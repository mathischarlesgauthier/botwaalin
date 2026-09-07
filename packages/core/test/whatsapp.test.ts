import { describe, expect, it } from "vitest";
import { createGate, SERVICE_WINDOW_MS, serviceWindow, WhatsAppClient } from "../src/whatsapp";
import { silentLogger } from "./helpers";

describe("serviceWindow (§4.1 — indicateur de fenêtre de service 24 h)", () => {
  it("jamais de message client : fenêtre fermée, closedSince inconnu (null)", () => {
    const result = serviceWindow(null, Date.now());
    expect(result).toEqual({ open: false, msLeft: 0, closedSince: null });
  });

  it("dernier message client récent : fenêtre ouverte, msLeft correct", () => {
    const now = 1_000_000_000_000;
    const last = now - 3 * 60 * 60 * 1000; // il y a 3 h
    const result = serviceWindow(last, now);
    expect(result.open).toBe(true);
    expect(result.closedSince).toBeNull();
    expect(result.msLeft).toBe(SERVICE_WINDOW_MS - 3 * 60 * 60 * 1000);
  });

  it("dernier message client il y a plus de 24 h : fenêtre fermée, closedSince renseigné", () => {
    const now = 1_000_000_000_000;
    const last = now - (26 * 60 * 60 * 1000); // il y a 26 h
    const result = serviceWindow(last, now);
    expect(result.open).toBe(false);
    expect(result.msLeft).toBe(0);
    expect(result.closedSince).toBe(2 * 60 * 60 * 1000); // fermée depuis 2 h
  });

  it("exactement à la limite des 24 h : reste ouverte (cohérent avec createGate, `>` strict)", () => {
    const now = 1_000_000_000_000;
    const last = now - SERVICE_WINDOW_MS;
    const result = serviceWindow(last, now);
    expect(result.open).toBe(true);
    expect(result.msLeft).toBe(0);
  });

  it("juste après la limite : fermée", () => {
    const now = 1_000_000_000_000;
    const last = now - SERVICE_WINDOW_MS - 1;
    const result = serviceWindow(last, now);
    expect(result.open).toBe(false);
    expect(result.closedSince).toBe(1);
  });
});

/** Fenêtre fermée depuis longtemps : dernier message client à t=0, « maintenant » très loin. */
function closedWindowGate(optOut = 0) {
  return createGate(
    { getContact: () => ({ optOut }), lastInboundTs: () => 0 },
    () => 10 * SERVICE_WINDOW_MS,
  );
}

function fakeFetch(status: number, body: unknown) {
  const calls: unknown[] = [];
  const fn = (async (_url: unknown, init?: RequestInit) => {
    calls.push(init?.body);
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

function client(fetchFn: typeof fetch, optOut = 0): WhatsAppClient {
  return new WhatsAppClient(
    {
      apiBase: "https://graph.test/v21.0",
      token: "t",
      phoneNumberId: "1",
      minGapMs: 0,
      maxRetries: 0,
      fetchFn,
    },
    closedWindowGate(optOut),
    silentLogger(),
  );
}

describe("canSendManual — Jacob doit toujours pouvoir reprendre la main", () => {
  it("hors fenêtre 24 h : le texte libre du bot est bloqué, l'envoi manuel non", () => {
    const gate = closedWindowGate();
    expect(gate.canSendFreeForm("336")).toEqual({ ok: false, reason: "outside_24h_window" });
    expect(gate.canSendManual("336")).toEqual({ ok: true });
  });

  it("opt-out : l'envoi manuel reste bloqué (numéro WhatsApp à protéger)", () => {
    expect(closedWindowGate(1).canSendManual("336")).toEqual({ ok: false, reason: "opt_out" });
  });
});

describe("sendText hors fenêtre", () => {
  it("sans `manual` : refus local, aucun appel réseau", async () => {
    const { fn, calls } = fakeFetch(200, {});
    const result = await client(fn).sendText("336", "coucou");
    expect(result).toEqual({ sent: false, reason: "outside_24h_window" });
    expect(calls).toHaveLength(0);
  });

  it("avec `manual` : l'appel part quand même vers Meta", async () => {
    const { fn, calls } = fakeFetch(200, { messages: [{ id: "wamid.1" }] });
    const result = await client(fn).sendText("336", "coucou", { manual: true });
    expect(result.sent).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("opt-out : même en manuel, rien ne part", async () => {
    const { fn, calls } = fakeFetch(200, {});
    const result = await client(fn, 1).sendText("336", "coucou", { manual: true });
    expect(result).toEqual({ sent: false, reason: "opt_out" });
    expect(calls).toHaveLength(0);
  });
});

describe("erreurs Meta traduites", () => {
  it("131047 (réengagement) devient `outside_24h_window` pour permettre le repli template", async () => {
    const { fn } = fakeFetch(400, { error: { code: 131047, message: "Re-engagement message" } });
    const result = await client(fn).sendText("336", "coucou", { manual: true });
    expect(result).toEqual({ sent: false, reason: "outside_24h_window", metaCode: 131047 });
  });

  it("autre code Meta : raison HTTP conservée, code remonté", async () => {
    const { fn } = fakeFetch(400, { error: { code: 132000 } });
    const result = await client(fn).sendText("336", "coucou", { manual: true });
    expect(result).toEqual({ sent: false, reason: "http_400", metaCode: 132000 });
  });

  it("corps d'erreur illisible : pas de metaCode, raison HTTP", async () => {
    const fn = (async () => new Response("<html>502</html>", { status: 403 })) as typeof fetch;
    const result = await client(fn).sendText("336", "coucou", { manual: true });
    expect(result).toEqual({ sent: false, reason: "http_403" });
  });
});
