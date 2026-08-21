import type { Core } from "./db";
import type { Logger } from "./logger";
import { logDecision } from "./logger";

/**
 * Facturation du service : abonnement 50 €/mois + consommation API.
 * Solde = crédits (bienvenue + paiements Stripe) − abonnements mensuels − coûts API facturés.
 * Le premier mois est inclus : crédit de bienvenue de 50 € posé à l'initialisation.
 */

export const SUBSCRIPTION_CENTS = 5000; // 50 €/mois
export const GRACE_DAYS = 10; // délai de paiement après le débit mensuel
const DAY_MS = 24 * 60 * 60 * 1000;

export interface BillingTransactionRow {
  id: number;
  type: string; // credit_initial | abonnement | paiement | ajustement
  montant_cents: number;
  description: string;
  ref: string | null;
  periode: string | null;
  created_at: number;
}

export interface UsageInput {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCentimes: number;
  billedCentimes: number;
}

export interface BillingStatus {
  balanceCents: number;
  active: boolean;
  /** ok | abonnement_impaye | credit_api_epuise | non_initialise */
  reason: string;
  /** Date de coupure (passée = déjà coupé, future = fin de la période de grâce). */
  cutAt: number | null;
}

function periodOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * k-ième échéance mensuelle à date anniversaire de billing_start (jour clampé
 * comme Stripe : 31 janv → 28/29 févr), pour rester aligné sur le
 * renouvellement de l'abonnement Stripe qui tombe à la date anniversaire.
 */
function echeance(startTs: number, k: number): number {
  const s = new Date(startTs);
  const y = s.getUTCFullYear();
  const m = s.getUTCMonth() + k;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(
    y,
    m,
    Math.min(s.getUTCDate(), lastDay),
    s.getUTCHours(),
    s.getUTCMinutes(),
    s.getUTCSeconds(),
    s.getUTCMilliseconds(),
  );
}

/** Crédit de bienvenue unique (premier mois inclus dans le prix). */
export function initBilling(core: Core, now: number = Date.now()): void {
  core.sqlite
    .prepare(
      `INSERT OR IGNORE INTO billing_transactions (type, montant_cents, description, ref, created_at)
       VALUES ('credit_initial', ?, 'Crédit de bienvenue — premier mois inclus', 'credit-initial', ?)`,
    )
    .run(SUBSCRIPTION_CENTS, now);
  if (core.settings.getRaw("billing_start") === null) {
    core.settings.set("billing_start", now);
  }
}

/**
 * Pose (idempotent) le débit d'abonnement de chaque échéance anniversaire
 * atteinte. Les débits sont horodatés à leur date de POSE effective (pas
 * antidatés) : la grâce de 10 jours court toujours à partir d'un moment où la
 * dette est réellement visible dans le grand livre, même après une longue
 * indisponibilité du serveur. Un billing_start dans le futur ne pose rien.
 */
export function ensureMonthlyDebits(core: Core, now: number = Date.now()): number {
  const start = Number(core.settings.getRaw("billing_start") ?? now);
  let inserted = 0;
  // Garde-fou : jamais plus de 10 ans de rattrapage.
  for (let k = 0; k < 120; k++) {
    const due = echeance(start, k);
    if (due > now) break;
    const periode = periodOf(due);
    const result = core.sqlite
      .prepare(
        `INSERT OR IGNORE INTO billing_transactions (type, montant_cents, description, periode, created_at)
         VALUES ('abonnement', ?, ?, ?, ?)`,
      )
      .run(-SUBSCRIPTION_CENTS, `Abonnement mensuel — ${periode}`, periode, now) as {
      changes: number;
    };
    inserted += result.changes;
  }
  return inserted;
}

