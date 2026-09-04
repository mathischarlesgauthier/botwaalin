import { DOCUMENT_MAX_ACTIVE, DOCUMENT_MAX_BYTES } from "@arbi/core";
import { describe, expect, it } from "vitest";
import {
  extensionOf,
  formatFileSize,
  generatedDocFilename,
  mimeFor,
  sanitizeDocName,
  validateDocumentUpload,
} from "./documents";

describe("extensionOf", () => {
  it("extrait l'extension en minuscules", () => {
    expect(extensionOf("Rapport.PDF")).toBe(".pdf");
    expect(extensionOf("notes.md")).toBe(".md");
  });
  it("renvoie une chaîne vide sans extension", () => {
    expect(extensionOf("sansextension")).toBe("");
  });
});

describe("sanitizeDocName", () => {
  it("retire tout chemin et ne garde que le nom de fichier", () => {
    expect(sanitizeDocName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeDocName("C:\\dossier\\fichier.txt")).toBe("fichier.txt");
  });
  it("retombe sur un nom par défaut si vide", () => {
    expect(sanitizeDocName("   ")).toBe("document");
  });
});

describe("generatedDocFilename", () => {
  it("génère un identifiant, jamais le nom du client", () => {
    const a = generatedDocFilename(".pdf");
    const b = generatedDocFilename(".pdf");
    expect(a).not.toBe(b);
    expect(a.endsWith(".pdf")).toBe(true);
  });
});

describe("mimeFor", () => {
  it("préfère le type du navigateur", () => {
    expect(mimeFor("a.pdf", "application/pdf")).toBe("application/pdf");
  });
  it("déduit le type depuis l'extension si absent", () => {
    expect(mimeFor("a.md", "")).toBe("text/markdown");
    expect(mimeFor("a.bin", "")).toBe("application/octet-stream");
  });
});

describe("formatFileSize", () => {
  it("formate en octets, Ko ou Mo selon la taille", () => {
    expect(formatFileSize(500)).toBe("500 o");
    expect(formatFileSize(2048)).toBe("2 Ko");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 Mo");
  });
});

describe("validateDocumentUpload", () => {
  it("refuse un fichier absent ou vide", () => {
    const result = validateDocumentUpload({ name: "", size: 0, type: "" }, 0);
    expect(result.ok).toBe(false);
  });

  it("refuse une extension non acceptée", () => {
    const result = validateDocumentUpload({ name: "malware.exe", size: 100, type: "" }, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/non accepté/);
  });

  it("refuse un fichier trop volumineux", () => {
    const result = validateDocumentUpload(
      { name: "gros.pdf", size: DOCUMENT_MAX_BYTES + 1, type: "application/pdf" },
      0,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/volumineux/);
  });

  it("refuse au-delà du quota de documents actifs", () => {
    const result = validateDocumentUpload(
      { name: "doc.md", size: 100, type: "text/markdown" },
      DOCUMENT_MAX_ACTIVE,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Quota/);
  });

  it("accepte un fichier valide sous les limites", () => {
    const result = validateDocumentUpload(
      { name: "catalogue.md", size: 1000, type: "text/markdown" },
      3,
    );
    expect(result).toEqual({ ok: true, ext: ".md" });
  });
});
