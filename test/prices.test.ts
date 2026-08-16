import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, PRICE_FALLBACK, SalesAgent } from "../src/agent";
import { extractPrices, extractSection, findForeignPrices } from "../src/catalogue";
import { createDb, type Db } from "../src/db";
import { silentLogger } from "./helpers";

const catalogue = readFileSync(join(__dirname, "..", "data", "catalogue.md"), "utf8");
const allowed = extractPrices(catalogue);

describe("extraction des prix du catalogue", () => {
  it("indexe les prix connus (750, 1 500, 545, 50/mois…)", () => {
    expect(allowed.has("750")).toBe(true);
    expect(allowed.has("1500")).toBe(true);
    expect(allowed.has("2500")).toBe(true);
    expect(allowed.has("545")).toBe(true);
    expect(allowed.has("1130")).toBe(true);
    expect(allowed.has("50")).toBe(true);
    expect(allowed.has("350")).toBe(true);
  });

  it("n'indexe pas de prix fantômes", () => {
    expect(allowed.has("999")).toBe(false);
    expect(allowed.has("1234")).toBe(false);
  });
});

describe("détection de prix hors catalogue", () => {
  it("laisse passer une réponse qui ne cite que des prix du catalogue", () => {
    expect(
      findForeignPrices("Le site vitrine démarre dès 750 € et le Premium dès 1 500 €.", allowed),
    ).toEqual([]);
  });

  it("détecte un prix inventé, quel que soit le format", () => {
    expect(findForeignPrices("Je te le fais à 999 € !", allowed)).toEqual(["999"]);
    expect(findForeignPrices("Comptez 1 234€ environ", allowed)).toEqual(["1234"]);
  });

  it("détecte les prix écrits en toutes lettres, en EUR ou en k€", () => {
    expect(findForeignPrices("ça tourne autour de 600 euros", allowed)).toEqual(["600"]);
    expect(findForeignPrices("Comptez 999 EUR", allowed)).toEqual(["999"]);
    expect(findForeignPrices("Environ 800 euro", allowed)).toEqual(["800"]);
    // 1,5k€ = 1500 est un prix du catalogue (Site Premium) : non signalé.
    expect(findForeignPrices("Compte 1,5k€ pour ça", allowed)).toEqual([]);
    expect(findForeignPrices("Compte 1,2k€ pour ça", allowed)).toEqual(["1200"]);
    expect(findForeignPrices("€999 pour toi", allowed)).toEqual(["999"]);
  });

  it("détecte chaque borne d'une fourchette", () => {
    expect(findForeignPrices("entre 400 et 750 €", allowed)).toEqual(["400"]);
    expect(findForeignPrices("de 749-999 €", allowed)).toEqual(["749", "999"]);
  });

  it("ne colle pas un nombre voisin au prix (faux positif « Formule 1, 545 € »)", () => {
    expect(findForeignPrices("Formule 1, 545 € pour le New Mexico", allowed)).toEqual([]);
    expect(findForeignPrices("Ça démarre à 750, 1 500 € pour le Premium", allowed)).toEqual([]);
  });

  it("ignore les nombres sans € (délais, pourcentages…) et les mots proches", () => {
    expect(findForeignPrices("Livraison en 10 à 15 jours, 38 % du trafic", allowed)).toEqual([]);
    expect(findForeignPrices("accès aux marchés européens", allowed)).toEqual([]);
    expect(findForeignPrices("Réponse sous 24 h, 5 à 10 heures d'appels", allowed)).toEqual([]);
  });
});

describe("garde-fou SalesAgent.guardReply (refus prix hors catalogue)", () => {
  let db: Db;
  let agent: SalesAgent;

  beforeEach(() => {
    db = createDb(":memory:");
    db.upsertContact("33612345678");
    agent = new SalesAgent({
      client: {} as Anthropic,
      model: "claude-sonnet-4-6",
      catalogue,
      db,
      wa: {} as never,
      telegram: { notifyAdmin: async () => true },
      log: silentLogger(),
    });
  });

  it("laisse passer une réponse conforme au catalogue", () => {
    const reply = "Un site vitrine, c'est dès 750 € avec domaine, SSL et SEO inclus.";
    expect(agent.guardReply("33612345678", reply)).toBe(reply);
  });

  it("remplace une réponse citant un prix inventé et trace un handoff", () => {
    const guarded = agent.guardReply("33612345678", "Pour toi ce sera 999 €, promis !");
    expect(guarded).toBe(PRICE_FALLBACK);
    expect(db.countHandoffs("33612345678")).toBe(1);
  });
});

describe("system prompt et sections catalogue", () => {
  it("injecte le catalogue intégral et les règles dures", () => {
    const prompt = buildSystemPrompt(catalogue);
    expect(prompt).toContain("<catalogue>");
    expect(prompt).toContain("Site vitrine");
    expect(prompt).toContain("à partir de");
    expect(prompt).toContain("aucun conseil fiscal");
    expect(prompt).toContain("@Jacob13013");
    expect(prompt).toContain("handoff_human");
  });

  it("extractSection renvoie le bon bloc par pôle", () => {
    expect(extractSection(catalogue, "digital")).toContain("Site vitrine");
    expect(extractSection(catalogue, "crea_societe")).toContain("Wyoming");
    expect(extractSection(catalogue, "trafic_pro")).toContain("Trafic → Telegram");
    expect(extractSection(catalogue, "china_acces")).toContain("Guangzhou");
    expect(extractSection(catalogue, "vinted_pro")).toContain("handoff");
    // Chaque section s'arrête avant la suivante.
    expect(extractSection(catalogue, "digital")).not.toContain("Wyoming");
  });
});
