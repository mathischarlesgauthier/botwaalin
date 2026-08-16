import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "../src/db";
import {
  createHandler,
  isOptIn,
  isOptOut,
  OPTIN_CONFIRMATION,
  OPTOUT_CONFIRMATION,
} from "../src/handler";
import { createGate, SERVICE_WINDOW_MS, type SendResult } from "../src/whatsapp";
import { silentLogger } from "./helpers";

const WA_ID = "33612345678";

describe("détection STOP / désabonnement", () => {
  it("reconnaît les variantes d'opt-out", () => {
    expect(isOptOut("STOP")).toBe(true);
    expect(isOptOut("stop")).toBe(true);
    expect(isOptOut("Désabonne-moi")).toBe(true);
    expect(isOptOut("je veux me désinscrire")).toBe(true);
    expect(isOptOut("je ne veux plus de message")).toBe(true);
  });

  it("ne se déclenche pas sur un message normal", () => {
    expect(isOptOut("Bonjour, je veux un site")).toBe(false);
    expect(isOptOut("stoppez pas le projet")).toBe(false);
    expect(isOptIn("START")).toBe(true);
    expect(isOptIn("bonjour")).toBe(false);
  });
});

describe("flux opt-out via le handler", () => {
  let db: Db;
  let sent: Array<{ waId: string; text: string }>;
  let agentCalls: number;
  let handleBatch: ReturnType<typeof createHandler>;

  beforeEach(() => {
    db = createDb(":memory:");
    sent = [];
    agentCalls = 0;
    handleBatch = createHandler({
      db,
      wa: {
        async sendText(waId, text): Promise<SendResult> {
          sent.push({ waId, text });
          return { sent: true };
        },
      },
      agent: {
        async respond() {
          agentCalls++;
          return "réponse agent";
        },
      },
      log: silentLogger(),
    });
  });

  it("STOP → opt_out=1 + confirmation unique, sans passer par l'agent", async () => {
    db.upsertContact(WA_ID);
    await handleBatch(WA_ID, [{ text: "STOP" }]);

    expect(db.getContact(WA_ID)?.opt_out).toBe(1);
    expect(agentCalls).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toBe(OPTOUT_CONFIRMATION);
  });

  it("un second STOP ne renvoie pas de confirmation (confirmation unique)", async () => {
    await handleBatch(WA_ID, [{ text: "STOP" }]);
    await handleBatch(WA_ID, [{ text: "stop" }]);
    expect(sent).toHaveLength(1);
  });

  it("plus aucun envoi vers un contact opt-out", async () => {
    await handleBatch(WA_ID, [{ text: "STOP" }]);
    sent = [];
    await handleBatch(WA_ID, [{ text: "Bonjour, je veux un site" }]);
    expect(sent).toHaveLength(0);
    expect(agentCalls).toBe(0);
  });

  it("START réactive le contact", async () => {
    await handleBatch(WA_ID, [{ text: "STOP" }]);
    await handleBatch(WA_ID, [{ text: "START" }]);
    expect(db.getContact(WA_ID)?.opt_out).toBe(0);
    expect(sent.at(-1)?.text).toBe(OPTIN_CONFIRMATION);
  });
});

describe("gate d'envoi sortant (opt-out + fenêtre 24 h)", () => {
  let db: Db;

  beforeEach(() => {
    db = createDb(":memory:");
    db.upsertContact(WA_ID);
  });

  it("bloque tout envoi libre vers un contact opt-out", () => {
    db.insertMessage(WA_ID, "user", "bonjour");
    db.setOptOut(WA_ID, true);
    const gate = createGate(db);
    expect(gate.canSendFreeForm(WA_ID)).toEqual({ ok: false, reason: "opt_out" });
    expect(gate.canSendTemplate(WA_ID)).toEqual({ ok: false, reason: "opt_out" });
  });

  it("refuse explicitement un message libre hors fenêtre de service 24 h", () => {
    const now = Date.now();
    db.insertMessage(WA_ID, "user", "vieux message", null, now - SERVICE_WINDOW_MS - 1);
    const gate = createGate(db, () => now);
    expect(gate.canSendFreeForm(WA_ID)).toEqual({
      ok: false,
      reason: "outside_24h_window",
    });
    // Hors fenêtre, seul un template approuvé reste autorisé.
    expect(gate.canSendTemplate(WA_ID)).toEqual({ ok: true });
  });

  it("autorise un message libre dans la fenêtre de 24 h", () => {
    const now = Date.now();
    db.insertMessage(WA_ID, "user", "message récent", null, now - 60_000);
    const gate = createGate(db, () => now);
    expect(gate.canSendFreeForm(WA_ID)).toEqual({ ok: true });
  });

  it("refuse un message libre vers un contact qui n'a jamais écrit", () => {
    const gate = createGate(db);
    expect(gate.canSendFreeForm(WA_ID)).toEqual({
      ok: false,
      reason: "outside_24h_window",
    });
  });
});
