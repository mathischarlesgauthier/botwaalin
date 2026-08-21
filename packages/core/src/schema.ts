import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const contacts = sqliteTable("contacts", {
  waId: text("wa_id").primaryKey(),
  nom: text("nom"),
  langue: text("langue").notNull().default("fr"),
  statut: text("statut").notNull().default("nouveau"),
  optOut: integer("opt_out").notNull().default(0),
  modeHumain: integer("mode_humain").notNull().default(0),
  humainDepuis: integer("humain_depuis"),
  createdAt: integer("created_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  waId: text("wa_id").notNull(),
  /** user (client) | assistant (bot) | human (Jacob via dashboard) */
  role: text("role").notNull(),
  contenu: text("contenu").notNull(),
  wamid: text("wamid"),
  ts: integer("ts").notNull(),
});

export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  waId: text("wa_id").notNull(),
  offre: text("offre").notNull(),
  besoin: text("besoin"),
  budget: text("budget"),
  delai: text("delai"),
  score: integer("score"),
  /** nouveau | en_cours | devis_envoye | gagne | perdu */
  statut: text("statut").notNull().default("nouveau"),
  ts: integer("ts").notNull(),
});

export const handoffs = sqliteTable("handoffs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  waId: text("wa_id").notNull(),
  motif: text("motif").notNull(),
  ts: integer("ts").notNull(),
});

export const alerts = sqliteTable("alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  waId: text("wa_id").notNull(),
  categorie: text("categorie").notNull().default("Autre"),
  intention: text("intention").notNull().default(""),
  motif: text("motif").notNull(),
  resume: text("resume").notNull().default(""),
  dernierMessage: text("dernier_message").notNull().default(""),
  /** ouverte | traitee */
  statut: text("statut").notNull().default("ouverte"),
  notifiedVia: text("notified_via").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  treatedAt: integer("treated_at"),
});

export const conversationState = sqliteTable("conversation_state", {
  waId: text("wa_id").primaryKey(),
  serviceEnCours: text("service_en_cours"),
  sousCategorie: text("sous_categorie"),
  besoin: text("besoin"),
  budget: text("budget"),
  delai: text("delai"),
  /** JSON: string[] des objections déjà traitées */
  objections: text("objections").notNull().default("[]"),
  /** JSON: string[] des offres déjà présentées */
  offresPresentees: text("offres_presentees").notNull().default("[]"),
  /** pro | relache | neutre */
  toneRegister: text("tone_register").notNull().default("neutre"),
  /** JSON: {marker: string, atIndex: number}[] — anti-répétition */
  styleMarkers: text("style_markers").notNull().default("[]"),
  groupLinkSent: integer("group_link_sent").notNull().default(0),
  crossSellDone: integer("cross_sell_done").notNull().default(0),
  lastIntent: text("last_intent"),
  sansProgression: integer("sans_progression").notNull().default(0),
  /** Compteur de réponses du bot dans la conversation (pour l'anti-répétition) */
  replyCount: integer("reply_count").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  /** JSON encodé */
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const settingsHistory = sqliteTable("settings_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value").notNull(),
  changedAt: integer("changed_at").notNull(),
});

export const questions = sqliteTable("questions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  waId: text("wa_id").notNull(),
  texte: text("texte").notNull(),
  normalise: text("normalise").notNull(),
  intention: text("intention").notNull().default(""),
  categorie: text("categorie").notNull().default("Autre"),
  repondue: integer("repondue").notNull().default(1),
  alerteId: integer("alerte_id"),
  createdAt: integer("created_at").notNull(),
});

export const catalogueVersions = sqliteTable("catalogue_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contenu: text("contenu").notNull(),
  note: text("note").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

export const pricing = sqliteTable("pricing", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serviceKey: text("service_key").notNull().unique(),
  label: text("label").notNull(),
  categorie: text("categorie").notNull(),
  /** FIXED | FROM | QUOTE | RANGE */
  type: text("type").notNull(),
  prixMin: integer("prix_min"),
  prixMax: integer("prix_max"),
  /** "" (one-shot) | "mois" */
  unite: text("unite").notNull().default(""),
  perimetre: text("perimetre").notNull().default(""),
  /** Texte d'affichage sur mesure (ex. « 1 100 € comptant, ou 1 500 € en 4 fois ») */
  affichage: text("affichage"),
  actif: integer("actif").notNull().default(1),
  updatedAt: integer("updated_at").notNull(),
});

export const pricingHistory = sqliteTable("pricing_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serviceKey: text("service_key").notNull(),
  avant: text("avant"),
  apres: text("apres").notNull(),
  changedAt: integer("changed_at").notNull(),
});

export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  waId: text("wa_id").notNull(),
  texte: text("texte").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const synonyms = sqliteTable("synonyms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pattern: text("pattern").notNull(),
  resolution: text("resolution").notNull(),
  actif: integer("actif").notNull().default(1),
});
