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
  /** image | audio | video | document | sticker — vide pour un message texte. */
  mediaType: text("media_type").notNull().default(""),
  /** Nom du fichier archivé dans le dossier média (jamais un chemin). */
  mediaFile: text("media_file").notNull().default(""),
  mediaMime: text("media_mime").notNull().default(""),
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
  /** Résumé automatique de la conversation (régénérable depuis le dashboard) */
  resume: text("resume").notNull().default(""),
  /** Id du dernier message couvert par `resume` : au-delà, le résumé est périmé. */
  resumeMessageId: integer("resume_message_id").notNull().default(0),
  /** Id du dernier message client auquel une réponse a RÉELLEMENT été envoyée. */
  repliedMessageId: integer("replied_message_id").notNull().default(0),
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
  /** Sujet général (« Tarifs et devis »…) attribué par le classement thématique. */
  sujet: text("sujet").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

/**
 * Fichiers déposés par Jacob que le BOT peut envoyer aux clients (plaquette,
 * photo d'une réalisation, vidéo de démo). À ne pas confondre avec `documents`,
 * qui alimentent le prompt en texte et ne sont jamais envoyés.
 */
export const botFiles = sqliteTable("bot_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Identifiant stable cité par le modèle dans l'outil send_file. */
  cle: text("cle").notNull().unique(),
  nom: text("nom").notNull(),
  /** Quand l'envoyer — c'est ce que lit le modèle pour décider. */
  description: text("description").notNull().default(""),
  /** Nom du fichier sur le volume (jamais un chemin). */
  fichier: text("fichier").notNull(),
  mime: text("mime").notNull(),
  /** image | video | document — détermine le type de message WhatsApp. */
  kind: text("kind").notNull(),
  taille: integer("taille").notNull().default(0),
  actif: integer("actif").notNull().default(1),
  /** Nombre d'envois, pour repérer ce qui sert vraiment. */
  envois: integer("envois").notNull().default(0),
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

/** Documents de référence uploadés par Jacob (contexte complémentaire du prompt). */
export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Nom d'origine nettoyé (affiché à Jacob). */
  nom: text("nom").notNull(),
  /** Nom du fichier sur disque — identifiant généré, jamais celui du client. */
  fichier: text("fichier").notNull(),
  mime: text("mime").notNull().default(""),
  taille: integer("taille").notNull().default(0),
  /** Texte extrait, "" si l'extraction est impossible (voir extractionReason). */
  contenu: text("contenu").notNull().default(""),
  extractionReason: text("extraction_reason").notNull().default(""),
  /** À quoi il sert, saisi par Jacob. */
  note: text("note").notNull().default(""),
  actif: integer("actif").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Mémoire durable par client, au-delà de l'état de conversation courant. */
export const clientFacts = sqliteTable("client_facts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  waId: text("wa_id").notNull(),
  fait: text("fait").notNull(),
  /** bot (outil pendant la conversation) | jacob (ajout manuel) | auto (extraction en tâche de fond). */
  source: text("source").notNull().default("bot"),
  actif: integer("actif").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Exemples de réponses de Jacob appris depuis l'envoi manuel (mode reprise). */
export const learnedExamples = sqliteTable("learned_examples", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  waId: text("wa_id").notNull(),
  question: text("question").notNull().default(""),
  reponse: text("reponse").notNull().default(""),
  theme: text("theme").notNull().default(""),
  /** en_attente | actif | rejete */
  statut: text("statut").notNull().default("en_attente"),
  motifRejet: text("motif_rejet").notNull().default(""),
  /** Message `human` d'origine (pour la suppression en cascade). Pas de FK stricte (style du projet). */
  messageId: integer("message_id"),
  /** Échecs techniques de `reviewExample` (retry FIFO du timer) — voir `examples.recordFailedAttempt`. */
  attempts: integer("attempts").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
