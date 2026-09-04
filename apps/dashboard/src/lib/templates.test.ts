import { describe, expect, it } from "vitest";
import { templateLanguageWarning, type TemplateStatus } from "./templates";

describe("templateLanguageWarning", () => {
  it("ne prévient pas quand aucun template n'est configuré", () => {
    expect(templateLanguageWarning([], "", "fr")).toBeNull();
  });

  it("signale un template totalement introuvable", () => {
    const warning = templateLanguageWarning([], "alerte_admin", "fr");
    expect(warning).toMatch(/n'existe pas côté Meta/);
  });

  it("reproduit le bug prod #132001 : template existant mais pas dans la langue demandée", () => {
    const templates: TemplateStatus[] = [
      { name: "alerte_admin", status: "APPROVED", language: "en_US" },
    ];
    const warning = templateLanguageWarning(templates, "alerte_admin", "fr");
    expect(warning).toMatch(/n'existe pas en langue « fr »/);
    expect(warning).toMatch(/132001/);
  });

  it("signale un template pas encore approuvé", () => {
    const templates: TemplateStatus[] = [
      { name: "relance_client", status: "PENDING", language: "fr" },
    ];
    const warning = templateLanguageWarning(templates, "relance_client", "fr");
    expect(warning).toMatch(/PENDING/);
  });

  it("ne prévient pas quand le template est approuvé dans la bonne langue", () => {
    const templates: TemplateStatus[] = [
      { name: "alerte_admin", status: "APPROVED", language: "fr" },
    ];
    expect(templateLanguageWarning(templates, "alerte_admin", "fr")).toBeNull();
  });
});
