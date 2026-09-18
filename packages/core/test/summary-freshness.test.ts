import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Core } from "../src";
import { testCore } from "./helpers";

const WA_ID = "33600000000";

let core: Core;

beforeEach(() => {
  core = testCore();
});

afterEach(() => {
  core.close();
});

describe("fraîcheur du résumé de conversation", () => {
  it("conversation vide : aucun message, donc rien à résumer", () => {
    expect(core.messages.lastMessageId(WA_ID)).toBe(0);
    expect(core.state.get(WA_ID).resumeMessageId).toBe(0);
  });

  it("setResume mémorise le dernier message couvert", () => {
    core.messages.insert(WA_ID, "user", "salut");
    const dernier = core.messages.lastMessageId(WA_ID);
    core.state.setResume(WA_ID, "Client : curieux", dernier);

    const state = core.state.get(WA_ID);
    expect(state.resume).toBe("Client : curieux");
    expect(state.resumeMessageId).toBe(dernier);
    // À jour tant qu'aucun message n'est arrivé après.
    expect(core.messages.lastMessageId(WA_ID) > state.resumeMessageId).toBe(false);
  });

  it("un nouveau message rend le résumé périmé", () => {
    core.messages.insert(WA_ID, "user", "salut");
    core.state.setResume(WA_ID, "Client : curieux", core.messages.lastMessageId(WA_ID));
    core.messages.insert(WA_ID, "assistant", "bonjour !");

    const state = core.state.get(WA_ID);
    expect(core.messages.lastMessageId(WA_ID) > state.resumeMessageId).toBe(true);
  });

  it("lastMessageId compte tous les rôles, pas seulement le client", () => {
    core.messages.insert(WA_ID, "user", "salut");
    const apresClient = core.messages.lastMessageId(WA_ID);
    core.messages.insert(WA_ID, "human", "réponse de Jacob");
    expect(core.messages.lastMessageId(WA_ID)).toBeGreaterThan(apresClient);
  });

  it("un save du bot n'écrase ni le résumé ni son marqueur (course inter-processus)", () => {
    core.messages.insert(WA_ID, "user", "salut");
    const dernier = core.messages.lastMessageId(WA_ID);
    core.state.setResume(WA_ID, "Résumé calculé par le dashboard", dernier);

    // Le bot sauvegarde son état vivant, sans rien savoir du résumé.
    const state = core.state.get(WA_ID);
    core.state.save({ ...state, besoin: "un volant", replyCount: 3, resume: "", resumeMessageId: 0 });

    const apres = core.state.get(WA_ID);
    expect(apres.resume).toBe("Résumé calculé par le dashboard");
    expect(apres.resumeMessageId).toBe(dernier);
    expect(apres.besoin).toBe("un volant");
    expect(apres.replyCount).toBe(3);
  });

  it("setResume sur une conversation sans état ne perd rien de l'état vivant ensuite", () => {
    core.state.setResume(WA_ID, "Premier résumé", 7);
    const state = core.state.get(WA_ID);
    core.state.save({ ...state, besoin: "un site" });

    const apres = core.state.get(WA_ID);
    expect(apres.resume).toBe("Premier résumé");
    expect(apres.resumeMessageId).toBe(7);
    expect(apres.besoin).toBe("un site");
  });
});
