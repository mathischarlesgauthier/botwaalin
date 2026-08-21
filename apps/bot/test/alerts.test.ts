import { triggerAlert } from "@arbi/core";
import { describe, expect, it } from "vitest";
import { analyzeInbound } from "../src/brain";
import { fakeWa, testAlertDeps, testCore } from "./helpers";

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
