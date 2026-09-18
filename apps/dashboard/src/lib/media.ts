import { join } from "node:path";

/**
 * Dossier d'archivage des médias, partagé avec le bot via le volume
 * persistant (`MEDIA_DIR`). Même convention que `docsDir()`. Un seul endroit
 * pour cette résolution : la route de lecture `/api/media/[file]` et l'envoi
 * depuis le back-office doivent viser exactement le même dossier, sinon un
 * média envoyé s'afficherait cassé.
 */
export function mediaDir(): string {
  return process.env.MEDIA_DIR ?? join(process.cwd(), "..", "..", "data", "media");
}

export type ParsedRange = { start: number; end: number } | null | "invalid";

/**
 * Intervalle demandé par un en-tête `Range`, borné à la taille du fichier.
 * `null` = pas de Range exploitable (servir le fichier entier) ;
 * `"invalid"` = intervalle hors limites, à refuser en 416.
 *
 * Nécessaire pour les vidéos : Safari (macOS et iOS) demande systématiquement
 * un intervalle sur une balise <video> et refuse de lire si le serveur répond
 * 200 au lieu de 206.
 */
export function parseRange(header: string | null, size: number): ParsedRange {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;
  // Forme suffixe « bytes=-500 » : les 500 derniers octets.
  const start = rawStart ? Number(rawStart) : Math.max(0, size - Number(rawEnd));
  const end = rawStart ? (rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return "invalid";
  }
  return { start, end };
}
