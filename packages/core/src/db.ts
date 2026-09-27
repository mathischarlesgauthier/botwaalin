import BetterSqlite3 = require("better-sqlite3");
const Database = BetterSqlite3;

type SqliteDatabase = BetterSqlite3.Database;

/** Accès SQL brut typé maison (le type better-sqlite3 n'est pas exportable). */
export interface RawStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}
export interface RawDb {
  prepare(sql: string): RawStatement;
}
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { normalizeText } from "./intents";
import { migrate } from "./migrations";
import { amountsIn } from "./pricing";
import { OBJECTIONS_SEED, PRICING_SEED, SYNONYMS_SEED } from "./pricing-data";
import type { PricingRow } from "./pricing";
import * as schema from "./schema";
import { MENU_ROWS, type MenuRow } from "./whatsapp";

// ─── Réglages : clés, valeurs par défaut ─────────────────────────────────────

export interface AdminNumber {
  number: string;
  actif: boolean;
}

// ─── Nouvelles tables (documents, mémoire client, exemples appris) ──────────

export interface DocumentRow {
  id: number;
  nom: string;
  fichier: string;
  mime: string;
  taille: number;
  contenu: string;
  extractionReason: string;
  note: string;
  actif: number;
  createdAt: number;
  updatedAt: number;
}

/** Fichier de la bibliothèque que le bot peut envoyer aux clients. */
export interface BotFileRow {
  id: number;
  cle: string;
  nom: string;
  description: string;
  fichier: string;
  mime: string;
  kind: string;
  taille: number;
  actif: number;
  envois: number;
  createdAt: number;
}

export interface FactRow {
  id: number;
  waId: string;
  fait: string;
  source: "bot" | "jacob" | "auto";
  actif: number;
  createdAt: number;
  updatedAt: number;
}

export interface ExampleRow {
  id: number;
  waId: string;
  question: string;
  reponse: string;
  theme: string;
  statut: "en_attente" | "actif" | "rejete";
  motifRejet: string;
  messageId: number | null;
  /** Nombre d'échecs techniques de `reviewExample` (JSON illisible, erreur réseau…) — voir `recordFailedAttempt`. */
  attempts: number;
  createdAt: number;
  updatedAt: number;
}

export const NIVEAU4_MESSAGE =
  "Je n'ai pas les connaissances nécessaires pour pouvoir te répondre précisément. Si tu souhaites une réponse plus rapide, écris directement à Jacob au {contact}. Sinon, laisse-moi une alerte et il pourra intervenir directement dans la conversation.";

export const SETTINGS_DEFAULTS = {
  admin_numbers: [] as AdminNumber[],
  menu_poles: MENU_ROWS as MenuRow[],
  /**
   * Contact direct de Jacob donné au client quand le bot passe la main.
   * WhatsApp : le client y est déjà, il n'a pas à changer d'application.
   */
  contact_direct: "+33 7 78 78 37 01",
  group_link: "https://t.me/+P6Vba87ei95lZGJk",
  bot_actif: true,
  reactivation_delay_h: 24,
  /**
   * Nombre d'échanges sans progression avant d'alerter Jacob. Volontairement
   * haut : une conversation qui piétine deux tours n'a pas besoin d'un humain,
   * le bot doit d'abord essayer de débloquer lui-même.
   */
  alert_threshold: 5,
  /**
   * Jusqu'où le bot se débrouille seul avant de passer la main.
   * autonome (défaut) : il passe la main seulement quand l'information est
   * introuvable ou qu'un engagement est en jeu · equilibre : il passe la main
   * dès qu'il n'est pas sûr · prudent : au moindre doute.
   */
  bot_autonomie: "autonome" as "autonome" | "equilibre" | "prudent",
  dashboard_url: "",
  niveau4_message: NIVEAU4_MESSAGE,
  objections: OBJECTIONS_SEED,
  alert_template_name: "alerte_admin",
  /** Langue Meta du template d'alerte (ex. "fr") — utilisée par `sendTemplate`. */
  alert_template_lang: "fr",
  alert_email_to: "",
  /** Template de relance client hors fenêtre 24 h. Vide = bouton de relance absent. */
  relance_template_name: "",
  /**
   * Messages de relance prêts à l'emploi, proposés en un clic dans la
   * conversation quand la fenêtre 24 h est fermée. Ils partent dans la
   * variable {{1}} du template approuvé : c'est le seul moyen de délivrer un
   * texte libre hors fenêtre.
   */
  relance_messages: [
    "Salut, comment tu vas ?",
    "Salut, je reviens vers toi par rapport à notre conversation.",
    "Salut, est-ce que tu as pu regarder de ton côté ?",
    "Salut, je reste dispo si tu veux qu'on avance sur ton projet.",
  ] as string[],
  /** Guide de style appris, régénérable depuis le back-office (§6), injecté après « Personnalité ». */
  style_guide_appris: "",
  /**
   * Brouillon produit par `regenerateStyleGuideAction`, JAMAIS injecté dans le
   * prompt : le résultat du LLM peut reprendre un prénom/détail d'un message
   * client (source = 40 derniers messages `human`, tous contacts confondus).
   * Publié dans `style_guide_appris` uniquement après relecture explicite de
   * Jacob (bouton « Enregistrer »).
   */
  style_guide_appris_brouillon: "",
  stripe_payment_link_url: "",
  stripe_price_id: "",
  stripe_customer_id: "",
  stripe_subscription_id: "",
  /** Textes marketing du site vitrine (JSON libre : types et seed côté dashboard). */
  site_content: {} as Record<string, unknown>,
} as const;

export type SettingsKey = keyof typeof SETTINGS_DEFAULTS;

// ─── État de conversation (JSON désérialisé) ─────────────────────────────────

