import { describe, expect, it } from "vitest";
import type { Core } from "@arbi/core";
import { buildStaticPrompt } from "../src/prompt";
import { executeTool, type ToolContext } from "../src/tools";
import { fakeWa, silentLogger, testCore } from "./helpers";

const WA_ID = "33600000000";

function addFile(core: Core, over: Partial<{ cle: string; nom: string; kind: string }> = {}) {
  core.botFiles.create({
    cle: over.cle ?? "plaquette_tarifs",
    nom: over.nom ?? "Plaquette tarifs",
    description: "Quand le client demande les tarifs détaillés",
    fichier: "abc123.pdf",
    mime: "application/pdf",
    kind: over.kind ?? "document",
    taille: 2048,
  });
}

function ctx(core: Core, wa: ReturnType<typeof fakeWa>, lu: Buffer | null = Buffer.from("x")) {
  return {
    waId: WA_ID,
    core,
    wa,
    alertDeps: {} as ToolContext["alertDeps"],
    readBotFile: async () => lu,
    state: core.state.get(WA_ID),
    log: silentLogger(),
    flags: { alertFired: false, niveau4Sent: false },
    lastClientMessage: "c'est combien ?",
  } as ToolContext;
}

describe("send_file — fichiers envoyables déposés par Jacob", () => {
  it("envoie le fichier, le trace dans la conversation et compte l'envoi", async () => {
    const core = testCore();
    addFile(core);
    const wa = fakeWa();

    const out = await executeTool("send_file", { cle: "plaquette_tarifs" }, ctx(core, wa));
    expect(out).toContain("envoyé au client");

    const envoi = wa.sent.find((s) => s.kind === "media");
    expect(envoi?.mediaKind).toBe("document");
    // Le fichier apparaît dans le fil du back-office comme un message du bot.
    const dernier = core.messages.history(WA_ID, 5).at(-1);
    expect(dernier?.contenu).toBe("[Plaquette tarifs envoyé]");
    expect(dernier?.mediaFile).toBe("abc123.pdf");
    expect(core.botFiles.byCle("plaquette_tarifs")?.envois).toBe(1);
    core.close();
  });

  it("clé inconnue : refus explicite avec la liste des clés valides, aucun envoi", async () => {
    const core = testCore();
    addFile(core);
    const wa = fakeWa();

    const out = await executeTool("send_file", { cle: "inventee" }, ctx(core, wa));
    expect(out).toContain("Fichier inconnu");
    expect(out).toContain("plaquette_tarifs");
    expect(wa.sent.filter((s) => s.kind === "media")).toHaveLength(0);
    core.close();
  });

  it("fichier désactivé : le bot ne peut plus l'envoyer", async () => {
    const core = testCore();
    addFile(core);
    const row = core.botFiles.byCle("plaquette_tarifs")!;
    core.botFiles.toggle(row.id);
    const wa = fakeWa();

    const out = await executeTool("send_file", { cle: "plaquette_tarifs" }, ctx(core, wa));
    expect(out).toContain("Fichier inconnu");
    expect(wa.sent.filter((s) => s.kind === "media")).toHaveLength(0);
    core.close();
  });

  it("fichier disparu du disque : message clair, la conversation continue", async () => {
    const core = testCore();
    addFile(core);
    const wa = fakeWa();

    const out = await executeTool("send_file", { cle: "plaquette_tarifs" }, ctx(core, wa, null));
    expect(out).toContain("Continue sans l'envoyer");
    expect(core.botFiles.byCle("plaquette_tarifs")?.envois).toBe(0);
    core.close();
  });

  it("échec d'envoi WhatsApp : rien n'est compté ni tracé", async () => {
    const core = testCore();
    addFile(core);
    const wa = fakeWa({ media: "http_400" });

    const out = await executeTool("send_file", { cle: "plaquette_tarifs" }, ctx(core, wa));
    expect(out).toContain("Envoi impossible");
    expect(core.botFiles.byCle("plaquette_tarifs")?.envois).toBe(0);
    expect(core.messages.history(WA_ID, 5)).toHaveLength(0);
    core.close();
  });

  it("le prompt liste les fichiers actifs avec leur clé et leur description", () => {
    const core = testCore();
    addFile(core);
    addFile(core, { cle: "demo_video", nom: "Démo", kind: "video" });
    const actifs = core.botFiles.actifs();

    const prompt = buildStaticPrompt("", [], [], [], "", "autonome", actifs);
    expect(prompt).toContain("Fichiers envoyables");
    expect(prompt).toContain("[plaquette_tarifs] Plaquette tarifs");
    expect(prompt).toContain("Quand le client demande les tarifs détaillés");
    expect(prompt).toContain("[demo_video]");
    core.close();
  });

  it("aucun fichier : pas de section parasite dans le prompt", () => {
    const prompt = buildStaticPrompt("", [], [], [], "", "autonome", []);
    expect(prompt).not.toContain("Fichiers envoyables");
  });
});
