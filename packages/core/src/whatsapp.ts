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
  const expectedHex = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const expected = Buffer.from(expectedHex, "hex");
  const given = Buffer.from(signatureHeader.slice("sha256=".length), "hex");
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

export interface ServiceWindowState {
  /** true si un message libre peut encore être envoyé (hors template). */
  open: boolean;
  /** Millisecondes restantes avant fermeture (0 si déjà fermée). */
  msLeft: number;
  /** Millisecondes écoulées depuis la fermeture (null si la fenêtre est ouverte, ou n'a jamais été ouverte). */
  closedSince: number | null;
}

/**
 * État de la fenêtre de service WhatsApp de 24 h, pour affichage back-office
 * (indicateur permanent §4.1). Ne change AUCUNE règle d'envoi : `createGate`
 * reste la seule autorité qui bloque/autorise réellement les envois.
 */
export function serviceWindow(lastInboundTs: number | null, now: number): ServiceWindowState {
  if (lastInboundTs === null) {
    return { open: false, msLeft: 0, closedSince: null };
  }
  const elapsed = now - lastInboundTs;
  if (elapsed <= SERVICE_WINDOW_MS) {
    return { open: true, msLeft: SERVICE_WINDOW_MS - elapsed, closedSince: null };
  }
  return { open: false, msLeft: 0, closedSince: elapsed - SERVICE_WINDOW_MS };
}

export interface GateDb {
  getContact(waId: string): { optOut: number } | undefined;
  lastInboundTs(waId: string): number | null;
}

export type GateResult = { ok: true } | { ok: false; reason: string };

export interface OutboundGate {
  canSendFreeForm(waId: string): GateResult;
  canSendTemplate(waId: string): GateResult;
  /**
   * Envoi manuel de Jacob depuis le back-office. La fenêtre 24 h n'est PAS un
   * verrou local ici : Jacob doit toujours pouvoir reprendre la main. Seul
   * l'opt-out (STOP) reste bloquant — écrire à un contact désabonné met en
   * danger le numéro WhatsApp. Si la fenêtre est réellement fermée, c'est Meta
   * qui refuse l'appel, et l'appelant bascule sur un template approuvé.
   */
  canSendManual(waId: string): GateResult;
}

export function createGate(db: GateDb, now: () => number = Date.now): OutboundGate {
  return {
    canSendFreeForm(waId) {
      const contact = db.getContact(waId);
      if (contact?.optOut) return { ok: false, reason: "opt_out" };
      const last = db.lastInboundTs(waId);
      if (last === null || now() - last > SERVICE_WINDOW_MS) {
        return { ok: false, reason: "outside_24h_window" };
      }
      return { ok: true };
    },
    canSendTemplate(waId) {
      const contact = db.getContact(waId);
      if (contact?.optOut) return { ok: false, reason: "opt_out" };
      return { ok: true };
    },
    canSendManual(waId) {
      const contact = db.getContact(waId);
      if (contact?.optOut) return { ok: false, reason: "opt_out" };
      return { ok: true };
    },
  };
}

/**
 * Codes d'erreur Meta signifiant « fenêtre de service 24 h fermée » (message
 * de réengagement refusé). Traduits en `outside_24h_window` pour que
 * l'appelant traite de la même façon un refus local et un refus Meta.
 */
const META_OUTSIDE_WINDOW_CODES = new Set([131047, 470]);

/** Code d'erreur Meta d'une réponse d'échec, si le corps est exploitable. */
function metaErrorCode(body: string): number | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: unknown } };
    const code = parsed.error?.code;
    return typeof code === "number" ? code : undefined;
  } catch {
    return undefined;
  }
}

export interface SendResult {
  sent: boolean;
  reason?: string;
  messageId?: string;
  /** Code d'erreur Meta brut (ex. 131047, 132000) quand l'API a répondu en erreur. */
  metaCode?: number;
}

export interface MenuRow {
  id: string;
  title: string;
  description: string;
}

/** Pôles par défaut — seed du réglage menu_poles, éditable depuis le dashboard. */
export const MENU_ROWS: MenuRow[] = [
  { id: "digital", title: "Digital", description: "Sites, apps, IA, bots, design" },
  { id: "crea_societe", title: "Créa société", description: "LLC USA, LTD UK, LTD Hong Kong" },
  { id: "trafic_pro", title: "Trafic Pro", description: "Formation réseaux sociaux & trafic" },
  { id: "china_acces", title: "China Accès", description: "Formation & agents en Chine" },
  { id: "vinted_pro", title: "Vinted Pro", description: "Formation Vinted" },
];

export interface InteractiveButton {
  id: string;
  title: string;
}

export interface WhatsAppClientOptions {
  apiBase: string;
  token: string;
  phoneNumberId: string;
  minGapMs?: number;
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

  /**
   * Texte libre. `manual: true` = envoi déclenché par Jacob depuis le
   * back-office : le verrou local des 24 h ne s'applique pas (cf.
   * `canSendManual`), seul l'opt-out bloque encore avant l'appel Meta.
   */
  async sendText(
    waId: string,
    text: string,
    opts: { manual?: boolean } = {},
  ): Promise<SendResult> {
    const gate = opts.manual ? this.gate.canSendManual(waId) : this.gate.canSendFreeForm(waId);
    if (!gate.ok) {
      logDecision(this.log, "send_blocked", { waId, kind: "text", reason: gate.reason });
      return { sent: false, reason: gate.reason };
    }
    return this.dispatch(waId, "text", {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: waId,
      type: "text",
      text: { preview_url: false, body: text.slice(0, 4096) },
    });
  }

