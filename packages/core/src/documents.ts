import { inflateRawSync } from "node:zlib";
// unpdf@1.7.0 est épinglé SANS caret (voir packages/core/package.json) : à
// partir de 1.8.0, unpdf exige Node ≥22 (`npm view unpdf@1.8.0 engines`),
// incompatible avec Dockerfile.railway (node:20-bookworm-slim). NE JAMAIS
// remettre de caret sur cette dépendance sans revérifier ce point.
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";

/**
 * Documents de référence uploadés par Jacob pour compléter le prompt (§3).
 * Extraction de texte robuste : ne lève jamais, un échec renvoie `contenu = ""`
 * accompagné d'une raison affichée dans le back-office.
 */

/** Taille maximale d'un fichier uploadé. */
export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;

/** Nombre maximal de documents actifs simultanément. */
export const DOCUMENT_MAX_ACTIVE = 20;

/** Extensions acceptées par l'upload (le back-office doit refuser le reste). */
export const DOCUMENT_ALLOWED_EXTENSIONS = [".txt", ".md", ".csv", ".json", ".html", ".pdf", ".docx"] as const;

/** Texte extrait tronqué à ce nombre de caractères (par document, stocké en base). */
export const DOCUMENT_MAX_CHARS = 50_000;

/**
 * Taille maximale de sortie acceptée pour la décompression d'une entrée .docx
 * (zip bomb) : l'upload n'est borné qu'en taille COMPRESSÉE (DOCUMENT_MAX_BYTES,
 * 5 Mo) — un ratio de décompression deflate proche de 1032:1 permettrait sinon
 * jusqu'à ~5 Go en mémoire pour un seul appel synchrone bloquant, sur le
 * process unique qui sert aussi le webhook WhatsApp en production. Le texte
 * utile ne dépasse de toute façon jamais DOCUMENT_MAX_CHARS : large marge pour
 * le XML (balises, attributs) autour du texte réellement extrait.
 */
const DOCX_INFLATE_MAX_BYTES = 2 * 1024 * 1024;

/** Budget total de caractères de documents injectés dans le prompt statique (tous documents actifs confondus). */
export const DOCUMENT_PROMPT_BUDGET_CHARS = 60_000;

export interface ExtractedText {
  text: string;
  /** Raison affichée dans le back-office quand `text` est vide. */
  reason?: string;
}

/** Espaces compactés, fins de ligne normalisées, troncature annoncée. */
function normalizeExtracted(raw: string): string {
  const compact = raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ *\n */g, "\n")
    .trim();
  if (compact.length <= DOCUMENT_MAX_CHARS) return compact;
  return `${compact.slice(0, DOCUMENT_MAX_CHARS)}\n[…texte tronqué à ${DOCUMENT_MAX_CHARS.toLocaleString("fr-FR")} caractères]`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function extractPdf(buffer: Buffer): Promise<ExtractedText> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractPdfText(pdf, { mergePages: true });
    const joined = Array.isArray(text) ? text.join("\n") : text;
    const normalized = normalizeExtracted(joined);
    if (!normalized) {
      return {
        text: "",
        reason: "texte non extrait — colle le contenu dans la note ou envoie un .md (PDF sans texte détecté, probablement scanné)",
      };
    }
    return { text: normalized };
  } catch (err) {
    return {
      text: "",
      reason: `texte non extrait — colle le contenu dans la note ou envoie un .md (${errorMessage(err)})`,
    };
  }
}

// ─── .docx : dézippage minimal (word/document.xml), pas de dépendance lourde ──

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

