import { describe, expect, it } from "vitest";
import { SalesAgent } from "../src/agent";
import { fakeLlmSeq, fakeWa, makeAnalysis, silentLogger, testAlertDeps, testCore } from "./helpers";

const WA_ID = "33612345678";

function makeAgent(core: ReturnType<typeof testCore>, llm: ReturnType<typeof fakeLlmSeq>) {
  const wa = fakeWa();
  return new SalesAgent({
    core,
    client: llm,
    model: "test-model",
    wa,
    alertDeps: testAlertDeps(core, wa),
    log: silentLogger(),
  });
}

describe("garde anti double réponse", () => {
  it("se tait si l'historique se termine par un tour assistant (message déjà couvert)", async () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    core.messages.insert(WA_ID, "user", "salut");
    core.messages.insert(WA_ID, "assistant", "réponse déjà envoyée qui couvre le message");
    const llm = fakeLlmSeq(["ne devrait jamais être généré"]);
    const agent = makeAgent(core, llm);

    const result = await agent.respond(WA_ID, makeAnalysis());
    expect(result.text).toBeNull();
    expect(llm.calls).toBe(0);
    core.close();
  });

  it("se tait aussi si Jacob (role human) a répondu en dernier", async () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    core.messages.insert(WA_ID, "user", "je veux un devis");
    core.messages.insert(WA_ID, "human", "je m'en occupe");
    const llm = fakeLlmSeq(["nope"]);
    const agent = makeAgent(core, llm);
    expect((await agent.respond(WA_ID, makeAnalysis())).text).toBeNull();
    expect(llm.calls).toBe(0);
    core.close();
  });
});

describe("régénération après nouveau message (commit différé)", () => {
  it("jette la réponse du 1er passage sans polluer l'état (lien de groupe conservé)", async () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    core.messages.insert(WA_ID, "user", "montre-moi des exemples");
    const groupLink = core.settings.get("group_link");
    const replyWithLink = `Regarde le groupe privé : ${groupLink}`;

    const llm = fakeLlmSeq([replyWithLink, replyWithLink], (call) => {
      // Pendant la 1re génération, un nouveau message client arrive.
      if (call === 0) core.messages.insert(WA_ID, "user", "et les tarifs ?");
    });
    const agent = makeAgent(core, llm);
    const result = await agent.respond(WA_ID, makeAnalysis());

    // La réponse retenue (2e passage) contient bien le lien : l'état du
    // passage jeté n'a pas marqué groupLinkSent.
    expect(llm.calls).toBe(2);
    expect(result.text).toContain(groupLink);
    expect(core.state.get(WA_ID).groupLinkSent).toBe(true);
    expect(core.state.get(WA_ID).replyCount).toBe(1);
    core.close();
  });
});

describe("filet anti-encaissement", () => {
  it("bloque un lien PayPal hallucin­é et alerte Jacob", async () => {
    const core = testCore("+33699999999");
    core.contacts.upsert(WA_ID);
    core.messages.insert(WA_ID, "user", "je veux payer maintenant");
    const llm = fakeLlmSeq(["Tu peux régler ici : paypal.me/arbi/750"]);
    const agent = makeAgent(core, llm);

    const result = await agent.respond(WA_ID, makeAnalysis({ intent: "achat" }));
    expect(result.text).not.toContain("paypal");
    // Le client est renvoyé vers le contact direct de Jacob, pas laissé sans suite.
    expect(result.text).toContain(core.settings.get("contact_direct"));
    expect(result.alertFired).toBe(true);
    expect(core.alerts.open()).toHaveLength(1);
    core.close();
  });

  it("bloque un IBAN, laisse passer une mention légitime de Stripe (périmètre)", async () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    core.messages.insert(WA_ID, "user", "ok");
    const llm = fakeLlmSeq([
      "Vire sur FR76 3000 6000 0112 3456 7890 189 merci",
      "Le système de paiement inclut Stripe et PayPal Business, à partir de 750 €.",
    ]);
    const agent = makeAgent(core, llm);

    const blocked = await agent.respond(WA_ID, makeAnalysis());
    expect(blocked.text).not.toContain("FR76");

    core.messages.insert(WA_ID, "user", "et sinon ?");
    const allowed = await agent.respond(WA_ID, makeAnalysis());
    expect(allowed.text).toContain("Stripe");
    core.close();
  });
});

describe("gardes tarifaires par type", () => {
  it("QUOTE jamais chiffré : montant cité pour un service sur devis → blocage + alerte", async () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    core.messages.insert(WA_ID, "user", "combien pour une LLC ?");
    // 2 500 € est un montant autorisé (e-commerce avancé) : seul le contrôle
    // d'association service↔montant peut l'attraper.
    const llm = fakeLlmSeq(["En général ça tourne autour de 2 500 €."]);
    const agent = makeAgent(core, llm);

    const result = await agent.respond(
      WA_ID,
      makeAnalysis({ serviceKey: "societe_llc_usa", categorie: "Société", intent: "tarif" }),
    );
    expect(result.text).toContain(core.settings.get("contact_direct"));
    expect(result.alertFired).toBe(true);
    core.close();
  });

  it("FROM jamais présenté comme final : régénération puis envoi correct", async () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    core.messages.insert(WA_ID, "user", "un site vitrine c'est combien ?");
    const llm = fakeLlmSeq([
      "C'est 750 € tout compris.",
      "C'est à partir de 750 €, le prix final dépend du projet.",
    ]);
    const agent = makeAgent(core, llm);

    const result = await agent.respond(
      WA_ID,
      makeAnalysis({ serviceKey: "site_vitrine", categorie: "Digital", intent: "tarif" }),
    );
    expect(llm.calls).toBe(2);
    expect(result.text).toContain("à partir de 750 €");
    expect(result.alertFired).toBe(false);
    core.close();
  });

  it("une formulation « dès » correcte passe du premier coup", async () => {
    const core = testCore();
    core.contacts.upsert(WA_ID);
    core.messages.insert(WA_ID, "user", "prix d'une boutique ?");
    const llm = fakeLlmSeq(["Les boutiques commencent à 750 €, selon ton projet."]);
    const agent = makeAgent(core, llm);
    const result = await agent.respond(WA_ID, makeAnalysis({ serviceKey: "boutique" }));
    expect(llm.calls).toBe(1);
    expect(result.text).toContain("750 €");
    core.close();
  });
});
