import { describe, expect, it } from "vitest";
import { extractClientFacts } from "../src/memory";
import { failingLlm, fakeLlm, silentLogger } from "./helpers";

describe("extractClientFacts (§5 — extraction automatique des faits durables)", () => {
  it("transcript vide : renvoie [] sans appeler le LLM", async () => {
    const llm = fakeLlm("ignoré");
    const facts = await extractClientFacts(llm, "modele-test", "   ", [], silentLogger());
    expect(facts).toEqual([]);
  });

  it("découpe la réponse du LLM en une liste de faits, une ligne par fait", async () => {
    const llm = fakeLlm("- Gère une boutique Vinted\n- Cherche un site vitrine pour son activité");
    const facts = await extractClientFacts(
      llm,
      "modele-test",
      "Client : Je gère une boutique Vinted, je veux un site vitrine.",
      [],
      silentLogger(),
    );
    expect(facts).toEqual(["Gère une boutique Vinted", "Cherche un site vitrine pour son activité"]);
  });

  it("lignes vides ignorées, numérotation/tirets retirés", async () => {
    const llm = fakeLlm("1. Premier fait\n\n2) Deuxième fait\n");
    const facts = await extractClientFacts(llm, "modele-test", "conversation", [], silentLogger());
    expect(facts).toEqual(["Premier fait", "Deuxième fait"]);
  });

  it("échec de l'appel LLM : ne lève JAMAIS, renvoie []", async () => {
    const llm = failingLlm();
    const facts = await extractClientFacts(llm, "modele-test", "conversation", [], silentLogger());
    expect(facts).toEqual([]);
  });
});
