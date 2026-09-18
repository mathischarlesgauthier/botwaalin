import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "./logger";
import { logDecision } from "./logger";

/**
 * Médias entrants WhatsApp : téléchargement depuis la Graph API, archivage sur
 * disque pour le back-office, transcription des messages vocaux.
 */

/** WhatsApp plafonne à 16 Mo ; on refuse au-delà pour protéger le volume. */
export const MEDIA_MAX_BYTES = 20 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/amr": "amr",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
};

/** Type de média que le back-office peut envoyer à un client. */
export type OutboundMediaKind = "image" | "video";

/**
 * Types MIME acceptés à l'ENVOI. Volontairement plus étroit qu'à la réception :
 * Meta refuse le reste sur les messages image/vidéo (le webp est un sticker,
 * le gif n'est pas supporté tel quel).
 */
const OUTBOUND_MIME: Record<string, OutboundMediaKind> = {
  "image/jpeg": "image",
  "image/png": "image",
  "video/mp4": "video",
  "video/3gpp": "video",
};

/** Plafonds Meta par type sortant — au-delà, l'API rejette l'upload. */
export const OUTBOUND_MEDIA_MAX_BYTES: Record<OutboundMediaKind, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
};

/** Extensions proposées au sélecteur de fichier du back-office. */
export const OUTBOUND_MEDIA_ACCEPT = ".jpg,.jpeg,.png,.mp4,.3gp";

/** `image` / `video` si le type MIME est envoyable, `null` sinon. */
export function outboundMediaKind(mime: string): OutboundMediaKind | null {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return OUTBOUND_MIME[base] ?? null;
}

/** Type MIME déduit de l'extension, pour les fichiers envoyables. */
const OUTBOUND_MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  mp4: "video/mp4",
  "3gp": "video/3gpp",
};

/**
 * Type MIME à utiliser pour un fichier choisi dans le back-office. Le
 * navigateur ne renseigne pas toujours `type` (extension inconnue du système,
 * fréquent pour .3gp sous Windows) : on retombe alors sur l'extension, sinon
 * un `.mp4` parfaitement valide serait refusé.
 */
export function outboundMimeFor(name: string, browserType: string): string {
  if (outboundMediaKind(browserType)) return browserType.split(";")[0]!.trim().toLowerCase();
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return OUTBOUND_MIME_BY_EXT[ext] ?? browserType;
}

export type OutboundMediaCheck =
  | { ok: true; kind: OutboundMediaKind; mime: string }
  | { ok: false; message: string };

/**
 * Contrôle d'un média sortant AVANT toute écriture disque ou appel réseau :
 * type supporté par WhatsApp, fichier non vide, taille sous le plafond Meta.
 * Renvoie le type MIME retenu (celui du navigateur, ou déduit de l'extension).
 */
export function checkOutboundMedia(file: { name: string; size: number; type: string }): OutboundMediaCheck {
  if (file.size === 0) return { ok: false, message: "Fichier vide." };
  const mime = outboundMimeFor(file.name, file.type || "");
  const kind = outboundMediaKind(mime);
  if (!kind) {
    return {
      ok: false,
      message: "Format non supporté par WhatsApp — envoie une photo JPEG/PNG ou une vidéo MP4.",
    };
  }
  const max = OUTBOUND_MEDIA_MAX_BYTES[kind];
  if (file.size > max) {
    const mb = Math.round(max / (1024 * 1024));
    return {
      ok: false,
      message: `Fichier trop lourd : WhatsApp plafonne ${kind === "image" ? "les photos" : "les vidéos"} à ${mb} Mo.`,
    };
  }
  return { ok: true, kind, mime };
}

export interface MediaConfig {
  apiBase: string;
  token: string;
  /** Dossier d'archivage (sur le volume persistant). */
  dir: string;
}

export interface TranscriptionConfig {
  /** Endpoint compatible OpenAI (audio/transcriptions). Vide = transcription désactivée. */
  apiUrl: string;
  apiKey: string;
  model: string;
  /** Coût interne, en centimes d'euro par minute d'audio (facturation). */
  costCentsPerMinute: number;
}

