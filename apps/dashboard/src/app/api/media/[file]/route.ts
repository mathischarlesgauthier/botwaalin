import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { getSessionUser } from "@/lib/auth";
import { mediaDir, parseRange } from "@/lib/media";

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
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
};

/**
 * Sert un média de la conversation (photo ou vocal reçu du client, photo ou
 * vidéo envoyée depuis le back-office), archivé sur le volume. Le nom de
 * fichier est validé strictement : ni chemin, ni traversée possible.
 *
 * Les requêtes `Range` sont honorées : Safari (macOS et iOS) demande
 * systématiquement un intervalle sur une balise <video> et refuse de lire si
 * le serveur répond 200 au lieu de 206.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response("Non autorisé", { status: 401 });

  const { file } = await params;
  if (!/^[A-Za-z0-9_-]{1,80}\.[A-Za-z0-9]{1,5}$/.test(file)) {
    return new Response("Nom de fichier invalide", { status: 400 });
  }

  const path = join(mediaDir(), file);
  try {
    const info = await stat(path);
    if (!info.isFile()) return new Response("Introuvable", { status: 404 });
    const ext = file.split(".").pop()?.toLowerCase() ?? "";
    const headers: Record<string, string> = {
      "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${file}"`,
      "Accept-Ranges": "bytes",
    };

    const range = parseRange(request.headers.get("range"), info.size);
    if (range === "invalid") {
      return new Response("Intervalle non satisfaisable", {
        status: 416,
        headers: { "Content-Range": `bytes */${info.size}` },
      });
    }
    if (range) {
      const buffer = await readFile(path);
      const slice = buffer.subarray(range.start, range.end + 1);
      return new Response(new Uint8Array(slice), {
        status: 206,
        headers: {
          ...headers,
          "Content-Length": String(slice.byteLength),
          "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`,
        },
      });
    }

    const buffer = await readFile(path);
    return new Response(new Uint8Array(buffer), {
      headers: { ...headers, "Content-Length": String(info.size) },
    });
  } catch {
    return new Response("Introuvable", { status: 404 });
  }
}
