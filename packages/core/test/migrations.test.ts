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
    core.close();
  });
});
