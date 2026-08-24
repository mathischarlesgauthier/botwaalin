import { MENU_ROWS, resolveService } from "@arbi/core";
import { describe, expect, it } from "vitest";
import { analyzeInbound } from "../src/brain";
import { testCore } from "./helpers";

describe("services et pôles éditables depuis le dashboard", () => {
  it("un service ajouté avec ses mots-clés est reconnu par le routeur", () => {
    const core = testCore();
    core.pricing.create({
      serviceKey: "formation_crypto",
      label: "Formation crypto",
      categorie: "Formation",
      type: "FROM",
      prixMin: 300,
      prixMax: null,
      unite: "",
      perimetre: "6 modules vidéo",
      affichage: null,
      actif: 1,
    });
    core.synonyms.replaceForResolution("formation_crypto", ["formation crypto", "crypto", "bitcoin"]);

    expect(core.pricing.byKey("formation_crypto")?.label).toBe("Formation crypto");
    const resolved = resolveService("je veux me lancer dans la crypto", core.synonyms.active());
    expect(resolved).toBe("formation_crypto");
  });

  it("la catégorie du routeur vient de la grille tarifaire (éditable), pas du préfixe", () => {
    const core = testCore();
    core.pricing.create({
      serviceKey: "formation_crypto",
      label: "Formation crypto",
      categorie: "Crypto Académie",
      type: "QUOTE",
      prixMin: null,
      prixMax: null,
      unite: "",
      perimetre: "",
      affichage: null,
      actif: 1,
    });
    core.synonyms.replaceForResolution("formation_crypto", ["crypto"]);
    const state = core.state.get("336000000");
    const analysis = analyzeInbound(core, state, ["je veux me former à la crypto"], 3);
    expect(analysis.serviceKey).toBe("formation_crypto");
    expect(analysis.categorie).toBe("Crypto Académie");
  });

  it("les mots-clés d'un service se remplacent sans toucher aux autres services", () => {
    const core = testCore();
    const before = core.synonyms.active().filter((s) => s.resolution === "site_vitrine").length;
    expect(before).toBeGreaterThan(0);
    core.synonyms.replaceForResolution("logo", ["identité visuelle", "blason"]);
    expect(core.synonyms.forResolution("logo").map((s) => s.pattern)).toEqual([
      "blason",
      "identité visuelle",
    ]);
    const after = core.synonyms.active().filter((s) => s.resolution === "site_vitrine").length;
    expect(after).toBe(before);
  });

  it("le réglage menu_poles est seedé avec les 5 pôles et reste éditable", () => {
    const core = testCore();
    const poles = core.settings.get("menu_poles");
    expect(poles).toHaveLength(5);
    expect(poles.map((p) => p.title)).toContain("China Accès");
    expect(poles).toEqual(MENU_ROWS);

    core.settings.set("menu_poles", [
      ...poles.filter((p) => p.id !== "vinted_pro"),
      { id: "crypto_academie", title: "Crypto Académie", description: "Formation crypto de A à Z" },
    ]);
    const updated = core.settings.get("menu_poles");
    expect(updated).toHaveLength(5);
    expect(updated.map((p) => p.id)).toContain("crypto_academie");
    expect(updated.map((p) => p.id)).not.toContain("vinted_pro");
  });

  it("la création d'un service est historisée et refuse les doublons de clé", () => {
    const core = testCore();
    core.pricing.create({
      serviceKey: "sourcing_dubai",
      label: "Sourcing Dubaï",
      categorie: "Sourcing",
      type: "QUOTE",
      prixMin: null,
      prixMax: null,
      unite: "",
      perimetre: "",
      affichage: null,
      actif: 1,
    });
    // Unicité garantie par la contrainte UNIQUE de service_key.
    expect(() =>
      core.pricing.create({
        serviceKey: "sourcing_dubai",
        label: "Doublon",
        categorie: "Sourcing",
        type: "QUOTE",
        prixMin: null,
        prixMax: null,
        unite: "",
        perimetre: "",
        affichage: null,
        actif: 1,
      }),
    ).toThrow();
  });
});
