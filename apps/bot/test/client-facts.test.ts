import { describe, expect, it } from "vitest";
import { SalesAgent } from "../src/agent";
import { createHandler } from "../src/handler";
import { buildDynamicContext } from "../src/prompt";
import { fakeLlm, fakeLlmSeq, fakeWa, silentLogger, testAlertDeps, testCore } from "./helpers";

const WA_ID = "33612345678";

// Le throttle de l'extraction (§5) vit dans une Map au niveau module de
// handler.ts (mémoire du process, volontairement PAS remise à zéro entre les
// tests d'un même fichier) : chaque test qui en dépend utilise son propre
// waId pour ne pas hériter du throttle posé par un test précédent.
let waIdCounter = 0;
function freshWaId(): string {
  waIdCounter += 1;
  return `336${String(waIdCounter).padStart(9, "0")}`;
}

describe("buildDynamicContext — mémoire client (§5)", () => {
  it("n'ajoute rien sans faits actifs", () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    const state = core.state.get(WA_ID);
    const dynamic = buildDynamicContext(state, "https://t.me/x", "@Jacob13013", []);
    expect(dynamic).not.toContain("Ce que tu sais déjà de ce client");
    core.close();
  });

  it("injecte les faits actifs, séparés par « · », juste après le registre détecté", () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    const state = core.state.get(WA_ID);
    core.facts.add(WA_ID, "Gère une boutique de vêtements en ligne", "bot");
    core.facts.add(WA_ID, "Cherche un logo pour sa marque", "jacob");
    const facts = core.facts.actifs(WA_ID, 10);

    const dynamic = buildDynamicContext(state, "https://t.me/x", "@Jacob13013", facts);

    expect(dynamic).toContain(
      "- Ce que tu sais déjà de ce client (mémoire) : Cherche un logo pour sa marque · Gère une boutique de vêtements en ligne",
    );
    expect(dynamic).toContain("Utilise-le naturellement, ne redemande jamais une information déjà connue");

    const registreIndex = dynamic.indexOf("Registre détecté du client");
    const memoireIndex = dynamic.indexOf("Ce que tu sais déjà de ce client");
    expect(registreIndex).toBeGreaterThanOrEqual(0);
    expect(registreIndex).toBeLessThan(memoireIndex);
    core.close();
  });

  it("ne contient JAMAIS de données de client_facts dans le prompt STATIQUE (buildStaticPrompt)", async () => {
    // Garde-fou contre un refactor futur qui déplacerait `facts` (données
    // personnelles d'UN client) vers le prompt statique caché et partagé.
    const { buildStaticPrompt } = await import("../src/prompt");
    const core = testCore();
    core.contacts.upsert(WA_ID);
    core.facts.add(WA_ID, "Fait personnel très spécifique à ce client précis", "bot");
    const prompt = buildStaticPrompt(core.catalogue.current().contenu, core.pricing.active());
    expect(prompt).not.toContain("Fait personnel très spécifique à ce client précis");
    core.close();
  });
});

