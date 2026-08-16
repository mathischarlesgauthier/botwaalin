import { readFileSync } from "node:fs";

export const CATEGORIES = [
  "digital",
  "crea_societe",
  "trafic_pro",
  "china_acces",
  "vinted_pro",
] as const;

export type Categorie = (typeof CATEGORIES)[number];

const SECTION_NUMBER: Record<Categorie, string> = {
  digital: "1",
  crea_societe: "2",
  trafic_pro: "3",
  china_acces: "4",
  vinted_pro: "5",
};

export function loadCatalogue(path: string): string {
  return readFileSync(path, "utf8");
}

/** Renvoie le bloc catalogue d'un pôle (section `## N.` jusqu'à la suivante). */
export function extractSection(catalogue: string, categorie: Categorie): string {
  const num = SECTION_NUMBER[categorie];
  const re = new RegExp(`^## ${num}\\. .*$`, "m");
  const match = re.exec(catalogue);
  if (!match) return "";
  const start = match.index;
  const next = catalogue.indexOf("\n## ", start + 1);
  return catalogue.slice(start, next === -1 ? undefined : next).trim();
}

// Un montant : chiffres, espaces (y c. insécables) ; . et , acceptés uniquement
// s'ils sont suivis d'un chiffre (séparateur de milliers/décimal), pour ne pas
// coller « Formule 1, 545 € » en 1545.
const AMOUNT = String.raw`\d(?:[\d   ]|[.,](?=\d)){0,12}`;
// Connecteurs de fourchettes : « entre 400 et 750 € », « 500 à 1 300 € », « 749-999 € ».
const CONNECT = String.raw`\s*(?:et|à|ou|[-–—/])\s*`;
// Marqueurs monétaires : €, euro(s), EUR (pas « européens » grâce au lookahead).
const CURRENCY = String.raw`(?:€|(?:euros?|eur)(?!\p{L}))`;

// Deux formes : « €2000 » (symbole avant) ou « [400 et ]750 [k]€/euros » (après),
// avec chaîne de nombres reliés par des connecteurs se terminant par le marqueur.
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
function amountsIn(text: string): string[] {
  const amounts: string[] = [];
  for (const span of text.matchAll(PRICE_SPAN_RE)) {
    for (const m of span[0].matchAll(SPAN_AMOUNT_RE)) {
      const normalized = normalizeAmount(m[1] ?? "", Boolean(m[2]));
      if (normalized) amounts.push(normalized);
    }
  }
  return amounts;
}

/** Ensemble des prix (normalisés) présents dans un texte. */
export function extractPrices(text: string): Set<string> {
  return new Set(amountsIn(text));
}

/** Prix cités dans `reply` qui n'existent pas dans le catalogue. */
export function findForeignPrices(reply: string, allowed: Set<string>): string[] {
  const foreign: string[] = [];
  for (const amount of amountsIn(reply)) {
    if (!allowed.has(amount) && !foreign.includes(amount)) {
      foreign.push(amount);
    }
  }
  return foreign;
}
