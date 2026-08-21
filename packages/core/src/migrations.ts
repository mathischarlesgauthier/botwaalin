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
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id   TEXT NOT NULL,
  role    TEXT NOT NULL,
  contenu TEXT NOT NULL,
  wamid   TEXT,
  ts      INTEGER NOT NULL
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
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_questions_norm ON questions (normalise);

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
  db.exec(CREATE_TABLES);

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

  db.pragma("user_version = 2");
}
