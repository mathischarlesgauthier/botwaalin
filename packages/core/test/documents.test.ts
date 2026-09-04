import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_MAX_CHARS,
  extractText,
} from "../src/documents";
import { testCore } from "./helpers";

const FIXTURES = join(__dirname, "fixtures");

/**
 * Construit un .zip minimal (une seule entrée, méthode Deflate) — assez pour
 * `readZipEntries`/`readZipEntryData` (packages/core/src/documents.ts), sans
 * dépendance externe. CRC32 non calculé (jamais vérifié par le lecteur).
 */
function buildMinimalZip(entryName: string, data: Buffer): Buffer {
  const compressed = deflateRawSync(data);
  const nameBuf = Buffer.from(entryName, "utf8");

  const local = Buffer.alloc(30 + nameBuf.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(8, 8); // méthode = deflate
  local.writeUInt16LE(0, 10); // heure
  local.writeUInt16LE(0, 12); // date
  local.writeUInt32LE(0, 14); // crc32 (non vérifié par le lecteur)
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28); // extra len
  nameBuf.copy(local, 30);

  const central = Buffer.alloc(46 + nameBuf.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6); // version needed
  central.writeUInt16LE(0, 8); // flags
  central.writeUInt16LE(8, 10); // méthode = deflate
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(0, 16); // crc32
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30); // extra len
  central.writeUInt16LE(0, 32); // comment len
  central.writeUInt16LE(0, 34); // disque de départ
  central.writeUInt16LE(0, 36); // attributs internes
  central.writeUInt32LE(0, 38); // attributs externes
  central.writeUInt32LE(0, 42); // offset de l'en-tête local
  nameBuf.copy(central, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8); // entrées sur ce disque
  eocd.writeUInt16LE(1, 10); // entrées totales
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length + compressed.length, 16); // offset du répertoire central
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([local, compressed, central, eocd]);
}

describe("extractText (§3 — extraction du texte des documents uploadés)", () => {
  it("texte brut (.txt) : décodage UTF-8 tel quel (après normalisation des espaces)", async () => {
    const result = await extractText(Buffer.from("Bonjour Jacob,\nvoici le tarif."), "text/plain", "notes.txt");
    expect(result.reason).toBeUndefined();
    expect(result.text).toContain("Bonjour Jacob");
    expect(result.text).toContain("voici le tarif");
  });

  it("markdown (.md)", async () => {
    const result = await extractText(Buffer.from("# Titre\n\nContenu du doc.\n"), "text/markdown", "doc.md");
    expect(result.text).toContain("Titre");
    expect(result.text).toContain("Contenu du doc.");
  });

  it("CSV (.csv)", async () => {
    const result = await extractText(Buffer.from("service,prix\nsite,1000\n"), "text/csv", "tarifs.csv");
    expect(result.text).toContain("service,prix");
  });

  it("JSON (.json)", async () => {
    const result = await extractText(Buffer.from('{"a":1}'), "application/json", "data.json");
    expect(result.text).toContain('{"a":1}');
  });

  it("HTML (.html) : les balises sont retirées", async () => {
    const html = "<html><body><h1>Titre</h1><p>Un paragraphe <b>important</b>.</p></body></html>";
    const result = await extractText(Buffer.from(html), "text/html", "page.html");
    expect(result.text).not.toContain("<h1>");
    expect(result.text).not.toContain("<p>");
    expect(result.text).toContain("Titre");
    expect(result.text).toContain("Un paragraphe");
    expect(result.text).toContain("important");
  });

  it("normalisation : espaces compactés", async () => {
    const result = await extractText(Buffer.from("a    b\t\tc"), "text/plain", "espaces.txt");
    expect(result.text).toBe("a b c");
  });

  it("troncature à 50 000 caractères, annoncée dans le texte", async () => {
    const long = "a".repeat(60_000);
    const result = await extractText(Buffer.from(long), "text/plain", "long.txt");
    expect(result.text.length).toBeGreaterThan(DOCUMENT_MAX_CHARS);
    expect(result.text.length).toBeLessThan(long.length);
    expect(result.text).toContain("tronqué");
  });

  it("extension non prise en charge : contenu vide + raison explicite", async () => {
    const result = await extractText(Buffer.from([1, 2, 3]), "application/zip", "archive.zip");
    expect(result.text).toBe("");
    expect(result.reason).toBeTruthy();
  });

  it("PDF avec texte réel (fixture générée par reportlab) : texte des 2 pages extrait", async () => {
    const buffer = readFileSync(join(FIXTURES, "exemple.pdf"));
    const result = await extractText(buffer, "application/pdf", "exemple.pdf");
    expect(result.reason).toBeUndefined();
    expect(result.text).toContain("Bonjour Jacob");
    expect(result.text).toContain("Conditions generales");
    expect(result.text).toContain("informations complementaires");
  });

  it("PDF sans texte détecté (page blanche, ~scanné) : contenu vide + raison dédiée", async () => {
    const buffer = readFileSync(join(FIXTURES, "scanne.pdf"));
    const result = await extractText(buffer, "application/pdf", "scanne.pdf");
    expect(result.text).toBe("");
    expect(result.reason).toContain("scanné");
  });

  it("PDF corrompu : ne lève jamais, renvoie une raison", async () => {
    const result = await extractText(Buffer.from("pas un vrai pdf"), "application/pdf", "invalide.pdf");
    expect(result.text).toBe("");
    expect(result.reason).toBeTruthy();
  });

  it(".docx (fixture zip réelle, word/document.xml compressé Deflate) : paragraphes, tabulation, entité XML", async () => {
    const buffer = readFileSync(join(FIXTURES, "exemple.docx"));
    const result = await extractText(
      buffer,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "exemple.docx",
    );
    expect(result.reason).toBeUndefined();
    expect(result.text).toContain("Bonjour Jacob");
    expect(result.text).toContain("voici le tarif & les conditions");
    expect(result.text).toContain("fin de ligne");
    expect(result.text).toContain("Deuxieme paragraphe avec accents");
  });

  it(".docx invalide (pas un zip) : ne lève jamais, renvoie une raison", async () => {
    const result = await extractText(Buffer.from("pas un zip"), "", "invalide.docx");
    expect(result.text).toBe("");
    expect(result.reason).toBeTruthy();
  });

  it(".docx « zip bomb » (word/document.xml hautement répétitif) : ne décompresse PAS sans limite — échec propre, pas d'OOM", async () => {
    // Contenu extrêmement répétitif : ratio de compression proche du pire cas
    // deflate. ~20 Mo de zéros compressent à quelques Ko, tout en restant très
    // en-deçà de DOCUMENT_MAX_BYTES (5 Mo, vérifié ailleurs par validateDocumentUpload).
    const xml =
      `<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>` +
      "0".repeat(20_000_000) +
      `</w:t></w:r></w:p></w:body></w:document>`;
    const zip = buildMinimalZip("word/document.xml", Buffer.from(xml, "utf8"));
    expect(zip.length).toBeLessThan(1_000_000); // très en-deçà de 5 Mo compressé

    const result = await extractText(
      zip,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "bombe.docx",
    );
    // `inflateRawSync({ maxOutputLength })` doit refuser AVANT d'allouer ~20 Mo
    // (et a fortiori les ~5 Go possibles avec un fichier de taille maximale) :
    // échec propre annoncé, jamais un crash/OOM du process qui sert aussi le
    // webhook WhatsApp en production.
    expect(result.text).toBe("");
    expect(result.reason).toBeTruthy();
  });
});

