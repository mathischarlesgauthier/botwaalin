import Anthropic from "@anthropic-ai/sdk";
import type { Logger } from "./logger";

export interface LlmEnv {
  apiKey: string;
  /** Endpoint compatible Anthropic (ex. Kimi : https://api.moonshot.ai/anthropic). Vide = Anthropic officiel. */
  baseUrl?: string;
  model: string;
}

export function createLlmClient(env: LlmEnv): Anthropic {
  return new Anthropic({
    apiKey: env.apiKey,
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
      max_tokens: 400,
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
