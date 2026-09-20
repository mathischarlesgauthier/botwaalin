import Anthropic from "@anthropic-ai/sdk";
import type { Logger } from "./logger";

export interface LlmEnv {
  apiKey: string;
  /** Endpoint compatible Anthropic (ex. Kimi : https://api.moonshot.ai/anthropic). Vide = Anthropic officiel. */
  baseUrl?: string;
  model: string;
  /** Délai max d'un appel, en ms. Défaut : 60 s. */
  timeoutMs?: number;
  /** Nombre de nouvelles tentatives après échec. Défaut : 1. */
  maxRetries?: number;
}

/**
 * Les défauts du SDK (10 min par tentative, 2 nouvelles tentatives) restent en
 * place pour le BOT : une réponse à un client n'a aucun repli, et raccourcir
 * les tentatives ferait perdre des messages en silence sur un 429 ou un 5xx.
 * Le back-office, lui, a un humain qui attend devant son écran : il passe des
 * valeurs courtes (cf. apps/dashboard/src/lib/core.ts), sinon un endpoint lent
 * donne un bouton qui « ne fait rien » pendant une demi-heure.
 */
export function createLlmClient(env: LlmEnv): Anthropic {
  return new Anthropic({
    apiKey: env.apiKey,
    ...(env.timeoutMs !== undefined ? { timeout: env.timeoutMs } : {}),
    ...(env.maxRetries !== undefined ? { maxRetries: env.maxRetries } : {}),
    ...(env.baseUrl ? { baseURL: env.baseUrl } : {}),
  });
}

// ─── Comptage de la consommation (facturation) ───────────────────────────────

export interface LlmRates {
  /** Coût interne en centimes d'euro par million de tokens d'entrée. */
  inputCentsPerMTok: number;
  /** Coût interne en centimes d'euro par million de tokens de sortie. */
  outputCentsPerMTok: number;
  /** Multiplicateur appliqué au coût interne pour obtenir le montant facturé. */
  markup: number;
}

export interface MeteredUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCentimes: number;
  billedCentimes: number;
}

interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * Enveloppe le client pour enregistrer la consommation de CHAQUE appel
 * messages.create (bot et dashboard). Le comptage n'échoue jamais une réponse.
 */
export function withUsageMetering(
  client: Anthropic,
  rates: LlmRates,
  onUsage: (usage: MeteredUsage) => void,
): Anthropic {
  const original = client.messages.create.bind(client.messages);
  (client.messages as { create: typeof client.messages.create }).create = (async (
    params: Anthropic.Messages.MessageCreateParams,
    options?: unknown,
  ) => {
    const response = await original(params as never, options as never);
    try {
      const usage = ((response as { usage?: RawUsage }).usage ?? {}) as RawUsage;
      const inputEquivalent =
        (usage.input_tokens ?? 0) +
        1.25 * (usage.cache_creation_input_tokens ?? 0) +
        0.1 * (usage.cache_read_input_tokens ?? 0);
      const outputTokens = usage.output_tokens ?? 0;
      const cost =
        (inputEquivalent / 1_000_000) * rates.inputCentsPerMTok +
        (outputTokens / 1_000_000) * rates.outputCentsPerMTok;
      onUsage({
        model: (params as { model?: string }).model ?? "",
        inputTokens: Math.round(inputEquivalent),
        outputTokens,
        costCentimes: cost,
        billedCentimes: cost * rates.markup,
      });
    } catch {
      // jamais bloquant
    }
    return response;
  }) as typeof client.messages.create;
  return client;
}

export interface TranscriptLine {
  role: string;
  contenu: string;
  ts: number;
}

function transcriptText(lines: TranscriptLine[], max = 40): string {
  const roleLabel: Record<string, string> = {
    user: "Client",
    assistant: "Bot",
    human: "Jacob",
  };
  return lines
    .slice(-max)
    .map((l) => `${roleLabel[l.role] ?? l.role} : ${l.contenu}`)
    .join("\n");
}