describe("mémoire client — garde-fou de coût de l'extraction en tâche de fond (§5)", () => {
  function makeHandler(core: ReturnType<typeof testCore>, extractionLlm: ReturnType<typeof fakeLlmSeq>) {
    const wa = fakeWa();
    const agent = new SalesAgent({
      core,
      client: fakeLlm("Bien reçu, je regarde ça."),
      model: "test-model",
      wa,
      alertDeps: testAlertDeps(core, wa),
      log: silentLogger(),
    });
    const handle = createHandler({
      core,
      wa,
      agent,
      alertDeps: testAlertDeps(core, wa),
      log: silentLogger(),
      llm: extractionLlm,
      model: "test-model",
    });
    return { handle, wa };
  }

  it("ne se déclenche PAS quand la conversation n'a pas progressé (simple accusé de réception)", async () => {
    const waId = freshWaId();
    const core = testCore();
    core.contacts.upsert(waId);
    const extractionLlm = fakeLlmSeq(["fait extrait"]);
    const { handle } = makeHandler(core, extractionLlm);

    core.messages.insert(waId, "user", "ok");
    await handle(waId, [{ text: "ok" }]);

    expect(extractionLlm.calls).toBe(0);
    core.close();
  });

  it("se déclenche une fois quand la conversation progresse", async () => {
    const waId = freshWaId();
    const core = testCore();
    core.contacts.upsert(waId);
    const extractionLlm = fakeLlmSeq(["Le client gère une boutique en ligne."]);
    const { handle } = makeHandler(core, extractionLlm);

    // Comme en prod (server.ts), le message entrant est inséré AVANT d'invoquer
    // le handler : sans cette ligne, extractClientFacts recevrait un transcript
    // vide et ne déclencherait jamais l'appel LLM.
    core.messages.insert(waId, "user", "Je veux un site vitrine, budget max 2000 €");
    await handle(waId, [{ text: "Je veux un site vitrine, budget max 2000 €" }]);

    expect(extractionLlm.calls).toBe(1);
    core.close();
  });

  it("ne se déclenche pas deux fois de suite pour le même contact (throttle 10 min)", async () => {
    const waId = freshWaId();
    const core = testCore();
    core.contacts.upsert(waId);
    const extractionLlm = fakeLlmSeq(["fait 1", "fait 2"]);
    const { handle } = makeHandler(core, extractionLlm);

    // Premier message : progresse (nouveau service + budget) → déclenche.
    core.messages.insert(waId, "user", "Je veux un site vitrine, budget max 2000 €");
    await handle(waId, [{ text: "Je veux un site vitrine, budget max 2000 €" }]);
    expect(extractionLlm.calls).toBe(1);

    // Deuxième message, quelques instants plus tard : progresse à nouveau
    // (nouveau service détecté) mais le throttle de 10 minutes bloque le
    // second appel — le coût ne doit pas doubler à chaque message.
    core.messages.insert(waId, "user", "Je cherche un agent.");
    await handle(waId, [{ text: "Je cherche un agent." }]);
    expect(extractionLlm.calls).toBe(1);
    core.close();
  });

  it("ne se déclenche jamais si llm/model ne sont pas fournis à createHandler (désactivation propre)", async () => {
    const waId = freshWaId();
    const core = testCore();
    core.contacts.upsert(waId);
    const wa = fakeWa();
    const agent = new SalesAgent({
      core,
      client: fakeLlm("Bien reçu."),
      model: "test-model",
      wa,
      alertDeps: testAlertDeps(core, wa),
      log: silentLogger(),
    });
    // Pas de `llm`/`model` dans les deps (comme les tests existants du handler).
    const handle = createHandler({ core, wa, agent, alertDeps: testAlertDeps(core, wa), log: silentLogger() });

    core.messages.insert(waId, "user", "Je veux un site vitrine, budget max 2000 €");
    await expect(
      handle(waId, [{ text: "Je veux un site vitrine, budget max 2000 €" }]),
    ).resolves.toBeUndefined();
    core.close();
  });
});

describe("ordre des gardes du handler — inchangé par l'ajout de la mémoire client", () => {
  it("mode humain reste totalement muet, y compris pour l'extraction en tâche de fond", async () => {
    const waId = freshWaId();
    const core = testCore();
    core.contacts.upsert(waId);
    core.contacts.setModeHumain(waId, true);
    const wa = fakeWa();
    const agent = new SalesAgent({
      core,
      client: fakeLlm("Ne devrait jamais être appelé."),
      model: "test-model",
      wa,
      alertDeps: testAlertDeps(core, wa),
      log: silentLogger(),
    });
    const extractionLlm = fakeLlmSeq(["fait"]);
    const handle = createHandler({
      core,
      wa,
      agent,
      alertDeps: testAlertDeps(core, wa),
      log: silentLogger(),
      llm: extractionLlm,
      model: "test-model",
    });

    core.messages.insert(waId, "user", "Je veux un site vitrine, budget max 2000 €");
    await handle(waId, [{ text: "Je veux un site vitrine, budget max 2000 €" }]);

    expect(wa.sent).toHaveLength(0);
    expect(extractionLlm.calls).toBe(0);
    core.close();
  });
});
