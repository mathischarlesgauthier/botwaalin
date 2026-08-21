import { normalizeText } from "./intents";

export type ToneRegister = "pro" | "relache" | "neutre";

/** Expressions familières autorisées (avec parcimonie). */
export const STYLE_MARKERS = [
  "salut mon reuf",
  "pas de souci khouya",
  "frangin",
  "carrément",
  "impeccable",
  "t'inquiète",
  "khouya",
  "reuf",
] as const;

/** Toutes les 4 à 5 réponses maximum — on prend 4 comme espacement minimal. */
export const MARKER_MIN_GAP = 4;

export interface MarkerUse {
  marker: string;
  atIndex: number;
}

const PRO_SIGNALS = [
  "vous ", "vouvoi", "pourriez", "veuillez", "cordialement", "bonjour monsieur",
  "bonjour madame", "societe", "facture", "tva", "cahier des charges", "prestation",
];
const RELAXED_SIGNALS = [
  "slt", "bjr", "jpense", "jsais", "chui", "askip", "tkt", "stp", "svp bro",
  "frero", "fréro", "bro", "mdr", "ptdr", "lol", "nickel", "grave", "ca va ou quoi",
];

/**
 * Réévalue le registre à chaque message client. Le registre ne bascule que sur
 * un signal réel — sinon il reste ce qu'il était (jamais de sur-jeu).
 */
export function detectTone(clientText: string, current: ToneRegister): ToneRegister {
  const normalized = ` ${normalizeText(clientText)} `;
  const raw = clientText.trim();

  let proScore = 0;
  let relaxedScore = 0;
  for (const signal of PRO_SIGNALS) if (normalized.includes(normalizeText(signal))) proScore++;
  for (const signal of RELAXED_SIGNALS) if (normalized.includes(` ${normalizeText(signal)} `)) relaxedScore++;

  // Ponctuation/majuscules soignées → plutôt pro ; tout en minuscules, court,
  // abréviations → plutôt relâché.
  if (/^[A-ZÀ-Ü]/.test(raw) && /[.?!]$/.test(raw) && raw.length > 40) proScore++;
  if (raw.length < 25 && raw === raw.toLowerCase() && !/[.,;]/.test(raw)) relaxedScore++;

  if (proScore > relaxedScore && proScore > 0) return "pro";
  if (relaxedScore > proScore && relaxedScore > 0) return "relache";
  return current;
}

/** Marqueurs de style présents dans une réponse du bot. */
export function detectMarkers(reply: string): string[] {
  const normalized = ` ${normalizeText(reply)} `;
  const found: string[] = [];
  for (const marker of STYLE_MARKERS) {
    const nm = normalizeText(marker);
    if (normalized.includes(nm) && !found.some((f) => normalizeText(f).includes(nm))) {
      found.push(marker);
    }
  }
  // « salut mon reuf » contient « reuf » : ne garder que le plus long.
  return found.filter(
    (m) => !found.some((other) => other !== m && normalizeText(other).includes(normalizeText(m))),
  );
}

export interface StyleCheck {
  ok: boolean;
  violations: string[];
}

/**
 * Règle anti-répétition : jamais deux fois le même marqueur dans une même
 * conversation, et au plus un marqueur toutes les MARKER_MIN_GAP réponses.
 */
export function checkStyleRules(
  reply: string,
  used: MarkerUse[],
  replyIndex: number,
): StyleCheck {
  const markers = detectMarkers(reply);
  const violations: string[] = [];

  if (markers.length > 1) {
    violations.push(`plusieurs expressions familières dans une seule réponse : ${markers.join(", ")}`);
  }
  for (const marker of markers) {
    if (used.some((u) => normalizeText(u.marker) === normalizeText(marker))) {
      violations.push(`« ${marker} » a déjà été utilisée dans cette conversation`);
    }
  }
  if (markers.length > 0) {
    const lastUse = used.length > 0 ? Math.max(...used.map((u) => u.atIndex)) : -Infinity;
    if (replyIndex - lastUse < MARKER_MIN_GAP) {
      violations.push(
        `expression familière trop rapprochée (dernière il y a ${replyIndex - lastUse} réponse(s), minimum ${MARKER_MIN_GAP})`,
      );
    }
  }
  return { ok: violations.length === 0, violations };
}

/** Ajoute les marqueurs d'une réponse envoyée à l'historique d'usage. */
export function registerMarkers(used: MarkerUse[], reply: string, replyIndex: number): MarkerUse[] {
  const markers = detectMarkers(reply);
  return [...used, ...markers.map((marker) => ({ marker, atIndex: replyIndex }))];
}

/** Consigne dynamique de registre injectée dans le prompt. */
export function toneInstruction(tone: ToneRegister): string {
  switch (tone) {
    case "pro":
      return "Le client s'exprime de façon soignée et professionnelle : registre propre, précis, zéro expression familière. Toujours le tutoiement, mais net et carré.";
    case "relache":
      return "Le client est détendu (abréviations, messages courts) : registre relâché et naturel, phrases courtes. Une expression familière est possible si les règles d'espacement le permettent.";
    default:
      return "Registre neutre et naturel : chaleureux, direct, sans forcer la familiarité.";
  }
}
