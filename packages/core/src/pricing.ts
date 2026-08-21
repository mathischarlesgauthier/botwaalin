import type { PriceType } from "./pricing-data";

export interface PricingRow {
  id: number;
  serviceKey: string;
  label: string;
  categorie: string;
  type: string;
  prixMin: number | null;
  prixMax: number | null;
  unite: string;
  perimetre: string;
  affichage: string | null;
  actif: number;
  updatedAt: number;
}

const EURO = (n: number) => `${n.toLocaleString("fr-FR").replace(/ /g, " ")} €`;

/**
 * Formulation officielle d'un prix selon son type. C'est LA seule fonction
 * autorisée à mettre un prix en mots — aucun prix en dur ailleurs.
 */
export function formatPrice(row: PricingRow): string {
  if (row.affichage) return row.affichage;
  const unit = row.unite === "mois" ? "/mois" : "";
  switch (row.type as PriceType) {
    case "FIXED":
      return row.prixMin != null ? `${EURO(row.prixMin)}${unit}` : "sur devis";
    case "FROM":
      return row.prixMin != null
        ? `à partir de ${EURO(row.prixMin)}${unit} — le prix final dépend du projet`
        : "sur devis";
    case "RANGE":
      return row.prixMin != null && row.prixMax != null
        ? `entre ${EURO(row.prixMin)} et ${EURO(row.prixMax)}${unit} selon le projet`
        : "sur devis";
    case "QUOTE":
    default:
      return "sur devis — à qualifier avant tout chiffrage";
  }
}

/** Bloc texte d'une offre pour le prompt / l'outil get_offer. */
export function describeOffer(row: PricingRow): string {
  return `${row.label} — ${formatPrice(row)}\nInclus : ${row.perimetre}`;
}

// ─── Extraction de montants (garde-fou prix) ─────────────────────────────────

const AMOUNT = String.raw`\d(?:[\d   ]|[.,](?=\d)){0,12}`;
const CONNECT = String.raw`\s*(?:et|à|ou|[-–—/])\s*`;
const CURRENCY = String.raw`(?:€|(?:euros?|eur)(?!\p{L}))`;

const PRICE_SPAN_RE = new RegExp(
  String.raw`€\s*${AMOUNT}\s*k?|(?:${AMOUNT}k?${CONNECT})*${AMOUNT}\s*k?\s*${CURRENCY}`,
  "giu",
);
const SPAN_AMOUNT_RE = new RegExp(String.raw`(${AMOUNT})\s*(k)?`, "giu");

function normalizeAmount(raw: string, kilo: boolean): string {
  const compact = raw.replace(/[   ]/g, "");
  if (kilo) {
    const n = Number.parseFloat(compact.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? String(Math.round(n * 1000)) : "";
  }
  const digits = compact.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits === "" || digits === "0" ? "" : digits;
}

/** Tous les montants monétaires d'un texte, normalisés en chiffres. */
export function amountsIn(text: string): string[] {
  const amounts: string[] = [];
  for (const span of text.matchAll(PRICE_SPAN_RE)) {
    for (const m of span[0].matchAll(SPAN_AMOUNT_RE)) {
      const normalized = normalizeAmount(m[1] ?? "", Boolean(m[2]));
      if (normalized) amounts.push(normalized);
    }
  }
  return amounts;
}

export function extractPrices(text: string): Set<string> {
  return new Set(amountsIn(text));
}

/**
 * Ensemble des montants autorisés : prix actifs de la table pricing
 * (min, max, affichage) + montants présents dans le texte du catalogue.
 */
export function allowedAmounts(rows: PricingRow[], catalogueText: string): Set<string> {
  const allowed = extractPrices(catalogueText);
  for (const row of rows) {
    if (!row.actif) continue;
    if (row.prixMin != null) allowed.add(String(row.prixMin));
    if (row.prixMax != null) allowed.add(String(row.prixMax));
    if (row.affichage) for (const a of amountsIn(row.affichage)) allowed.add(a);
  }
  return allowed;
}

/** Montants cités dans `reply` absents de l'ensemble autorisé. */
export function findForeignPrices(reply: string, allowed: Set<string>): string[] {
  const foreign: string[] = [];
  for (const amount of amountsIn(reply)) {
    if (!allowed.has(amount) && !foreign.includes(amount)) foreign.push(amount);
  }
  return foreign;
}
