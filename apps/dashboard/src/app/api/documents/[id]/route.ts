import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { getSessionUser } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { docsDir } from "@/lib/documents";

export const dynamic = "force-dynamic";

/**
 * Sert un document de référence uploadé par Jacob (§3), en téléchargement.
 * Même schéma d'auth que `/api/media/[file]` : session obligatoire, le
 * fichier physique n'est jamais adressé par son nom brut (id numérique →
 * ligne base → nom sur disque généré côté serveur).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response("Non autorisé", { status: 401 });

  const { id } = await params;
  const documentId = Number.parseInt(id, 10);
  if (!Number.isFinite(documentId) || documentId <= 0) {
    return new Response("Identifiant invalide", { status: 400 });
  }

  const { core } = getRuntime();
  const row = core.documents.get(documentId);
  if (!row) return new Response("Introuvable", { status: 404 });

  const path = join(docsDir(), row.fichier);
  try {
    const info = await stat(path);
    if (!info.isFile()) return new Response("Introuvable", { status: 404 });
    const buffer = await readFile(path);
    const safeName = row.nom.replace(/["\r\n]/g, "_");
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": row.mime || "application/octet-stream",
        "Content-Length": String(info.size),
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(row.nom)}`,
      },
    });
  } catch {
    return new Response("Introuvable", { status: 404 });
  }
}
