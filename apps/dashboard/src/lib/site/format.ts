import { formatPrice, type PricingRow } from "@arbi/core";

/**
 * Formatage côté site : prix courts, liens, slugs, couleurs.
 * `priceShort` et `priceLong` (qui délègue à `formatPrice` du core) sont les
 * SEULES façons d'écrire un prix sur le site — aucun montant en dur ailleurs.
 */

// ─── Couleurs ────────────────────────────────────────────────────────────────

/** Palette cyclique des pôles (ordre du design). */
export const PALETTE: readonly string[] = ["#FF6A2B", "#7C2AE8", "#22E1B9", "#2B5BFF", "#1C1C1E"];

/** Encre (texte) associée à chaque couleur de pôle — table INK du design. */
const INK: Record<string, string> = {
  "#FF6A2B": "#C24300",
  "#7C2AE8": "#6A1FCC",
  "#22E1B9": "#076A55",
  "#2B5BFF": "#1E45CC",
  "#1C1C1E": "#1C1C1E",
};

/** Couleur de texte lisible sur fond clair pour une couleur de pôle (INK, sinon assombrie). */
export function inkOf(color: string): string {
  const key = color.trim().toUpperCase();
  const known = INK[key];
  if (known) return known;
  const match = /^#([0-9A-F]{6})$/.exec(key);
  if (!match) return "#1C1C1E";
  const n = Number.parseInt(match[1] ?? "000000", 16);
  const channel = (shift: number) =>
    Math.round(((n >> shift) & 0xff) * 0.7)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(16)}${channel(8)}${channel(0)}`.toUpperCase();
}

// ─── Prix ────────────────────────────────────────────────────────────────────

/** Nombre au format fr-FR (même normalisation d'espace que le core). */
export function formatNumberFr(n: number): string {
  return n.toLocaleString("fr-FR").replace(/\u202F/g, " ");
}

export function euro(n: number): string {
  return `${formatNumberFr(n)} €`;
}

/**
 * Prix court d'une carte : FIXED `<min> €`, FROM `dès <min> €`, RANGE `<min> – <max> €`,
 * QUOTE ou montant absent `sur devis` (+ `/mois` pour les services mensuels).
 */
export function priceShort(row: PricingRow): string {
  const unit = row.unite === "mois" ? "/mois" : "";
  switch (row.type) {
    case "FIXED":
      return row.prixMin != null ? `${euro(row.prixMin)}${unit}` : "sur devis";
    case "FROM":
      return row.prixMin != null ? `dès ${euro(row.prixMin)}${unit}` : "sur devis";
    case "RANGE":
      if (row.prixMin != null && row.prixMax != null) {
        return `${formatNumberFr(row.prixMin)} – ${euro(row.prixMax)}${unit}`;
      }
      return row.prixMin != null ? `dès ${euro(row.prixMin)}${unit}` : "sur devis";
    case "QUOTE":
    default:
      return "sur devis";
  }
}

/** Formulation longue : l'affichage saisi dans le back-office, sinon la formule officielle du core. */
export function priceLong(row: PricingRow): string {
  return row.affichage?.trim() || formatPrice(row);
}

// ─── Liens ───────────────────────────────────────────────────────────────────

/** Lien WhatsApp `wa.me` avec message pré-rempli. */
export function waHref(number: string, text: string): string {
  const digits = number.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** `@pseudo` ou `pseudo` → `https://t.me/pseudo` ; une URL est rendue telle quelle ; vide → "". */
/** Numéro E.164 → affichage français : +33756975687 → "+33 7 56 97 56 87". */
export function formatPhoneFr(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (!digits) return e164.trim();
  const fr = /^33(\d)(\d{8})$/.exec(digits);
  if (fr) {
    const pairs = (fr[2] ?? "").match(/\d{2}/g) ?? [];
    return `+33 ${fr[1]} ${pairs.join(" ")}`;
  }
  // Autres pays : indicatif supposé sur 2 chiffres, reste groupé par paires depuis la fin.
  const rest = digits.slice(2);
  const head = rest.length % 2 === 1 ? rest.slice(0, 1) : "";
  const pairs = rest.slice(head.length).match(/\d{2}/g) ?? [];
  return `+${digits.slice(0, 2)}${head ? ` ${head}` : ""}${pairs.length ? ` ${pairs.join(" ")}` : ""}`;
}

// ─── Slugs ───────────────────────────────────────────────────────────────────

/** Slug d'URL : minuscules, sans accents, tirets. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Slug par défaut d'un pôle (id de menu_poles, `_` → `-`). */
export function poleSlug(poleId: string): string {
  return slugify(poleId);
}

/** Slug d'un service (serviceKey, `_` → `-`). */
export function serviceSlug(serviceKey: string): string {
  return slugify(serviceKey);
}
