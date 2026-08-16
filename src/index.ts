import Anthropic from "@anthropic-ai/sdk";
import { SalesAgent } from "./agent";
import { loadCatalogue } from "./catalogue";
import { loadConfig } from "./config";
import { createDb } from "./db";
import { createHandler } from "./handler";
import { createLogger } from "./logger";
import { DebounceQueue } from "./queue";
import { buildServer } from "./server";
import { createTelegramNotifier } from "./telegram";
import { createGate, WhatsAppClient } from "./whatsapp";

async function main(): Promise<void> {
  const config = loadConfig();
  const log = createLogger(config.LOG_LEVEL);

  const db = createDb(config.DB_PATH);
  const catalogue = loadCatalogue(config.CATALOGUE_PATH);

  const gate = createGate(db);
  const wa = new WhatsAppClient(
    {
      apiBase: config.GRAPH_API_BASE,
      token: config.WHATSAPP_TOKEN,
      phoneNumberId: config.PHONE_NUMBER_ID,
    },
    gate,
    log,
  );
  const telegram = createTelegramNotifier(
    { botToken: config.TELEGRAM_BOT_TOKEN, chatId: config.ADMIN_TG_CHAT_ID },
    log,
  );
  const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  const agent = new SalesAgent({
    client: anthropic,
    model: config.ANTHROPIC_MODEL,
    catalogue,
    db,
    wa,
    telegram,
    log,
  });

  const handler = createHandler({ db, wa, agent, log });
  const queue = new DebounceQueue(config.DEBOUNCE_MS, handler, (err, waId) => {
    log.error({ waId, err: String(err) }, "batch_processing_error");
  });

  const app = buildServer({ config, db, queue, log });
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  log.info(
    { port: config.PORT, model: config.ANTHROPIC_MODEL },
    "Agent commercial WhatsApp démarré",
  );

  const shutdown = async (signal: string) => {
    log.info({ signal }, "Arrêt en cours");
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Démarrage impossible :", err);
  process.exit(1);
});
