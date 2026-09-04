import { describe, expect, it } from "vitest";
import { testCore } from "./helpers";

const WA_ID = "33612345678";

describe("core.facts (§5 — mémoire client durable)", () => {
  it("add() insère un fait et le retrouve dans list()/actifs()", () => {
    const core = testCore();
    const fait = core.facts.add(WA_ID, "Gère une boutique Vinted depuis 2 ans", "bot");
    expect(fait).not.toBeNull();
    expect(core.facts.list(WA_ID)).toHaveLength(1);
    expect(core.facts.actifs(WA_ID)).toHaveLength(1);
    core.close();
  });

  it("add() refuse tout fait contenant un montant — filtre déterministe indépendant de la consigne du LLM", () => {
    const core = testCore();
    expect(core.facts.add(WA_ID, "A un budget de 500 €", "auto")).toBeNull();
    expect(core.facts.add(WA_ID, "Budget max 2000 euros pour le site", "auto")).toBeNull();
    expect(core.facts.list(WA_ID)).toHaveLength(0);
    core.close();
  });

  it("add() refuse une chaîne vide", () => {
    const core = testCore();
    expect(core.facts.add(WA_ID, "   ", "bot")).toBeNull();
    core.close();
  });

  it("déduplication exacte (normalizeText : minuscules, sans accents) — pas de doublon, met juste à jour updated_at", () => {
    const core = testCore();
    const first = core.facts.add(WA_ID, "Gère une Élève-entreprise à Paris", "bot")!;
    const second = core.facts.add(WA_ID, "gere une eleve-entreprise a paris", "auto");
    expect(second).not.toBeNull();
    expect(second?.id).toBe(first.id); // même ligne, pas d'insertion
    expect(core.facts.list(WA_ID)).toHaveLength(1);
    core.close();
  });

  it("deux reformulations non identiques du même fait NE dédupliquent PAS (risque assumé, documenté)", () => {
    const core = testCore();
    core.facts.add(WA_ID, "Cherche un site e-commerce", "bot");
    core.facts.add(WA_ID, "Cherche une boutique en ligne", "bot"); // synonyme, pas une dédup exacte
    expect(core.facts.list(WA_ID)).toHaveLength(2);
    core.close();
  });

  it("plafond 20 faits actifs : les plus anciens de source 'auto' sont désactivés au-delà", () => {
    const core = testCore();
    for (let i = 0; i < 20; i++) {
      core.facts.add(WA_ID, `Fait numero ${i}`, "auto");
    }
    expect(core.facts.actifs(WA_ID, 100)).toHaveLength(20);
    core.facts.add(WA_ID, "Fait numero 20", "auto");
    const actifs = core.facts.actifs(WA_ID, 100);
    expect(actifs).toHaveLength(20);
    // Le plus ancien ("Fait numero 0") a été évincé, le plus récent est bien présent.
    expect(actifs.some((f) => f.fait === "Fait numero 0")).toBe(false);
    expect(actifs.some((f) => f.fait === "Fait numero 20")).toBe(true);
    core.close();
  });

  it("le plafond global reste 20, mais l'éviction ne retire JAMAIS un fait 'jacob' ou 'bot'", () => {
    const core = testCore();
    core.facts.add(WA_ID, "Fait manuel de Jacob", "jacob");
    for (let i = 0; i < 20; i++) {
      core.facts.add(WA_ID, `Fait auto ${i}`, "auto");
    }
    const actifs = core.facts.actifs(WA_ID, 100);
    expect(actifs).toHaveLength(20); // plafond global : le fait 'jacob' + 19 'auto' (le plus ancien 'auto' évincé)
    expect(actifs.some((f) => f.fait === "Fait manuel de Jacob")).toBe(true);
    expect(actifs.some((f) => f.fait === "Fait auto 0")).toBe(false); // le plus ancien 'auto' a été évincé
    expect(actifs.some((f) => f.fait === "Fait auto 19")).toBe(true);
    core.close();
  });

  it("remove() supprime définitivement", () => {
    const core = testCore();
    const fait = core.facts.add(WA_ID, "Un fait à supprimer", "bot")!;
    expect(core.facts.remove(fait.id)).toBe(true);
    expect(core.facts.list(WA_ID)).toHaveLength(0);
    expect(core.facts.remove(999)).toBe(false);
    core.close();
  });

  it("toggle() active/désactive sans supprimer", () => {
    const core = testCore();
    const fait = core.facts.add(WA_ID, "Un fait à bascule", "bot")!;
    core.facts.toggle(fait.id);
    expect(core.facts.actifs(WA_ID)).toHaveLength(0);
    expect(core.facts.list(WA_ID)).toHaveLength(1);
    core.facts.toggle(fait.id);
    expect(core.facts.actifs(WA_ID)).toHaveLength(1);
    core.close();
  });

  it("replaceAuto() remplace uniquement les faits 'auto' du client, jamais 'jacob'/'bot'", () => {
    const core = testCore();
    core.facts.add(WA_ID, "Fait manuel", "jacob");
    core.facts.add(WA_ID, "Ancien fait auto A", "auto");
    core.facts.add(WA_ID, "Ancien fait auto B", "auto");

    core.facts.replaceAuto(WA_ID, ["Nouveau fait auto C", "Nouveau fait auto D"]);

    const actifs = core.facts.actifs(WA_ID, 100);
    expect(actifs.some((f) => f.fait === "Fait manuel")).toBe(true);
    expect(actifs.some((f) => f.fait === "Ancien fait auto A")).toBe(false);
    expect(actifs.some((f) => f.fait === "Ancien fait auto B")).toBe(false);
    expect(actifs.some((f) => f.fait === "Nouveau fait auto C")).toBe(true);
    expect(actifs.some((f) => f.fait === "Nouveau fait auto D")).toBe(true);
    core.close();
  });

  it("replaceAuto() ne touche pas les faits d'un autre client", () => {
    const core = testCore();
    core.facts.add("336_autre", "Fait d'un autre client", "auto");
    core.facts.replaceAuto(WA_ID, ["Fait pour WA_ID"]);
    expect(core.facts.actifs("336_autre")).toHaveLength(1);
    core.close();
  });
});
