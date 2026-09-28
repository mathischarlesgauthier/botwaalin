import type Anthropic from "@anthropic-ai/sdk";
import type { ExampleRow } from "./db";
import { REASONING_HEADROOM } from "./llm";
import type { Logger } from "./logger";
import { maskAmounts, PAYMENT_OUTBOUND_RE } from "./pricing";

/**
 * Auto-amélioration à partir des messages envoyés manuellement par Jacob (§6) :
 * rejet déterministe (sans appel LLM), revue LLM (anonymisation + jugement de
 * réutilisabilité), guide de style appris.
 */

const MIN_LENGTH = 12;
const MAX_LENGTH = 600;

/** Téléphone FR : 0X XX XX XX XX, avec ou sans séparateurs. */
const PHONE_FR_RE = /\b0[1-9](?:[\s.-]?\d{2}){4}\b/;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i;

/**
 * Rejet automatique et non négociable, SANS appel LLM : un montant, un lien/
 * coordonnée de paiement, un téléphone ou un e-mail (fuite d'identité vers le
 * prompt statique PARTAGÉ entre toutes les conversations — le risque le plus
 * sérieux de cette fonctionnalité), ou une longueur hors bornes.
 * Appliquée deux fois par `reviewExample` : sur la réponse brute de Jacob
 * (avant tout appel LLM, coût zéro) ET sur la réponse reformulée par le LLM
 * (après coup, au cas où la reformulation aurait réintroduit une fuite).
 */
export function deterministicRejectReason(reponse: string): string | null {
  const clean = reponse.trim();
  // Les montants ne sont PLUS un motif de rejet : ils sont masqués par
  // `maskAmounts` avant stockage. Les rejeter revenait à jeter presque tout ce
  // qu'un vendeur écrit — ses réponses citent des prix — et l'apprentissage ne
  // se remplissait jamais. Restent bloquées les vraies fuites : coordonnées de
  // paiement, téléphone, e-mail, qui atterriraient dans un prompt PARTAGÉ.
  if (PAYMENT_OUTBOUND_RE.test(clean)) return "lien ou coordonnée de paiement détecté";
  if (PHONE_FR_RE.test(clean)) return "numéro de téléphone détecté";
  if (EMAIL_RE.test(clean)) return "adresse e-mail détectée";
  if (clean.length < MIN_LENGTH) return "réponse trop courte";
  if (clean.length > MAX_LENGTH) return "réponse trop longue";
  return null;
}

/**
 * Même filtre que `deterministicRejectReason`, mais pour la QUESTION du client
 * (bornes de longueur différentes : `question` vient de messages client bruts,
 * pas d'une réponse rédigée par Jacob — on ne rejette donc que sur fuite
 * d'identité, pas sur une longueur trop courte/longue).
 * `question` provient verbatim des derniers messages du client (aucune
 * anonymisation avant l'appel LLM) : si le client y tape lui-même son
 * numéro/e-mail/un montant, ça doit être filtré exactement comme `reponse`.
 */
export function deterministicRejectReasonQuestion(question: string): string | null {
  const clean = question.trim();
  // Idem : un client qui dit « j'ai 500 € de budget » ne doit pas faire perdre
  // l'exemple. Le montant est masqué, pas rejeté.
  if (PAYMENT_OUTBOUND_RE.test(clean)) return "lien ou coordonnée de paiement détecté dans la question";
  if (PHONE_FR_RE.test(clean)) return "numéro de téléphone détecté dans la question";
  if (EMAIL_RE.test(clean)) return "adresse e-mail détectée dans la question";
  return null;
}

export interface ReviewResult {
  garder: boolean;
  motif: string;
  question: string;
  reponse: string;
  theme: string;
}

/**
 * Revoit un exemple `en_attente` : reformule la question en cas général,
 * anonymise la réponse en gardant le ton, juge si l'exemple est réutilisable.
 *
 * Ne catch PAS les erreurs de l'appel LLM : un échec technique doit remonter
 * pour que l'appelant laisse la ligne `en_attente` (retry à la passe
 * suivante) — jamais un `garder:false` silencieux en cas d'exception.
 */
