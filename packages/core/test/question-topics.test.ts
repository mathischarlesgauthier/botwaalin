import { describe, expect, it } from "vitest";
import { classifyQuestionTopics } from "../src/llm";
import { fakeLlm, failingLlm, silentLogger } from "./helpers";

const QUESTIONS = [
  { id: 1, texte: "combien coûte un volant Megane 3RS ?" },
  { id: 2, texte: "vous livrez en combien de temps sur Marseille ?" },
];

describe("classifyQuestionTopics — un sujet général, pas la question exacte", () => {
  it("attribue le sujet renvoyé par le LLM à chaque question", async () => {
    const llm = fakeLlm("1 = Tarifs et devis\n2 = Délais de livraison");
    const topics = await classifyQuestionTopics(llm, "m", QUESTIONS, [], silentLogger());
    expect(topics.get(1)).toBe("Tarifs et devis");
    expect(topics.get(2)).toBe("Délais de livraison");
  });

  it("nettoie la réponse : puces, guillemets, point d'interrogation, majuscule", async () => {
    const llm = fakeLlm('- [1] = « tarifs et devis ? »\n2: délais de livraison.');
    const topics = await classifyQuestionTopics(llm, "m", QUESTIONS, [], silentLogger());
    expect(topics.get(1)).toBe("Tarifs et devis");
    expect(topics.get(2)).toBe("Délais de livraison");
  });

  it("ignore un id qui n'était pas dans le lot (hallucination)", async () => {
    const llm = fakeLlm("999 = Sujet inventé");
    const topics = await classifyQuestionTopics(llm, "m", QUESTIONS, [], silentLogger());
    expect(topics.size).toBe(0);
  });

  it("accepte les mises en forme spontanées du modèle (gras, liste numérotée)", async () => {
    const llm = fakeLlm("**1** = Tarifs et devis\n2. Délais de livraison");
    const topics = await classifyQuestionTopics(llm, "m", QUESTIONS, [], silentLogger());
    expect(topics.get(1)).toBe("Tarifs et devis");
    expect(topics.get(2)).toBe("Délais de livraison");
  });

  it("garde un sujet qui commence par un chiffre", async () => {
    const llm = fakeLlm("1 = 3D et impression\n2 = 4x4 et utilitaires");
    const topics = await classifyQuestionTopics(llm, "m", QUESTIONS, [], silentLogger());
    expect(topics.get(1)).toBe("3D et impression");
    expect(topics.get(2)).toBe("4x4 et utilitaires");
  });

  it("ignore les lignes hors format au lieu de les prendre pour des sujets", async () => {
    const llm = fakeLlm("Voici le classement :\n1 = Tarifs et devis\nMerci !");
    const topics = await classifyQuestionTopics(llm, "m", QUESTIONS, [], silentLogger());
    expect([...topics.entries()]).toEqual([[1, "Tarifs et devis"]]);
  });

  it("LLM en panne : aucun sujet écrit (l'appelant garde son repli lexical)", async () => {
    const topics = await classifyQuestionTopics(
      failingLlm(),
      "m",
      QUESTIONS,
      ["Tarifs et devis"],
      silentLogger(),
    );
    expect(topics.size).toBe(0);
  });

  it("liste vide : aucun appel LLM nécessaire", async () => {
    const topics = await classifyQuestionTopics(failingLlm(), "m", [], [], silentLogger());
    expect(topics.size).toBe(0);
  });
});
