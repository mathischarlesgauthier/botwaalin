import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { triggerAlert, type AlertDeps } from "../src/alerts";
import { SETTINGS_DEFAULTS } from "../src/db";
import type { SendResult, WhatsAppClient } from "../src/whatsapp";
import { fakeLlm, silentLogger, testCore } from "./helpers";

describe("SETTINGS_DEFAULTS (§4.5/§4.6 — nouveaux réglages)", () => {
  it("relance_template_name, alert_template_lang, style_guide_appris ont les bons défauts", () => {
    expect(SETTINGS_DEFAULTS.relance_template_name).toBe("");
    expect(SETTINGS_DEFAULTS.alert_template_lang).toBe("fr");
    expect(SETTINGS_DEFAULTS.style_guide_appris).toBe("");
  });

  it("core.settings.get() renvoie ces défauts sur une base neuve", () => {
    const core = testCore();
    expect(core.settings.get("relance_template_name")).toBe("");
    expect(core.settings.get("alert_template_lang")).toBe("fr");
    expect(core.settings.get("style_guide_appris")).toBe("");
    core.close();
  });
});

interface RecordedTemplate {
  waId: string;
  templateName: string;
  lang: string;
}

function fakeWaRecordingLang() {
  const templates: RecordedTemplate[] = [];
  const wa = {
    templates,
    async sendText(): Promise<SendResult> {
      return { sent: false, reason: "not_used" };
    },
    async sendButtons(): Promise<SendResult> {
      return { sent: false, reason: "not_used" };
    },
    async sendMenu(): Promise<SendResult> {
      return { sent: false, reason: "not_used" };
    },
    async sendTemplate(waId: string, templateName: string, lang = "fr"): Promise<SendResult> {
      templates.push({ waId, templateName, lang });
      return { sent: true, messageId: "wamid.TEST" };
    },
  };
  return wa as typeof wa & WhatsAppClient;
}

describe("sendTemplate — le core envoie le template d'alerte dans la langue réglée (§4.6)", () => {
  it("triggerAlert() utilise alert_template_lang, pas 'fr' en dur", async () => {
    const core = testCore();
    core.settings.set("admin_numbers", [{ number: "+33600000000", actif: true }]);
    core.settings.set("alert_template_lang", "en");
    const wa = fakeWaRecordingLang();
    const deps: AlertDeps = {
      core,
      wa,
      llm: fakeLlm("Résumé.") as unknown as Anthropic,
      model: "modele-test",
      log: silentLogger(),
    };

    await triggerAlert(deps, {
      waId: "33612345678",
      motif: "test",
      intention: "information",
      categorie: "Autre",
      dernierMessage: "dernier message",
    });

    expect(wa.templates).toHaveLength(1);
    expect(wa.templates[0]?.lang).toBe("en");
    core.close();
  });

  it("par défaut (réglage non modifié), la langue reste 'fr'", async () => {
    const core = testCore();
    core.settings.set("admin_numbers", [{ number: "+33600000000", actif: true }]);
    const wa = fakeWaRecordingLang();
    const deps: AlertDeps = {
      core,
      wa,
      llm: fakeLlm("Résumé.") as unknown as Anthropic,
      model: "modele-test",
      log: silentLogger(),
    };

    await triggerAlert(deps, {
      waId: "33612345679",
      motif: "test",
      intention: "information",
      categorie: "Autre",
      dernierMessage: "dernier message",
    });

    expect(wa.templates[0]?.lang).toBe("fr");
    core.close();
  });
});
