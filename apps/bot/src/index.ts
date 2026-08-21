import {
  createCore,
  createGate,
  createLlmClient,
  createLogger,
  WhatsAppClient,
  type AlertDeps,
} from "@arbi/core";
import { SalesAgent } from "./agent";
import { loadConfig } from "./config";
import { createHandler } from "./handler";
import { DebounceQueue } from "./queue";
import { buildServer } from "./server";

async function main(): Promise<void> {
  const config = loadConfig();
  const log = createLogger(config.LOG_LEVEL, "wa-agent");

  const core = createCore({
    dbPath: config.DB_PATH,
    catalogueSeedPath: config.CATALOGUE_PATH,
    adminWhatsappNumber: config.ADMIN_WHATSAPP_NUMBER,
    dashboardUrl: config.DASHBOARD_URL,
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
      apiBase: config.GRAPH_API_BASE,
      token: config.WHATSAPP_TOKEN,
      phoneNumberId: config.PHONE_NUMBER_ID,
    },
    gate,
    log,
  );

  const llm = createLlmClient({
    apiKey: config.ANTHROPIC_API_KEY,
    baseUrl: config.ANTHROPIC_BASE_URL || undefined,
    model: config.ANTHROPIC_MODEL,
  });

  const alertDeps: AlertDeps = {
    core,
    wa,
    llm,
    model: config.ANTHROPIC_MODEL,
    log,
    resendApiKey: config.RESEND_API_KEY || undefined,
    emailFrom: config.ALERT_EMAIL_FROM || undefined,
  };

  const agent = new SalesAgent({
    core,
    client: llm,
    model: config.ANTHROPIC_MODEL,
    wa,
    alertDeps,
    log,
  });

  const handler = createHandler({ core, wa, agent, alertDeps, log });
  const queue = new DebounceQueue(config.DEBOUNCE_MS, handler, (err, waId) => {
    log.error({ waId, err: String(err) }, "batch_processing_error");
  });

  const app = buildServer({
    config: { VERIFY_TOKEN: config.VERIFY_TOKEN, APP_SECRET: config.APP_SECRET },
    core,
    queue,
    log,
  });
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  log.info(
    { port: config.PORT, model: config.ANTHROPIC_MODEL },
    "Agent commercial WhatsApp v2 démarré",
  );

  // Réactivation automatique du bot après inactivité en mode humain.
  const releaseTimer = setInterval(() => {
    const delayH = core.settings.get("reactivation_delay_h");
    const released = core.contacts.releaseStaleHumanMode(delayH * 60 * 60 * 1000);
    if (released > 0) {
      log.info({ released, delayH }, "human_mode_auto_released");
    }
  }, 10 * 60 * 1000);

  const shutdown = async (signal: string) => {
    log.info({ signal }, "Arrêt en cours");
    clearInterval(releaseTimer);
    await app.close();
    core.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Démarrage impossible :", err);
  process.exit(1);
});
