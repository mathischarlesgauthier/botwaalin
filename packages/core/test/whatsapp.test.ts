import { describe, expect, it } from "vitest";
import { SERVICE_WINDOW_MS, serviceWindow } from "../src/whatsapp";

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
