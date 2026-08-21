import {
  checkStyleRules,
  detectMarkers,
  detectTone,
  registerMarkers,
  type MarkerUse,
} from "@arbi/core";
import { describe, expect, it } from "vitest";

describe("anti-répétition des expressions familières", () => {
  it("détecte les marqueurs, sans doublon imbriqué (« salut mon reuf » ≠ « reuf »)", () => {
    expect(detectMarkers("Salut mon reuf, tu vas bien ?")).toEqual(["salut mon reuf"]);
    expect(detectMarkers("Carrément, on part là-dessus.")).toEqual(["carrément"]);
    expect(detectMarkers("Bonjour, voici le récapitulatif.")).toEqual([]);
  });

  it("autorise une première expression familière", () => {
    const check = checkStyleRules("Carrément, on fait comme ça.", [], 0);
    expect(check.ok).toBe(true);
  });

  it("refuse la même expression deux fois dans une conversation", () => {
    const used: MarkerUse[] = [{ marker: "carrément", atIndex: 0 }];
    const check = checkStyleRules("Carrément !", used, 6);
    expect(check.ok).toBe(false);
    expect(check.violations.join(" ")).toContain("déjà été utilisée");
  });

  it("refuse une expression trop rapprochée (moins de 4 réponses d'écart)", () => {
    const used: MarkerUse[] = [{ marker: "carrément", atIndex: 3 }];
    const check = checkStyleRules("T'inquiète, je gère.", used, 5);
    expect(check.ok).toBe(false);
    expect(check.violations.join(" ")).toContain("trop rapprochée");
  });

  it("accepte une nouvelle expression après 4 réponses ou plus", () => {
    const used: MarkerUse[] = [{ marker: "carrément", atIndex: 0 }];
    const check = checkStyleRules("T'inquiète, je gère.", used, 5);
    expect(check.ok).toBe(true);
  });

  it("refuse deux expressions dans une même réponse", () => {
    const check = checkStyleRules("Carrément frangin, on y va.", [], 10);
    expect(check.ok).toBe(false);
  });

  it("registerMarkers accumule l'historique d'usage", () => {
    let used: MarkerUse[] = [];
    used = registerMarkers(used, "Impeccable, je note.", 0);
    used = registerMarkers(used, "Réponse neutre sans marqueur.", 1);
    used = registerMarkers(used, "Frangin, c'est parti.", 5);
    expect(used).toEqual([
      { marker: "impeccable", atIndex: 0 },
      { marker: "frangin", atIndex: 5 },
    ]);
  });
});

describe("détection du registre client (tone_register)", () => {
  it("client soigné/professionnel → pro", () => {
    expect(
      detectTone("Bonjour, pourriez-vous me détailler votre prestation e-commerce ?", "neutre"),
    ).toBe("pro");
  });

  it("client détendu (abréviations, minuscules) → relache", () => {
    expect(detectTone("slt tkt je regarde ça", "neutre")).toBe("relache");
  });

  it("sans signal clair, le registre ne bascule pas", () => {
    expect(detectTone("D'accord", "pro")).toBe("pro");
    expect(detectTone("ok merci", "relache")).toBe("relache");
  });
});
