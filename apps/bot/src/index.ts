import {
  createCore,
  createGate,
  createLlmClient,
  createLogger,
  ensureMonthlyDebits,
  initBilling,
  ensureStripePaymentLink,
  pollStripePayments,
  pushApiInvoiceItems,
  recordUsage,
  WhatsAppClient,
  withUsageMetering,
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

  // Chaque appel LLM est compté et facturé au client (montant = coût interne × marge).
  const llm = withUsageMetering(
    createLlmClient({
      apiKey: config.ANTHROPIC_API_KEY,
      baseUrl: config.ANTHROPIC_BASE_URL || undefined,
      model: config.ANTHROPIC_MODEL,
    }),
    {
      inputCentsPerMTok: config.LLM_COST_INPUT_CENTS_PER_MTOK,
      outputCentsPerMTok: config.LLM_COST_OUTPUT_CENTS_PER_MTOK,
      markup: config.LLM_MARKUP,
    },
    (usage) => recordUsage(core, usage),
  );

  initBilling(core);
  ensureMonthlyDebits(core);
  const billingEnforced =
    config.BILLING_ENFORCE === "1" ||
    (config.BILLING_ENFORCE !== "0" && Boolean(config.STRIPE_SECRET_KEY));

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

  const handler = createHandler({ core, wa, agent, alertDeps, log, billingEnforced });
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

  // Facturation : débit mensuel + encaissements Stripe.
  const billingTimer = setInterval(() => {
    try {
      const inserted = ensureMonthlyDebits(core);
      if (inserted > 0) log.info({ inserted }, "monthly_debit_posted");
    } catch (err) {
      log.error({ err: String(err) }, "monthly_debit_failed");
    }
  }, 60 * 60 * 1000);
  let stripeTimer: NodeJS.Timeout | undefined;
  if (config.STRIPE_SECRET_KEY) {
    const key = config.STRIPE_SECRET_KEY;
    // La création du lien est une étape du poll : un échec Stripe transitoire
    // au boot est retenté toutes les 15 min au lieu d'être perdu jusqu'au
    // prochain redémarrage.
    const poll = async () => {
      try {
        if (!core.settings.get("stripe_payment_link_url")) {
          await ensureStripePaymentLink(core, key, log);
        }
        await pollStripePayments(core, key, log);
        await pushApiInvoiceItems(core, key, log);
      } catch (err) {
        log.error({ err: String(err) }, "stripe_poll_failed");
      }
    };
    void poll();
    stripeTimer = setInterval(() => void poll(), 15 * 60 * 1000);
  }

  const shutdown = async (signal: string) => {
    log.info({ signal }, "Arrêt en cours");
    clearInterval(releaseTimer);
    clearInterval(billingTimer);
    if (stripeTimer) clearInterval(stripeTimer);
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
