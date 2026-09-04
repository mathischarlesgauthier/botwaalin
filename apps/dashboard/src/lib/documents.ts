import { DOCUMENT_ALLOWED_EXTENSIONS, DOCUMENT_MAX_ACTIVE, DOCUMENT_MAX_BYTES } from "@arbi/core";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

/**
 * Documents de référence (§3) : dossier de stockage, validation d'upload et
 * mise en forme — logique pure, sans effet de bord, pour rester testable
 * indépendamment de la server action qui écrit sur disque.
 */

/** Dossier d'archivage sur le volume persistant (même convention que MEDIA_DIR). */
export function docsDir(): string {
  return process.env.DOCS_DIR ?? join(process.cwd(), "..", "..", "data", "documents");
}

const MIME_BY_EXT: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
  ".html": "text/html",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** Extension en minuscules (avec le point), "" si absente. */
export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

/** Type MIME déduit : celui du navigateur en priorité, sinon déduit de l'extension. */
export function mimeFor(filename: string, browserType: string): string {
  return browserType || MIME_BY_EXT[extensionOf(filename)] || "application/octet-stream";
}

/** Nom d'origine nettoyé pour l'affichage : jamais un chemin, longueur bornée. */
export function sanitizeDocName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const clean = base.trim().slice(0, 200);
  return clean || "document";
}

/** Nom de fichier sûr sur disque : identifiant généré, jamais celui du client. */
export function generatedDocFilename(ext: string): string {
  return `${randomUUID()}${ext}`;
}

export interface DocumentUploadCandidate {
  name: string;
  size: number;
  type: string;
}

export type DocumentValidation = { ok: true; ext: string } | { ok: false; message: string };

/**
 * Validation pure de l'upload (taille, extension, quota) — appliquée AVANT
 * toute écriture disque ou insertion base. `activeCount` = nombre actuel de
 * documents actifs (avant l'ajout de celui-ci).
 */
export function validateDocumentUpload(
  file: DocumentUploadCandidate,
  activeCount: number,
): DocumentValidation {
  if (!file.name || file.size <= 0) {
    return { ok: false, message: "Aucun fichier sélectionné." };
  }
  const ext = extensionOf(file.name);
  if (!(DOCUMENT_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return {
      ok: false,
      message: `Type de fichier non accepté (${ext || "sans extension"}). Formats acceptés : ${DOCUMENT_ALLOWED_EXTENSIONS.join(", ")}.`,
    };
  }
  if (file.size > DOCUMENT_MAX_BYTES) {
    return {
      ok: false,
      message: `Fichier trop volumineux (${formatFileSize(file.size)}) — 5 Mo maximum.`,
    };
  }
  if (activeCount >= DOCUMENT_MAX_ACTIVE) {
    return {
      ok: false,
      message: `Quota atteint : ${DOCUMENT_MAX_ACTIVE} documents actifs maximum. Désactive-en un avant d'en ajouter un nouveau.`,
    };
  }
  return { ok: true, ext };
}

/** Taille lisible (o / Ko / Mo). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
