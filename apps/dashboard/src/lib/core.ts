import {
  createCore,
  createGate,
  createLlmClient,
  createLogger,
  WhatsAppClient,
  type AlertDeps,
  type Core,
} from "@arbi/core";
import { join } from "node:path";

/**
 * Singleton partagé entre toutes les routes du dashboard (le bot a son propre
 * processus : SQLite en mode WAL autorise les deux en parallèle).
 */

interface Runtime {
  core: Core;
  wa: WhatsAppClient;
  llm: ReturnType<typeof createLlmClient>;
  model: string;
  alertDeps: AlertDeps;
  log: ReturnType<typeof createLogger>;
}

const globalStore = globalThis as unknown as { __arbiRuntime?: Runtime };

export function getRuntime(): Runtime {
  if (globalStore.__arbiRuntime) return globalStore.__arbiRuntime;

  const log = createLogger(process.env.LOG_LEVEL ?? "info", "dashboard");
  const core = createCore({
    dbPath: process.env.DB_PATH ?? join(process.cwd(), "..", "..", "data", "agent.db"),
    catalogueSeedPath: process.env.CATALOGUE_PATH,
    adminWhatsappNumber: process.env.ADMIN_WHATSAPP_NUMBER,
    dashboardUrl: process.env.DASHBOARD_URL,
  });

  const gate = createGate({
    getContact: (waId) => {
      const contact = core.contacts.get(waId);
      return contact ? { optOut: contact.optOut } : undefined;
    },
    lastInboundTs: (waId) => core.messages.lastInboundTs(waId),
  });
  const wa = new WhatsAppClient(
    {
      apiBase: process.env.GRAPH_API_BASE ?? "https://graph.facebook.com/v21.0",
      token: process.env.WHATSAPP_TOKEN ?? "",
      phoneNumberId: process.env.PHONE_NUMBER_ID ?? "",
    },
    gate,
    log,
  );

  const model = process.env.ANTHROPIC_MODEL ?? "kimi-k2.6";
  const llm = createLlmClient({
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    baseUrl: process.env.ANTHROPIC_BASE_URL || undefined,
    model,
  });

  const alertDeps: AlertDeps = {
    core,
    wa,
    llm,
    model,
    log,
    resendApiKey: process.env.RESEND_API_KEY || undefined,
    emailFrom: process.env.ALERT_EMAIL_FROM || undefined,
  };

  globalStore.__arbiRuntime = { core, wa, llm, model, alertDeps, log };
  return globalStore.__arbiRuntime;
}
