import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCore } from "../src/db";

describe("migrations (§8 — idempotence des 3 nouvelles tables)", () => {
  it("createCore() appelé deux fois de suite sur le même fichier ne casse rien", () => {
    const dir = mkdtempSync(join(tmpdir(), "core-migrate-"));
    const dbPath = join(dir, "agent.db");

    const first = createCore({ dbPath });
    first.documents.create({
      nom: "grille.md",
      fichier: "abc123.md",
      mime: "text/markdown",
      taille: 10,
      contenu: "contenu",
      extractionReason: "",
      note: "note",
    });
    first.facts.add("336000000", "Cherche un site vitrine", "bot");
    first.examples.capture({ waId: "336000000", question: "Q ?", reponse: "R.", messageId: null });
    first.close();

    // Deuxième ouverture : les CREATE TABLE IF NOT EXISTS / ALTER conditionnels
    // ne doivent ni lever, ni perdre les données déjà écrites.
    const second = createCore({ dbPath });
    expect(second.documents.list()).toHaveLength(1);
    expect(second.facts.list("336000000")).toHaveLength(1);
    expect(second.examples.list()).toHaveLength(1);

    // Une troisième ouverture confirme que la migration reste stable (pas de dérive).
    second.close();
    const third = createCore({ dbPath });
    expect(third.documents.list()).toHaveLength(1);
    third.close();
  });

  it("busy_timeout est configuré (concurrence bot/dashboard sur le même fichier)", () => {
    const core = createCore({ dbPath: ":memory:" });
    const row = core.sqlite.prepare("PRAGMA busy_timeout").get() as { timeout: number };
    expect(row.timeout).toBe(5000);
    core.close();
  });

  it("les index des nouvelles tables existent", () => {
    const core = createCore({ dbPath: ":memory:" });
    const names = (
      core.sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`).all() as Array<{
        name: string;
      }>
    ).map((r) => r.name);
    expect(names).toContain("idx_documents_actif");
    expect(names).toContain("idx_client_facts_wa");
    expect(names).toContain("idx_learned_examples_statut");
    expect(names).toContain("idx_learned_examples_message");
    expect(names).toContain("idx_questions_sujet");
    core.close();
  });

  /**
   * Le cas que « rouvrir une base créée par le code neuf » ne couvre pas : une
   * base ANCIENNE ouverte par le code neuf. C'est le scénario du déploiement.
   * Un index posé dans CREATE_TABLES sur une colonne ajoutée seulement par un
   * ALTER plus bas y échouait (« no such column »), interrompant toute la
   * migration — bot et dashboard refusaient alors de démarrer.
   */
  it("base au schéma antérieur : les colonnes ajoutées arrivent sans casser l'ouverture", () => {
    const dir = mkdtempSync(join(tmpdir(), "core-migrate-old-"));
    const dbPath = join(dir, "agent.db");

    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE questions (
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
      CREATE TABLE conversation_state (
        wa_id       TEXT PRIMARY KEY,
        objections  TEXT NOT NULL DEFAULT '[]',
        updated_at  INTEGER NOT NULL
      );
      INSERT INTO questions (wa_id, texte, normalise, created_at)
        VALUES ('336000000', 'c''est combien ?', 'cest combien', 1);
    `);
    legacy.close();

    const core = createCore({ dbPath });
    const questionCols = (
      core.sqlite.prepare(`PRAGMA table_info(questions)`).all() as Array<{ name: string }>
    ).map((c) => c.name);
    const stateCols = (
      core.sqlite.prepare(`PRAGMA table_info(conversation_state)`).all() as Array<{ name: string }>
    ).map((c) => c.name);

    expect(questionCols).toContain("sujet");
    expect(stateCols).toContain("resume");
    expect(stateCols).toContain("resume_message_id");
    // La donnée préexistante survit et devient classable.
    expect(core.questions.withoutTopic()).toHaveLength(1);
    core.close();

    // Réouverture : la migration reste idempotente sur une base migrée.
    const again = createCore({ dbPath });
    expect(again.questions.withoutTopic()).toHaveLength(1);
    again.close();
  });
});
