import {
  balanceCents,
  billingStatus,
  ensureMonthlyDebits,
  GRACE_DAYS,
  initBilling,
  listTransactions,
  pollStripePayments,
  recordUsage,
  SUBSCRIPTION_CENTS,
  withUsageMetering,
  type MeteredUsage,
} from "@arbi/core";
import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { silentLogger, testCore } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 5); // 5 janvier 2026

describe("grand livre de facturation", () => {
  it("crédite 50 € une seule fois à l'initialisation (premier mois inclus)", () => {
    const core = testCore();
    initBilling(core, T0);
    initBilling(core, T0 + DAY);
    expect(balanceCents(core)).toBe(SUBSCRIPTION_CENTS);
    const credits = listTransactions(core).filter((t) => t.type === "credit_initial");
    expect(credits).toHaveLength(1);
  });

  it("pose un débit de 50 € par échéance anniversaire, idempotent", () => {
    const core = testCore();
    initBilling(core, T0);
    // Trois échéances atteintes : 5 janv, 5 févr, 5 mars.
    const later = Date.UTC(2026, 2, 20);
    ensureMonthlyDebits(core, later);
    ensureMonthlyDebits(core, later); // re-exécution sans double débit
    const debits = listTransactions(core).filter((t) => t.type === "abonnement");
    expect(debits).toHaveLength(3);
    expect(debits.every((t) => t.montant_cents === -SUBSCRIPTION_CENTS)).toBe(true);
    expect(balanceCents(core)).toBe(SUBSCRIPTION_CENTS - 3 * SUBSCRIPTION_CENTS);
  });

  it("pas de débit avant le jour anniversaire du mois (aligné sur le renouvellement Stripe)", () => {
    const core = testCore();
    const start = Date.UTC(2026, 0, 20); // activation le 20 janvier
    initBilling(core, start);
    ensureMonthlyDebits(core, Date.UTC(2026, 1, 15)); // 15 févr : échéance pas atteinte
    expect(listTransactions(core).filter((t) => t.type === "abonnement")).toHaveLength(1);
    ensureMonthlyDebits(core, Date.UTC(2026, 1, 20)); // 20 févr : échéance atteinte
    expect(listTransactions(core).filter((t) => t.type === "abonnement")).toHaveLength(2);
  });

  it("billing_start dans le futur ne pose AUCUN débit (recul d'horloge)", () => {
    const core = testCore();
    initBilling(core, Date.UTC(2026, 8, 1, 0, 0, 1)); // horloge en avance
    const inserted = ensureMonthlyDebits(core, Date.UTC(2026, 7, 31, 23, 30)); // horloge corrigée
    expect(inserted).toBe(0);
    expect(balanceCents(core)).toBe(SUBSCRIPTION_CENTS);
  });

  it("le crédit de bienvenue couvre exactement le premier mois", () => {
    const core = testCore();
    initBilling(core, T0);
    ensureMonthlyDebits(core, T0);
    expect(balanceCents(core)).toBe(0);
    // Solde exactement nul = compte réglé (le premier mois est couvert).
    const status = billingStatus(core, T0 + DAY);
    expect(status.active).toBe(true);
    expect(status.reason).toBe("ok");
  });
});

describe("consommation API facturée", () => {
  it("enregistre le montant facturé = coût interne × marge", () => {
    const core = testCore();
    initBilling(core, T0);
    recordUsage(
      core,
      { model: "kimi-k2.6", inputTokens: 1000, outputTokens: 500, costCentimes: 2.5, billedCentimes: 10 },
      T0,
    );
    expect(balanceCents(core)).toBe(SUBSCRIPTION_CENTS - 10);
  });

  it("le wrapper de comptage applique la marge ×4 sur le coût interne", async () => {
    const usages: MeteredUsage[] = [];
    const fake = {
      messages: {
        create: async () => ({
          usage: { input_tokens: 1_000_000, output_tokens: 500_000 },
          content: [],
        }),
      },
    } as unknown as Anthropic;
    const metered = withUsageMetering(
      fake,
      { inputCentsPerMTok: 55, outputCentsPerMTok: 230, markup: 4 },
      (u) => usages.push(u),
    );
    await metered.messages.create({ model: "kimi-k2.6", max_tokens: 10, messages: [] });
    expect(usages).toHaveLength(1);
    const expectedCost = 55 + 230 / 2; // 1M input + 0,5M output
    expect(usages[0]?.costCentimes).toBeCloseTo(expectedCost, 5);
    expect(usages[0]?.billedCentimes).toBeCloseTo(expectedCost * 4, 5);
  });
});

