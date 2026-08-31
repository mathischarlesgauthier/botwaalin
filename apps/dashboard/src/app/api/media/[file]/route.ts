import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  amr: "audio/amr",
  wav: "audio/wav",
  mp4: "video/mp4",
  "3gp": "video/3gpp",
  pdf: "application/pdf",
};

/**
 * Sert un média reçu d'un client (photo, vocal), archivé sur le volume.
 * Le nom de fichier est validé strictement : ni chemin, ni traversée possible.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response("Non autorisé", { status: 401 });

  const { file } = await params;
  if (!/^[A-Za-z0-9_-]{1,80}\.[A-Za-z0-9]{1,5}$/.test(file)) {
    return new Response("Nom de fichier invalide", { status: 400 });
  }

  const dir = process.env.MEDIA_DIR ?? join(process.cwd(), "..", "..", "data", "media");
  const path = join(dir, file);
  try {
    const info = await stat(path);
    if (!info.isFile()) return new Response("Introuvable", { status: 404 });
    const buffer = await readFile(path);
    const ext = file.split(".").pop()?.toLowerCase() ?? "";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
        "Content-Length": String(info.size),
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${file}"`,
      },
    });
  } catch {
    return new Response("Introuvable", { status: 404 });
  }
}
