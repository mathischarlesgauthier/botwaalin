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

const PRICE_RE = /(\d[\d\s  .,]{0,12}?)\s*€/gu;

function normalizePrice(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Ensemble des prix (normalisés en chiffres) présents dans un texte. */
export function extractPrices(text: string): Set<string> {
  const prices = new Set<string>();
  for (const match of text.matchAll(PRICE_RE)) {
    const normalized = normalizePrice(match[1] ?? "");
    if (normalized) prices.add(normalized);
  }
  return prices;
}

/** Prix cités dans `reply` qui n'existent pas dans le catalogue. */
export function findForeignPrices(reply: string, allowed: Set<string>): string[] {
  const foreign: string[] = [];
  for (const match of reply.matchAll(PRICE_RE)) {
    const normalized = normalizePrice(match[1] ?? "");
    if (normalized && !allowed.has(normalized) && !foreign.includes(normalized)) {
      foreign.push(normalized);
    }
  }
  return foreign;
}
