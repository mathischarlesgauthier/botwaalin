import { describe, expect, it } from "vitest";
import {
  checkOutboundMedia,
  displayMediaText,
  mediaPlaceholder,
  OUTBOUND_MEDIA_MAX_BYTES,
  outboundMediaKind,
} from "../src/media";

describe("displayMediaText (§1 — affichage back-office des médias)", () => {
  it("photo avec légende : renvoie la légende seule", () => {
    const contenu = mediaPlaceholder("image", "ma boutique");
    expect(displayMediaText(contenu, "wamidX.jpg", "image/jpeg")).toBe("ma boutique");
  });

  it("photo sans légende, média archivé : renvoie une chaîne vide (pas de consigne LLM)", () => {
    const contenu = mediaPlaceholder("image");
    expect(displayMediaText(contenu, "wamidX.jpg", "image/jpeg")).toBe("");
  });

  it("photo sans légende, média NON archivé : mention discrète en gris", () => {
    const contenu = mediaPlaceholder("image");
    expect(displayMediaText(contenu, "", "")).toBe("📷 Photo non récupérée");
  });

  it("sticker : jamais de légende, chaîne vide si archivé", () => {
    const contenu = mediaPlaceholder("sticker");
    expect(displayMediaText(contenu, "wamidX.webp", "image/webp")).toBe("");
    expect(displayMediaText(contenu, "", "")).toBe("🏷️ Sticker non récupéré");
  });

  it("vidéo avec légende", () => {
    const contenu = mediaPlaceholder("video", "vue de la boutique");
    expect(displayMediaText(contenu, "wamidX.mp4", "video/mp4")).toBe("vue de la boutique");
    expect(displayMediaText(mediaPlaceholder("video"), "", "")).toBe("🎥 Vidéo non récupérée");
  });

  it("document avec et sans légende", () => {
    expect(displayMediaText(mediaPlaceholder("document", "cahier des charges"), "f.pdf", "application/pdf")).toBe(
      "cahier des charges",
    );
    expect(displayMediaText(mediaPlaceholder("document"), "", "")).toBe("📎 Document non récupéré");
  });

  it("audio : jamais de légende, chaîne vide si archivé, mention si non récupéré", () => {
    const contenu = mediaPlaceholder("audio");
    expect(displayMediaText(contenu, "wamidX.ogg", "audio/ogg")).toBe("");
    expect(displayMediaText(contenu, "", "")).toBe("🎤 Message vocal non récupéré");
  });

  it("type inconnu : repli sur le mime quand le média n'est pas archivé", () => {
    const contenu = mediaPlaceholder("location");
    expect(displayMediaText(contenu, "", "image/jpeg")).toBe("📷 Photo non récupérée");
    expect(displayMediaText(contenu, "", "")).toBe("📎 Média non récupéré");
  });

  it("transcription vocale : renvoie le texte seul, le préfixe est déjà porté par le lecteur audio", () => {
    expect(displayMediaText("[Message vocal] Bonjour, je cherche un agent en Chine.", "f.ogg", "audio/ogg")).toBe(
      "Bonjour, je cherche un agent en Chine.",
    );
  });

  it("textes d'attente de server.ts (avant traitement asynchrone), y compris anciens messages en base", () => {
    expect(displayMediaText("[Photo reçue — chargement…]", "", "")).toBe("📷 Photo non récupérée");
    expect(displayMediaText("[Photo reçue — chargement…]", "f.jpg", "image/jpeg")).toBe("");
    expect(displayMediaText("[Vidéo reçue — chargement…]", "", "")).toBe("🎥 Vidéo non récupérée");
    expect(displayMediaText("[Sticker reçue — chargement…]", "", "")).toBe("🏷️ Sticker non récupéré");
    expect(displayMediaText("[Document reçue — chargement…]", "", "")).toBe("📎 Document non récupéré");
    expect(displayMediaText("[Message vocal — transcription en cours…]", "", "")).toBe(
      "🎤 Message vocal non récupéré",
    );
    expect(displayMediaText("[Message vocal — transcription en cours…]", "f.ogg", "audio/ogg")).toBe("");
  });

  it("message texte normal : renvoyé inchangé", () => {
    expect(displayMediaText("Bonjour, c'est combien pour un site vitrine ?", "", "")).toBe(
      "Bonjour, c'est combien pour un site vitrine ?",
    );
  });

  it("chaîne vide : renvoyée inchangée", () => {
    expect(displayMediaText("", "", "")).toBe("");
  });

  it("ne change rien au texte stocké : mediaPlaceholder reste inchangé (contrat LLM)", () => {
    // Non-régression explicite du §1 : le texte destiné au LLM n'est jamais modifié par cette fonction.
    const original = mediaPlaceholder("image", "test");
    displayMediaText(original, "f.jpg", "image/jpeg");
    expect(mediaPlaceholder("image", "test")).toBe(original);
  });
});

