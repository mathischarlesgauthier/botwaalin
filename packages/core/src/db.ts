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
import { migrate } from "./migrations";
import { OBJECTIONS_SEED, PRICING_SEED, SYNONYMS_SEED } from "./pricing-data";
import type { PricingRow } from "./pricing";
import * as schema from "./schema";
import { MENU_ROWS, type MenuRow } from "./whatsapp";

// ─── Réglages : clés, valeurs par défaut ─────────────────────────────────────

export interface AdminNumber {
  number: string;
  actif: boolean;
}

export const NIVEAU4_MESSAGE =
  "Je n'ai pas les connaissances nécessaires pour pouvoir te répondre précisément. Si tu souhaites avoir une réponse un peu plus rapide, contacte directement {telegram} sur Telegram. Sinon, laisse-moi une alerte et Jacob pourra intervenir directement dans la conversation.";

export const SETTINGS_DEFAULTS = {
  admin_numbers: [] as AdminNumber[],
  menu_poles: MENU_ROWS as MenuRow[],
  telegram_contact: "@Jacob13013",
  group_link: "https://t.me/+P6Vba87ei95lZGJk",
  bot_actif: true,
  reactivation_delay_h: 24,
  alert_threshold: 3,
  dashboard_url: "",
  niveau4_message: NIVEAU4_MESSAGE,
  objections: OBJECTIONS_SEED,
  alert_template_name: "alerte_admin",
  alert_email_to: "",
  stripe_payment_link_url: "",
  stripe_price_id: "",
  stripe_customer_id: "",
  stripe_subscription_id: "",
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
    insert(
      waId: string,
      role: "user" | "assistant" | "human",
      contenu: string,
      wamid: string | null = null,
      ts: number = now(),
    ): void {
      db.insert(schema.messages).values({ waId, role, contenu, wamid, ts }).run();
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
        updatedAt: now(),
      };
      // `resume` est exclu de l'UPDATE : il appartient au dashboard (setResume).
      // Sans ça, un save du bot pendant une régénération de résumé écraserait
      // silencieusement le résumé fraîchement calculé (course inter-processus).
      const { resume: _resume, ...updateSet } = values;
      db.insert(schema.conversationState)
        .values(values)
        .onConflictDoUpdate({ target: schema.conversationState.waId, set: updateSet })
        .run();
    },
    /** Écriture ciblée du résumé (dashboard) : ne touche à aucun champ vivant du bot. */
    setResume(waId: string, resume: string): void {
      sqlite
        .prepare(
          `INSERT INTO conversation_state (wa_id, resume, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(wa_id) DO UPDATE SET resume = excluded.resume, updated_at = excluded.updated_at`,
        )
        .run(waId, resume, now());
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
    conversationOverview,
    close(): void {
      sqlite.close();
    },
  };
}

export type Core = ReturnType<typeof createCore>;
