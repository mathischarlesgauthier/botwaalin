import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface Contact {
  wa_id: string;
  nom: string | null;
  langue: string;
  statut: string;
  opt_out: number;
  created_at: number;
}

export interface StoredMessage {
  role: "user" | "assistant";
  contenu: string;
  ts: number;
}

export interface LeadInput {
  offre: string;
  besoin: string;
  budget: string;
  delai: string;
  score: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS contacts (
  wa_id      TEXT PRIMARY KEY,
  nom        TEXT,
  langue     TEXT NOT NULL DEFAULT 'fr',
  statut     TEXT NOT NULL DEFAULT 'nouveau',
  opt_out    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id   TEXT NOT NULL,
  role    TEXT NOT NULL CHECK (role IN ('user','assistant')),
  contenu TEXT NOT NULL,
  wamid   TEXT,
  ts      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_wa_ts ON messages (wa_id, ts);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wamid ON messages (wamid) WHERE wamid IS NOT NULL;

CREATE TABLE IF NOT EXISTS leads (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id  TEXT NOT NULL,
  offre  TEXT NOT NULL,
  besoin TEXT,
  budget TEXT,
  delai  TEXT,
  score  INTEGER CHECK (score BETWEEN 1 AND 5),
  statut TEXT NOT NULL DEFAULT 'nouveau',
  ts     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS handoffs (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_id TEXT NOT NULL,
  motif TEXT NOT NULL,
  ts    INTEGER NOT NULL
);
`;

export function createDb(path: string) {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);

  const stmts = {
    upsertContact: db.prepare(
      `INSERT INTO contacts (wa_id, nom, created_at) VALUES (?, ?, ?)
       ON CONFLICT(wa_id) DO UPDATE SET nom = COALESCE(excluded.nom, contacts.nom)`,
    ),
    getContact: db.prepare(`SELECT * FROM contacts WHERE wa_id = ?`),
    setOptOut: db.prepare(`UPDATE contacts SET opt_out = ? WHERE wa_id = ?`),
    setStatut: db.prepare(`UPDATE contacts SET statut = ? WHERE wa_id = ?`),
    insertMessage: db.prepare(
      `INSERT INTO messages (wa_id, role, contenu, wamid, ts) VALUES (?, ?, ?, ?, ?)`,
    ),
    hasWamid: db.prepare(`SELECT 1 FROM messages WHERE wamid = ? LIMIT 1`),
    getHistory: db.prepare(
      `SELECT role, contenu, ts FROM messages WHERE wa_id = ?
       ORDER BY ts DESC, id DESC LIMIT ?`,
    ),
    lastInboundTs: db.prepare(
      `SELECT MAX(ts) AS ts FROM messages WHERE wa_id = ? AND role = 'user'`,
    ),
    insertLead: db.prepare(
      `INSERT INTO leads (wa_id, offre, besoin, budget, delai, score, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertHandoff: db.prepare(
      `INSERT INTO handoffs (wa_id, motif, ts) VALUES (?, ?, ?)`,
    ),
    countHandoffs: db.prepare(
      `SELECT COUNT(*) AS n FROM handoffs WHERE wa_id = ?`,
    ),
  };

  return {
    upsertContact(waId: string, nom?: string | null): void {
      stmts.upsertContact.run(waId, nom ?? null, Date.now());
    },
    getContact(waId: string): Contact | undefined {
      return stmts.getContact.get(waId) as Contact | undefined;
    },
    setOptOut(waId: string, optOut: boolean): void {
      stmts.setOptOut.run(optOut ? 1 : 0, waId);
    },
    setStatut(waId: string, statut: string): void {
      stmts.setStatut.run(statut, waId);
    },
    insertMessage(
      waId: string,
      role: "user" | "assistant",
      contenu: string,
      wamid: string | null = null,
      ts: number = Date.now(),
    ): void {
      stmts.insertMessage.run(waId, role, contenu, wamid, ts);
    },
    hasWamid(wamid: string): boolean {
      return stmts.hasWamid.get(wamid) !== undefined;
    },
    getHistory(waId: string, limit = 20): StoredMessage[] {
      const rows = stmts.getHistory.all(waId, limit) as StoredMessage[];
      return rows.reverse();
    },
    lastInboundTs(waId: string): number | null {
      const row = stmts.lastInboundTs.get(waId) as { ts: number | null } | undefined;
      return row?.ts ?? null;
    },
    insertLead(waId: string, lead: LeadInput): void {
      stmts.insertLead.run(
        waId,
        lead.offre,
        lead.besoin,
        lead.budget,
        lead.delai,
        lead.score,
        Date.now(),
      );
    },
    insertHandoff(waId: string, motif: string): void {
      stmts.insertHandoff.run(waId, motif, Date.now());
    },
    countHandoffs(waId: string): number {
      const row = stmts.countHandoffs.get(waId) as { n: number };
      return row.n;
    },
    close(): void {
      db.close();
    },
  };
}

export type Db = ReturnType<typeof createDb>;