describe("statut du service (coupures)", () => {
  it("abonnement impayé → 10 jours de grâce puis coupure", () => {
    const core = testCore();
    initBilling(core, T0);
    ensureMonthlyDebits(core, T0); // janvier, couvert par le crédit de bienvenue
    const feb5 = Date.UTC(2026, 1, 5);
    ensureMonthlyDebits(core, feb5); // échéance de février, non couverte

    const during = billingStatus(core, feb5 + (GRACE_DAYS - 1) * DAY);
    expect(during.active).toBe(true);
    expect(during.reason).toBe("abonnement_impaye");
    expect(during.cutAt).toBe(feb5 + GRACE_DAYS * DAY);

    const after = billingStatus(core, feb5 + (GRACE_DAYS + 1) * DAY);
    expect(after.active).toBe(false);
    expect(after.reason).toBe("abonnement_impaye");
  });

  it("rattrapage après indisponibilité : la grâce court depuis la POSE du débit, pas la date nominale", () => {
    const core = testCore();
    initBilling(core, T0);
    ensureMonthlyDebits(core, T0); // janvier posé, puis serveur éteint
    const boot = Date.UTC(2026, 2, 20); // redémarrage le 20 mars
    ensureMonthlyDebits(core, boot); // février + mars posés maintenant

    const atBoot = billingStatus(core, boot + DAY);
    expect(atBoot.active).toBe(true); // 10 jours pleins de grâce après le boot
    expect(atBoot.reason).toBe("abonnement_impaye");
    expect(atBoot.cutAt).toBe(boot + GRACE_DAYS * DAY);
    expect(billingStatus(core, boot + (GRACE_DAYS + 1) * DAY).active).toBe(false);
  });

  it("client qui paie chaque mois et consomme l'API : jamais coupé", () => {
    const core = testCore();
    const start = Date.UTC(2026, 0, 20);
    initBilling(core, start);
    ensureMonthlyDebits(core, start); // janvier couvert par le crédit
    recordUsage(
      core,
      { model: "m", inputTokens: 1, outputTokens: 1, costCentimes: 100, billedCentimes: 400 },
      Date.UTC(2026, 1, 10),
    );
    const pay = (ts: number) =>
      core.sqlite
        .prepare(
          `INSERT INTO billing_transactions (type, montant_cents, description, ref, created_at)
           VALUES ('paiement', ?, 'Paiement abonnement (Stripe)', ?, ?)`,
        )
        .run(SUBSCRIPTION_CENTS, `stripe:in_${ts}`, ts);
    ensureMonthlyDebits(core, Date.UTC(2026, 1, 20));
    pay(Date.UTC(2026, 1, 20));
    ensureMonthlyDebits(core, Date.UTC(2026, 2, 20));
    pay(Date.UTC(2026, 2, 20));

    const status = billingStatus(core, Date.UTC(2026, 2, 25));
    expect(status.active).toBe(true);
    expect(status.reason).toBe("ok");
    expect(status.balanceCents).toBe(-400); // conso API en attente de facturation
  });

  it("crédit épuisé par l'API (plus de 50 € non couverts) → coupure immédiate, sans grâce", () => {
    const core = testCore();
    initBilling(core, T0);
    ensureMonthlyDebits(core, T0); // le crédit couvre l'abonnement de janvier
    recordUsage(
      core,
      { model: "m", inputTokens: 1, outputTokens: 1, costCentimes: 1300, billedCentimes: 5200 },
      T0 + DAY,
    );
    const status = billingStatus(core, T0 + DAY + 1);
    expect(status.active).toBe(false);
    expect(status.reason).toBe("credit_api_epuise");
  });

  it("une conso API modérée (≤ 50 €) ne coupe pas : elle part sur la facture suivante", () => {
    const core = testCore();
    initBilling(core, T0);
    ensureMonthlyDebits(core, T0);
    recordUsage(
      core,
      { model: "m", inputTokens: 1, outputTokens: 1, costCentimes: 300, billedCentimes: 1200 },
      T0 + DAY,
    );
    const status = billingStatus(core, T0 + 2 * DAY);
    expect(status.active).toBe(true);
    expect(status.reason).toBe("ok");
  });

  it("un paiement reçu réactive le service", () => {
    const core = testCore();
    initBilling(core, T0);
    ensureMonthlyDebits(core, T0);
    const feb5 = Date.UTC(2026, 1, 5);
    ensureMonthlyDebits(core, feb5);
    expect(billingStatus(core, feb5 + 15 * DAY).active).toBe(false);

    core.sqlite
      .prepare(
        `INSERT INTO billing_transactions (type, montant_cents, description, ref, created_at)
         VALUES ('paiement', ?, 'Paiement abonnement (Stripe)', 'stripe:in_test', ?)`,
      )
      .run(SUBSCRIPTION_CENTS, feb5 + 16 * DAY);
    const status = billingStatus(core, feb5 + 17 * DAY);
    expect(status.active).toBe(true);
    expect(status.reason).toBe("ok");
    expect(status.balanceCents).toBe(0);
  });
});

