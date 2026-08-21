import { describe, expect, it } from "vitest";
import { analyzeInbound } from "../src/brain";
import { buildDynamicContext } from "../src/prompt";
import { testCore } from "./helpers";

const WA_ID = "33612345678";

describe("mémoire contextuelle — cas obligatoire « agent → casquettes → prix »", () => {
  it("comprend que « les prix » porte sur les agents China Accès, pas sur le catalogue entier", () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    const state = core.state.get(WA_ID);

    // « Je cherche un agent. »
    const a1 = analyzeInbound(core, state, ["Je cherche un agent."], 3);
    expect(state.serviceEnCours).toBe("china_acces_agents");
    expect(a1.categorie).toBe("China");
    core.state.save(state);

    // « Des casquettes. » — précision produit, le service reste China Accès.
    const state2 = core.state.get(WA_ID);
    analyzeInbound(core, state2, ["Des casquettes."], 3);
    expect(state2.serviceEnCours).toBe("china_acces_agents");
    expect(state2.sousCategorie).toContain("casquettes");
    core.state.save(state2);

    // « Et les prix ? » — l'intention tarif est rattachée au service en cours.
    const state3 = core.state.get(WA_ID);
    const a3 = analyzeInbound(core, state3, ["Et les prix ?"], 3);
    expect(a3.intent).toBe("tarif");
    expect(a3.serviceKey).toBe("china_acces_agents");
    expect(a3.categorie).toBe("China");
    expect(a3.route).toBe("agent");

    // Le contexte injecté dans le prompt mentionne explicitement le service.
    const dynamic = buildDynamicContext(state3, "https://t.me/x", "@Jacob13013");
    expect(dynamic).toContain("china_acces_agents");
    expect(dynamic).toContain("porte sur CE service");
    core.close();
  });

  it("ne redemande jamais une info déjà donnée (budget mémorisé)", () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    const state = core.state.get(WA_ID);
    analyzeInbound(core, state, ["Je veux un site vitrine, budget max 2000 €"], 3);
    expect(state.serviceEnCours).toBe("site_vitrine");
    expect(state.budget).toContain("2000");
    const dynamic = buildDynamicContext(state, "https://t.me/x", "@Jacob13013");
    expect(dynamic).toContain("ne pas redemander");
    core.close();
  });

  it("tolère fautes de frappe et absence d'accents dans la résolution de service", () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    const state = core.state.get(WA_ID);
    analyzeInbound(core, state, ["je veu une boutiqe en ligne"], 3);
    expect(state.serviceEnCours).toBe("boutique");
    core.close();
  });

  it("routeur niveau 4 : demande explicite d'un humain", () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    const state = core.state.get(WA_ID);
    const a = analyzeInbound(core, state, ["Je veux parler à un humain s'il te plaît"], 3);
    expect(a.intent).toBe("demande_humain");
    expect(a.route).toBe("niveau4");
    core.close();
  });
});