  /** Boutons de réponse interactifs (max 3, titres ≤ 20 caractères). */
  async sendButtons(waId: string, bodyText: string, buttons: InteractiveButton[]): Promise<SendResult> {
    const gate = this.gate.canSendFreeForm(waId);
    if (!gate.ok) {
      logDecision(this.log, "send_blocked", { waId, kind: "buttons", reason: gate.reason });
      return { sent: false, reason: gate.reason };
    }
    return this.dispatch(waId, "buttons", {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: waId,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText.slice(0, 1024) },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({
            type: "reply",
            // Troncature par points de code (pas d'unité UTF-16 orpheline avec les emoji).
            reply: { id: b.id, title: [...b.title].slice(0, 20).join("") },
          })),
        },
      },
    });
  }

  /** Liste interactive des 5 pôles. */
  async sendMenu(waId: string, rows: readonly MenuRow[] = MENU_ROWS): Promise<SendResult> {
    const gate = this.gate.canSendFreeForm(waId);
    if (!gate.ok) {
      logDecision(this.log, "send_blocked", { waId, kind: "menu", reason: gate.reason });
      return { sent: false, reason: gate.reason };
    }
    // Limites Cloud API : 10 lignes max, titre ≤ 24, description ≤ 72 (code points).
    const source = rows.length > 0 ? rows : MENU_ROWS;
    const safeRows = source.slice(0, 10).map((r) => ({
      id: r.id.slice(0, 200),
      title: [...r.title].slice(0, 24).join(""),
      description: [...r.description].slice(0, 72).join(""),
    }));
    return this.dispatch(waId, "menu", {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: waId,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type: "text", text: "ARBI JACOB" },
        body: { text: "Voici nos pôles. Dis-moi ce qui t'intéresse 👇" },
        action: {
          button: "Découvrir",
          sections: [{ title: "Nos pôles", rows: safeRows }],
        },
      },
    });
  }

  /**
   * Template approuvé Meta — seul canal autorisé hors fenêtre de service 24 h.
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

  /**
   * Dépose un fichier chez Meta (POST /{phone-number-id}/media) et renvoie son
   * identifiant, à passer ensuite à `sendMedia`. Endpoint et encodage
   * différents des messages (multipart, pas de JSON) : cet appel ne passe donc
   * pas par `dispatch`. Ne lève jamais — `null` en cas d'échec.
   */
  async uploadMedia(file: Buffer, mime: string, filename: string): Promise<string | null> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mime);
    form.append("file", new Blob([new Uint8Array(file)], { type: mime }), filename);
    try {
      const response = await this.fetchFn(
        `${this.opts.apiBase}/${this.opts.phoneNumberId}/media`,
        { method: "POST", headers: { Authorization: `Bearer ${this.opts.token}` }, body: form },
      );
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        this.log.error(
          { status: response.status, mime, body: body.slice(0, 500) },
          "whatsapp_media_upload_failed",
        );
        return null;
      }
      const json = (await response.json().catch(() => ({}))) as { id?: string };
      if (!json.id) {
        this.log.error({ mime }, "whatsapp_media_upload_no_id");
        return null;
      }
      logDecision(this.log, "media_uploaded", { mediaId: json.id, mime, bytes: file.byteLength });
      return json.id;
    } catch (err) {
      this.log.error({ err: String(err), mime }, "whatsapp_media_upload_error");
      return null;
    }
  }

  /**
   * Envoie un média déjà déposé chez Meta (`uploadMedia`). `manual: true` =
   * envoi déclenché par Jacob depuis le back-office : mêmes règles que
   * `sendText` — pas de verrou local sur la fenêtre 24 h, l'opt-out bloque.
   */
  async sendMedia(
    waId: string,
    kind: "image" | "video" | "audio" | "document",
    mediaId: string,
    opts: { caption?: string; filename?: string; manual?: boolean } = {},
  ): Promise<SendResult> {
    const gate = opts.manual ? this.gate.canSendManual(waId) : this.gate.canSendFreeForm(waId);
    if (!gate.ok) {
      logDecision(this.log, "send_blocked", { waId, kind, reason: gate.reason });
      return { sent: false, reason: gate.reason };
    }
    const media: Record<string, string> = { id: mediaId };
    // WhatsApp refuse une légende sur l'audio, et `filename` n'existe que pour
    // les documents.
    if (opts.caption && kind !== "audio") media.caption = opts.caption.slice(0, 1024);
    if (opts.filename && kind === "document") media.filename = opts.filename;
    return this.dispatch(waId, kind, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: waId,
      type: kind,
      [kind]: media,
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

  private async postWithRetry(waId: string, kind: string, payload: unknown): Promise<SendResult> {
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
      const metaCode = metaErrorCode(errorBody);
      this.log.error(
        { waId, kind, status: response.status, metaCode, body: errorBody.slice(0, 500) },
        "whatsapp_send_failed",
      );
      const reason =
        metaCode !== undefined && META_OUTSIDE_WINDOW_CODES.has(metaCode)
          ? "outside_24h_window"
          : `http_${response.status}`;
      return { sent: false, reason, ...(metaCode !== undefined ? { metaCode } : {}) };
    }
    return { sent: false, reason: "retries_exhausted" };
  }

  private backoff(attempt: number): number {
    return 500 * 2 ** attempt + Math.floor(Math.random() * 250);
  }
}
