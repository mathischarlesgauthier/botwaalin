import {
  allowedAmounts,
  deterministicRejectReason,
  DOCUMENT_PROMPT_BUDGET_CHARS,
  type DocumentRow,
  type ExampleRow,
} from "@arbi/core";
import { describe, expect, it } from "vitest";
import { SalesAgent } from "../src/agent";
import { buildStaticPrompt } from "../src/prompt";
import { fakeLlm, fakeWa, makeAnalysis, silentLogger, testAlertDeps, testCore } from "./helpers";

function fakeDocument(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 1,
    nom: "Doc de test",
    fichier: "doc-de-test.txt",
    mime: "text/plain",
    taille: 100,
    contenu: "Contenu du document de test.",
    extractionReason: "",
    note: "Note de test",
    actif: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function fakeExample(overrides: Partial<ExampleRow> = {}): ExampleRow {
  return {
    id: 1,
    waId: "33612345678",
    question: "C'est combien un site vitrine ?",
    reponse: "Ça dépend du projet, je regarde ça avec toi et je te fais un chiffrage précis.",
    theme: "site",
    statut: "actif",
    motifRejet: "",
    messageId: null,
    attempts: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("buildStaticPrompt — documents de référence (§3)", () => {
  it("n'ajoute aucune section quand il n'y a aucun document actif", () => {
    const core = testCore();
    const prompt = buildStaticPrompt(core.catalogue.current().contenu, core.pricing.active());
    expect(prompt).not.toContain("Documents de référence fournis par Jacob");
    core.close();
  });

  it("injecte nom, note et contenu, et rappelle que la grille prime", () => {
    const core = testCore();
    const doc = fakeDocument({ nom: "Grille interne", note: "usage interne", contenu: "Détails du produit X." });
    const prompt = buildStaticPrompt(core.catalogue.current().contenu, core.pricing.active(), [doc]);
    expect(prompt).toContain("# Documents de référence fournis par Jacob (contexte complémentaire)");
    expect(prompt).toContain("## Grille interne — usage interne");
    expect(prompt).toContain("Détails du produit X.");
    expect(prompt).toContain("Ces documents complètent le catalogue");
    expect(prompt).toContain("tout montant vient de la grille tarifaire");
    core.close();
  });

  it("tronque le document qui dépasse le budget de 60 000 caractères et signale les documents omis", () => {
    const core = testCore();
    const big = fakeDocument({ id: 1, nom: "Gros document", contenu: "x".repeat(DOCUMENT_PROMPT_BUDGET_CHARS + 500) });
    const second = fakeDocument({ id: 2, nom: "Second document", contenu: "contenu du second document" });
    const prompt = buildStaticPrompt(core.catalogue.current().contenu, core.pricing.active(), [big, second]);
    expect(prompt).toContain("[…document tronqué — budget de contexte atteint]");
    expect(prompt).toContain("(1 document(s) non inclus, budget de contexte atteint)");
    expect(prompt).not.toContain("Second document");
    core.close();
  });
});

describe("buildStaticPrompt — exemples appris (§6)", () => {
  it("n'ajoute aucune section quand il n'y a aucun exemple actif", () => {
    const core = testCore();
    const prompt = buildStaticPrompt(core.catalogue.current().contenu, core.pricing.active());
    expect(prompt).not.toContain("Réponses de Jacob dont tu dois t'inspirer");
    core.close();
  });

  it("injecte question/réponse de chaque exemple et limite au top 12", () => {
    const core = testCore();
    const examples = Array.from({ length: 15 }, (_, i) =>
      fakeExample({ id: i + 1, question: `Question numéro ${i}`, reponse: `Réponse numéro ${i}` }),
    );
    const prompt = buildStaticPrompt(core.catalogue.current().contenu, core.pricing.active(), [], examples);
    expect(prompt).toContain("# Réponses de Jacob dont tu dois t'inspirer (ton, formulation, angle)");
    expect(prompt).toContain("Client : Question numéro 0");
    expect(prompt).toContain("Jacob : Réponse numéro 0");
    expect(prompt).toContain("Imite le TON et la STRUCTURE, jamais le contenu factuel");
    expect(prompt).not.toContain("Question numéro 12");
    core.close();
  });
});

describe("buildStaticPrompt — guide de style appris (§6)", () => {
  it("n'ajoute aucune section quand le guide est vide", () => {
    const core = testCore();
    const prompt = buildStaticPrompt(core.catalogue.current().contenu, core.pricing.active(), [], [], "");
    expect(prompt).not.toContain("Guide de style observé chez Jacob");
    core.close();
  });

  it("injecte le guide juste après la Personnalité et avant la Logique à 4 niveaux", () => {
    const core = testCore();
    const prompt = buildStaticPrompt(
      core.catalogue.current().contenu,
      core.pricing.active(),
      [],
      [],
      "- Jamais de point d'exclamation.",
    );
    expect(prompt).toContain("# Guide de style observé chez Jacob (à respecter)");
    expect(prompt).toContain("- Jamais de point d'exclamation.");
    const personnaliteIndex = prompt.indexOf("# Personnalité et ton");
    const styleIndex = prompt.indexOf("# Guide de style observé chez Jacob");
    const logiqueIndex = prompt.indexOf("# Logique à 4 niveaux");
    expect(personnaliteIndex).toBeGreaterThanOrEqual(0);
    expect(personnaliteIndex).toBeLessThan(styleIndex);
    expect(styleIndex).toBeLessThan(logiqueIndex);
    core.close();
  });
});

describe("INVARIANT §0.1 — allowedAmounts reste calculé sur pricing + catalogue SEULEMENT", () => {
  it("un montant présent uniquement dans un document actif n'élargit jamais allowedAmounts", () => {
    const core = testCore();
    const rows = core.pricing.active();
    const catalogue = core.catalogue.current().contenu;
    const before = allowedAmounts(rows, catalogue);

    core.documents.create({
      nom: "Barème interne",
      fichier: "bareme.txt",
      mime: "text/plain",
      taille: 10,
      contenu: "Le tarif spécial VIP est de 987654 €, à ne jamais citer publiquement.",
      extractionReason: "",
      note: "test",
    });

    // refreshKnowledge() (constructeur) recharge le prompt statique — DOIT
    // injecter le document dans le prompt SANS toucher allowedAmounts : même
    // signature à deux arguments qu'avant cette spec (rows, catalogue).
    const wa = fakeWa();
    new SalesAgent({
      core,
      client: fakeLlm(),
      model: "test-model",
      wa,
      alertDeps: testAlertDeps(core, wa),
      log: silentLogger(),
    });

    const after = allowedAmounts(rows, catalogue);
    expect(after).toEqual(before);
    expect(after.has("987654")).toBe(false);
    core.close();
  });

  it("guardReply bloque toujours un montant qui n'existe que dans un document uploadé", async () => {
    const core = testCore();
    core.documents.create({
      nom: "Barème interne",
      fichier: "bareme.txt",
      mime: "text/plain",
      taille: 10,
      contenu: "Le tarif spécial VIP est de 987654 €.",
      extractionReason: "",
      note: "test",
    });
    const wa = fakeWa();
    const agent = new SalesAgent({
      core,
      client: fakeLlm(),
      model: "test-model",
      wa,
      alertDeps: testAlertDeps(core, wa),
      log: silentLogger(),
    });

    const result = await agent.guardReply(
      "33612345678",
      "Pour toi ce sera 987654 €.",
      makeAnalysis(),
    );
    expect(result.blocked).toBe(true);
    core.close();
  });

  it("un montant écrit en toutes lettres dans un document uploadé reste bloqué en sortie", async () => {
    const core = testCore();
    core.documents.create({
      nom: "Barème interne",
      fichier: "bareme.txt",
      mime: "text/plain",
      taille: 10,
      // 850 n'est plus un prix v2 (cf. prices.test.ts : « anciens prix v1
      // supprimés ») — 1000, lui, est par coïncidence un prix v2 autorisé,
      // donc impropre à démontrer le garde-fou ici.
      contenu: "Le tarif spécial VIP peut descendre à environ huit cent cinquante euros, à ne jamais citer.",
      extractionReason: "",
      note: "test",
    });
    const wa = fakeWa();
    const agent = new SalesAgent({
      core,
      client: fakeLlm(),
      model: "test-model",
      wa,
      alertDeps: testAlertDeps(core, wa),
      log: silentLogger(),
    });

    // Le prompt statique injecte bien le document (contexte complémentaire)…
    expect((agent as unknown as { staticPrompt: string }).staticPrompt).toContain("cent cinquante euros");
    // … mais si le modèle reprend ce montant en toutes lettres dans sa
    // réponse, le garde-fou de sortie le bloque comme n'importe quel prix
    // hors grille (amountsIn détecte aussi les montants en toutes lettres).
    const result = await agent.guardReply(
      "33612345678",
      "Pour toi ce sera huit cent cinquante euros, en exclusivité.",
      makeAnalysis(),
    );
    expect(result.blocked).toBe(true);
    core.close();
  });

  it("un montant écrit en toutes lettres dans un exemple appris est rejeté par le filtre déterministe (§6)", () => {
    // Le même échappatoire concerne les exemples appris (buildExamplesSection,
    // apps/bot/src/prompt.ts) : deterministicRejectReason (packages/core/src/
    // learning.ts) doit rejeter la réponse de Jacob AVANT toute activation.
    const motif = deterministicRejectReason(
      "Pour toi je peux descendre à environ mille euros, mais ne le répète à personne.",
    );
    expect(motif).toMatch(/montant/);
  });
});
