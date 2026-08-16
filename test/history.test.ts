import { describe, expect, it } from "vitest";
import { toAnthropicMessages } from "../src/agent";
import { createDb } from "../src/db";

const WA_ID = "33612345678";

describe("toAnthropicMessages (contraintes API Messages)", () => {
  it("fusionne les rôles consécutifs et commence par un tour user", () => {
    const messages = toAnthropicMessages([
      { role: "assistant", contenu: "orphelin", ts: 1 },
      { role: "user", contenu: "salut", ts: 2 },
      { role: "user", contenu: "je veux un site", ts: 3 },
      { role: "assistant", contenu: "super", ts: 4 },
      { role: "user", contenu: "un vitrine", ts: 5 },
    ]);
    expect(messages).toEqual([
      { role: "user", content: "salut\nje veux un site" },
      { role: "assistant", content: "super" },
      { role: "user", content: "un vitrine" },
    ]);
  });

  it("tronque tout tour assistant final (prefill interdit sur la famille 4.6+)", () => {
    const messages = toAnthropicMessages([
      { role: "user", contenu: "salut", ts: 1 },
      { role: "assistant", contenu: "bonjour !", ts: 2 },
    ]);
    expect(messages).toEqual([{ role: "user", content: "salut" }]);
  });

  it("renvoie [] si l'historique ne contient aucun tour user exploitable", () => {
    expect(
      toAnthropicMessages([{ role: "assistant", contenu: "seul", ts: 1 }]),
    ).toEqual([]);
  });
});

describe("ordre de l'historique en base", () => {
  it("trie par ordre d'insertion même avec des horodatages incohérents (horloge Meta vs serveur)", () => {
    const db = createDb(":memory:");
    db.upsertContact(WA_ID);
    // Message client A (ts Meta = 5000), réponse serveur (Date.now simulé = 6200),
    // puis message client B dont l'horloge Meta tronquée le date AVANT la réponse.
    db.insertMessage(WA_ID, "user", "A", "wamid.a", 5000);
    db.insertMessage(WA_ID, "assistant", "réponse à A", null, 6200);
    db.insertMessage(WA_ID, "user", "B", "wamid.b", 2000);

    const history = db.getHistory(WA_ID);
    expect(history.map((m) => m.contenu)).toEqual(["A", "réponse à A", "B"]);

    // La conversation reconstruite se termine bien par un tour user.
    const messages = toAnthropicMessages(history);
    expect(messages.at(-1)).toEqual({ role: "user", content: "B" });
    db.close();
  });

  it("lastUserMessageId avance à chaque message client, pas sur les réponses", () => {
    const db = createDb(":memory:");
    db.upsertContact(WA_ID);
    expect(db.lastUserMessageId(WA_ID)).toBeNull();
    db.insertMessage(WA_ID, "user", "A");
    const first = db.lastUserMessageId(WA_ID);
    expect(first).not.toBeNull();
    db.insertMessage(WA_ID, "assistant", "réponse");
    expect(db.lastUserMessageId(WA_ID)).toBe(first);
    db.insertMessage(WA_ID, "user", "B");
    expect(db.lastUserMessageId(WA_ID)).toBeGreaterThan(first as number);
    db.close();
  });
});
