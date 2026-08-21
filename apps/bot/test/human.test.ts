import { validateE164, type AdminNumber } from "@arbi/core";
import { describe, expect, it, vi } from "vitest";
import type { SalesAgent } from "../src/agent";
import { createHandler } from "../src/handler";
import { fakeWa, silentLogger, testAlertDeps, testCore } from "./helpers";

const WA_ID = "33612345678";

function stubAgent() {
  const respond = vi.fn(async () => ({
    text: "réponse agent",
    alertFired: false,
    niveau4Sent: false,
  }));
  return { agent: { respond } as unknown as SalesAgent, respond };
}

describe("mode humain : le bot se tait complètement", () => {
  it("ne répond pas et n'appelle pas l'agent quand Jacob a repris la main", async () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    core.contacts.setModeHumain(WA_ID, true);
    const wa = fakeWa();
    const { agent, respond } = stubAgent();
    const handle = createHandler({
      core, wa, agent, alertDeps: testAlertDeps(core, wa), log: silentLogger(),
    });

    await handle(WA_ID, [{ text: "Bonjour, vous êtes là ?" }]);

    expect(respond).not.toHaveBeenCalled();
    expect(wa.sent).toHaveLength(0);
    core.close();
  });

  it("répond normalement une fois la main rendue au bot", async () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    core.contacts.setModeHumain(WA_ID, true);
    core.contacts.setModeHumain(WA_ID, false);
    core.messages.insert(WA_ID, "user", "Bonjour");
    const wa = fakeWa();
    const { agent, respond } = stubAgent();
    const handle = createHandler({
      core, wa, agent, alertDeps: testAlertDeps(core, wa), log: silentLogger(),
    });

    await handle(WA_ID, [{ text: "Bonjour" }]);
    expect(respond).toHaveBeenCalledTimes(1);
    expect(wa.sent.some((s) => s.kind === "text" && s.text === "réponse agent")).toBe(true);
    core.close();
  });

  it("réactivation automatique après le délai d'inactivité", () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    core.contacts.setModeHumain(WA_ID, true);
    // Simule une reprise humaine vieille de 25 h sans aucune activité depuis.
    core.sqlite
      .prepare(`UPDATE contacts SET humain_depuis = ? WHERE wa_id = ?`)
      .run(Date.now() - 25 * 3600 * 1000, WA_ID);

    const released = core.contacts.releaseStaleHumanMode(24 * 3600 * 1000);
    expect(released).toBe(1);
    expect(core.contacts.get(WA_ID)?.modeHumain).toBe(0);
    core.close();
  });

  it("PAS de réactivation si une activité récente existe", () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    core.contacts.setModeHumain(WA_ID, true);
    core.messages.insert(WA_ID, "human", "Je m'en occupe", null, Date.now());
    const released = core.contacts.releaseStaleHumanMode(24 * 3600 * 1000);
    expect(released).toBe(0);
    expect(core.contacts.get(WA_ID)?.modeHumain).toBe(1);
    core.close();
  });
});

describe("numéro admin modifiable (réglages)", () => {
  it("seed depuis l'env, puis la base fait autorité, avec historique", () => {
    const core = testCore("+33699999999");
    const initial = core.settings.get("admin_numbers") as AdminNumber[];
    expect(initial).toEqual([{ number: "+33699999999", actif: true }]);

    // Changement depuis le dashboard : nouveau numéro + second destinataire.
    const updated: AdminNumber[] = [
      { number: "+33612345678", actif: true },
      { number: "+33700000000", actif: false },
    ];
    core.settings.set("admin_numbers", updated);
    expect(core.settings.get("admin_numbers")).toEqual(updated);

    const history = core.settings.history("admin_numbers");
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0]?.newValue).toContain("+33612345678");
    expect(history[0]?.oldValue).toContain("+33699999999");
    core.close();
  });

  it("validation E.164", () => {
    expect(validateE164("+33612345678")).toBe(true);
    expect(validateE164("+14155550123")).toBe(true);
    expect(validateE164("0612345678")).toBe(false);
    expect(validateE164("+0612345678")).toBe(false);
    expect(validateE164("+33 6 12 34 56 78")).toBe(false);
    expect(validateE164("jacob")).toBe(false);
  });
});