describe("checkOutboundMedia — photo/vidéo envoyées depuis le back-office", () => {
  const file = (type: string, size: number, name = "x") => ({ name, size, type });

  it("accepte une photo JPEG et une vidéo MP4", () => {
    expect(checkOutboundMedia(file("image/jpeg", 1000, "photo.jpg"))).toEqual({
      ok: true,
      kind: "image",
      mime: "image/jpeg",
    });
    expect(checkOutboundMedia(file("video/mp4", 1000, "clip.mp4"))).toEqual({
      ok: true,
      kind: "video",
      mime: "video/mp4",
    });
  });

  it("tolère un type MIME avec paramètre et une casse inattendue", () => {
    expect(checkOutboundMedia(file("IMAGE/PNG; charset=binary", 10, "p.png"))).toEqual({
      ok: true,
      kind: "image",
      mime: "image/png",
    });
  });

  it("navigateur sans type MIME : repli sur l'extension du fichier", () => {
    // Cas réel : .3gp (et parfois .mp4) non enregistré côté système, le
    // navigateur envoie alors type === "".
    expect(checkOutboundMedia(file("", 1000, "video.3gp"))).toEqual({
      ok: true,
      kind: "video",
      mime: "video/3gpp",
    });
    expect(checkOutboundMedia(file("", 1000, "PHOTO.JPEG"))).toEqual({
      ok: true,
      kind: "image",
      mime: "image/jpeg",
    });
  });

  it("extension inconnue et type absent : refusé", () => {
    expect(checkOutboundMedia(file("", 1000, "archive.zip")).ok).toBe(false);
    expect(checkOutboundMedia(file("", 1000, "sans-extension")).ok).toBe(false);
  });

  it("refuse un format que WhatsApp n'accepte pas à l'envoi (webp, gif)", () => {
    for (const mime of ["image/webp", "image/gif", ""]) {
      const result = checkOutboundMedia(file(mime, 1000));
      expect(result.ok).toBe(false);
    }
  });

  it("accepte un PDF comme document (plaquette envoyée par le bot)", () => {
    expect(checkOutboundMedia(file("application/pdf", 1000, "tarifs.pdf"))).toEqual({
      ok: true,
      kind: "document",
      mime: "application/pdf",
    });
  });

  it("accepte les tableurs (xlsx, xls, csv) comme documents", () => {
    const xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    expect(checkOutboundMedia(file(xlsx, 1000, "grille.xlsx"))).toEqual({
      ok: true,
      kind: "document",
      mime: xlsx,
    });
    expect(checkOutboundMedia(file("application/vnd.ms-excel", 1000, "vieux.xls")).kind).toBe(
      "document",
    );
    expect(checkOutboundMedia(file("text/csv", 1000, "export.csv")).kind).toBe("document");
  });

  it("tableur sans type MIME du navigateur : reconnu par son extension", () => {
    // Windows ne renseigne pas toujours le type pour .xlsx / .csv.
    const parExtension = checkOutboundMedia(file("", 2000, "tarifs 2026.xlsx"));
    expect(parExtension.ok).toBe(true);
    expect(parExtension.kind).toBe("document");
    expect(checkOutboundMedia(file("", 2000, "clients.csv")).kind).toBe("document");
  });

  it("refuse un fichier vide", () => {
    expect(checkOutboundMedia(file("image/jpeg", 0)).ok).toBe(false);
  });

  it("refuse au-delà du plafond Meta, par type", () => {
    const image = checkOutboundMedia(file("image/jpeg", OUTBOUND_MEDIA_MAX_BYTES.image + 1));
    expect(image.ok).toBe(false);
    // Une vidéo de la même taille reste acceptée : le plafond vidéo est plus haut.
    expect(checkOutboundMedia(file("video/mp4", OUTBOUND_MEDIA_MAX_BYTES.image + 1)).ok).toBe(true);
    expect(checkOutboundMedia(file("video/mp4", OUTBOUND_MEDIA_MAX_BYTES.video + 1)).ok).toBe(false);
  });

  it("pile exactement au plafond : accepté", () => {
    expect(checkOutboundMedia(file("image/jpeg", OUTBOUND_MEDIA_MAX_BYTES.image)).ok).toBe(true);
  });

  it("outboundMediaKind renvoie null hors des formats envoyables", () => {
    expect(outboundMediaKind("image/jpeg")).toBe("image");
    expect(outboundMediaKind("audio/ogg")).toBeNull();
  });
});
