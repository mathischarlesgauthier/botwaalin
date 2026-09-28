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

// ─── Montants écrits en toutes lettres (français) ────────────────────────────
// Un montant en toutes lettres (« cinq cents euros », « mille euros ») échappe
// entièrement à AMOUNT ci-dessus (ancré sur un chiffre) : sans cette détection,
// un document uploadé ou un exemple appris contenant un prix en toutes lettres
// passerait `allowedAmounts`/`deterministicRejectReason` sans être vu, et
// `guardReply` (qui repose sur le même `amountsIn`) laisserait ensuite partir
// un prix hors grille si le modèle reprend la formulation. Couverture : les
// nombres cardinaux français usuels (jusqu'au million), accolés à « euro(s) »
// ou « € ». Pas de gestion des fractions/décimales en toutes lettres — rare
// dans ce contexte, et un faux négatif résiduel reste rattrapé par le filet
// PAYMENT_OUTBOUND_RE / la revue humaine du back-office.
const WORD_UNITS: Record<string, number> = {
  zéro: 0,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
};
const WORD_TENS: Record<string, number> = {
  vingt: 20,
  trente: 30,
  quarante: 40,
  cinquante: 50,
  soixante: 60,
  septante: 70,
  huitante: 80,
  octante: 80,
  nonante: 90,
  // Normalisé depuis « quatre-vingt(s) »/« quatre vingt(s) » avant tokenisation
  // (irrégularité du français : 4×20, pas 4+20 — cf. parseFrenchNumberWords).
  quatrevingt: 80,
};
const WORD_SCALES: Record<string, number> = {
  mille: 1_000,
  million: 1_000_000,
  millions: 1_000_000,
  milliard: 1_000_000_000,
  milliards: 1_000_000_000,
};

/** Un mot-nombre français isolé (utilisé pour composer le span à repérer). */
const NUMBER_WORD_RE = String.raw`(?:zéro|quatre[ -]?vingts?|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|septante|huitante|octante|nonante|cents?|mille|millions?|milliards?|et)`;

/** Une suite de mots-nombres français directement suivie de « euro(s) »/« € »/« eur ». */
const WORDS_AMOUNT_SPAN_RE = new RegExp(
  String.raw`\b(?:${NUMBER_WORD_RE}[ \t-]+){0,9}${NUMBER_WORD_RE}\b\s*${CURRENCY}`,
  "giu",
);

/** Retire le suffixe monétaire final pour ne garder que les mots-nombres. */
function stripTrailingCurrency(span: string): string {
  return span.replace(/\s*(?:€|euros?|eur)\s*$/iu, "");
}

/**
 * Convertit une suite de mots-nombres français (« cinq cents », « quatre-vingt-
 * dix mille »…) en valeur numérique. Renvoie `null` si aucun mot-nombre reconnu.
 */
function parseFrenchNumberWords(span: string): number | null {
  const normalized = stripTrailingCurrency(span)
    .toLowerCase()
    .replace(/quatre[ -]?vingts?/g, " quatrevingt ");
  const tokens = normalized.split(/[\s-]+/).filter(Boolean);
  let total = 0;
  let current = 0;
  let sawNumber = false;
  for (const token of tokens) {
    if (token === "et") continue;
    if (token === "cent" || token === "cents") {
      current = (current || 1) * 100;
      sawNumber = true;
    } else if (token in WORD_SCALES) {
      total += (current || 1) * (WORD_SCALES[token] ?? 0);
      current = 0;
      sawNumber = true;
    } else if (token in WORD_TENS) {
      current += WORD_TENS[token] ?? 0;
      sawNumber = true;
    } else if (token in WORD_UNITS) {
      current += WORD_UNITS[token] ?? 0;
      sawNumber = true;
    }
  }
  total += current;
  return sawNumber && total > 0 ? total : null;
}

/** Montants écrits en toutes lettres (« mille euros » → "1000"). */
function amountsInWords(text: string): string[] {
  const amounts: string[] = [];
  for (const m of text.matchAll(WORDS_AMOUNT_SPAN_RE)) {
    const numeric = parseFrenchNumberWords(m[0]);
    if (numeric != null) amounts.push(String(numeric));
  }
  return amounts;
}

/** Tous les montants monétaires d'un texte, normalisés en chiffres — chiffrés ET en toutes lettres. */
export function amountsIn(text: string): string[] {
  const amounts: string[] = [];
  for (const span of text.matchAll(PRICE_SPAN_RE)) {
    for (const m of span[0].matchAll(SPAN_AMOUNT_RE)) {
      const normalized = normalizeAmount(m[1] ?? "", Boolean(m[2]));
      if (normalized) amounts.push(normalized);
    }
  }
  amounts.push(...amountsInWords(text));
  return amounts;
}

export function extractPrices(text: string): Set<string> {
  return new Set(amountsIn(text));
}

/**
 * Neutralise les montants d'un texte sans le jeter. Sert aux exemples appris :
 * la réponse de Jacob vaut pour son TON, pas pour ses chiffres — les rejeter
 * revenait à ne jamais rien apprendre d'un vendeur, dont les réponses citent
 * presque toujours un prix. Le montant devient un repère neutre, le reste est
 * conservé tel quel.
 */
export function maskAmounts(text: string): string {
  return text.replace(PRICE_SPAN_RE, "[prix]").replace(WORDS_AMOUNT_SPAN_RE, "[prix]");
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

/**
 * Filet déterministe anti-encaissement : aucune coordonnée ou lien de paiement
 * ne doit JAMAIS partir vers un client, même si le modèle en hallucine un.
 * Ancré sur domaines/formats pour éviter les faux positifs (le mot « Stripe »
 * seul est légitime dans le périmètre des offres).
 *
 * Vit dans le core (à côté d'`amountsIn`, sa cousine fonctionnelle) car
 * `packages/core/src/learning.ts` (rejet déterministe des exemples appris) en
 * a besoin, et le core ne peut pas dépendre d'apps/bot.
 */
export const PAYMENT_OUTBOUND_RE = new RegExp(
  [
    String.raw`paypal\.(me|com)`,
    String.raw`(checkout|buy|pay|donate)\.stripe\.com`,
    String.raw`lydia-app\.com`,
    String.raw`revolut\.me`,
    String.raw`sumup\.`,
    String.raw`paylib`,
    String.raw`\bIBAN\b`,
    String.raw`\bRIB\b`,
    String.raw`\bFR\d{2}(?:\s?\d{4}){5}(?:\s?\d{1,3})?\b`, // IBAN FR
    String.raw`\b(?:bc1|[13])[a-km-zA-HJ-NP-Z1-9]{25,39}\b`, // BTC
    String.raw`\b0x[a-fA-F0-9]{40}\b`, // ETH/EVM
  ].join("|"),
  "i",
);