/** Enregistre la consommation d'un appel LLM (le montant facturé est le seul affiché). */
export function recordUsage(core: Core, usage: UsageInput, now: number = Date.now()): void {
  core.sqlite
    .prepare(
      `INSERT INTO llm_usage (model, input_tokens, output_tokens, cost_centimes, billed_centimes, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(usage.model, usage.inputTokens, usage.outputTokens, usage.costCentimes, usage.billedCentimes, now);
}

export function balanceCents(core: Core): number {
  const tx = core.sqlite
    .prepare(`SELECT COALESCE(SUM(montant_cents), 0) AS s FROM billing_transactions`)
    .get() as { s: number };
  const usage = core.sqlite
    .prepare(`SELECT COALESCE(SUM(billed_centimes), 0) AS s FROM llm_usage`)
    .get() as { s: number };
  return tx.s - usage.s;
}

/**
 * Statut du service, par décomposition du solde selon la cause :
 * - les crédits (bienvenue, paiements, ajustements) couvrent d'abord les
 *   abonnements ; un abonnement non couvert → grâce de 10 jours à partir de la
 *   pose du plus ancien débit non couvert, puis coupure. Un paiement mensuel
 *   régulier ne peut donc jamais laisser le service coupé.
 * - la consommation API non couverte par l'excédent de crédits est tolérée
 *   jusqu'à 50 € (elle est ajoutée à la facture Stripe suivante) ; au-delà,
 *   coupure immédiate (le crédit est épuisé par le LLM).
 */
export function billingStatus(core: Core, now: number = Date.now()): BillingStatus {
  const txs = core.sqlite
    .prepare(
      `SELECT type, montant_cents AS amount, created_at FROM billing_transactions ORDER BY created_at, id`,
    )
    .all() as Array<{ type: string; amount: number; created_at: number }>;
  const api = core.sqlite
    .prepare(`SELECT COALESCE(SUM(billed_centimes), 0) AS s FROM llm_usage`)
    .get() as { s: number };

  if (txs.length === 0 && api.s === 0) {
    return { balanceCents: 0, active: true, reason: "non_initialise", cutAt: null };
  }

  const credits = txs.filter((t) => t.type !== "abonnement").reduce((s, t) => s + t.amount, 0);
  const debits = txs.filter((t) => t.type === "abonnement");
  const subTotal = debits.reduce((s, t) => s - t.amount, 0);
  const balance = Math.round(credits - subTotal - api.s);

  // Conso API au-delà de l'excédent de crédits ET du tampon de 50 €.
  const apiDebt = api.s - Math.max(0, credits - subTotal);
  if (apiDebt > SUBSCRIPTION_CENTS) {
    return { balanceCents: balance, active: false, reason: "credit_api_epuise", cutAt: null };
  }

  // Abonnements non couverts : grâce depuis la pose du plus ancien débit impayé.
  if (subTotal > credits) {
    let covered = credits;
    let cutAt = now + GRACE_DAYS * DAY_MS;
    for (const debit of debits) {
      covered += debit.amount;
      if (covered < 0) {
        cutAt = debit.created_at + GRACE_DAYS * DAY_MS;
        break;
      }
    }
    return { balanceCents: balance, active: now < cutAt, reason: "abonnement_impaye", cutAt };
  }

  return { balanceCents: balance, active: true, reason: "ok", cutAt: null };
}

// ─── Statistiques pour la page Abonnement ────────────────────────────────────

export function apiUsageSince(core: Core, sinceTs: number) {
  return core.sqlite
    .prepare(
      `SELECT COUNT(*) AS calls,
              COALESCE(SUM(input_tokens), 0) AS inputTokens,
              COALESCE(SUM(output_tokens), 0) AS outputTokens,
              COALESCE(SUM(billed_centimes), 0) AS billedCentimes
       FROM llm_usage WHERE created_at >= ?`,
    )
    .get(sinceTs) as { calls: number; inputTokens: number; outputTokens: number; billedCentimes: number };
}

export function apiUsageByDay(core: Core, days = 30) {
  const since = Date.now() - days * DAY_MS;
  return core.sqlite
    .prepare(
      `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS jour,
              COUNT(*) AS calls,
              COALESCE(SUM(billed_centimes), 0) AS billedCentimes
       FROM llm_usage WHERE created_at >= ?
       GROUP BY jour ORDER BY jour DESC`,
    )
    .all(since) as Array<{ jour: string; calls: number; billedCentimes: number }>;
}

export function listTransactions(core: Core, limit = 50): BillingTransactionRow[] {
  return core.sqlite
    .prepare(`SELECT * FROM billing_transactions ORDER BY created_at DESC, id DESC LIMIT ?`)
    .all(limit) as BillingTransactionRow[];
}

// ─── Stripe (API REST, sans dépendance) ──────────────────────────────────────

const STRIPE_API = "https://api.stripe.com/v1";
const PRICE_LOOKUP_KEY = "arbi-jacob-abo-50";

async function stripeRequest(
  key: string,
  path: string,
  method: "GET" | "POST" = "GET",
  form?: Record<string, string>,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(form ? { body: new URLSearchParams(form).toString() } : {}),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = (body as { error?: { message?: string } }).error;
    throw new Error(`Stripe ${path} → ${response.status}: ${error?.message ?? "erreur inconnue"}`);
  }
  return body;
}

/**
 * Crée (une seule fois) le produit + prix récurrent 50 €/mois + lien de
 * paiement Stripe, et les mémorise en base. L'idempotence est ancrée sur
 * l'état RÉEL du compte Stripe (lookup_key du prix) : si la base locale est
 * perdue, le prix existant est retrouvé et les renouvellements de l'abonnement
 * déjà en cours restent crédités.
 */
export async function ensureStripePaymentLink(
  core: Core,
  key: string,
  log: Logger,
): Promise<string> {
  const existing = core.settings.get("stripe_payment_link_url");
  if (existing) return existing;

  let priceId: string = core.settings.get("stripe_price_id");
  if (!priceId) {
    const found = await stripeRequest(
      key,
      `/prices?lookup_keys[]=${PRICE_LOOKUP_KEY}&active=true&limit=1`,
    );
    const prices = (found.data ?? []) as Array<{ id: string }>;
    if (prices[0]?.id) {
      priceId = prices[0].id;
      logDecision(log, "stripe_price_recovered", { priceId });
    }
  }
  if (!priceId) {
    const product = await stripeRequest(
      key,
      "/products",
      "POST",
      {
        name: "Abonnement Bot WhatsApp — ARBI JACOB",
        description:
          "Maintenance et hébergement de l'agent commercial WhatsApp (50 €/mois, consommation API en sus)",
      },
      "arbi-jacob-product-v1",
    );
    const price = await stripeRequest(
      key,
      "/prices",
      "POST",
      {
        unit_amount: String(SUBSCRIPTION_CENTS),
        currency: "eur",
        "recurring[interval]": "month",
        product: String(product.id),
        lookup_key: PRICE_LOOKUP_KEY,
        transfer_lookup_key: "true",
      },
      "arbi-jacob-price-v1",
    );
    priceId = String(price.id);
  }
  const link = await stripeRequest(
    key,
    "/payment_links",
    "POST",
    {
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
    },
    "arbi-jacob-link-v1",
  );

  core.settings.set("stripe_price_id", priceId);
  core.settings.set("stripe_payment_link_url", String(link.url));
  logDecision(log, "stripe_payment_link_created", { url: String(link.url) });
  return String(link.url);
}

interface StripeInvoice {
  id: string;
  amount_paid: number;
  currency: string;
  created: number;
  customer?: string | null;
  subscription?: string | null;
  charge?: string | null;
  lines?: {
    data?: Array<{ price?: { id?: string }; pricing?: { price_details?: { price?: string } } }>;
  };
}

/**
 * Sonde les factures Stripe payées (paginé, tout l'historique du compte) et
 * crédite le compte du montant payé — idempotent par facture. Couvre le
 * paiement initial, les renouvellements ET les lignes de consommation API
 * ajoutées aux factures de l'abonnement. Répercute aussi les remboursements et
 * litiges perdus portant sur NOS paiements (scopés par charge).
 */
export async function pollStripePayments(core: Core, key: string, log: Logger): Promise<number> {
  const priceId = core.settings.get("stripe_price_id");
  let subscriptionId: string = core.settings.get("stripe_subscription_id");
  if (!priceId && !subscriptionId) {
    logDecision(log, "stripe_poll_skipped_no_price_id", {});
    return 0;
  }
  let credited = 0;
  const ourCharges = new Map<string, string>();
  let startingAfter = "";
  for (let page = 0; page < 20; page++) {
    const body = await stripeRequest(
      key,
      `/invoices?status=paid&limit=100${startingAfter ? `&starting_after=${startingAfter}` : ""}`,
    );
    const invoices = (body.data ?? []) as StripeInvoice[];
    for (const invoice of invoices) {
      const lines = invoice.lines?.data ?? [];
      const matchesPrice =
        Boolean(priceId) &&
        lines.some((l) => l.price?.id === priceId || l.pricing?.price_details?.price === priceId);
      const matchesSubscription =
        Boolean(subscriptionId) && invoice.subscription === subscriptionId;
      if (
        (!matchesPrice && !matchesSubscription) ||
        invoice.currency !== "eur" ||
        invoice.amount_paid <= 0
      ) {
        continue;
      }
      if (invoice.charge) ourCharges.set(invoice.charge, invoice.id);
      // Mémorise le client/abonnement Stripe (facturation de la conso API).
      if (invoice.customer && !core.settings.get("stripe_customer_id")) {
        core.settings.set("stripe_customer_id", String(invoice.customer));
      }
      if (invoice.subscription && !subscriptionId) {
        subscriptionId = String(invoice.subscription);
        core.settings.set("stripe_subscription_id", subscriptionId);
      }
      const result = core.sqlite
        .prepare(
          `INSERT OR IGNORE INTO billing_transactions (type, montant_cents, description, ref, created_at)
           VALUES ('paiement', ?, 'Paiement abonnement (Stripe)', ?, ?)`,
        )
        .run(invoice.amount_paid, `stripe:${invoice.id}`, invoice.created * 1000) as {
        changes: number;
      };
      if (result.changes > 0) {
        credited += 1;
        logDecision(log, "stripe_payment_credited", {
          invoice: invoice.id,
          cents: invoice.amount_paid,
        });
      }
    }
    if (body.has_more !== true || invoices.length === 0) break;
    startingAfter = invoices[invoices.length - 1]?.id ?? "";
    if (!startingAfter) break;
  }

  if (ourCharges.size > 0) {
    try {
      await reconcileRefunds(core, key, log, ourCharges);
    } catch (err) {
      log.error({ err: String(err) }, "stripe_refund_poll_failed");
    }
  }
  return credited;
}

/** Remboursements et litiges perdus sur nos paiements → ajustements négatifs idempotents. */
async function reconcileRefunds(
  core: Core,
  key: string,
  log: Logger,
  ourCharges: Map<string, string>,
): Promise<void> {
  const insert = core.sqlite.prepare(
    `INSERT OR IGNORE INTO billing_transactions (type, montant_cents, description, ref, created_at)
     VALUES ('ajustement', ?, ?, ?, ?)`,
  );
  const refunds = await stripeRequest(key, "/refunds?limit=100");
  for (const refund of (refunds.data ?? []) as Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    charge?: string | null;
    created: number;
  }>) {
    if (refund.status !== "succeeded" || refund.currency !== "eur") continue;
    if (!refund.charge || !ourCharges.has(refund.charge)) continue;
    const result = insert.run(
      -refund.amount,
      "Remboursement (Stripe)",
      `stripe-refund:${refund.id}`,
      refund.created * 1000,
    ) as { changes: number };
    if (result.changes > 0) {
      logDecision(log, "stripe_refund_recorded", { refund: refund.id, cents: refund.amount });
    }
  }
  const disputes = await stripeRequest(key, "/disputes?limit=100");
  for (const dispute of (disputes.data ?? []) as Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    charge?: string | null;
    created: number;
  }>) {
    if (dispute.status !== "lost" || dispute.currency !== "eur") continue;
    if (!dispute.charge || !ourCharges.has(dispute.charge)) continue;
    const result = insert.run(
      -dispute.amount,
      "Litige perdu (Stripe)",
      `stripe-dispute:${dispute.id}`,
      dispute.created * 1000,
    ) as { changes: number };
    if (result.changes > 0) {
      logDecision(log, "stripe_dispute_recorded", { dispute: dispute.id, cents: dispute.amount });
    }
  }
}

/**
 * Pousse la consommation API non encore facturée comme ligne de la prochaine
 * facture de l'abonnement Stripe (au plus une fois par cycle de ~25 jours,
 * minimum 0,50 €). Le client paie ainsi « 50 € + conso API » à chaque
 * renouvellement, et le paiement crédité couvre les deux.
 */
export async function pushApiInvoiceItems(
  core: Core,
  key: string,
  log: Logger,
  now: number = Date.now(),
): Promise<number> {
  const customer = core.settings.get("stripe_customer_id");
  const subscription = core.settings.get("stripe_subscription_id");
  if (!customer || !subscription) return 0;
  const start = Number(core.settings.getRaw("billing_start") ?? now);
  const cursor = Number(core.settings.getRaw("stripe_api_invoiced_until") ?? start);
  if (now - cursor < 25 * DAY_MS) return 0;
  const row = core.sqlite
    .prepare(
      `SELECT COALESCE(SUM(billed_centimes), 0) AS s FROM llm_usage WHERE created_at > ? AND created_at <= ?`,
    )
    .get(cursor, now) as { s: number };
  const cents = Math.round(row.s);
  if (cents < 50) return 0;
  await stripeRequest(
    key,
    "/invoiceitems",
    "POST",
    {
      customer,
      subscription,
      currency: "eur",
      amount: String(cents),
      description: `Consommation API — jusqu'au ${new Date(now).toISOString().slice(0, 10)}`,
    },
    `arbi-api-item-${cursor}`,
  );
  core.settings.set("stripe_api_invoiced_until", now);
  logDecision(log, "stripe_api_invoice_item_pushed", { cents });
  return cents;
}
