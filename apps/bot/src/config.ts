import { z } from "zod";

const envSchema = z.object({
  WHATSAPP_TOKEN: z.string().min(1, "WHATSAPP_TOKEN requis"),
  PHONE_NUMBER_ID: z.string().min(1, "PHONE_NUMBER_ID requis"),
  VERIFY_TOKEN: z.string().min(1, "VERIFY_TOKEN requis"),
  APP_SECRET: z.string().min(1, "APP_SECRET requis"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY requis"),
  /** Endpoint compatible Anthropic (ex. Kimi : https://api.moonshot.ai/anthropic). Vide = Anthropic officiel. */
  ANTHROPIC_BASE_URL: z.string().default(""),
  ANTHROPIC_MODEL: z.string().default("kimi-k2.6"),
  /** Seed du réglage admin_numbers (la base fait ensuite autorité). */
  ADMIN_WHATSAPP_NUMBER: z.string().default(""),
  ADMIN_TG_CHAT_ID: z.string().default(""),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  DASHBOARD_URL: z.string().default(""),
  RESEND_API_KEY: z.string().default(""),
  ALERT_EMAIL_FROM: z.string().default(""),
  PORT: z.coerce.number().int().positive().default(3000),
  DB_PATH: z.string().default("data/agent.db"),
  CATALOGUE_PATH: z.string().default("data/catalogue.md"),
  LOG_LEVEL: z.string().default("info"),
  // 8 s : un client qui tape sur mobile laisse souvent plus de 2,5 s entre
  // deux messages. Trop court, ses messages partaient en lots séparés et le
  // bot répondait au premier avant d'avoir lu le suivant.
  DEBOUNCE_MS: z.coerce.number().int().positive().default(8000),
  GRAPH_API_BASE: z.string().default("https://graph.facebook.com/v21.0"),
  /** Clé secrète Stripe (lien de paiement + sondage des factures). Vide = pas de Stripe. */
  STRIPE_SECRET_KEY: z.string().default(""),
  /** Multiplicateur appliqué à notre coût LLM interne pour obtenir le montant facturé. */
  LLM_MARKUP: z.coerce.number().positive().default(4),
  /** Coût interne, en centimes d'euro par million de tokens. */
  LLM_COST_INPUT_CENTS_PER_MTOK: z.coerce.number().nonnegative().default(55),
  LLM_COST_OUTPUT_CENTS_PER_MTOK: z.coerce.number().nonnegative().default(230),
  /** "1" = coupure forcée, "0" = jamais de coupure, "auto" = coupure si Stripe configuré. */
  BILLING_ENFORCE: z.string().default("auto"),
  /** Dossier d'archivage des médias reçus (volume persistant). */
  MEDIA_DIR: z.string().default("data/media"),
  /** Transcription des vocaux : endpoint compatible OpenAI. Vide = désactivée. */
  TRANSCRIBE_API_KEY: z.string().default(""),
  TRANSCRIBE_API_URL: z.string().default("https://api.openai.com/v1/audio/transcriptions"),
  TRANSCRIBE_MODEL: z.string().default("whisper-1"),
  /** Coût interne de la transcription, en centimes d'euro par minute. */
  TRANSCRIBE_COST_CENTS_PER_MIN: z.coerce.number().nonnegative().default(0.6),
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