describe("core.documents (repo)", () => {
  it("create/get/list (plus récent d'abord)/actifs (ordre d'upload)/update/remove/stamp", () => {
    const core = testCore();
    expect(core.documents.stamp()).toEqual({ n: 0, m: 0 });

    const d1 = core.documents.create({
      nom: "grille.md",
      fichier: "f1.md",
      mime: "text/markdown",
      taille: 100,
      contenu: "contenu 1",
      extractionReason: "",
      note: "note 1",
    });
    const d2 = core.documents.create({
      nom: "conditions.pdf",
      fichier: "f2.pdf",
      mime: "application/pdf",
      taille: 200,
      contenu: "",
      extractionReason: "texte non extrait — colle le contenu dans la note ou envoie un .md",
      note: "note 2",
    });

    // list() : le plus récent d'abord.
    expect(core.documents.list().map((d) => d.id)).toEqual([d2.id, d1.id]);
    // actifs() : ordre d'upload (id ASC) = ordre d'injection dans le prompt.
    expect(core.documents.actifs().map((d) => d.id)).toEqual([d1.id, d2.id]);

    expect(core.documents.get(d2.id)?.extractionReason).toContain("colle le contenu");

    core.documents.update(d1.id, { actif: 0, note: "désactivé" });
    expect(core.documents.actifs().map((d) => d.id)).toEqual([d2.id]);
    expect(core.documents.get(d1.id)?.note).toBe("désactivé");
    // contenu/fichier/mime/taille restent immuables via update() (non exposés dans le patch).
    expect(core.documents.get(d1.id)?.contenu).toBe("contenu 1");

    const stampBefore = core.documents.stamp();
    expect(stampBefore.n).toBe(1); // un seul actif

    expect(core.documents.remove(d2.id)).toBe(true);
    expect(core.documents.remove(999)).toBe(false);
    expect(core.documents.list()).toHaveLength(1);
    core.close();
  });
});
