import { describe, expect, it } from "vitest";
import { displayMediaText, mediaPlaceholder } from "../src/media";

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
