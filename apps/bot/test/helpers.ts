import type Anthropic from "@anthropic-ai/sdk";
import {
  createCore,
  createLogger,
  type AlertDeps,
  type Core,
  type Logger,
  type SendResult,
  type WhatsAppClient,
} from "@arbi/core";
import { join } from "node:path";
import type { Analysis } from "../src/brain";

export const CATALOGUE_PATH = join(__dirname, "..", "..", "..", "data", "catalogue.md");

export function silentLogger(): Logger {
  return createLogger("silent");
}

export function testCore(adminNumber?: string): Core {
  return createCore({
    dbPath: ":memory:",
    catalogueSeedPath: CATALOGUE_PATH,
    adminWhatsappNumber: adminNumber,
    dashboardUrl: "http://localhost:3001",
  });
}

export interface SentRecord {
  waId: string;
  kind: "text" | "buttons" | "menu" | "template";
  text?: string;
  templateName?: string;
  components?: unknown[];
}

/** Faux client WhatsApp : enregistre les envois, résultat paramétrable par type. */
export function fakeWa(failing: Partial<Record<SentRecord["kind"], string>> = {}) {
  const sent: SentRecord[] = [];
  const result = (kind: SentRecord["kind"]): SendResult =>
    failing[kind] ? { sent: false, reason: failing[kind] } : { sent: true };
  const wa = {
    sent,
    async sendText(waId: string, text: string): Promise<SendResult> {
      const r = result("text");
      if (r.sent) sent.push({ waId, kind: "text", text });
      return r;
    },
    async sendButtons(waId: string, text: string): Promise<SendResult> {
      const r = result("buttons");
      if (r.sent) sent.push({ waId, kind: "buttons", text });
      return r;
    },
    async sendMenu(waId: string): Promise<SendResult> {
      const r = result("menu");
      if (r.sent) sent.push({ waId, kind: "menu" });
      return r;
    },
    async sendTemplate(
      waId: string,
      templateName: string,
      _lang?: string,
      components?: unknown[],
    ): Promise<SendResult> {
      const r = result("template");
      if (r.sent) sent.push({ waId, kind: "template", templateName, components });
      return r;
    },
  };
  return wa as typeof wa & WhatsAppClient;
}

/** Faux client LLM répondant un texte fixe. */
export function fakeLlm(text = "Résumé de test.") {
  return {
    messages: {
      create: async () => ({
        stop_reason: "end_turn",
        content: [{ type: "text", text }],
      }),
    },
  } as unknown as Anthropic;
}

/**
 * Faux client LLM séquencé : renvoie les textes dans l'ordre des appels et
 * permet un hook par appel (ex. simuler un message client pendant la génération).
 */
export function fakeLlmSeq(texts: string[], onCall?: (callIndex: number) => void) {
  let call = 0;
  const client = {
    calls: 0,
    messages: {
      create: async () => {
        const index = call++;
        client.calls = call;
        onCall?.(index);
        const text = texts[Math.min(index, texts.length - 1)] ?? "";
        return { stop_reason: "end_turn", content: [{ type: "text", text }] };
      },
    },
  };
  return client as typeof client & Anthropic;
}

export function testAlertDeps(core: Core, wa: WhatsAppClient, overrides: Partial<AlertDeps> = {}): AlertDeps {
  return {
    core,
    wa,
    llm: fakeLlm(),
    model: "test-model",
    log: silentLogger(),
    ...overrides,
  };
}

export function makeAnalysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    intent: "information",
    serviceKey: null,
    categorie: "Autre",
    route: "agent",
    motif: "",
    combinedText: "message de test",
    progressed: false,
    ...overrides,
  };
}
