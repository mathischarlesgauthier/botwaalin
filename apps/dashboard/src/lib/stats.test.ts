import { createCore, type Core } from "@arbi/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countQuestionsWithoutTopic, groupQuestionsByTopic } from "./stats";

let core: Core;

beforeEach(() => {
  core = createCore({ dbPath: ":memory:" });
});

afterEach(() => {
  core.close();
});

function record(texte: string, categorie = "Digital", repondue = true): number {
  core.questions.record({
    waId: "33600000000",
    texte,
    normalise: texte.toLowerCase(),
    intention: "tarif",
    categorie,
    repondue,
  });
  return core.questions.all(1)[0]!.id;
}

describe("groupQuestionsByTopic — vue thématique des questions", () => {
  it("base vide : aucun sujet, rien à classer", () => {
    expect(groupQuestionsByTopic(core)).toEqual([]);
    expect(countQuestionsWithoutTopic(core)).toBe(0);
  });

  it("ignore les questions pas encore classées, et les compte à part", () => {
    record("combien coûte un site ?");
    expect(groupQuestionsByTopic(core)).toEqual([]);
    expect(countQuestionsWithoutTopic(core)).toBe(1);
  });

  it("agrège occurrences, sans-réponse et catégorie dominante par sujet", () => {
    const a = record("combien coûte un site ?", "Digital");
    const b = record("c'est quel prix la LLC ?", "Créa société", false);
    const c = record("vous livrez quand ?", "Digital");
    core.questions.setTopic(a, "Tarifs et devis");
    core.questions.setTopic(b, "Tarifs et devis");
    core.questions.setTopic(c, "Délais de livraison");

    const groups = groupQuestionsByTopic(core);
    expect(groups.map((g) => g.sujet)).toEqual(["Tarifs et devis", "Délais de livraison"]);
    const tarifs = groups[0]!;
    expect(tarifs.count).toBe(2);
    expect(tarifs.sansReponse).toBe(1);
    expect(tarifs.exemples).toHaveLength(2);
    expect(countQuestionsWithoutTopic(core)).toBe(0);
  });

  it("regroupe les formulations identiques en un exemple compté", () => {
    const a = record("c'est combien ?");
    const b = record("c'est combien ?");
    core.questions.setTopic(a, "Tarifs et devis");
    core.questions.setTopic(b, "Tarifs et devis");

    const groups = groupQuestionsByTopic(core);
    expect(groups[0]!.count).toBe(2);
    expect(groups[0]!.exemples).toEqual([{ texte: "c'est combien ?", count: 2 }]);
  });

  it("reclasser écrase le sujet d'une question déjà classée", () => {
    const a = record("c'est combien ?");
    core.questions.setTopic(a, "Divers");
    expect(groupQuestionsByTopic(core).map((g) => g.sujet)).toEqual(["Divers"]);

    core.questions.setTopic(a, "Tarifs et devis");
    expect(groupQuestionsByTopic(core).map((g) => g.sujet)).toEqual(["Tarifs et devis"]);
    expect(countQuestionsWithoutTopic(core)).toBe(0);
  });

  it("knownTopics classe les sujets du plus fréquent au plus rare", () => {
    const ids = [record("q1"), record("q2"), record("q3")];
    core.questions.setTopic(ids[0]!, "Délais de livraison");
    core.questions.setTopic(ids[1]!, "Tarifs et devis");
    core.questions.setTopic(ids[2]!, "Tarifs et devis");
    expect(core.questions.knownTopics()).toEqual(["Tarifs et devis", "Délais de livraison"]);
  });
});
