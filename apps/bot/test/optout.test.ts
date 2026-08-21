import { createGate, SERVICE_WINDOW_MS } from "@arbi/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SalesAgent } from "../src/agent";
import {
  createHandler,
  isOptIn,
  isOptOut,
  OPTIN_CONFIRMATION,
  OPTOUT_CONFIRMATION,
} from "../src/handler";
import { fakeWa, silentLogger, testAlertDeps, testCore } from "./helpers";

const WA_ID = "33612345678";

describe("détection STOP / désabonnement", () => {
  it("reconnaît les variantes d'opt-out et d'opt-in", () => {
    expect(isOptOut("STOP")).toBe(true);
    expect(isOptOut("Désabonne-moi")).toBe(true);
    expect(isOptOut("je veux me désinscrire")).toBe(true);
    expect(isOptOut("Bonjour, je veux un site")).toBe(false);
    expect(isOptOut("stoppez pas le projet")).toBe(false);
    expect(isOptIn("START")).toBe(true);
    expect(isOptIn("bonjour")).toBe(false);
  });
});

describe("flux opt-out via le handler", () => {
  let core: ReturnType<typeof testCore>;
  let wa: ReturnType<typeof fakeWa>;
  let respond: ReturnType<typeof vi.fn>;
  let handle: ReturnType<typeof createHandler>;

  beforeEach(() => {
    core = testCore();
    wa = fakeWa();
    respond = vi.fn(async () => ({ text: "réponse agent", alertFired: false, niveau4Sent: false }));
    handle = createHandler({
      core,
      wa,
      agent: { respond } as unknown as SalesAgent,
      alertDeps: testAlertDeps(core, wa),
      log: silentLogger(),
    });
  });

  it("STOP → opt_out=1 + confirmation unique, sans passer par l'agent", async () => {
    core.contacts.upsert(WA_ID);
    await handle(WA_ID, [{ text: "STOP" }]);
    expect(core.contacts.get(WA_ID)?.optOut).toBe(1);
    expect(respond).not.toHaveBeenCalled();
    expect(wa.sent).toHaveLength(1);
    expect(wa.sent[0]?.text).toBe(OPTOUT_CONFIRMATION);
  });

  it("un second STOP ne renvoie pas de confirmation", async () => {
    await handle(WA_ID, [{ text: "STOP" }]);
    await handle(WA_ID, [{ text: "stop" }]);
    expect(wa.sent).toHaveLength(1);
  });

  it("plus aucun envoi vers un contact opt-out", async () => {
    await handle(WA_ID, [{ text: "STOP" }]);
    wa.sent.length = 0;
    await handle(WA_ID, [{ text: "Bonjour, je veux un site" }]);
    expect(wa.sent).toHaveLength(0);
    expect(respond).not.toHaveBeenCalled();
  });

  it("START réactive le contact", async () => {
    await handle(WA_ID, [{ text: "STOP" }]);
    await handle(WA_ID, [{ text: "START" }]);
    expect(core.contacts.get(WA_ID)?.optOut).toBe(0);
    expect(wa.sent.at(-1)?.text).toBe(OPTIN_CONFIRMATION);
  });
});

describe("gate d'envoi sortant (fenêtre 24 h + opt-out)", () => {
  it("bloque un envoi libre hors fenêtre, autorise le template", () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    const now = Date.now();
    core.messages.insert(WA_ID, "user", "vieux message", null, now - SERVICE_WINDOW_MS - 1);
    const gate = createGate(
      {
        getContact: (waId) => {
          const c = core.contacts.get(waId);
          return c ? { optOut: c.optOut } : undefined;
        },
        lastInboundTs: (waId) => core.messages.lastInboundTs(waId),
      },
      () => now,
    );
    expect(gate.canSendFreeForm(WA_ID)).toEqual({ ok: false, reason: "outside_24h_window" });
    expect(gate.canSendTemplate(WA_ID)).toEqual({ ok: true });

    core.messages.insert(WA_ID, "user", "message récent", null, now - 60_000);
    expect(gate.canSendFreeForm(WA_ID)).toEqual({ ok: true });

    core.contacts.setOptOut(WA_ID, true);
    expect(gate.canSendFreeForm(WA_ID)).toEqual({ ok: false, reason: "opt_out" });
    expect(gate.canSendTemplate(WA_ID)).toEqual({ ok: false, reason: "opt_out" });
    core.close();
  });
});
