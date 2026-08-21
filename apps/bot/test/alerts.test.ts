import { triggerAlert } from "@arbi/core";
import { describe, expect, it } from "vitest";
import { analyzeInbound } from "../src/brain";
import { executeTool, type ToolContext } from "../src/tools";
import { fakeLlm, fakeWa, silentLogger, testAlertDeps, testCore } from "./helpers";

const WA_ID = "33612345678";

describe("déclenchement d'alerte", () => {
  it("crée l'alerte, génère le résumé, notifie l'admin par template et bascule le contact", async () => {
    const core = testCore("+33699999999");
    core.contacts.upsert(WA_ID, "Karim");
    core.messages.insert(WA_ID, "user", "Je veux un truc très particulier");
    const wa = fakeWa();

    const result = await triggerAlert(testAlertDeps(core, wa), {
      waId: WA_ID,
      motif: "info absente de la base",
      intention: "demande_personnalisee",
      categorie: "Digital",
      dernierMessage: "Je veux un truc très particulier",
    });

    expect(result.deduped).toBe(false);
    const alert = core.alerts.get(result.alertId);
    expect(alert?.statut).toBe("ouverte");
    expect(alert?.resume).toContain("Résumé de test");
    expect(result.notifiedVia).toContain("template:33699999999");
    expect(core.contacts.get(WA_ID)?.statut).toBe("alerte");
    expect(wa.sent.some((s) => s.kind === "template" && s.waId === "33699999999")).toBe(true);
    core.close();
  });

  it("repli texte libre quand le template échoue", async () => {
    const core = testCore("+33699999999");
    core.contacts.upsert(WA_ID);
    core.messages.insert(WA_ID, "user", "bonjour");
    // L'admin a écrit récemment au bot : fenêtre 24 h ouverte pour le texte libre.
    core.contacts.upsert("33699999999");
    core.messages.insert("33699999999", "user", "ok");
    const wa = fakeWa({ template: "http_404" });

    const result = await triggerAlert(testAlertDeps(core, wa), {
      waId: WA_ID,
      motif: "test repli",
      intention: "information",
      categorie: "Autre",
      dernierMessage: "bonjour",
    });

    expect(result.notifiedVia).toContain("texte:33699999999");
    const textSent = wa.sent.find((s) => s.kind === "text" && s.waId === "33699999999");
    expect(textSent?.text).toContain("NOUVELLE ALERTE");
    expect(textSent?.text).toContain("→ Reprendre : http://localhost:3001/conversations/" + WA_ID);
    core.close();
  });

  it("notifiedVia = aucune si tous les canaux échouent", async () => {
    const core = testCore("+33699999999");
    core.contacts.upsert(WA_ID);
    core.messages.insert(WA_ID, "user", "bonjour");
    const wa = fakeWa({ template: "http_404", text: "outside_24h_window" });

    const result = await triggerAlert(testAlertDeps(core, wa), {
      waId: WA_ID,
      motif: "test échec",
      intention: "information",
      categorie: "Autre",
      dernierMessage: "bonjour",
    });
    expect(result.notifiedVia).toBe("aucune");
    core.close();
  });

  it("dédoublonne : une seule alerte ouverte par contact, pas de re-notification", async () => {
    const core = testCore("+33699999999");
    core.contacts.upsert(WA_ID);
    core.messages.insert(WA_ID, "user", "bonjour");
    const wa = fakeWa();
    const deps = testAlertDeps(core, wa);

    const first = await triggerAlert(deps, {
      waId: WA_ID, motif: "premier", intention: "", categorie: "Autre", dernierMessage: "a",
    });
    const sentAfterFirst = wa.sent.length;
    const second = await triggerAlert(deps, {
      waId: WA_ID, motif: "second", intention: "", categorie: "Autre", dernierMessage: "b",
    });

    expect(second.deduped).toBe(true);
    expect(second.alertId).toBe(first.alertId);
    expect(core.alerts.open()).toHaveLength(1);
    expect(wa.sent.length).toBe(sentAfterFirst);
    core.close();
  });
});