export interface MarkerUseRow {
  marker: string;
  atIndex: number;
}

export interface ConversationStateData {
  waId: string;
  serviceEnCours: string | null;
  sousCategorie: string | null;
  besoin: string | null;
  budget: string | null;
  delai: string | null;
  objections: string[];
  offresPresentees: string[];
  toneRegister: "pro" | "relache" | "neutre";
  styleMarkers: MarkerUseRow[];
  groupLinkSent: boolean;
  crossSellDone: boolean;
  lastIntent: string | null;
  sansProgression: number;
  replyCount: number;
  resume: string;
  /** Id du dernier message pris en compte par `resume` (0 = jamais résumé). */
  resumeMessageId: number;
}

const EMPTY_STATE: Omit<ConversationStateData, "waId"> = {
  serviceEnCours: null,
  sousCategorie: null,
  besoin: null,
  budget: null,
  delai: null,
  objections: [],
  offresPresentees: [],
  toneRegister: "neutre",
  styleMarkers: [],
  groupLinkSent: false,
  crossSellDone: false,
  lastIntent: null,
  sansProgression: 0,
  replyCount: 0,
  resume: "",
  resumeMessageId: 0,
};

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Format E.164 : +[indicatif][numéro], 7 à 15 chiffres au total. */
export function validateE164(number: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(number.trim());
}

export interface CreateCoreOptions {
  dbPath: string;
  /** Fichier catalogue seed (utilisé uniquement si la table est vide). */
  catalogueSeedPath?: string;
  /** Numéro admin initial (seed du réglage admin_numbers s'il est vide). */
  adminWhatsappNumber?: string;
  dashboardUrl?: string;
}