export async function reviewExample(
  llm: Anthropic,
  model: string,
  example: Pick<ExampleRow, "question" | "reponse" | "theme">,
  pricingLabels: string[],
  log: Logger,
): Promise<ReviewResult> {
  const deterministic = deterministicRejectReason(example.reponse) ?? deterministicRejectReasonQuestion(example.question);
  if (deterministic) {
    return {
      garder: false,
      motif: deterministic,
      question: example.question,
      reponse: example.reponse,
      theme: example.theme,
    };
  }

  const response = await llm.messages.create({
    model,
    // Marge pour le raisonnement du modèle (cf. REASONING_HEADROOM).
    max_tokens: REASONING_HEADROOM,
    system: [
      "Tu prépares un exemple de réponse commerciale WhatsApp en français, pour servir de modèle de TON à un bot de vente.",
      "1) Reformule la question du client en CAS GÉNÉRAL : retire prénom, détail identifiant ou propre à ce client précis.",
      "2) Garde la réponse de Jacob comme modèle de TON (formulation, structure, angle), en retirant toute donnée personnelle (prénom, numéro, e-mail, adresse, nom d'entreprise du client).",
      "3) Ne change JAMAIS le fond : aucun prix, aucun délai, aucune disponibilité ne doit apparaître dans la réponse reformulée (le bot les tire toujours de la grille tarifaire et du catalogue, jamais de cet exemple).",
      `Services connus (pour contexte uniquement) : ${pricingLabels.join(", ") || "—"}.`,
      'Réponds UNIQUEMENT avec un objet JSON, sans texte autour : {"garder": boolean, "motif": string, "question": string, "reponse": string, "theme": string}.',
      "garder=false si la question ou la réponse ne peuvent pas être anonymisées proprement, ou si le contenu n'est pas réutilisable comme modèle de ton générique.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: `Question client :\n${example.question}\n\nRéponse de Jacob :\n${example.reponse}`,
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    log.error({ text: text.slice(0, 300) }, "review_example_no_json");
    throw new Error("réponse LLM non exploitable (pas de JSON)");
  }
  const parsed = JSON.parse(jsonMatch[0]) as Partial<ReviewResult>;
  // Masquage des montants APRÈS reformulation : l'exemple sert de modèle de
  // ton, les chiffres viennent toujours de la grille. Masquer plutôt que
  // rejeter, sinon presque aucune réponse de vendeur ne serait apprise.
  const reponseReformulee = maskAmounts(
    String(parsed.reponse ?? example.reponse).slice(0, MAX_LENGTH),
  );
  const questionReformulee = maskAmounts(
    String(parsed.question ?? example.question).slice(0, MAX_LENGTH),
  );
  const theme = String(parsed.theme ?? example.theme);

  // Filet déterministe appliqué à nouveau : même après reformulation par le
  // LLM, aucune fuite (prix, paiement, téléphone, e-mail) ne doit passer —
  // sur la réponse ET sur la question reformulées.
  const postCheck =
    deterministicRejectReason(reponseReformulee) ?? deterministicRejectReasonQuestion(questionReformulee);
  if (postCheck) {
    return { garder: false, motif: postCheck, question: questionReformulee, reponse: reponseReformulee, theme };
  }

  return {
    garder: Boolean(parsed.garder),
    motif: String(parsed.motif ?? ""),
    question: questionReformulee,
    reponse: reponseReformulee,
    theme,
  };
}

/**
 * Guide de style appris (§6) : 5 à 10 règles de ton observées chez Jacob à
 * partir de ses derniers messages manuels. Régénéré uniquement sur clic
 * manuel (jamais automatique) — robuste : ne lève jamais, renvoie "" en cas
 * d'échec (l'appelant ne doit alors PAS écraser le réglage existant).
 */
export async function buildStyleGuide(
  llm: Anthropic,
  model: string,
  lastHumanMessages: string[],
  log: Logger,
): Promise<string> {
  if (lastHumanMessages.length === 0) return "";
  try {
    const response = await llm.messages.create({
      model,
      // Marge pour le raisonnement du modèle (cf. REASONING_HEADROOM).
      max_tokens: REASONING_HEADROOM,
      system: [
        "Tu observes des messages écrits manuellement par un commercial (Jacob) sur WhatsApp, en français,",
        "et tu en dégages 5 à 10 règles de TON concrètes et actionnables pour un bot qui doit lui ressembler :",
        "tutoiement ou vouvoiement, longueur habituelle des messages, formules d'ouverture et de fermeture récurrentes,",
        "ce qu'il ne fait JAMAIS (ex. jamais de point d'exclamation, jamais de smiley, jamais de « cordialement »…).",
        "Réponds UNIQUEMENT avec la liste, une règle par ligne précédée d'un tiret. Pas de préambule, pas de conclusion.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: `Messages de Jacob (du plus récent au plus ancien) :\n${lastHumanMessages.map((m) => `- ${m}`).join("\n")}`,
        },
      ],
    });
    return response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  } catch (err) {
    log.error({ err: String(err) }, "build_style_guide_failed");
    return "";
  }
}
