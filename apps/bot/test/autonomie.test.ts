import { describe, expect, it } from "vitest";
import { buildStaticPrompt } from "../src/prompt";

const CATALOGUE = "Sites vitrines, boutiques, formations.";

function prompt(autonomie?: "autonome" | "equilibre" | "prudent"): string {
  return buildStaticPrompt(CATALOGUE, [], [], [], "", autonomie);
}

describe("autonomie du bot — fréquence du passage à Jacob", () => {
  it("par défaut : mode autonome, l'escalade est présentée comme une exception", () => {
    const p = prompt();
    expect(p).toContain("Autonomie (RÈGLE IMPORTANTE)");
    expect(p).toContain("EXCEPTION");
    expect(p).toContain("N'escalade JAMAIS");
  });

  it("mode autonome : les cas courants sont explicitement exclus de l'escalade", () => {
    const p = prompt("autonome");
    for (const cas of ["comparaison", "objection commerciale", "message de politesse"]) {
      expect(p).toContain(cas);
    }
  });

  it("mode prudent : consigne inverse, escalade au moindre doute", () => {
    const p = prompt("prudent");
    expect(p).toContain("Autonomie : prudente");
    expect(p).toContain("moindre doute");
    expect(p).not.toContain("N'escalade JAMAIS");
  });

  it("mode équilibré : cherche d'abord, escalade si l'info manque", () => {
    const p = prompt("equilibre");
    expect(p).toContain("Autonomie : équilibrée");
    expect(p).not.toContain("RÈGLE IMPORTANTE");
  });

  it("le closing ne passe plus la main automatiquement", () => {
    const p = prompt();
    expect(p).toContain("UNIQUEMENT si le client veut engager concrètement");
    // Non-régression de l'ancienne consigne, qui transmettait à chaque closing.
    expect(p).not.toContain("puis niveau4_humain pour le passage à Jacob");
  });

  it("les garde-fous restent intacts quel que soit le niveau d'autonomie", () => {
    for (const niveau of ["autonome", "equilibre", "prudent"] as const) {
      const p = prompt(niveau);
      // Jamais de prix inventé…
      expect(p).toContain("Ne JAMAIS inventer un prix");
      // …jamais d'encaissement…
      expect(p).toContain("Tu n'encaisses JAMAIS");
      // …et une réclamation part toujours en alerte immédiate.
      expect(p).toContain("raise_alert immédiatement");
    }
  });
});