export interface DownloadedMedia {
  buffer: Buffer;
  mime: string;
}

/** Extension de fichier sûre déduite du type MIME (jamais issue du client). */
export function extensionFor(mime: string): string {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return EXTENSIONS[base] ?? "bin";
}

/** Nom de fichier sûr : seul un identifiant WhatsApp normalisé est accepté. */
export function safeMediaName(wamid: string, mime: string): string {
  const slug = wamid.replace(/[^A-Za-z0-9_-]/g, "").slice(-60) || "media";
  return `${slug}.${extensionFor(mime)}`;
}

/**
 * Télécharge un média : l'API renvoie d'abord une URL signée, à récupérer avec
 * le même token porteur.
 */
export async function downloadMedia(
  cfg: MediaConfig,
  mediaId: string,
): Promise<DownloadedMedia | null> {
  const metaResponse = await fetch(`${cfg.apiBase}/${mediaId}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  if (!metaResponse.ok) {
    throw new Error(`media metadata ${mediaId} → ${metaResponse.status}`);
  }
  const meta = (await metaResponse.json()) as { url?: string; mime_type?: string };
  if (!meta.url) return null;

  const fileResponse = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  if (!fileResponse.ok) {
    throw new Error(`media download ${mediaId} → ${fileResponse.status}`);
  }
  const buffer = Buffer.from(await fileResponse.arrayBuffer());
  if (buffer.byteLength > MEDIA_MAX_BYTES) {
    throw new Error(`media ${mediaId} trop volumineux (${buffer.byteLength} octets)`);
  }
  return {
    buffer,
    mime: meta.mime_type ?? fileResponse.headers.get("content-type") ?? "application/octet-stream",
  };
}

/** Archive le média et renvoie le nom du fichier (jamais un chemin complet). */
export function storeMedia(cfg: MediaConfig, wamid: string, media: DownloadedMedia): string {
  mkdirSync(cfg.dir, { recursive: true });
  const name = safeMediaName(wamid, media.mime);
  writeFileSync(join(cfg.dir, name), media.buffer);
  return name;
}

export interface TranscriptionResult {
  text: string;
  /** Durée facturée en secondes (estimée si l'API ne la renvoie pas). */
  seconds: number;
}

/**
 * Transcrit un audio via une API compatible OpenAI (`audio/transcriptions`).
 * Renvoie null si la transcription n'est pas configurée ou échoue : le vocal
 * reste alors écoutable dans le back-office.
 */
export async function transcribeAudio(
  cfg: TranscriptionConfig,
  media: DownloadedMedia,
  log: Logger,
): Promise<TranscriptionResult | null> {
  if (!cfg.apiKey || !cfg.apiUrl) return null;
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(media.buffer)], { type: media.mime }), `audio.${extensionFor(media.mime)}`);
    form.append("model", cfg.model);
    form.append("language", "fr");
    form.append("response_format", "verbose_json");
    const response = await fetch(cfg.apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: form,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`transcription → ${response.status} ${detail.slice(0, 200)}`);
    }
    const body = (await response.json()) as { text?: string; duration?: number };
    const text = (body.text ?? "").trim();
    if (!text) return null;
    // À défaut de durée renvoyée : estimation d'après la taille (~12 ko/s en opus).
    const seconds = body.duration ?? Math.max(1, Math.round(media.buffer.byteLength / 12_000));
    return { text, seconds };
  } catch (err) {
    log.error({ err: String(err) }, "transcription_failed");
    return null;
  }
}

/** Libellé affiché quand le contenu n'est pas exploitable en texte. */
export function mediaPlaceholder(type: string, caption?: string): string {
  const legende = caption?.trim() ? ` — légende : « ${caption.trim()} »` : "";
  switch (type) {
    case "image":
      return `[Le client a envoyé une photo${legende}. Tu ne peux pas la voir : demande-lui poliment ce qu'elle représente ou ce qu'il attend.]`;
    case "sticker":
      return "[Le client a envoyé un sticker.]";
    case "audio":
      return "[Le client a envoyé un message vocal que tu ne peux pas écouter : demande-lui poliment de résumer par écrit.]";
    case "video":
      return `[Le client a envoyé une vidéo${legende}. Tu ne peux pas la voir : demande-lui poliment de préciser par écrit.]`;
    case "document":
      return `[Le client a envoyé un document${legende}. Tu ne peux pas l'ouvrir : demande-lui poliment de préciser sa demande.]`;
    default:
      return `[Le client a envoyé un message de type « ${type} » que tu ne peux pas lire — demande-lui poliment de préciser par écrit.]`;
  }
}

export interface ProcessMediaDeps {
  media: MediaConfig;
  transcription: TranscriptionConfig;
  log: Logger;
  /** Facturation de la transcription (coût interne, la marge est appliquée en amont). */
  onTranscriptionCost?: (costCentimes: number, seconds: number, model: string) => void;
}

export interface ProcessedMedia {
  /** Texte destiné au bot et affiché dans le back-office. */
  text: string;
  mediaFile: string;
  mediaMime: string;
  transcribed: boolean;
}

/**
 * Pipeline complet d'un média entrant : téléchargement, archivage, puis
 * transcription pour les vocaux. Ne lève jamais : en cas d'échec, le message
 * reste présent dans la conversation avec un libellé explicite.
 */
export async function processInboundMedia(
  deps: ProcessMediaDeps,
  input: { wamid: string; mediaId: string; type: string; caption?: string },
): Promise<ProcessedMedia> {
  const fallback: ProcessedMedia = {
    text: mediaPlaceholder(input.type, input.caption),
    mediaFile: "",
    mediaMime: "",
    transcribed: false,
  };
  let downloaded: DownloadedMedia | null = null;
  try {
    downloaded = await downloadMedia(deps.media, input.mediaId);
  } catch (err) {
    deps.log.error({ err: String(err), mediaId: input.mediaId }, "media_download_failed");
    return fallback;
  }
  if (!downloaded) return fallback;

  let mediaFile = "";
  try {
    mediaFile = storeMedia(deps.media, input.wamid, downloaded);
  } catch (err) {
    deps.log.error({ err: String(err), wamid: input.wamid }, "media_store_failed");
  }

  const isAudio = input.type === "audio" || downloaded.mime.startsWith("audio/");
  if (isAudio) {
    const result = await transcribeAudio(deps.transcription, downloaded, deps.log);
    if (result) {
      const cost = (result.seconds / 60) * deps.transcription.costCentsPerMinute;
      deps.onTranscriptionCost?.(cost, result.seconds, deps.transcription.model);
      logDecision(deps.log, "voice_transcribed", {
        wamid: input.wamid,
        seconds: Math.round(result.seconds),
      });
      return {
        text: `[Message vocal] ${result.text}`,
        mediaFile,
        mediaMime: downloaded.mime,
        transcribed: true,
      };
    }
  }

  return {
    text: mediaPlaceholder(input.type, input.caption),
    mediaFile,
    mediaMime: downloaded.mime,
    transcribed: false,
  };
}

// ─── Affichage back-office (§1) ───────────────────────────────────────────────

type DisplayMediaKind = "image" | "sticker" | "audio" | "video" | "document" | "inconnu";

/** Mention discrète affichée quand le média n'a pas pu être archivé. */
const NOT_RETRIEVED_LABEL: Record<DisplayMediaKind, string> = {
  image: "📷 Photo non récupérée",
  video: "🎥 Vidéo non récupérée",
  audio: "🎤 Message vocal non récupéré",
  document: "📎 Document non récupéré",
  sticker: "🏷️ Sticker non récupéré",
  inconnu: "📎 Média non récupéré",
};

/**
 * Formes finales produites par `mediaPlaceholder` : légende optionnelle
 * capturée pour être réaffichée seule (le média est déjà montré au-dessus).
 */
const FINAL_PLACEHOLDER_PATTERNS: Array<{ kind: DisplayMediaKind; re: RegExp }> = [
  {
    kind: "image",
    re: /^\[Le client a envoyé une photo(?: — légende : « (.+) »)?\. Tu ne peux pas la voir : demande-lui poliment ce qu'elle représente ou ce qu'il attend\.\]$/,
  },
  {
    kind: "video",
    re: /^\[Le client a envoyé une vidéo(?: — légende : « (.+) »)?\. Tu ne peux pas la voir : demande-lui poliment de préciser par écrit\.\]$/,
  },
  {
    kind: "document",
    re: /^\[Le client a envoyé un document(?: — légende : « (.+) »)?\. Tu ne peux pas l'ouvrir : demande-lui poliment de préciser sa demande\.\]$/,
  },
  { kind: "sticker", re: /^\[Le client a envoyé un sticker\.\]$/ },
  {
    kind: "audio",
    re: /^\[Le client a envoyé un message vocal que tu ne peux pas écouter : demande-lui poliment de résumer par écrit\.\]$/,
  },
  {
    kind: "inconnu",
    re: /^\[Le client a envoyé un message de type « .+ » que tu ne peux pas lire — demande-lui poliment de préciser par écrit\.\]$/,
  },
];

/**
 * Textes d'attente écrits par `server.ts` avant le traitement asynchrone du
 * média (« chargement… ») — y compris ceux qui ne seront jamais remplacés
 * (traitement interrompu) et restent tels quels dans les anciens messages.
 */
const PENDING_PLACEHOLDER_PATTERNS: Array<{ kind: DisplayMediaKind; re: RegExp }> = [
  { kind: "audio", re: /^\[Message vocal — transcription en cours…\]$/ },
  { kind: "image", re: /^\[Photo reçue — chargement…\]$/ },
  { kind: "video", re: /^\[Vidéo reçue — chargement…\]$/ },
  { kind: "sticker", re: /^\[Sticker reçue — chargement…\]$/ },
  { kind: "document", re: /^\[Document reçue — chargement…\]$/ },
];

/** `[Message vocal] <transcription>` → le préfixe est déjà porté par le lecteur audio. */
const VOICE_TRANSCRIPT_RE = /^\[Message vocal\] ([\s\S]*)$/;

/**
 * Ce que le back-office doit afficher sous un message média, à la place du
 * texte brut de `messages.contenu` (destiné au LLM, pas au lecteur humain).
 * Ne change RIEN à ce qui est stocké en base ni à ce que reçoit le LLM.
 */
export function displayMediaText(contenu: string, mediaFile: string, mediaMime: string): string {
  const voice = contenu.match(VOICE_TRANSCRIPT_RE);
  if (voice) return (voice[1] ?? "").trim();

  for (const { kind, re } of FINAL_PLACEHOLDER_PATTERNS) {
    const match = contenu.match(re);
    if (!match) continue;
    const caption = match[1]?.trim();
    if (caption) return caption;
    if (mediaFile === "") {
      return kind === "inconnu" ? notRetrievedFromMime(mediaMime) : NOT_RETRIEVED_LABEL[kind];
    }
    return "";
  }

  for (const { kind, re } of PENDING_PLACEHOLDER_PATTERNS) {
    if (!re.test(contenu)) continue;
    return mediaFile === "" ? NOT_RETRIEVED_LABEL[kind] : "";
  }

  return contenu;
}

/** Repli sur le type MIME quand le type de média n'a pas pu être déterminé depuis le texte. */
function notRetrievedFromMime(mediaMime: string): string {
  if (mediaMime.startsWith("image/")) return NOT_RETRIEVED_LABEL.image;
  if (mediaMime.startsWith("audio/")) return NOT_RETRIEVED_LABEL.audio;
  if (mediaMime.startsWith("video/")) return NOT_RETRIEVED_LABEL.video;
  return NOT_RETRIEVED_LABEL.inconnu;
}
