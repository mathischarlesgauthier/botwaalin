import { classifyIntent, resolveService, type SynonymRow } from "@arbi/core";
import { beforeAll, describe, expect, it } from "vitest";
import { testCore } from "./helpers";

let synonyms: SynonymRow[];

beforeAll(() => {
  const core = testCore();
  synonyms = core.synonyms.active();
  core.close();
});

describe("classifyIntent : frontières de mots (anti-misroutage)", () => {
  it("ne matche plus des mots-clés à l'intérieur d'autres mots", () => {
    // « décupler » contenait « decu » → réclamation, « écoute » contenait « coute » → tarif
    expect(classifyIntent("je veux décupler mes ventes").intent).not.toBe("reclamation");
    expect(classifyIntent("je t'écoute").intent).not.toBe("tarif");
    expect(classifyIntent("ma commande est en cours de traitement").intent).not.toBe("formation");
  });

  it("garde les détections légitimes", () => {
    expect(classifyIntent("c'est quoi le prix ?").intent).toBe("tarif");
    expect(classifyIntent("ça coute combien ?").intent).toBe("tarif");
    expect(classifyIntent("50€ c'est possible ?").intent).toBe("tarif");
    expect(classifyIntent("je suis déçu, je veux un remboursement").intent).toBe("reclamation");
    expect(classifyIntent("je veux parler à un humain").intent).toBe("demande_humain");
    expect(classifyIntent("mon cas est très particulier").intent).toBe("demande_personnalisee");
    expect(classifyIntent("c'est quoi le programme de la formation ?").intent).toBe("formation");
    expect(classifyIntent("vos formations m'intéressent").intent).toBe("formation");
  });
});

describe("resolveService : tolérance durcie (anti-dérive de service)", () => {
  it("ne dérive plus sur des mots proches", () => {
    // « urgent »≈« agent », « argent »≈« agent », « vite »≈« vinted »
    expect(resolveService("c'est urgent", synonyms)).toBeNull();
    expect(resolveService("je cherche à faire de l'argent", synonyms)).toBeNull();
    expect(resolveService("ok je te réponds vite", synonyms)).toBeNull();
    expect(resolveService("on se voit de suite", synonyms)).toBeNull();
  });

  it("résout toujours les demandes réelles et les fautes de frappe plausibles", () => {
    expect(resolveService("un agent en chine", synonyms)).toBe("china_acces_agents");
    expect(resolveService("je veux un site", synonyms)).toBe("site_vitrine");
    expect(resolveService("une boutiqe en ligne", synonyms)).toBe("boutique");
    expect(resolveService("automatisation whatsap", synonyms)).toBe("bot_whatsapp");
    expect(resolveService("une societe americane", synonyms)).toBe("societe_llc_usa");
    expect(resolveService("la formation vinted", synonyms)).toBe("vinted_pro");
  });

  it("le match le plus long gagne", () => {
    expect(resolveService("un bot whatsapp pour mon site", synonyms)).toBe("bot_whatsapp");
  });
});