describe("budget du template d'alerte (corps hydraté ≤ 1024 caractères Meta)", () => {
  it("plafonne le résumé pour rester sous la limite, même au pire cas", async () => {
    const core = testCore("+33699999999");
    core.contacts.upsert(WA_ID, "Client Avec Un Nom Particulièrement Long Pour Le Test");
    core.messages.insert(WA_ID, "user", "bonjour");
    const wa = fakeWa();
    const longSummary = "Résumé extrêmement détaillé. ".repeat(40); // ~1160 caractères
    const deps = testAlertDeps(core, wa, { llm: fakeLlm(longSummary) });

    await triggerAlert(deps, {
      waId: WA_ID,
      motif: "un motif de blocage volontairement très long pour pousser le budget du corps de template",
      intention: "demande_personnalisee",
      categorie: "Digital",
      dernierMessage: "d".repeat(300),
    });

    const template = wa.sent.find((s) => s.kind === "template");
    expect(template).toBeDefined();
    const body = (template?.components as Array<{ type: string; parameters?: Array<{ text: string }> }>)
      .find((c) => c.type === "body");
    const paramsLength = (body?.parameters ?? []).reduce((sum, p) => sum + p.text.length, 0);
    const TEMPLATE_BODY_FIXED = 113;
    expect(paramsLength + TEMPLATE_BODY_FIXED).toBeLessThanOrEqual(1024);
    for (const p of body?.parameters ?? []) {
      expect(p.text).not.toMatch(/\n/);
    }
    core.close();
  });
});

describe("niveau 4 : échec d'envoi géré honnêtement", () => {
  it("double échec boutons+texte → alerte à Jacob, pas de faux statut", async () => {
    const core = testCore("+33699999999");
    core.contacts.upsert(WA_ID);
    core.messages.insert(WA_ID, "user", "demande spéciale");
    const wa = fakeWa({ buttons: "outside_24h_window", text: "outside_24h_window" });
    // Le template admin, lui, passe (canal indépendant de la fenêtre client).
    const failingForClientOnly = {
      ...wa,
      async sendTemplate(waId: string, name: string, lang?: string, components?: unknown[]) {
        wa.sent.push({ waId, kind: "template", templateName: name, components });
        return { sent: true };
      },
    };
    const ctx: ToolContext = {
      waId: WA_ID,
      core,
      wa: failingForClientOnly as never,
      alertDeps: testAlertDeps(core, failingForClientOnly as never),
      state: core.state.get(WA_ID),
      log: silentLogger(),
      flags: { alertFired: false, niveau4Sent: false },
      lastClientMessage: "demande spéciale",
    };

    const output = await executeTool("niveau4_humain", { motif: "info absente" }, ctx);
    expect(output).toContain("ÉCHEC");
    expect(ctx.flags.niveau4Sent).toBe(false);
    expect(ctx.flags.alertFired).toBe(true);
    expect(core.contacts.get(WA_ID)?.statut).not.toBe("attente_choix");
    expect(core.alerts.open()).toHaveLength(1);
    core.close();
  });
});

describe("déclencheurs du routeur", () => {
  it("réclamation → alerte directe", () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    const state = core.state.get(WA_ID);
    const a = analyzeInbound(core, state, ["J'ai un problème, je veux un remboursement"], 3);
    expect(a.route).toBe("alerte_directe");
    expect(a.motif).toContain("réclamation");
    core.close();
  });

  it("3 échanges sans progression → alerte directe", () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    const state = core.state.get(WA_ID);
    // Premier message : fixe l'intention de référence.
    analyzeInbound(core, state, ["hmm"], 3);
    let last = analyzeInbound(core, state, ["hmm"], 3);
    last = analyzeInbound(core, state, ["hmm"], 3);
    last = analyzeInbound(core, state, ["hmm"], 3);
    expect(state.sansProgression).toBeGreaterThanOrEqual(3);
    expect(last.route).toBe("alerte_directe");
    expect(last.motif).toContain("sans progression");
    core.close();
  });
});
