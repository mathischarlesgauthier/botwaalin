import { describe, expect, it } from "vitest";
import { toAnthropicMessages } from "../src/agent";
import { testCore } from "./helpers";

const WA_ID = "33612345678";

describe("toAnthropicMessages (contraintes API Messages)", () => {
  it("fusionne les rôles consécutifs et commence par un tour user", () => {
    const messages = toAnthropicMessages([
      { role: "assistant", contenu: "orphelin" },
      { role: "user", contenu: "salut" },
      { role: "user", contenu: "je veux un site" },
      { role: "assistant", contenu: "super" },
      { role: "user", contenu: "un vitrine" },
    ]);
    expect(messages).toEqual([
      { role: "user", content: "salut\nje veux un site" },
      { role: "assistant", content: "super" },
      { role: "user", content: "un vitrine" },
    ]);
  });

  it("tronque tout tour assistant final (prefill interdit)", () => {
    expect(
      toAnthropicMessages([
        { role: "user", contenu: "salut" },
        { role: "assistant", contenu: "bonjour !" },
      ]),
    ).toEqual([{ role: "user", content: "salut" }]);
  });

  it("les messages de Jacob (role human) apparaissent côté assistant, préfixés", () => {
    const messages = toAnthropicMessages([
      { role: "user", contenu: "je veux un devis" },
      { role: "human", contenu: "Je te prépare ça ce soir" },
      { role: "user", contenu: "merci !" },
    ]);
    expect(messages).toEqual([
      { role: "user", content: "je veux un devis" },
      { role: "assistant", content: "[Réponse de Jacob] Je te prépare ça ce soir" },
      { role: "user", content: "merci !" },
    ]);
  });
});

describe("ordre de l'historique en base", () => {
  it("trie par ordre d'insertion même avec des horodatages incohérents", () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    core.messages.insert(WA_ID, "user", "A", "wamid.a", 5000);
    core.messages.insert(WA_ID, "assistant", "réponse à A", null, 6200);
    core.messages.insert(WA_ID, "user", "B", "wamid.b", 2000);

    const history = core.messages.history(WA_ID);
    expect(history.map((m) => m.contenu)).toEqual(["A", "réponse à A", "B"]);
    expect(toAnthropicMessages(history).at(-1)).toEqual({ role: "user", content: "B" });
    core.close();
  });

  it("lastUserMessageId avance sur les messages client uniquement", () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    expect(core.messages.lastUserMessageId(WA_ID)).toBeNull();
    core.messages.insert(WA_ID, "user", "A");
    const first = core.messages.lastUserMessageId(WA_ID);
    core.messages.insert(WA_ID, "assistant", "réponse");
    core.messages.insert(WA_ID, "human", "coucou c'est Jacob");
    expect(core.messages.lastUserMessageId(WA_ID)).toBe(first);
    core.messages.insert(WA_ID, "user", "B");
    expect(core.messages.lastUserMessageId(WA_ID)).toBeGreaterThan(first as number);
    core.close();
  });
});
