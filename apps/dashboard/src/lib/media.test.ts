import { describe, expect, it } from "vitest";
import { parseRange } from "./media";

const SIZE = 1000;

describe("parseRange — lecture des vidéos (Safari exige du 206)", () => {
  it("pas d'en-tête Range : fichier entier", () => {
    expect(parseRange(null, SIZE)).toBeNull();
  });

  it("en-tête illisible : fichier entier plutôt qu'une erreur", () => {
    expect(parseRange("octets=0-10", SIZE)).toBeNull();
    expect(parseRange("bytes=abc", SIZE)).toBeNull();
    expect(parseRange("bytes=-", SIZE)).toBeNull();
  });

  it("intervalle explicite", () => {
    expect(parseRange("bytes=0-99", SIZE)).toEqual({ start: 0, end: 99 });
    // La sonde que Safari envoie systématiquement sur une balise <video>.
    expect(parseRange("bytes=0-1", SIZE)).toEqual({ start: 0, end: 1 });
  });

  it("borne de fin absente : jusqu'au dernier octet", () => {
    expect(parseRange("bytes=500-", SIZE)).toEqual({ start: 500, end: 999 });
  });

  it("fin au-delà de la taille : ramenée au dernier octet", () => {
    expect(parseRange("bytes=900-99999", SIZE)).toEqual({ start: 900, end: 999 });
  });

  it("forme suffixe : les N derniers octets", () => {
    expect(parseRange("bytes=-100", SIZE)).toEqual({ start: 900, end: 999 });
    // Suffixe plus grand que le fichier : tout le fichier, pas un début négatif.
    expect(parseRange("bytes=-5000", SIZE)).toEqual({ start: 0, end: 999 });
  });

  it("intervalle hors limites ou inversé : 416", () => {
    expect(parseRange("bytes=1000-1200", SIZE)).toBe("invalid");
    expect(parseRange("bytes=800-700", SIZE)).toBe("invalid");
  });

  it("espaces autour de la valeur tolérés", () => {
    expect(parseRange("  bytes=0-9  ", SIZE)).toEqual({ start: 0, end: 9 });
  });
});