/**
 * Kimi k2.6 est un modèle à RAISONNEMENT : il dépense d'abord des tokens de
 * réflexion, qui sont décomptés de `max_tokens` avant le moindre caractère de
 * réponse. Mesuré en production sur un résumé de 3 messages : 308 tokens de
 * raisonnement pour 158 de texte. Avec un plafond à 400, la réponse était donc
 * TOUJOURS vide (`stop_reason: max_tokens`) et l'appelant retombait sur son
 * texte de repli — le back-office affichait « Résumé indisponible » en
 * permanence, sans qu'aucune erreur n'apparaisse nulle part.
 *
 * `max_tokens` est un plafond, pas une consommation : le relever ne coûte rien
 * tant que la réponse reste courte. Garder de la marge est donc gratuit, et
 * l'inverse casse la fonctionnalité en silence.
 */
export const REASONING_HEADROOM = 1500;

export interface QuestionToClassify {
  id: number;
  texte: string;
}

/** Sujet propre : une étiquette courte, jamais une question ni une phrase. */
function normalizeTopic(raw: string): string {
  const cleaned = raw
    // Puce résiduelle uniquement : un tiret/astérisque ou « 2. » SUIVI d'un
    // espace. Surtout pas les chiffres seuls, sinon « 3D et impression »
    // deviendrait « D et impression ».
    .replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "")
    .replace(/["«»*]/g, "")
    .replace(/\s+/g, " ")
    // Trim AVANT de couper la ponctuation : sans ça, un « … ? » (guillemet
    // retiré, espace restant) gardait son point d'interrogation.
    .trim()
    .replace(/[?!.,;:]+$/, "")
    .trim();
  if (!cleaned) return "";
  const short = cleaned.slice(0, 60).trim();
  return short.charAt(0).toUpperCase() + short.slice(1);
}

/**
 * Lots volontairement petits : un lot = un appel LLM court, donc fiable à
 * parser et sûr de tenir dans `max_tokens` (25 lignes « id = Sujet » ≈ 300
 * tokens au pire, pour 1000 disponibles).
 */
const TOPIC_BATCH_SIZE = 25;

/** Nombre de sujets connus rappelés au modèle à chaque lot. */
const TOPIC_KNOWN_HINTS = 25;

/**
 * Range des questions clients sous un SUJET général (« Tarifs et devis »,
 * « Délais de livraison »…) plutôt que de les répertorier une par une.
 *
 * Les sujets déjà attribués sont réinjectés d'un lot à l'autre pour que le
 * classement reste stable : une question rejoint un sujet existant dès qu'il
 * convient, au lieu d'en créer une variante quasi identique.
 *
 * Renvoie une map id → sujet ; vide si le LLM échoue (l'appelant garde alors
 * son regroupement lexical de repli).
 */
export async function classifyQuestionTopics(
  client: Anthropic,
  model: string,
  questions: QuestionToClassify[],
  knownTopics: string[],
  log: Logger,
): Promise<Map<number, string>> {
  const assigned = new Map<number, string>();
  if (questions.length === 0) return assigned;
  const topics = new Set(knownTopics.map(normalizeTopic).filter(Boolean));

  for (let start = 0; start < questions.length; start += TOPIC_BATCH_SIZE) {
    const batch = questions.slice(start, start + TOPIC_BATCH_SIZE);
    // Les DERNIERS sujets retenus, pas les premiers : sinon les sujets créés
    // au lot précédent sortent de la liste rappelée au modèle, qui recrée
    // aussitôt des quasi-doublons — exactement ce que ce rappel évite.
    const known = [...topics].slice(-TOPIC_KNOWN_HINTS);
    try {
      const response = await client.messages.create({
        model,
        // Raisonnement + 25 lignes « id = Sujet » (cf. REASONING_HEADROOM).
        max_tokens: REASONING_HEADROOM + 1000,
        system: [
          "Tu classes des questions de clients (WhatsApp, entreprise de services) par SUJET général, en français.",
          "Un sujet est un THÈME, pas une question : 2 à 4 mots, sans point d'interrogation, sans référence à un produit ou à un modèle précis.",
          "Exemples de bons sujets : « Tarifs et devis », « Délais de livraison », « Disponibilité des pièces », « Création de société à l'étranger », « Moyens de paiement », « Suivi de commande ».",
          "Exemples de MAUVAIS sujets (trop précis, interdits) : « Prix d'un volant Megane 3RS », « Est-ce que le volant est dispo ? », « Combien coûte la LLC ? ».",
          "Réutilise EXACTEMENT un sujet de la liste existante dès qu'il convient. N'en crée un nouveau que si aucun ne convient.",
          "Vise le moins de sujets possible : regroupe largement, quitte à rester général.",
          "Réponds UNIQUEMENT par une ligne par question, au format « id = Sujet ». Aucune autre ligne, aucun commentaire.",
        ].join("\n"),
        messages: [
          {
            role: "user",
            content: [
              `Sujets existants :\n${known.length > 0 ? known.map((t) => `- ${t}`).join("\n") : "(aucun pour l'instant)"}`,
              `Questions à classer :\n${batch.map((q) => `[${q.id}] ${q.texte.replace(/\s+/g, " ").slice(0, 200)}`).join("\n")}`,
            ].join("\n\n"),
          },
        ],
      });
      if (response.stop_reason === "max_tokens") {
        // Réponse coupée : la fin du lot n'a pas été classée. On garde ce qui
        // a été lu ; l'appelant annonce le reste comme « non classé » et un
        // nouveau clic le reprendra.
        log.error({ lot: batch.length }, "classify_question_topics_truncated");
      }
      const text = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const allowed = new Set(batch.map((q) => q.id));
      for (const line of text.split("\n")) {
        // Tolérant à ce que les modèles ajoutent spontanément : puce, gras
        // markdown, crochets, et « . » comme séparateur (liste numérotée).
        const match = /^\s*[-•*]*\s*\**\s*\[?(\d+)\]?\**\s*[=:—.\-]\s*(.+)$/.exec(line);
        if (!match) continue;
        const id = Number(match[1]);
        // Un id hors du lot = hallucination : on l'ignore plutôt que d'écrire
        // un sujet sur une question qui n'a pas été soumise.
        if (!allowed.has(id)) continue;
        const sujet = normalizeTopic(match[2] ?? "");
        if (!sujet) continue;
        assigned.set(id, sujet);
        topics.add(sujet);
      }
    } catch (err) {
      log.error({ err: String(err) }, "classify_question_topics_failed");
      return assigned;
    }
  }
  return assigned;
}

/**
 * Résumé automatique d'une conversation : qui est le client, ce qu'il cherche,
 * où en est l'échange, ce qui bloque, ce qu'il faut faire.
 * Renvoie un texte court en français ; en cas d'échec LLM, un extrait brut.
 */
export async function summarizeConversation(
  client: Anthropic,
  model: string,
  lines: TranscriptLine[],
  log: Logger,
  contactName?: string | null,
): Promise<string> {
  const transcript = transcriptText(lines);
  if (!transcript) return "Conversation vide.";
  try {
    const response = await client.messages.create({
      model,
      max_tokens: REASONING_HEADROOM,
      system:
        "Tu résumes des conversations commerciales WhatsApp en français. Réponds UNIQUEMENT avec le résumé, sans préambule, au format :\nClient : (qui il est, ce qu'on sait)\nDemande : (ce qu'il cherche)\nÉtat : (où en est l'échange, ce qui a été proposé)\nBlocage : (ce qui bloque, ou « aucun »)\nÀ faire : (la prochaine action concrète)",
      messages: [
        {
          role: "user",
          content: `Conversation avec ${contactName || "un client"} :\n\n${transcript}`,
        },
      ],
    });
    const text = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (text) return text;
  } catch (err) {
    log.error({ err: String(err) }, "summarize_failed");
  }
  const lastClient = [...lines].reverse().find((l) => l.role === "user");
  return `Résumé indisponible. Dernier message client : « ${lastClient?.contenu ?? "—"} »`;
}
