import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Core } from "../src";
import { initBilling, nextBillingDate } from "../src/billing";
import { testCore } from "./helpers";

let core: Core;

beforeEach(() => {
  core = testCore();
});

afterEach(() => {
  core.close();
});

const JOUR = 24 * 60 * 60 * 1000;

describe("nextBillingDate — prochain prélèvement affiché au client", () => {
  it("facturation jamais initialisée : aucune date", () => {
    expect(nextBillingDate(core)).toBeNull();
  });

  it("date anniversaire du mois suivant, et jours restants", () => {
    const debut = Date.UTC(2026, 0, 10, 12, 0, 0); // 10 janvier
    initBilling(core, debut);
    const now = Date.UTC(2026, 0, 20, 12, 0, 0); // 20 janvier
    const prochain = nextBillingDate(core, now);
    expect(prochain).not.toBeNull();
    expect(new Date(prochain!.at).toISOString().slice(0, 10)).toBe("2026-02-10");
    expect(prochain!.daysLeft).toBe(21);
  });

  it("le jour même de l'échéance, la suivante est celle du mois d'après", () => {
    const debut = Date.UTC(2026, 0, 10, 12, 0, 0);
    initBilling(core, debut);
    // Juste après l'échéance de février.
    const now = Date.UTC(2026, 1, 10, 12, 0, 1);
    const prochain = nextBillingDate(core, now);
    expect(new Date(prochain!.at).toISOString().slice(0, 10)).toBe("2026-03-10");
  });

  it("échéance imminente : jours restants jamais négatifs", () => {
    const debut = Date.UTC(2026, 0, 10, 12, 0, 0);
    initBilling(core, debut);
    const now = Date.UTC(2026, 1, 10, 11, 0, 0); // 1 h avant
    const prochain = nextBillingDate(core, now);
    expect(prochain!.daysLeft).toBe(1);
    expect(prochain!.at - now).toBeLessThan(JOUR);
  });

  it("jour de fin de mois : clampé comme Stripe (31 janv → 28 févr)", () => {
    const debut = Date.UTC(2026, 0, 31, 9, 0, 0);
    initBilling(core, debut);
    const now = Date.UTC(2026, 1, 1, 9, 0, 0);
    const prochain = nextBillingDate(core, now);
    // 2026 n'est pas bissextile : février compte 28 jours.
    expect(new Date(prochain!.at).toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("début de facturation dans le futur : c'est la première échéance", () => {
    const debut = Date.UTC(2026, 5, 1, 8, 0, 0);
    initBilling(core, debut);
    const now = Date.UTC(2026, 4, 1, 8, 0, 0);
    const prochain = nextBillingDate(core, now);
    expect(new Date(prochain!.at).toISOString().slice(0, 10)).toBe("2026-06-01");
  });
});
