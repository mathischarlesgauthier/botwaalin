import type Anthropic from "@anthropic-ai/sdk";
import { createCore, createLogger, type Core, type Logger } from "../src";

export function silentLogger(): Logger {
  return createLogger("silent");
}

export function testCore(): Core {
  return createCore({ dbPath: ":memory:" });
}

/** Faux client LLM répondant un texte fixe (jamais d'appel réseau dans les tests). */
export function fakeLlm(text: string) {
  return {
    messages: {
      create: async () => ({
        stop_reason: "end_turn",
        content: [{ type: "text", text }],
      }),
    },
  } as unknown as Anthropic;
}

/** Faux client LLM qui échoue systématiquement (teste le repli sur échec). */
export function failingLlm() {
  return {
    messages: {
      create: async () => {
        throw new Error("panne réseau simulée");
      },
    },
  } as unknown as Anthropic;
}

/** Faux client LLM séquencé + compteur d'appels (vérifie l'absence d'appel réseau). */
export function countingLlm(text: string) {
  let calls = 0;
  const client = {
    get calls() {
      return calls;
    },
    messages: {
      create: async () => {
        calls++;
        return { stop_reason: "end_turn", content: [{ type: "text", text }] };
      },
    },
  };
  return client as typeof client & Anthropic;
}
