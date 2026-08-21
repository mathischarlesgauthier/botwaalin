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
