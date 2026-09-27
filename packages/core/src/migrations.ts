import type BetterSqlite3 from "better-sqlite3";

/**
 * Migrations idempotentes. Gèrent à la fois une base neuve et la base v1
 * existante (dont la table messages portait un CHECK role IN ('user','assistant')
 * incompatible avec le rôle 'human' du mode reprise).
 */

const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS contacts (
  wa_id      TEXT PRIMARY KEY,
  nom        TEXT,
  langue     TEXT NOT NULL DEFAULT 'fr',
  statut     TEXT NOT NULL DEFAULT 'nouveau',
  opt_out    INTEGER NOT NULL DEFAULT 0,
  mode_humain INTEGER NOT NULL DEFAULT 0,
  humain_depuis INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id      TEXT NOT NULL,
  role       TEXT NOT NULL,
  contenu    TEXT NOT NULL,
  wamid      TEXT,
  ts         INTEGER NOT NULL,
  media_type TEXT NOT NULL DEFAULT '',
  media_file TEXT NOT NULL DEFAULT '',
  media_mime TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_messages_wa ON messages (wa_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wamid ON messages (wamid) WHERE wamid IS NOT NULL;

CREATE TABLE IF NOT EXISTS leads (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id  TEXT NOT NULL,
  offre  TEXT NOT NULL,
  besoin TEXT,
  budget TEXT,
  delai  TEXT,
  score  INTEGER,
  statut TEXT NOT NULL DEFAULT 'nouveau',
  ts     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS handoffs (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id TEXT NOT NULL,
  motif TEXT NOT NULL,
  ts    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id           TEXT NOT NULL,
  categorie       TEXT NOT NULL DEFAULT 'Autre',
  intention       TEXT NOT NULL DEFAULT '',
  motif           TEXT NOT NULL,
  resume          TEXT NOT NULL DEFAULT '',
  dernier_message TEXT NOT NULL DEFAULT '',
  statut          TEXT NOT NULL DEFAULT 'ouverte',
  notified_via    TEXT NOT NULL DEFAULT '',
  created_at      INTEGER NOT NULL,
  treated_at      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_alerts_statut ON alerts (statut, created_at);

CREATE TABLE IF NOT EXISTS conversation_state (
  wa_id             TEXT PRIMARY KEY,
  service_en_cours  TEXT,
  sous_categorie    TEXT,
  besoin            TEXT,
  budget            TEXT,
  delai             TEXT,
  objections        TEXT NOT NULL DEFAULT '[]',
  offres_presentees TEXT NOT NULL DEFAULT '[]',
  tone_register     TEXT NOT NULL DEFAULT 'neutre',
  style_markers     TEXT NOT NULL DEFAULT '[]',
  group_link_sent   INTEGER NOT NULL DEFAULT 0,
  cross_sell_done   INTEGER NOT NULL DEFAULT 0,
  last_intent       TEXT,
  sans_progression  INTEGER NOT NULL DEFAULT 0,
  reply_count       INTEGER NOT NULL DEFAULT 0,
  resume            TEXT NOT NULL DEFAULT '',
  resume_message_id INTEGER NOT NULL DEFAULT 0,
  updated_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key        TEXT NOT NULL,
  old_value  TEXT,
  new_value  TEXT NOT NULL,
  changed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id      TEXT NOT NULL,
  texte      TEXT NOT NULL,
  normalise  TEXT NOT NULL,
  intention  TEXT NOT NULL DEFAULT '',
  categorie  TEXT NOT NULL DEFAULT 'Autre',
  repondue   INTEGER NOT NULL DEFAULT 1,
  alerte_id  INTEGER,
  sujet      TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_questions_norm ON questions (normalise);
-- L'index sur la colonne sujet est créé plus bas, APRÈS les ALTER : sur une
-- base existante, CREATE TABLE IF NOT EXISTS est un no-op et la colonne
-- n'existe pas encore ici. Un index posé à cet endroit échouerait sur
-- « no such column » et interromprait toute la migration.

CREATE TABLE IF NOT EXISTS bot_files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cle         TEXT NOT NULL UNIQUE,
  nom         TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  fichier     TEXT NOT NULL,
  mime        TEXT NOT NULL,
  kind        TEXT NOT NULL,
  taille      INTEGER NOT NULL DEFAULT 0,
  actif       INTEGER NOT NULL DEFAULT 1,
  envois      INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bot_files_actif ON bot_files (actif, id);

CREATE TABLE IF NOT EXISTS catalogue_versions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  contenu    TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pricing (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  service_key TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  categorie   TEXT NOT NULL,
  type        TEXT NOT NULL,
  prix_min    INTEGER,
  prix_max    INTEGER,
  unite       TEXT NOT NULL DEFAULT '',
  perimetre   TEXT NOT NULL DEFAULT '',
  affichage   TEXT,
  actif       INTEGER NOT NULL DEFAULT 1,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pricing_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  service_key TEXT NOT NULL,
  avant       TEXT,
  apres       TEXT NOT NULL,
  changed_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id      TEXT NOT NULL,
  texte      TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS synonyms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern    TEXT NOT NULL,
  resolution TEXT NOT NULL,
  actif      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS billing_transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT NOT NULL,
  montant_cents INTEGER NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  ref           TEXT,
  periode       TEXT,
  created_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_ref ON billing_transactions (ref) WHERE ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_periode ON billing_transactions (type, periode) WHERE periode IS NOT NULL;

CREATE TABLE IF NOT EXISTS llm_usage (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  model           TEXT NOT NULL DEFAULT '',
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  cost_centimes   REAL NOT NULL DEFAULT 0,
  billed_centimes REAL NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_llm_usage_date ON llm_usage (created_at);

CREATE TABLE IF NOT EXISTS documents (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  nom               TEXT NOT NULL,
  fichier           TEXT NOT NULL,
  mime              TEXT NOT NULL DEFAULT '',
  taille            INTEGER NOT NULL DEFAULT 0,
  contenu           TEXT NOT NULL DEFAULT '',
  extraction_reason TEXT NOT NULL DEFAULT '',
  note              TEXT NOT NULL DEFAULT '',
  actif             INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_actif ON documents (actif, id);

CREATE TABLE IF NOT EXISTS client_facts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id      TEXT NOT NULL,
  fait       TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'bot',
  actif      INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_client_facts_wa ON client_facts (wa_id, actif, id);

CREATE TABLE IF NOT EXISTS learned_examples (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id       TEXT NOT NULL,
  question    TEXT NOT NULL DEFAULT '',
  reponse     TEXT NOT NULL DEFAULT '',
  theme       TEXT NOT NULL DEFAULT '',
  statut      TEXT NOT NULL DEFAULT 'en_attente',
  motif_rejet TEXT NOT NULL DEFAULT '',
  message_id  INTEGER,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_learned_examples_statut ON learned_examples (statut, id);
CREATE INDEX IF NOT EXISTS idx_learned_examples_message ON learned_examples (message_id);
`;

function tableColumns(db: BetterSqlite3.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(rows.map((r) => r.name));
}

function tableSql(db: BetterSqlite3.Database, table: string): string {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`)
    .get(table) as { sql: string } | undefined;
  return row?.sql ?? "";
}

export function migrate(db: BetterSqlite3.Database): void {
  db.pragma("journal_mode = WAL");
  // Deux process (bot + dashboard) écrivent sur le même fichier : sans ceci,
  // une collision d'écriture renvoie immédiatement SQLITE_BUSY au lieu d'attendre.
  db.pragma("busy_timeout = 5000");
  db.exec(CREATE_TABLES);

  // v2.1 : résumé de conversation régénérable (dashboard)
  const stateCols = tableColumns(db, "conversation_state");
  if (stateCols.size > 0 && !stateCols.has("resume")) {
    db.exec(`ALTER TABLE conversation_state ADD COLUMN resume TEXT NOT NULL DEFAULT ''`);
  }

  // v2.2 : dernier message couvert par le résumé — sert à savoir s'il est
  // périmé (et donc à le régénérer tout seul) sans le recalculer à l'aveugle.
  if (stateCols.size > 0 && !stateCols.has("resume_message_id")) {
    db.exec(
      `ALTER TABLE conversation_state ADD COLUMN resume_message_id INTEGER NOT NULL DEFAULT 0`,
    );
  }

  // v2.2 : sujet général d'une question (regroupement thématique du back-office).
  const questionCols = tableColumns(db, "questions");
  if (questionCols.size > 0 && !questionCols.has("sujet")) {
    db.exec(`ALTER TABLE questions ADD COLUMN sujet TEXT NOT NULL DEFAULT ''`);
  }
  // Après l'ALTER, donc valable aussi bien pour une base neuve que migrée.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_questions_sujet ON questions (sujet)`);

  // v2.3 : le compte Telegram de contact n'existe plus. Un message de niveau 4
  // personnalisé qui y renvoie enverrait les clients dans le vide : on efface
  // la valeur stockée pour revenir au message par défaut (contact WhatsApp).
  // Le réglage `telegram_contact` lui-même n'est plus lu nulle part.
  db.exec(
    `DELETE FROM settings
     WHERE key = 'niveau4_message' AND value LIKE '%elegram%'`,
  );
  db.exec(`DELETE FROM settings WHERE key = 'telegram_contact'`);

  // v1 → v2 : colonnes ajoutées sur contacts
  const contactCols = tableColumns(db, "contacts");
  if (!contactCols.has("mode_humain")) {
    db.exec(`ALTER TABLE contacts ADD COLUMN mode_humain INTEGER NOT NULL DEFAULT 0`);
  }
  if (!contactCols.has("humain_depuis")) {
    db.exec(`ALTER TABLE contacts ADD COLUMN humain_depuis INTEGER`);
  }

  // v1 → v2 : la table messages v1 portait CHECK (role IN ('user','assistant')),
  // incompatible avec le rôle 'human'. On la reconstruit sans le CHECK.
  const msgSql = tableSql(db, "messages");
  if (/CHECK\s*\(\s*role\s+IN\s*\(\s*'user'\s*,\s*'assistant'\s*\)\s*\)/i.test(msgSql)) {
    db.exec(`
      BEGIN;
      CREATE TABLE messages_v2 (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        wa_id   TEXT NOT NULL,
        role    TEXT NOT NULL,
        contenu TEXT NOT NULL,
        wamid   TEXT,
        ts      INTEGER NOT NULL
      );
      INSERT INTO messages_v2 (id, wa_id, role, contenu, wamid, ts)
        SELECT id, wa_id, role, contenu, wamid, ts FROM messages;
      DROP TABLE messages;
      ALTER TABLE messages_v2 RENAME TO messages;
      CREATE INDEX IF NOT EXISTS idx_messages_wa ON messages (wa_id, id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wamid ON messages (wamid) WHERE wamid IS NOT NULL;
      COMMIT;
    `);
  }

  // v2.2 : archivage des médias reçus (photos, vocaux) pour le back-office.
  // Après l'éventuelle reconstruction ci-dessus, qui ne recopie que les colonnes v1.
  const msgCols = tableColumns(db, "messages");
  if (msgCols.size > 0 && !msgCols.has("media_type")) {
    db.exec(`ALTER TABLE messages ADD COLUMN media_type TEXT NOT NULL DEFAULT ''`);
    db.exec(`ALTER TABLE messages ADD COLUMN media_file TEXT NOT NULL DEFAULT ''`);
    db.exec(`ALTER TABLE messages ADD COLUMN media_mime TEXT NOT NULL DEFAULT ''`);
  }

  // v2.3 : plafond de tentatives sur l'apprentissage (§6) — CREATE_TABLES
  // ci-dessus couvre les bases neuves ; garde défensive pour une base déjà
  // créée par une version antérieure de ce fichier sans la colonne.
  const examplesCols = tableColumns(db, "learned_examples");
  if (examplesCols.size > 0 && !examplesCols.has("attempts")) {
    db.exec(`ALTER TABLE learned_examples ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0`);
  }

  db.pragma("user_version = 2");
}