describe("sondage des paiements Stripe", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("crédite chaque facture payée une seule fois (idempotent)", async () => {
    const core = testCore();
    initBilling(core, T0);
    core.settings.set("stripe_price_id", "price_test_123");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: "in_abc",
                amount_paid: SUBSCRIPTION_CENTS,
                currency: "eur",
                created: Math.floor(Date.UTC(2026, 1, 3) / 1000),
                lines: { data: [{ price: { id: "price_test_123" } }] },
              },
              {
                id: "in_autre_produit",
                amount_paid: 9900,
                currency: "eur",
                created: Math.floor(Date.UTC(2026, 1, 4) / 1000),
                lines: { data: [{ price: { id: "price_autre" } }] },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const first = await pollStripePayments(core, "sk_test_x", silentLogger());
    const second = await pollStripePayments(core, "sk_test_x", silentLogger());
    expect(first).toBe(1);
    expect(second).toBe(0);
    const paiements = listTransactions(core).filter((t) => t.type === "paiement");
    expect(paiements).toHaveLength(1);
    expect(paiements[0]?.montant_cents).toBe(SUBSCRIPTION_CENTS);
    expect(paiements[0]?.ref).toBe("stripe:in_abc");
  });

  it("pagine au-delà de la première page de factures (has_more)", async () => {
    const core = testCore();
    initBilling(core, T0);
    core.settings.set("stripe_price_id", "price_test_123");
    const json = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 });
    const invoice = (id: string, created: number) => ({
      id,
      amount_paid: SUBSCRIPTION_CENTS,
      currency: "eur",
      created,
      lines: { data: [{ price: { id: "price_test_123" } }] },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes("/invoices")) {
          if (u.includes("starting_after=in_page1")) {
            return json({ data: [invoice("in_page2", 1_700_000_100)], has_more: false });
          }
          return json({ data: [invoice("in_page1", 1_700_000_200)], has_more: true });
        }
        return json({ data: [] });
      }),
    );
    const credited = await pollStripePayments(core, "sk_test_x", silentLogger());
    expect(credited).toBe(2);
    expect(listTransactions(core).filter((t) => t.type === "paiement")).toHaveLength(2);
  });

  it("répercute un remboursement sur nos paiements en ajustement négatif, idempotent", async () => {
    const core = testCore();
    initBilling(core, T0);
    core.settings.set("stripe_price_id", "price_test_123");
    const json = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes("/invoices")) {
          return json({
            data: [
              {
                id: "in_ref",
                amount_paid: SUBSCRIPTION_CENTS,
                currency: "eur",
                created: 1_700_000_000,
                charge: "ch_nous",
                lines: { data: [{ price: { id: "price_test_123" } }] },
              },
            ],
            has_more: false,
          });
        }
        if (u.includes("/refunds")) {
          return json({
            data: [
              // Remboursement sur NOTRE charge → répercuté.
              { id: "re_1", amount: SUBSCRIPTION_CENTS, currency: "eur", status: "succeeded", charge: "ch_nous", created: 1_700_100_000 },
              // Remboursement d'un autre produit du compte → ignoré.
              { id: "re_autre", amount: 9900, currency: "eur", status: "succeeded", charge: "ch_autre", created: 1_700_100_001 },
            ],
          });
        }
        return json({ data: [] });
      }),
    );
    await pollStripePayments(core, "sk_test_x", silentLogger());
    await pollStripePayments(core, "sk_test_x", silentLogger());
    const ajustements = listTransactions(core).filter((t) => t.type === "ajustement");
    expect(ajustements).toHaveLength(1);
    expect(ajustements[0]?.montant_cents).toBe(-SUBSCRIPTION_CENTS);
    expect(ajustements[0]?.ref).toBe("stripe-refund:re_1");
  });
});
