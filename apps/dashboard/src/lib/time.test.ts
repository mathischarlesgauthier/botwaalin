import { describe, expect, it } from "vitest";
import { formatDuration } from "./time";

describe("formatDuration", () => {
  it("affiche des minutes en dessous d'une heure", () => {
    expect(formatDuration(5 * 60_000)).toBe("5 min");
    expect(formatDuration(0)).toBe("0 min");
  });

  it("affiche heures et minutes en dessous d'un jour", () => {
    expect(formatDuration(3 * 60 * 60_000 + 12 * 60_000)).toBe("3 h 12");
    expect(formatDuration(60 * 60_000)).toBe("1 h 00");
  });

  it("affiche des jours au-delà de 24 h", () => {
    expect(formatDuration(2 * 24 * 60 * 60_000)).toBe("2 j");
    expect(formatDuration(25 * 60 * 60_000)).toBe("1 j");
  });

  it("ne renvoie jamais de durée négative", () => {
    expect(formatDuration(-1000)).toBe("0 min");
  });
});
