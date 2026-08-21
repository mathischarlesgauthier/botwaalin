import { allowedAmounts, amountsIn, findForeignPrices, formatPrice } from "@arbi/core";
import { beforeAll, describe, expect, it } from "vitest";
import { buildStaticPrompt } from "../src/prompt";
import { testCore } from "./helpers";

let allowed: Set<string>;
let core: ReturnType<typeof testCore>;

beforeAll(() => {
  core = testCore();
  allowed = allowedAmounts(core.pricing.active(), core.catalogue.current().contenu);
});

describe("moteur tarifaire — montants autorisés (base = autorité)", () => {
  it("indexe les prix v2 (750, 1100/1500 Trafic Pro, 300 Vinted, 10 000…)", () => {
    for (const amount of ["750", "1500", "2500", "3000", "50", "70", "1100", "300", "10000"]) {
      expect(allowed.has(amount), `montant ${amount} attendu`).toBe(true);
    }
  });

  it("les anciens prix v1 supprimés (LLC 545/690/850) ne sont PLUS autorisés", () => {
    expect(allowed.has("545")).toBe(false);
    expect(allowed.has("690")).toBe(false);
    expect(allowed.has("850")).toBe(false);
  });
});

describe("garde-fou : refus de prix hors catalogue", () => {
  it("laisse passer les prix officiels sous toutes leurs formes", () => {
    expect(findForeignPrices("Le site vitrine démarre à 750 €", allowed)).toEqual([]);
    expect(findForeignPrices("1 100 € comptant, ou 1 500 € en 4 fois", allowed)).toEqual([]);
    expect(findForeignPrices("La formation Vinted est à 300 euros", allowed)).toEqual([]);
  });

  it("bloque un prix inventé, y compris un ancien prix retiré de la grille", () => {
    expect(findForeignPrices("Pour la LLC c'est 545 €", allowed)).toEqual(["545"]);
    expect(findForeignPrices("Je te fais ça à 999 €", allowed)).toEqual(["999"]);
    expect(findForeignPrices("Compte 1,2k€", allowed)).toEqual(["1200"]);
    expect(findForeignPrices("entre 400 et 750 €", allowed)).toEqual(["400"]);
  });

  it("ignore les nombres non monétaires", () => {
    expect(findForeignPrices("Livraison en 10 à 15 jours, 7 modules de 1h15", allowed)).toEqual([]);
    expect(findForeignPrices("accès aux marchés européens", allowed)).toEqual([]);
  });
});

describe("aucun prix en dur dans le prompt (la table pricing fait autorité)", () => {
  it("tous les montants du prompt statique viennent de la grille", () => {
    const rows = core.pricing.active();
    const prompt = buildStaticPrompt("", rows);
    const allowedFromPricing = allowedAmounts(rows, "");
    expect(findForeignPrices(prompt, allowedFromPricing)).toEqual([]);
    expect(amountsIn(prompt).length).toBeGreaterThan(5);
  });

  it("un changement de tarif au dashboard se propage aux few-shots", () => {
    const localCore = testCore();
    localCore.pricing.update("logo", { prixMin: 80 });
    const prompt = buildStaticPrompt("", localCore.pricing.active());
    expect(prompt).toContain("« 80 €. »");
    expect(prompt).not.toContain("« 50 €. »");
    localCore.close();
  });
});

describe("formulation des 4 types de prix", () => {
  it("FIXED : prix sec", () => {
    expect(formatPrice(core.pricing.byKey("logo")!)).toBe("50 €");
  });
  it("FROM : jamais présenté comme final", () => {
    const text = formatPrice(core.pricing.byKey("site_vitrine")!);
    expect(text).toContain("à partir de 750 €");
    expect(text).toContain("dépend du projet");
  });
  it("FIXED avec affichage sur mesure (Trafic Pro comptant / 4 fois)", () => {
    expect(formatPrice(core.pricing.byKey("trafic_pro")!)).toBe(
      "1 100 € comptant, ou 1 500 € en 4 fois",
    );
  });
  it("QUOTE : ne chiffre jamais", () => {
    const text = formatPrice(core.pricing.byKey("societe_llc_usa")!);
    expect(text).toContain("devis");
    expect(text).not.toMatch(/\d\s*€/);
  });
  it("FROM mensuel", () => {
    expect(formatPrice(core.pricing.byKey("hebergement")!)).toContain("50 €/mois");
  });
});