/** Repère l'enregistrement de fin de répertoire central (EOCD) d'un zip. */
function findEndOfCentralDirectory(buf: Buffer): number {
  const MIN_EOCD_LEN = 22;
  const MAX_COMMENT_LEN = 65_535;
  const start = Math.max(0, buf.length - MIN_EOCD_LEN - MAX_COMMENT_LEN);
  for (let i = buf.length - MIN_EOCD_LEN; i >= start; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error("archive zip invalide (fin de répertoire introuvable)");
}

function readZipEntries(buf: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buf);
  const entryCount = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("entrée de répertoire central invalide");
    }
    const compressionMethod = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLen);
    entries.push({ name, compressionMethod, compressedSize, localHeaderOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readZipEntryData(buf: Buffer, entry: ZipEntry): Buffer {
  if (buf.readUInt32LE(entry.localHeaderOffset) !== 0x04034b50) {
    throw new Error("en-tête local zip invalide");
  }
  const nameLen = buf.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLen = buf.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + nameLen + extraLen;
  const compressed = buf.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.compressionMethod === 0) return Buffer.from(compressed);
  if (entry.compressionMethod === 8) {
    // maxOutputLength : filet anti « zip bomb » — sans lui, `inflateRawSync`
    // décompresse en mémoire sans limite de sortie (seule la taille COMPRESSÉE
    // est bornée par DOCUMENT_MAX_BYTES en amont).
    return inflateRawSync(compressed, { maxOutputLength: DOCX_INFLATE_MAX_BYTES });
  }
  throw new Error(`méthode de compression zip non supportée (${entry.compressionMethod})`);
}

function unescapeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Concatène le contenu des balises `<w:t>`, en réinsérant sauts de ligne (`</w:p>`) et tabulations. */
function extractDocxRuns(documentXml: string): string {
  const withBreaks = documentXml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br\s*\/>/g, "\n");
  const RUN_OR_BREAK_RE = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|\n|\t/g;
  let out = "";
  for (const match of withBreaks.matchAll(RUN_OR_BREAK_RE)) {
    out += match[1] !== undefined ? unescapeXmlEntities(match[1]) : match[0];
  }
  return out;
}

function extractDocx(buffer: Buffer): ExtractedText {
  try {
    const entries = readZipEntries(buffer);
    const documentEntry = entries.find((e) => e.name === "word/document.xml");
    if (!documentEntry) {
      return { text: "", reason: "structure .docx inattendue (word/document.xml introuvable)" };
    }
    const xml = readZipEntryData(buffer, documentEntry).toString("utf8");
    const normalized = normalizeExtracted(extractDocxRuns(xml));
    if (!normalized) {
      return { text: "", reason: "aucun texte trouvé dans le document Word" };
    }
    return { text: normalized };
  } catch (err) {
    return {
      text: "",
      reason: `texte non extrait — colle le contenu dans la note ou envoie un .md (${errorMessage(err)})`,
    };
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const PLAIN_TEXT_EXTENSIONS = new Set([".txt", ".md", ".csv", ".json"]);

/**
 * Extrait le texte d'un document uploadé. Ne lève jamais : en cas d'échec ou
 * de format non pris en charge, `text` est vide et `reason` explique pourquoi
 * (affiché dans le back-office).
 */
export async function extractText(
  buffer: Buffer,
  mime: string,
  filename: string,
): Promise<ExtractedText> {
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  try {
    if (ext === ".pdf" || mime === "application/pdf") {
      return await extractPdf(buffer);
    }
    if (
      ext === ".docx" ||
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      return extractDocx(buffer);
    }
    if (ext === ".html" || mime === "text/html") {
      return { text: normalizeExtracted(stripHtml(buffer.toString("utf8"))) };
    }
    if (PLAIN_TEXT_EXTENSIONS.has(ext) || mime.startsWith("text/") || mime === "application/json") {
      return { text: normalizeExtracted(buffer.toString("utf8")) };
    }
    return {
      text: "",
      reason: `type de fichier non pris en charge (${ext || mime || "inconnu"})`,
    };
  } catch (err) {
    return {
      text: "",
      reason: `texte non extrait — colle le contenu dans la note ou envoie un .md (${errorMessage(err)})`,
    };
  }
}
