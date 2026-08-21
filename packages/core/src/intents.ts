export const INTENTS = [
  "information",
  "tarif",
  "comparaison",
  "recommandation",
  "achat",
  "disponibilite",
  "demande_personnalisee",
  "reclamation",
  "devis",
  "formation",
  "sourcing",
  "demande_humain",
] as const;

export type Intent = (typeof INTENTS)[number];

/** Minuscules, sans accents, sans ponctuation, espaces normalisés. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s@€+]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i, ...new Array<number>(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] as number) + 1,
        (prev[j] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
    }
    prev = curr;
  }
  return prev[n] as number;
}

function tolerance(len: number): number {
  if (len <= 4) return 1;
  if (len <= 8) return 2;
  return 3;
}

/**
 * Le pattern (déjà normalisé) apparaît-il dans le texte normalisé, en tolérant
 * fautes de frappe et variations légères ? Fenêtre glissante sur les mots +
 * distance de Levenshtein.
 */
export function fuzzyIncludes(normalizedText: string, normalizedPattern: string): boolean {
  if (normalizedText.includes(normalizedPattern)) return true;
  const words = normalizedText.split(" ");
  const patternWords = normalizedPattern.split(" ");
  const windowSize = patternWords.length;
  const maxDist = tolerance(normalizedPattern.length);
  for (let i = 0; i + windowSize <= words.length; i++) {
    const window = words.slice(i, i + windowSize).join(" ");
    if (Math.abs(window.length - normalizedPattern.length) > maxDist) continue;
    if (levenshtein(window, normalizedPattern) <= maxDist) return true;
  }
  return false;
}

export interface SynonymRow {
  pattern: string;
  resolution: string;
  actif: number;
}

/**
 * Résout le service visé par un message via la table de synonymes.
 * Le pattern le plus long qui matche gagne (« bot whatsapp » avant « bot »).
 */
export function resolveService(text: string, syns: SynonymRow[]): string | null {
  const normalized = normalizeText(text);
  let best: { pattern: string; resolution: string } | null = null;
  for (const syn of syns) {
    if (!syn.actif) continue;
    const pattern = normalizeText(syn.pattern);
    if (!pattern) continue;
    if (fuzzyIncludes(normalized, pattern)) {
      if (!best || pattern.length > best.pattern.length) {
        best = { pattern, resolution: syn.resolution };
      }
    }
  }
  return best?.resolution ?? null;
}

const INTENT_KEYWORDS: Array<{ intent: Intent; keywords: string[] }> = [
  {
    intent: "demande_humain",
    keywords: [
      "parler a un humain", "parler a quelqu un", "un humain", "une vraie personne",
      "un conseiller", "parler a jacob", "joindre jacob", "contact humain",
    ],
  },
  {
    intent: "reclamation",
    keywords: [
      "probleme", "remboursement", "rembourse", "arnaque", "pas recu", "jamais recu",
      "insatisfait", "deçu", "decu", "reclamation", "litige", "ca ne marche pas",
    ],
  },
  {
    intent: "achat",
    keywords: [
      "je prends", "je veux acheter", "j achete", "comment payer", "je paye",
      "ou je paie", "passer commande", "je commande", "c est ok pour moi", "banco",
    ],
  },
  { intent: "devis", keywords: ["devis", "estimation", "chiffrage", "chiffrer", "proposition commerciale"] },
  {
    intent: "tarif",
    keywords: [
      "prix", "combien", "tarif", "coute", "coûte", "cout", "ca revient a", "budget necessaire", "€",
    ],
  },
  {
    intent: "comparaison",
    keywords: ["difference", "versus", " vs ", "mieux que", "ou bien", "compare", "lequel choisir"],
  },
  {
    intent: "recommandation",
    keywords: [
      "tu conseilles", "tu recommandes", "tu proposes quoi", "que me conseilles",
      "qu est ce qui est mieux", "je sais pas quoi choisir", "orienter",
    ],
  },
  {
    intent: "disponibilite",
    keywords: ["dispo", "disponible", "delai", "quand", "combien de temps", "sous quel delai", "livraison"],
  },
  {
    intent: "sourcing",
    keywords: ["fournisseur", "sourcing", "usine", "produit en chine", "importer", "grossiste", "casquette", "echantillon"],
  },
  { intent: "formation", keywords: ["formation", "apprendre", "coaching", "cours", "module"] },
  {
    intent: "demande_personnalisee",
    keywords: ["sur mesure", "tres specifique", "particulier", "custom", "personnalise", "mon cas precis"],
  },
];

/** Classification lexicale rapide. Renvoie `information` si rien ne matche. */
export function classifyIntent(text: string): { intent: Intent; matched: boolean } {
  const normalized = ` ${normalizeText(text)} `;
  for (const { intent, keywords } of INTENT_KEYWORDS) {
    for (const kw of keywords) {
      const nkw = normalizeText(kw);
      if (normalized.includes(` ${nkw} `) || normalized.includes(nkw)) {
        return { intent, matched: true };
      }
    }
  }
  return { intent: "information", matched: false };
}

const SERVICE_CATEGORY: Array<{ prefix: string; categorie: string }> = [
  { prefix: "societe_", categorie: "Société" },
  { prefix: "china_", categorie: "China" },
  { prefix: "trafic_pro", categorie: "Formation" },
  { prefix: "vinted_pro", categorie: "Formation" },
];

export function categoryForService(serviceKey: string | null): string {
  if (!serviceKey) return "Autre";
  for (const { prefix, categorie } of SERVICE_CATEGORY) {
    if (serviceKey.startsWith(prefix)) return categorie;
  }
  return "Digital";
}
