import crypto from "node:crypto";
import type { Logger } from "./logger";
import { logDecision } from "./logger";

export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Vérifie X-Hub-Signature-256 : HMAC SHA256 de l'app secret sur le body brut. */
export function verifySignature(
  appSecret: string,
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expectedHex = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  const expected = Buffer.from(expectedHex, "hex");
  const given = Buffer.from(signatureHeader.slice("sha256=".length), "hex");
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

export interface GateDb {
  getContact(waId: string): { opt_out: number } | undefined;
  lastInboundTs(waId: string): number | null;
}

export type GateResult = { ok: true } | { ok: false; reason: string };

export interface OutboundGate {
  /** Message libre : bloqué si opt-out ou hors fenêtre de service 24 h. */
  canSendFreeForm(waId: string): GateResult;
  /** Template approuvé : bloqué uniquement si opt-out. */
  canSendTemplate(waId: string): GateResult;
}

export function createGate(db: GateDb, now: () => number = Date.now): OutboundGate {
  return {
    canSendFreeForm(waId) {
      const contact = db.getContact(waId);
      if (contact?.opt_out) return { ok: false, reason: "opt_out" };
      const last = db.lastInboundTs(waId);
      if (last === null || now() - last > SERVICE_WINDOW_MS) {
        return { ok: false, reason: "outside_24h_window" };
      }
      return { ok: true };
    },
    canSendTemplate(waId) {
      const contact = db.getContact(waId);
      if (contact?.opt_out) return { ok: false, reason: "opt_out" };
      return { ok: true };
    },
  };
}

export interface SendResult {
  sent: boolean;
  reason?: string;
  messageId?: string;
}

export const MENU_ROWS = [
  { id: "digital", title: "Digital", description: "Sites, apps, IA, bots, design" },
  { id: "crea_societe", title: "Créa société", description: "LLC USA, LTD UK, LTD Hong Kong" },
  { id: "trafic_pro", title: "Trafic Pro", description: "Formation réseaux sociaux & trafic" },
  { id: "china_acces", title: "China Accès", description: "Formation & agents en Chine" },
  { id: "vinted_pro", title: "Vinted Pro", description: "Formation Vinted" },
] as const;

export interface WhatsAppClientOptions {
  apiBase: string;
  token: string;
  phoneNumberId: string;
  /** Espacement minimal entre deux envois (rate limit sortant). */
  minGapMs?: number;
  /** Nombre de retries sur 429/5xx (backoff exponentiel). */
  maxRetries?: number;
  fetchFn?: typeof fetch;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class WhatsAppClient {
  private tail: Promise<unknown> = Promise.resolve();
  private lastSentAt = 0;
  private readonly minGapMs: number;
  private readonly maxRetries: number;
  private readonly fetchFn: typeof fetch;

  constructor(
    private readonly opts: WhatsAppClientOptions,
    private readonly gate: OutboundGate,
    private readonly log: Logger,
  ) {
    this.minGapMs = opts.minGapMs ?? 100;
    this.maxRetries = opts.maxRetries ?? 3;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  async sendText(waId: string, text: string): Promise<SendResult> {
    const gate = this.gate.canSendFreeForm(waId);
    if (!gate.ok) {
      logDecision(this.log, "send_blocked", { waId, kind: "text", reason: gate.reason });
      return { sent: false, reason: gate.reason };
    }
    return this.dispatch(waId, "text", {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: waId,
      type: "text",
      // Limite WhatsApp : 4096 caractères par corps de message.
      text: { preview_url: false, body: text.slice(0, 4096) },
    });
  }

  /** Liste interactive des 5 pôles. */
  async sendMenu(waId: string): Promise<SendResult> {
    const gate = this.gate.canSendFreeForm(waId);
    if (!gate.ok) {
      logDecision(this.log, "send_blocked", { waId, kind: "menu", reason: gate.reason });
      return { sent: false, reason: gate.reason };
    }
    return this.dispatch(waId, "menu", {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: waId,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: "ARBI JACOB" },
        body: { text: "Voici nos 5 pôles. Dis-moi ce qui t'intéresse 👇" },
        action: {
          button: "Découvrir",
          sections: [{ title: "Nos pôles", rows: MENU_ROWS.map((r) => ({ ...r })) }],
        },
      },
    });
  }

  /**
   * Envoi d'un template approuvé Meta — seul canal autorisé hors fenêtre 24 h.
   * Refus explicite uniquement si le contact est opt-out.
   */
  async sendTemplate(
    waId: string,
    templateName: string,
    languageCode = "fr",
    components?: unknown[],
  ): Promise<SendResult> {
    const gate = this.gate.canSendTemplate(waId);
    if (!gate.ok) {
      logDecision(this.log, "send_blocked", { waId, kind: "template", reason: gate.reason });
      return { sent: false, reason: gate.reason };
    }
    return this.dispatch(waId, "template", {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: waId,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {}),
      },
    });
  }

  private dispatch(waId: string, kind: string, payload: unknown): Promise<SendResult> {
    const run = this.tail.then(async (): Promise<SendResult> => {
      const wait = this.lastSentAt + this.minGapMs - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        return await this.postWithRetry(waId, kind, payload);
      } finally {
        this.lastSentAt = Date.now();
      }
    });
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async postWithRetry(
    waId: string,
    kind: string,
    payload: unknown,
  ): Promise<SendResult> {
    const url = `${this.opts.apiBase}/${this.opts.phoneNumberId}/messages`;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      let response: Response;
      try {
        response = await this.fetchFn(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.opts.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        if (attempt === this.maxRetries) {
          this.log.error({ waId, kind, err: String(err) }, "whatsapp_send_network_error");
          return { sent: false, reason: "network_error" };
        }
        await sleep(this.backoff(attempt));
        continue;
      }

      if (response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          messages?: Array<{ id?: string }>;
        };
        const messageId = body.messages?.[0]?.id;
        logDecision(this.log, "message_sent", { waId, kind, messageId });
        return { sent: true, messageId };
      }

      const retryable = response.status === 429 || response.status >= 500;
      const errorBody = await response.text().catch(() => "");
      if (retryable && attempt < this.maxRetries) {
        logDecision(this.log, "send_retry", {
          waId,
          kind,
          status: response.status,
          attempt: attempt + 1,
        });
        await sleep(this.backoff(attempt));
        continue;
      }
      this.log.error(
        { waId, kind, status: response.status, body: errorBody.slice(0, 500) },
        "whatsapp_send_failed",
      );
      return { sent: false, reason: `http_${response.status}` };
    }
    return { sent: false, reason: "retries_exhausted" };
  }

  private backoff(attempt: number): number {
    return 500 * 2 ** attempt + Math.floor(Math.random() * 250);
  }
}