export function createCore(options: CreateCoreOptions) {
  if (options.dbPath !== ":memory:") {
    mkdirSync(dirname(options.dbPath), { recursive: true });
  }
  const sqlite: SqliteDatabase = new Database(options.dbPath);
  migrate(sqlite);
  const db: BetterSQLite3Database<typeof schema> = drizzle(sqlite, { schema });
  const now = () => Date.now();

  // ── Réglages ──
  const settingsRepo = {
    get<K extends SettingsKey>(key: K): (typeof SETTINGS_DEFAULTS)[K] {
      const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
      if (!row) return SETTINGS_DEFAULTS[key];
      return parseJson(row.value, SETTINGS_DEFAULTS[key]) as (typeof SETTINGS_DEFAULTS)[K];
    },
    getRaw(key: string): unknown {
      const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
      return row ? parseJson<unknown>(row.value, null) : null;
    },
    set(key: string, value: unknown): void {
      const previous = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
      const encoded = JSON.stringify(value);
      if (previous?.value === encoded) return;
      db.insert(schema.settings)
        .values({ key, value: encoded, updatedAt: now() })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value: encoded, updatedAt: now() },
        })
        .run();
      db.insert(schema.settingsHistory)
        .values({ key, oldValue: previous?.value ?? null, newValue: encoded, changedAt: now() })
        .run();
    },
    history(key: string, limit = 20) {
      return db
        .select()
        .from(schema.settingsHistory)
        .where(eq(schema.settingsHistory.key, key))
        .orderBy(desc(schema.settingsHistory.id))
        .limit(limit)
        .all();
    },
  };

  // ── Contacts ──
  const contactsRepo = {
    upsert(waId: string, nom?: string | null): void {
      db.insert(schema.contacts)
        .values({ waId, nom: nom ?? null, createdAt: now() })
        .onConflictDoUpdate({
          target: schema.contacts.waId,
          set: { nom: sql`COALESCE(${nom ?? null}, ${schema.contacts.nom})` },
        })
        .run();
    },
    get(waId: string) {
      return db.select().from(schema.contacts).where(eq(schema.contacts.waId, waId)).get();
    },
    setOptOut(waId: string, optOut: boolean): void {
      db.update(schema.contacts)
        .set({ optOut: optOut ? 1 : 0 })
        .where(eq(schema.contacts.waId, waId))
        .run();
    },
    setStatut(waId: string, statut: string): void {
      db.update(schema.contacts).set({ statut }).where(eq(schema.contacts.waId, waId)).run();
    },
    setModeHumain(waId: string, on: boolean): void {
      db.update(schema.contacts)
        .set({ modeHumain: on ? 1 : 0, humainDepuis: on ? now() : null })
        .where(eq(schema.contacts.waId, waId))
        .run();
    },
    /**
     * Rend la main au bot pour les conversations en mode humain dont JACOB est
     * inactif depuis `delayMs`. L'inactivité se mesure sur le rôle 'human'
     * uniquement : les messages du client ne doivent pas réarmer le délai,
     * sinon un client qui écrit régulièrement resterait sans réponse à jamais.
     */
    releaseStaleHumanMode(delayMs: number): number {
      const cutoff = now() - delayMs;
      const stale = sqlite
        .prepare(
          `SELECT c.wa_id FROM contacts c
           WHERE c.mode_humain = 1
             AND COALESCE((SELECT MAX(ts) FROM messages m WHERE m.wa_id = c.wa_id AND m.role = 'human'), c.humain_depuis, 0) < ?`,
        )
        .all(cutoff) as Array<{ wa_id: string }>;
      for (const row of stale) contactsRepo.setModeHumain(row.wa_id, false);
      return stale.length;
    },
  };

  // ── Messages ──
  const messagesRepo = {
    /** Renvoie l'id AUTOINCREMENT de la ligne insérée (ex. capture d'exemple appris depuis un message `human`). */
    insert(
      waId: string,
      role: "user" | "assistant" | "human",
      contenu: string,
      wamid: string | null = null,
      ts: number = now(),
      media?: { type?: string; file?: string; mime?: string },
    ): number {
      const result = db
        .insert(schema.messages)
        .values({
          waId,
          role,
          contenu,
          wamid,
          ts,
          mediaType: media?.type ?? "",
          mediaFile: media?.file ?? "",
          mediaMime: media?.mime ?? "",
        })
        .run();
      return Number(result.lastInsertRowid);
    },
    /**
     * Supprime UNIQUEMENT un message `role = 'human'` (garde dans le WHERE, pas
     * une vérification préalable en JS) : un message client ou bot n'est jamais
     * supprimable, sinon la fenêtre 24 h et l'historique du modèle deviendraient faux.
     */
    deleteHuman(id: number): boolean {
      const result = sqlite.prepare(`DELETE FROM messages WHERE id = ? AND role = 'human'`).run(id);
      return result.changes > 0;
    },
    /**
     * Fichier média attaché à un message, à lire AVANT suppression : sans lui,
     * le fichier resterait sur le volume sans plus aucune référence.
     */
    mediaFileOf(id: number): string {
      const row = sqlite.prepare(`SELECT media_file AS f FROM messages WHERE id = ?`).get(id) as
        | { f: string | null }
        | undefined;
      return row?.f ?? "";
    },
    /**
     * 40 derniers messages `human`, tous contacts confondus (guide de style
     * appris, §6). Les entrées techniques entre crochets ([Photo envoyée],
     * [Template de relance envoyé…]) sont exclues : ce ne sont pas des phrases
     * de Jacob, et le modèle finirait par imiter ces étiquettes.
     */
    lastHumanMessages(limit = 40): Array<{ contenu: string }> {
      return sqlite
        .prepare(
          `SELECT contenu FROM messages
           WHERE role = 'human' AND contenu NOT LIKE '[%'
           ORDER BY id DESC LIMIT ?`,
        )
        .all(limit) as Array<{ contenu: string }>;
    },
    /** Complète un message média une fois téléchargé/transcrit (traitement différé). */
    attachMedia(
      wamid: string,
      patch: { contenu?: string; file?: string; mime?: string },
    ): void {
      const set: Record<string, string> = {};
      if (patch.contenu !== undefined) set.contenu = patch.contenu;
      if (patch.file !== undefined) set.media_file = patch.file;
      if (patch.mime !== undefined) set.media_mime = patch.mime;
      const keys = Object.keys(set);
      if (keys.length === 0) return;
      sqlite
        .prepare(`UPDATE messages SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE wamid = ?`)
        .run(...keys.map((k) => set[k]), wamid);
    },
    hasWamid(wamid: string): boolean {
      return (
        db.select({ id: schema.messages.id })
          .from(schema.messages)
          .where(eq(schema.messages.wamid, wamid))
          .get() !== undefined
      );
    },
    history(waId: string, limit = 20) {
      const rows = db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.waId, waId))
        .orderBy(desc(schema.messages.id))
        .limit(limit)
        .all();
      return rows.reverse();
    },
    fullTranscript(waId: string) {
      return db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.waId, waId))
        .orderBy(asc(schema.messages.id))
        .all();
    },
    lastInboundTs(waId: string): number | null {
      const row = sqlite
        .prepare(`SELECT MAX(ts) AS ts FROM messages WHERE wa_id = ? AND role = 'user'`)
        .get(waId) as { ts: number | null } | undefined;
      return row?.ts ?? null;
    },
    /** Dernier message de la conversation, tous rôles — fraîcheur du résumé. */
    lastMessageId(waId: string): number {
      const row = sqlite
        .prepare(`SELECT MAX(id) AS id FROM messages WHERE wa_id = ?`)
        .get(waId) as { id: number | null } | undefined;
      return row?.id ?? 0;
    },
    lastUserMessageId(waId: string): number | null {
      const row = sqlite
        .prepare(`SELECT MAX(id) AS id FROM messages WHERE wa_id = ? AND role = 'user'`)
        .get(waId) as { id: number | null } | undefined;
      return row?.id ?? null;
    },
  };

  // ── État de conversation ──
  const stateRepo = {
    get(waId: string): ConversationStateData {
      const row = db
        .select()
        .from(schema.conversationState)
        .where(eq(schema.conversationState.waId, waId))
        .get();
      if (!row) return { waId, ...EMPTY_STATE };
      return {
        waId,
        serviceEnCours: row.serviceEnCours,
        sousCategorie: row.sousCategorie,
        besoin: row.besoin,
        budget: row.budget,
        delai: row.delai,
        objections: parseJson<string[]>(row.objections, []),
        offresPresentees: parseJson<string[]>(row.offresPresentees, []),
        toneRegister: (row.toneRegister as ConversationStateData["toneRegister"]) ?? "neutre",
        styleMarkers: parseJson<MarkerUseRow[]>(row.styleMarkers, []),
        groupLinkSent: row.groupLinkSent === 1,
        crossSellDone: row.crossSellDone === 1,
        lastIntent: row.lastIntent,
        sansProgression: row.sansProgression,
        replyCount: row.replyCount,
        resume: row.resume,
        resumeMessageId: row.resumeMessageId,
      };
    },
    save(state: ConversationStateData): void {
      const values = {
        waId: state.waId,
        serviceEnCours: state.serviceEnCours,
        sousCategorie: state.sousCategorie,
        besoin: state.besoin,
        budget: state.budget,
        delai: state.delai,
        objections: JSON.stringify(state.objections),
        offresPresentees: JSON.stringify(state.offresPresentees),
        toneRegister: state.toneRegister,
        styleMarkers: JSON.stringify(state.styleMarkers),
        groupLinkSent: state.groupLinkSent ? 1 : 0,
        crossSellDone: state.crossSellDone ? 1 : 0,
        lastIntent: state.lastIntent,
        sansProgression: state.sansProgression,
        replyCount: state.replyCount,
        resume: state.resume,
        resumeMessageId: state.resumeMessageId,
        updatedAt: now(),
      };
      // `resume` et son marqueur de fraîcheur sont exclus de l'UPDATE : ils
      // appartiennent au producteur du résumé (setResume). Sans ça, un save du
      // bot pendant une régénération écraserait silencieusement le résumé
      // fraîchement calculé (course inter-processus).
      const { resume: _resume, resumeMessageId: _resumeMessageId, ...updateSet } = values;
      db.insert(schema.conversationState)
        .values(values)
        .onConflictDoUpdate({ target: schema.conversationState.waId, set: updateSet })
        .run();
    },
    /**
     * Écriture ciblée du résumé (dashboard) : ne touche à aucun champ vivant
     * du bot. `messageId` = dernier message couvert, ce qui rend le résumé
     * auto-vérifiable (périmé dès qu'un message plus récent existe).
     */
    setResume(waId: string, resume: string, messageId = 0): void {
      sqlite
        .prepare(
          `INSERT INTO conversation_state (wa_id, resume, resume_message_id, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(wa_id) DO UPDATE SET resume = excluded.resume,
                                            resume_message_id = excluded.resume_message_id,
                                            updated_at = excluded.updated_at`,
        )
        .run(waId, resume, messageId, now());
    },
    reset(waId: string): void {
      db.delete(schema.conversationState).where(eq(schema.conversationState.waId, waId)).run();
    },
  };

  // ── Leads ──
  const leadsRepo = {
    insert(waId: string, lead: { offre: string; besoin: string; budget: string; delai: string; score: number }): void {
      db.insert(schema.leads).values({ waId, ...lead, ts: now() }).run();
    },
    list() {
      return db.select().from(schema.leads).orderBy(desc(schema.leads.ts)).all();
    },
    /** Leads encore à traiter — alimente le compteur du menu et de l'accueil. */
    countNouveaux(): number {
      const row = sqlite
        .prepare(`SELECT COUNT(*) AS n FROM leads WHERE statut = 'nouveau'`)
        .get() as { n: number };
      return row.n;
    },
    setStatut(id: number, statut: string): void {
      db.update(schema.leads).set({ statut }).where(eq(schema.leads.id, id)).run();
    },
  };

  // ── Alertes ──
  const alertsRepo = {
    create(input: {
      waId: string;
      categorie: string;
      intention: string;
      motif: string;
      resume: string;
      dernierMessage: string;
      notifiedVia?: string;
    }): number {
      const result = db
        .insert(schema.alerts)
        .values({ ...input, notifiedVia: input.notifiedVia ?? "", createdAt: now() })
        .run();
      return Number(result.lastInsertRowid);
    },
    setNotifiedVia(id: number, via: string): void {
      db.update(schema.alerts).set({ notifiedVia: via }).where(eq(schema.alerts.id, id)).run();
    },
    get(id: number) {
      return db.select().from(schema.alerts).where(eq(schema.alerts.id, id)).get();
    },
    open() {
      return db
        .select()
        .from(schema.alerts)
        .where(eq(schema.alerts.statut, "ouverte"))
        .orderBy(desc(schema.alerts.createdAt))
        .all();
    },
    countOpen(): number {
      const row = sqlite
        .prepare(`SELECT COUNT(*) AS n FROM alerts WHERE statut = 'ouverte'`)
        .get() as { n: number };
      return row.n;
    },
    hasOpenFor(waId: string): boolean {
      const row = sqlite
        .prepare(`SELECT 1 FROM alerts WHERE wa_id = ? AND statut = 'ouverte' LIMIT 1`)
        .get(waId);
      return row !== undefined;
    },
    markTreated(id: number): void {
      db.update(schema.alerts)
        .set({ statut: "traitee", treatedAt: now() })
        .where(eq(schema.alerts.id, id))
        .run();
    },
    listFor(waId: string) {
      return db
        .select()
        .from(schema.alerts)
        .where(eq(schema.alerts.waId, waId))
        .orderBy(desc(schema.alerts.createdAt))
        .all();
    },
  };

  // ── Tarifs ──
  const pricingRepo = {
    all(): PricingRow[] {
      return db.select().from(schema.pricing).orderBy(asc(schema.pricing.categorie), asc(schema.pricing.label)).all() as PricingRow[];
    },
    active(): PricingRow[] {
      return db.select().from(schema.pricing).where(eq(schema.pricing.actif, 1)).all() as PricingRow[];
    },
    byKey(serviceKey: string): PricingRow | undefined {
      return db
        .select()
        .from(schema.pricing)
        .where(eq(schema.pricing.serviceKey, serviceKey))
        .get() as PricingRow | undefined;
    },
    update(serviceKey: string, patch: Partial<Omit<PricingRow, "id" | "serviceKey">>): void {
      const before = pricingRepo.byKey(serviceKey);
      db.update(schema.pricing)
        .set({ ...patch, updatedAt: now() })
        .where(eq(schema.pricing.serviceKey, serviceKey))
        .run();
      const after = pricingRepo.byKey(serviceKey);
      db.insert(schema.pricingHistory)
        .values({
          serviceKey,
          avant: before ? JSON.stringify(before) : null,
          apres: JSON.stringify(after),
          changedAt: now(),
        })
        .run();
    },
    create(input: Omit<PricingRow, "id" | "updatedAt">): PricingRow {
      db.insert(schema.pricing)
        .values({
          serviceKey: input.serviceKey,
          label: input.label,
          categorie: input.categorie,
          type: input.type,
          prixMin: input.prixMin,
          prixMax: input.prixMax,
          unite: input.unite,
          perimetre: input.perimetre,
          affichage: input.affichage,
          actif: input.actif,
          updatedAt: now(),
        })
        .run();
      const created = pricingRepo.byKey(input.serviceKey) as PricingRow;
      db.insert(schema.pricingHistory)
        .values({
          serviceKey: input.serviceKey,
          avant: null,
          apres: JSON.stringify(created),
          changedAt: now(),
        })
        .run();
      return created;
    },
  };

  // ── Catalogue versionné ──
  const catalogueRepo = {
    current(): { id: number; contenu: string } {
      const row = db
        .select()
        .from(schema.catalogueVersions)
        .orderBy(desc(schema.catalogueVersions.id))
        .limit(1)
        .get();
      return row ? { id: row.id, contenu: row.contenu } : { id: 0, contenu: "" };
    },
    currentVersionId(): number {
      const row = sqlite.prepare(`SELECT MAX(id) AS id FROM catalogue_versions`).get() as {
        id: number | null;
      };
      return row.id ?? 0;
    },
    save(contenu: string, note: string): number {
      const result = db
        .insert(schema.catalogueVersions)
        .values({ contenu, note, createdAt: now() })
        .run();
      return Number(result.lastInsertRowid);
    },
    /** Boucle d'apprentissage : ajoute une Q/R à la section FAQ du catalogue. */
    appendFaq(question: string, reponse: string): number {
      const current = catalogueRepo.current();
      const faqHeader = "## FAQ apprise";
      let contenu = current.contenu;
      if (!contenu.includes(faqHeader)) {
        contenu = `${contenu.trimEnd()}\n\n${faqHeader}\n`;
      }
      contenu = `${contenu.trimEnd()}\n\n**Q : ${question.trim()}**\nR : ${reponse.trim()}\n`;
      return catalogueRepo.save(contenu, `FAQ : ${question.slice(0, 60)}`);
    },
    versions(limit = 20) {
      return db
        .select({
          id: schema.catalogueVersions.id,
          note: schema.catalogueVersions.note,
          createdAt: schema.catalogueVersions.createdAt,
        })
        .from(schema.catalogueVersions)
        .orderBy(desc(schema.catalogueVersions.id))
        .limit(limit)
        .all();
    },
  };

  // ── Questions ──
  const questionsRepo = {
    record(input: {
      waId: string;
      texte: string;
      normalise: string;
      intention: string;
      categorie: string;
      repondue: boolean;
      alerteId?: number | null;
    }): void {
      db.insert(schema.questions)
        .values({
          waId: input.waId,
          texte: input.texte,
          normalise: input.normalise,
          intention: input.intention,
          categorie: input.categorie,
          repondue: input.repondue ? 1 : 0,
          alerteId: input.alerteId ?? null,
          createdAt: now(),
        })
        .run();
    },
    all(limit = 500) {
      return db
        .select()
        .from(schema.questions)
        .orderBy(desc(schema.questions.id))
        .limit(limit)
        .all();
    },
    unanswered(limit = 200) {
      return db
        .select()
        .from(schema.questions)
        .where(eq(schema.questions.repondue, 0))
        .orderBy(desc(schema.questions.id))
        .limit(limit)
        .all();
    },
    markAnswered(id: number): void {
      db.update(schema.questions).set({ repondue: 1 }).where(eq(schema.questions.id, id)).run();
    },
    /** Questions pas encore rattachées à un sujet général (les plus récentes d'abord). */
    withoutTopic(limit = 200) {
      return db
        .select()
        .from(schema.questions)
        .where(eq(schema.questions.sujet, ""))
        .orderBy(desc(schema.questions.id))
        .limit(limit)
        .all();
    },
    setTopic(id: number, sujet: string): void {
      db.update(schema.questions).set({ sujet }).where(eq(schema.questions.id, id)).run();
    },
    /**
     * Sujets déjà en base, du plus fréquent au plus rare. Sert à ancrer le
     * classement : une nouvelle question rejoint un sujet existant plutôt que
     * d'en créer un quasi-identique.
     */
    knownTopics(limit = 30): string[] {
      const rows = sqlite
        .prepare(
          `SELECT sujet, COUNT(*) AS n FROM questions WHERE sujet <> ''
           GROUP BY sujet ORDER BY n DESC LIMIT ?`,
        )
        .all(limit) as Array<{ sujet: string }>;
      return rows.map((row) => row.sujet);
    },
  };

  // ── Fichiers envoyables par le bot ──
  const botFilesRepo = {
    create(input: {
      cle: string;
      nom: string;
      description: string;
      fichier: string;
      mime: string;
      kind: string;
      taille: number;
    }): void {
      db.insert(schema.botFiles)
        .values({ ...input, createdAt: now() })
        .run();
    },
    /** Tous les fichiers, actifs d'abord, pour le back-office. */
    list() {
      return db.select().from(schema.botFiles).orderBy(desc(schema.botFiles.id)).all();
    },
    /** Uniquement ce que le bot a le droit d'envoyer, dans l'ordre d'ajout. */
    actifs() {
      return db
        .select()
        .from(schema.botFiles)
        .where(eq(schema.botFiles.actif, 1))
        .orderBy(asc(schema.botFiles.id))
        .all();
    },
    byCle(cle: string) {
      return db.select().from(schema.botFiles).where(eq(schema.botFiles.cle, cle)).get();
    },
    get(id: number) {
      return db.select().from(schema.botFiles).where(eq(schema.botFiles.id, id)).get();
    },
    toggle(id: number): void {
      const row = db.select().from(schema.botFiles).where(eq(schema.botFiles.id, id)).get();
      if (!row) return;
      db.update(schema.botFiles)
        .set({ actif: row.actif === 1 ? 0 : 1 })
        .where(eq(schema.botFiles.id, id))
        .run();
    },
    remove(id: number): void {
      db.delete(schema.botFiles).where(eq(schema.botFiles.id, id)).run();
    },
    countEnvoi(id: number): void {
      sqlite.prepare(`UPDATE bot_files SET envois = envois + 1 WHERE id = ?`).run(id);
    },
  };

  // ── Notes, users, synonymes, handoffs ──
  const notesRepo = {
    add(waId: string, texte: string): void {
      db.insert(schema.notes).values({ waId, texte, createdAt: now() }).run();
    },
    list(waId: string) {
      return db
        .select()
        .from(schema.notes)
        .where(eq(schema.notes.waId, waId))
        .orderBy(desc(schema.notes.id))
        .all();
    },
  };

  const usersRepo = {
    count(): number {
      const row = sqlite.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number };
      return row.n;
    },
    byUsername(username: string) {
      return db.select().from(schema.users).where(eq(schema.users.username, username)).get();
    },
    create(username: string, passwordHash: string): void {
      db.insert(schema.users).values({ username, passwordHash, createdAt: now() }).run();
    },
  };

  const synonymsRepo = {
    active() {
      return db.select().from(schema.synonyms).where(eq(schema.synonyms.actif, 1)).all();
    },
    all() {
      return db.select().from(schema.synonyms).orderBy(asc(schema.synonyms.pattern)).all();
    },
    forResolution(resolution: string) {
      return db
        .select()
        .from(schema.synonyms)
        .where(eq(schema.synonyms.resolution, resolution))
        .orderBy(asc(schema.synonyms.pattern))
        .all();
    },
    /** Remplace les mots-clés de reconnaissance d'un service (dashboard). */
    replaceForResolution(resolution: string, patterns: string[]): void {
      db.delete(schema.synonyms).where(eq(schema.synonyms.resolution, resolution)).run();
      for (const pattern of patterns) {
        const clean = pattern.trim();
        if (!clean) continue;
        db.insert(schema.synonyms).values({ pattern: clean, resolution, actif: 1 }).run();
      }
    },
  };

  const handoffsRepo = {
    insert(waId: string, motif: string): void {
      db.insert(schema.handoffs).values({ waId, motif, ts: now() }).run();
    },
    countFor(waId: string): number {
      const row = sqlite
        .prepare(`SELECT COUNT(*) AS n FROM handoffs WHERE wa_id = ?`)
        .get(waId) as { n: number };
      return row.n;
    },
  };

  // ── Documents de référence pour le prompt (§3) ──
  const documentsRepo = {
    list(): DocumentRow[] {
      return db.select().from(schema.documents).orderBy(desc(schema.documents.id)).all() as DocumentRow[];
    },
    /** Actifs, dans l'ordre d'upload (id ASC) : ordre d'injection dans le prompt. */
    actifs(): DocumentRow[] {
      return db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.actif, 1))
        .orderBy(asc(schema.documents.id))
        .all() as DocumentRow[];
    },
    get(id: number): DocumentRow | undefined {
      return db.select().from(schema.documents).where(eq(schema.documents.id, id)).get() as
        | DocumentRow
        | undefined;
    },
    create(input: {
      nom: string;
      fichier: string;
      mime: string;
      taille: number;
      contenu: string;
      extractionReason: string;
      note: string;
    }): DocumentRow {
      const result = db
        .insert(schema.documents)
        .values({ ...input, actif: 1, createdAt: now(), updatedAt: now() })
        .run();
      return documentsRepo.get(Number(result.lastInsertRowid)) as DocumentRow;
    },
    /** Seuls `note`/`actif` sont éditables après upload — contenu/fichier/mime/taille sont immuables. */
    update(id: number, patch: Partial<Pick<DocumentRow, "note" | "actif">>): void {
      db.update(schema.documents).set({ ...patch, updatedAt: now() }).where(eq(schema.documents.id, id)).run();
    },
    remove(id: number): boolean {
      const result = db.delete(schema.documents).where(eq(schema.documents.id, id)).run();
      return result.changes > 0;
    },
    /** Invalidation du prompt (agent.ts:refreshKnowledge) : compte + dernière modification des actifs. */
    stamp(): { n: number; m: number } {
      return sqlite
        .prepare(`SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS m FROM documents WHERE actif = 1`)
        .get() as { n: number; m: number };
    },
  };

  // ── Mémoire client durable (§5) ──
  /** Faits actifs d'un client, du plus récent au plus ancien, sans plafond (usage interne). */
  function activeFactRows(waId: string): FactRow[] {
    return db
      .select()
      .from(schema.clientFacts)
      .where(and(eq(schema.clientFacts.waId, waId), eq(schema.clientFacts.actif, 1)))
      .orderBy(desc(schema.clientFacts.id))
      .all() as FactRow[];
  }

  const FACTS_MAX_ACTIVE = 20;

  const factsRepo = {
    list(waId: string): FactRow[] {
      return db
        .select()
        .from(schema.clientFacts)
        .where(eq(schema.clientFacts.waId, waId))
        .orderBy(desc(schema.clientFacts.id))
        .all() as FactRow[];
    },
    actifs(waId: string, limit = FACTS_MAX_ACTIVE): FactRow[] {
      return activeFactRows(waId).slice(0, limit);
    },
    /**
     * Filtre déterministe (amountsIn) indépendant de la consigne texte donnée au
     * LLM d'extraction ; déduplication exacte (normalizeText) contre les faits
     * actifs existants ; plafond FACTS_MAX_ACTIVE, éviction des plus anciens
     * `source = 'auto'` uniquement (jamais un fait 'jacob'/'bot').
     */
    add(waId: string, fait: string, source: FactRow["source"]): FactRow | null {
      const clean = fait.trim();
      if (!clean || amountsIn(clean).length > 0) return null;
      const normalized = normalizeText(clean);
      const active = activeFactRows(waId);
      const duplicate = active.find((f) => normalizeText(f.fait) === normalized);
      if (duplicate) {
        db.update(schema.clientFacts).set({ updatedAt: now() }).where(eq(schema.clientFacts.id, duplicate.id)).run();
        return { ...duplicate, updatedAt: now() };
      }
      const result = db
        .insert(schema.clientFacts)
        .values({ waId, fait: clean, source, actif: 1, createdAt: now(), updatedAt: now() })
        .run();
      const created = db
        .select()
        .from(schema.clientFacts)
        .where(eq(schema.clientFacts.id, Number(result.lastInsertRowid)))
        .get() as FactRow;
      const overflow = active.length + 1 - FACTS_MAX_ACTIVE;
      if (overflow > 0) {
        const evictable = active.filter((f) => f.source === "auto").sort((a, b) => a.id - b.id);
        for (const row of evictable.slice(0, overflow)) {
          db.update(schema.clientFacts).set({ actif: 0, updatedAt: now() }).where(eq(schema.clientFacts.id, row.id)).run();
        }
      }
      return created;
    },
    remove(id: number): boolean {
      const result = db.delete(schema.clientFacts).where(eq(schema.clientFacts.id, id)).run();
      return result.changes > 0;
    },
    toggle(id: number): void {
      const row = db.select().from(schema.clientFacts).where(eq(schema.clientFacts.id, id)).get() as
        | FactRow
        | undefined;
      if (!row) return;
      db.update(schema.clientFacts)
        .set({ actif: row.actif ? 0 : 1, updatedAt: now() })
        .where(eq(schema.clientFacts.id, id))
        .run();
    },
    /** Remplace les faits de source 'auto' d'un client (extraction en tâche de fond) — ne touche jamais 'jacob'/'bot'. */
    replaceAuto(waId: string, faits: string[]): void {
      const run = sqlite.transaction(() => {
        for (const row of activeFactRows(waId).filter((f) => f.source === "auto")) {
          db.update(schema.clientFacts).set({ actif: 0, updatedAt: now() }).where(eq(schema.clientFacts.id, row.id)).run();
        }
        for (const fait of faits) factsRepo.add(waId, fait, "auto");
      });
      run();
    },
  };

  // ── Apprentissage : exemples de réponses de Jacob (§6) ──
  const examplesRepo = {
    /** Assemblage de `question` (derniers messages client) fait par l'appelant — repo = CRUD nu. */
    capture(input: {
      waId: string;
      question: string;
      reponse: string;
      theme?: string;
      messageId: number | null;
    }): number | null {
      const question = input.question.trim().slice(0, 600);
      const reponse = input.reponse.trim().slice(0, 600);
      if (question === "") return null;
      const result = db
        .insert(schema.learnedExamples)
        .values({
          waId: input.waId,
          question,
          reponse,
          theme: input.theme ?? "",
          statut: "en_attente",
          motifRejet: "",
          messageId: input.messageId,
          createdAt: now(),
          updatedAt: now(),
        })
        .run();
      return Number(result.lastInsertRowid);
    },
    /** Défaut : 200 lignes, les plus récentes d'abord. Le timer de revue passe `{ limit: 10, order: 'asc' }` (FIFO). */
    list(statut?: ExampleRow["statut"], opts?: { limit?: number; order?: "asc" | "desc" }): ExampleRow[] {
      const limit = opts?.limit ?? 200;
      const orderFn = opts?.order === "asc" ? asc : desc;
      if (statut) {
        return db
          .select()
          .from(schema.learnedExamples)
          .where(eq(schema.learnedExamples.statut, statut))
          .orderBy(orderFn(schema.learnedExamples.id))
          .limit(limit)
          .all() as ExampleRow[];
      }
      return db
        .select()
        .from(schema.learnedExamples)
        .orderBy(orderFn(schema.learnedExamples.id))
        .limit(limit)
        .all() as ExampleRow[];
    },
    actifs(limit = 12): ExampleRow[] {
      return db
        .select()
        .from(schema.learnedExamples)
        .where(eq(schema.learnedExamples.statut, "actif"))
        .orderBy(desc(schema.learnedExamples.id))
        .limit(limit)
        .all() as ExampleRow[];
    },
    get(id: number): ExampleRow | undefined {
      return db.select().from(schema.learnedExamples).where(eq(schema.learnedExamples.id, id)).get() as
        | ExampleRow
        | undefined;
    },
    /** `COUNT(*)` par statut (ou global) — pour les compteurs de badges, sans rapatrier `question`/`reponse`. */
    count(statut?: ExampleRow["statut"]): number {
      const row = statut
        ? sqlite
            .prepare(`SELECT COUNT(*) AS n FROM learned_examples WHERE statut = ?`)
            .get(statut) as { n: number }
        : (sqlite.prepare(`SELECT COUNT(*) AS n FROM learned_examples`).get() as { n: number });
      return row.n;
    },
    update(id: number, patch: Partial<Pick<ExampleRow, "question" | "reponse" | "theme">>): void {
      db.update(schema.learnedExamples)
        .set({ ...patch, updatedAt: now() })
        .where(eq(schema.learnedExamples.id, id))
        .run();
    },
    setStatut(id: number, statut: ExampleRow["statut"], motif = ""): void {
      db.update(schema.learnedExamples)
        .set({ statut, motifRejet: motif, updatedAt: now() })
        .where(eq(schema.learnedExamples.id, id))
        .run();
    },
    /**
     * Échec technique de `reviewExample` (JSON illisible, erreur réseau…) :
     * incrémente `attempts` ; au-delà de `maxAttempts`, rejette automatiquement
     * au lieu de laisser la ligne `en_attente` indéfiniment — sans ce plafond,
     * un exemple systématiquement en échec est retenté à CHAQUE passe du timer
     * (coût LLM récurrent non borné) ET occupe en permanence une des 10 places
     * du lot FIFO, gelant la file pour tout nouvel exemple valide.
     */
    recordFailedAttempt(id: number, maxAttempts = 3): void {
      const row = examplesRepo.get(id);
      if (!row) return;
      const attempts = row.attempts + 1;
      if (attempts >= maxAttempts) {
        db.update(schema.learnedExamples)
          .set({ attempts, statut: "rejete", motifRejet: "échec technique répété", updatedAt: now() })
          .where(eq(schema.learnedExamples.id, id))
          .run();
        return;
      }
      db.update(schema.learnedExamples).set({ attempts, updatedAt: now() }).where(eq(schema.learnedExamples.id, id)).run();
    },
    remove(id: number): boolean {
      const result = db.delete(schema.learnedExamples).where(eq(schema.learnedExamples.id, id)).run();
      return result.changes > 0;
    },
    /** Suppression en cascade depuis `messages.deleteHuman` (§7). */
    removeByMessageId(messageId: number): boolean {
      const result = db
        .delete(schema.learnedExamples)
        .where(eq(schema.learnedExamples.messageId, messageId))
        .run();
      return result.changes > 0;
    },
    /** Un exemple encore 'en_attente' ne doit pas déclencher de rechargement du prompt : seuls les 'actif' comptent. */
    stamp(): { n: number; m: number } {
      return sqlite
        .prepare(`SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS m FROM learned_examples WHERE statut = 'actif'`)
        .get() as { n: number; m: number };
    },
  };

  // ── Vue dashboard : liste des conversations ──
  function conversationOverview(): Array<{
    waId: string;
    nom: string | null;
    statut: string;
    optOut: number;
    modeHumain: number;
    dernierMessage: string;
    dernierTs: number;
    dernierRole: string;
    alertesOuvertes: number;
    score: number | null;
    serviceEnCours: string | null;
    lastIntent: string | null;
  }> {
    const rows = sqlite
      .prepare(
        `SELECT c.wa_id AS waId, c.nom, c.statut, c.opt_out AS optOut, c.mode_humain AS modeHumain,
                m.contenu AS dernierMessage, m.ts AS dernierTs, m.role AS dernierRole,
                (SELECT COUNT(*) FROM alerts a WHERE a.wa_id = c.wa_id AND a.statut = 'ouverte') AS alertesOuvertes,
                (SELECT MAX(score) FROM leads l WHERE l.wa_id = c.wa_id) AS score,
                s.service_en_cours AS serviceEnCours, s.last_intent AS lastIntent
         FROM contacts c
         JOIN messages m ON m.id = (SELECT MAX(id) FROM messages WHERE wa_id = c.wa_id)
         LEFT JOIN conversation_state s ON s.wa_id = c.wa_id
         ORDER BY m.ts DESC`,
      )
      .all() as ReturnType<typeof conversationOverview>;
    return rows;
  }

  // ── Seed initial ──
  const seedNow = now();
  const pricingCount = (sqlite.prepare(`SELECT COUNT(*) AS n FROM pricing`).get() as { n: number }).n;
  if (pricingCount === 0) {
    const insert = db.insert(schema.pricing);
    for (const seed of PRICING_SEED) {
      insert
        .values({
          serviceKey: seed.serviceKey,
          label: seed.label,
          categorie: seed.categorie,
          type: seed.type,
          prixMin: seed.prixMin ?? null,
          prixMax: seed.prixMax ?? null,
          unite: seed.unite ?? "",
          perimetre: seed.perimetre,
          affichage: seed.affichage ?? null,
          updatedAt: seedNow,
        })
        .run();
    }
  }

  const synCount = (sqlite.prepare(`SELECT COUNT(*) AS n FROM synonyms`).get() as { n: number }).n;
  if (synCount === 0) {
    for (const seed of SYNONYMS_SEED) {
      db.insert(schema.synonyms).values({ pattern: seed.pattern, resolution: seed.resolution }).run();
    }
  }

  if (catalogueRepo.currentVersionId() === 0 && options.catalogueSeedPath) {
    if (existsSync(options.catalogueSeedPath)) {
      catalogueRepo.save(readFileSync(options.catalogueSeedPath, "utf8"), "seed initial (data/catalogue.md)");
    }
  }

  for (const [key, fallback] of Object.entries(SETTINGS_DEFAULTS)) {
    const existing = sqlite.prepare(`SELECT 1 FROM settings WHERE key = ?`).get(key);
    if (!existing) {
      let value: unknown = fallback;
      if (key === "admin_numbers" && options.adminWhatsappNumber) {
        value = [{ number: options.adminWhatsappNumber, actif: true }] satisfies AdminNumber[];
      }
      if (key === "dashboard_url" && options.dashboardUrl) {
        value = options.dashboardUrl;
      }
      db.insert(schema.settings)
        .values({ key, value: JSON.stringify(value), updatedAt: seedNow })
        .run();
    }
  }

  return {
    sqlite: sqlite as RawDb,
    db,
    schema,
    settings: settingsRepo,
    contacts: contactsRepo,
    messages: messagesRepo,
    state: stateRepo,
    leads: leadsRepo,
    alerts: alertsRepo,
    pricing: pricingRepo,
    catalogue: catalogueRepo,
    questions: questionsRepo,
    notes: notesRepo,
    users: usersRepo,
    synonyms: synonymsRepo,
    handoffs: handoffsRepo,
    documents: documentsRepo,
    botFiles: botFilesRepo,
    facts: factsRepo,
    examples: examplesRepo,
    conversationOverview,
    close(): void {
      sqlite.close();
    },
  };
}

export type Core = ReturnType<typeof createCore>;
