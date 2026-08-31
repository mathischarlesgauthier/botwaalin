import {
  extensionFor,
  mediaPlaceholder,
  processInboundMedia,
  safeMediaName,
  type ProcessMediaDeps,
} from "@arbi/core";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractInbound } from "../src/server";
import { silentLogger, testCore } from "./helpers";

function deps(dir: string, overrides: Partial<ProcessMediaDeps> = {}): ProcessMediaDeps {
  return {
    media: { apiBase: "https://graph.test/v21.0", token: "tok", dir },
    transcription: {
      apiUrl: "https://api.test/v1/audio/transcriptions",
      apiKey: "sk-test",
      model: "whisper-1",
      costCentsPerMinute: 0.6,
    },
    log: silentLogger(),
    ...overrides,
  };
}

const json = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 });

describe("médias entrants (photos, vocaux)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("extrait l'identifiant média d'une photo avec légende", () => {
    const result = extractInbound({
      id: "wamid.PHOTO",
      from: "336",
      type: "image",
      image: { id: "media-1", caption: "ma boutique" },
    } as never);
    expect(result.media).toEqual({ id: "media-1", type: "image", caption: "ma boutique" });
    expect(result.text).toContain("chargement");
  });

  it("traite « voice » comme un audio", () => {
    const result = extractInbound({
      id: "wamid.VOICE",
      from: "336",
      type: "voice",
      voice: { id: "media-2" },
    } as never);
    expect(result.media?.type).toBe("audio");
    expect(result.text).toContain("transcription en cours");
  });

  it("archive une photo et la rend consultable", async () => {
    const dir = mkdtempSync(join(tmpdir(), "media-"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes("/media-1")) return json({ url: "https://cdn.test/f", mime_type: "image/jpeg" });
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        });
      }),
    );
    const result = await processInboundMedia(deps(dir), {
      wamid: "wamid.ABC=",
      mediaId: "media-1",
      type: "image",
      caption: "ma boutique",
    });
    expect(result.mediaFile).toBe("wamidABC.jpg");
    expect(result.mediaMime).toBe("image/jpeg");
    expect(result.text).toContain("ma boutique");
    expect(readFileSync(join(dir, result.mediaFile))).toHaveLength(4);
  });

  it("transcrit un vocal, facture la durée et met le texte dans la conversation", async () => {
    const dir = mkdtempSync(join(tmpdir(), "media-"));
    const costs: Array<{ cost: number; seconds: number }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes("/media-2")) return json({ url: "https://cdn.test/a", mime_type: "audio/ogg" });
        if (u.includes("transcriptions")) {
          return json({ text: "Bonjour, je cherche un agent en Chine.", duration: 30 });
        }
        return new Response(new Uint8Array([9, 9, 9]), {
          status: 200,
          headers: { "content-type": "audio/ogg" },
        });
      }),
    );
    const result = await processInboundMedia(
      deps(dir, {
        onTranscriptionCost: (cost, seconds) => costs.push({ cost, seconds }),
      }),
      { wamid: "wamid.VOICE", mediaId: "media-2", type: "audio" },
    );
    expect(result.transcribed).toBe(true);
    expect(result.text).toBe("[Message vocal] Bonjour, je cherche un agent en Chine.");
    expect(result.mediaFile).toBe("wamidVOICE.ogg");
    expect(costs).toHaveLength(1);
    expect(costs[0]?.cost).toBeCloseTo(0.3, 5); // 30 s à 0,6 ct/min
  });

  it("transcription indisponible : le vocal reste archivé et écoutable", async () => {
    const dir = mkdtempSync(join(tmpdir(), "media-"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes("/media-3")) return json({ url: "https://cdn.test/a", mime_type: "audio/ogg" });
        if (u.includes("transcriptions")) return new Response("quota", { status: 429 });
        return new Response(new Uint8Array([1]), {
          status: 200,
          headers: { "content-type": "audio/ogg" },
        });
      }),
    );
    const result = await processInboundMedia(deps(dir), {
      wamid: "wamid.KO",
      mediaId: "media-3",
      type: "audio",
    });
    expect(result.transcribed).toBe(false);
    expect(result.mediaFile).toBe("wamidKO.ogg"); // écoutable dans le back-office
    expect(result.text).toContain("vocal");
  });

  it("échec de téléchargement : la conversation garde une trace lisible", async () => {
    const dir = mkdtempSync(join(tmpdir(), "media-"));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const result = await processInboundMedia(deps(dir), {
      wamid: "wamid.FAIL",
      mediaId: "media-x",
      type: "image",
    });
    expect(result.mediaFile).toBe("");
    expect(result.text).toBe(mediaPlaceholder("image"));
  });

  it("le nom de fichier archivé ne peut pas sortir du dossier média", () => {
    expect(safeMediaName("../../etc/passwd", "image/png")).toBe("etcpasswd.png");
    expect(safeMediaName("wamid.HGBS/../x", "audio/ogg")).toBe("wamidHGBSx.ogg");
    expect(extensionFor("application/x-inconnu")).toBe("bin");
  });

  it("le message média est complété en base après traitement", () => {
    const core = testCore();
    core.messages.insert("336", "user", "[Message vocal — transcription en cours…]", "wamid.V1", 1, {
      type: "audio",
    });
    core.messages.attachMedia("wamid.V1", {
      contenu: "[Message vocal] Salut, tu fais quoi comme prix ?",
      file: "wamidV1.ogg",
      mime: "audio/ogg",
    });
    const [message] = core.messages.history("336", 5);
    expect(message?.contenu).toContain("Salut, tu fais quoi comme prix");
    expect(message?.mediaFile).toBe("wamidV1.ogg");
    expect(message?.mediaType).toBe("audio");
  });
});
