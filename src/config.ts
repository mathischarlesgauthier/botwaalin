import { z } from "zod";

const envSchema = z.object({
  WHATSAPP_TOKEN: z.string().min(1, "WHATSAPP_TOKEN requis"),
  PHONE_NUMBER_ID: z.string().min(1, "PHONE_NUMBER_ID requis"),
  VERIFY_TOKEN: z.string().min(1, "VERIFY_TOKEN requis"),
  APP_SECRET: z.string().min(1, "APP_SECRET requis"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY requis"),
  /** Endpoint compatible Anthropic (ex. Kimi/Moonshot : https://api.moonshot.ai/anthropic). Vide = API Anthropic officielle. */
  ANTHROPIC_BASE_URL: z.string().default(""),
  ADMIN_TG_CHAT_ID: z.string().default(""),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  PORT: z.coerce.number().int().positive().default(3000),
  DB_PATH: z.string().default("data/agent.db"),
  CATALOGUE_PATH: z.string().default("data/catalogue.md"),
  LOG_LEVEL: z.string().default("info"),
  DEBOUNCE_MS: z.coerce.number().int().positive().default(2500),
  GRAPH_API_BASE: z.string().default("https://graph.facebook.com/v21.0"),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(" · ");
    throw new Error(`Configuration invalide — ${details}`);
  }
  return parsed.data;
}
