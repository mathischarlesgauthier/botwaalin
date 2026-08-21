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
    async sendTemplate(waId: string, templateName: string): Promise<SendResult> {
      const r = result("template");
      if (r.sent) sent.push({ waId, kind: "template", templateName });
      return r;
    },
  };
  return wa as typeof wa & WhatsAppClient;
}

/** Faux client LLM (résumés & agent) répondant un texte fixe. */
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
