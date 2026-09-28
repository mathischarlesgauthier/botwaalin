import { describe, expect, it } from "vitest";
import { maskAmounts, PAYMENT_OUTBOUND_RE } from "../src/pricing";
import {
  buildStyleGuide,
  deterministicRejectReason,
  deterministicRejectReasonQuestion,
  reviewExample,
} from "../src/learning";
import { countingLlm, failingLlm, fakeLlm, silentLogger, testCore } from "./helpers";

describe("deterministicRejectReason (§6 — rejet automatique, sans appel LLM)", () => {
  it("ne rejette PLUS un montant : il sera masqué, pas jeté", () => {
    // Une réponse de vendeur cite presque toujours un prix. Les rejeter
    // revenait à n'apprendre quasiment rien de Jacob.
    expect(deterministicRejectReason("C'est 1500 € pour un site vitrine complet.")).toBeNull();
    expect(
      deterministicRejectReason("On peut descendre à environ mille euros pour toi, exceptionnellement."),
    ).toBeNull();
  });

  it("masque les montants, chiffrés comme en toutes lettres, en gardant le reste", () => {
    const masque = maskAmounts("C'est 1500 € pour un site, ou environ mille euros en promo.");
    expect(masque).not.toContain("1500");
    expect(masque).not.toContain("mille euros");
    expect(masque).toContain("pour un site");
    expect(masque).toContain("[prix]");
  });

  it("rejette un lien de paiement", () => {
    expect(deterministicRejectReason("Tu peux payer ici : checkout.stripe.com/pay/xyz merci pour ta confiance")).toMatch(
      /paiement/,
    );
    expect(PAYMENT_OUTBOUND_RE.test("checkout.stripe.com/pay/xyz")).toBe(true);
  });

  it("rejette un IBAN", () => {
    expect(
      deterministicRejectReason("Voici mon IBAN pour le virement, merci de faire vite pour la suite du projet"),
    ).toMatch(/paiement/);
  });

  it("rejette un numéro de téléphone français", () => {
    expect(deterministicRejectReason("Tu peux aussi m'appeler direct au 06 12 34 56 78 si besoin")).toMatch(
      /téléphone/,
    );
  });

  it("rejette une adresse e-mail", () => {
    expect(deterministicRejectReason("Écris-moi plutôt à jacob@arbi-exemple.com pour la suite")).toMatch(/mail/);
  });

  it("rejette une réponse trop courte", () => {
    expect(deterministicRejectReason("Ok merci")).toMatch(/courte/);
  });

  it("rejette une réponse trop longue (> 600 caractères)", () => {
    expect(deterministicRejectReason("a".repeat(601))).toMatch(/longue/);
  });

  it("accepte une réponse normale, sans montant ni coordonnée", () => {
    expect(
      deterministicRejectReason("Oui carrément, on peut faire ça pour toi, dis-moi juste ce que tu veux comme style."),
    ).toBeNull();
  });
});

describe("deterministicRejectReasonQuestion (§6 — la QUESTION du client, verbatim, n'est jamais anonymisée avant l'appel LLM)", () => {
  it("ne rejette PLUS un montant tapé par le client : il est masqué", () => {
    expect(deterministicRejectReasonQuestion("Tu peux me faire ça pour 1500 € ?")).toBeNull();
  });

  it("rejette un numéro de téléphone tapé par le client", () => {
    expect(deterministicRejectReasonQuestion("Rappelle-moi au 06 12 34 56 78 stp")).toMatch(/téléphone/);
  });

  it("rejette une adresse e-mail tapée par le client", () => {
    expect(deterministicRejectReasonQuestion("Tu peux m'écrire à client@exemple.com ?")).toMatch(/mail/);
  });

  it("accepte une question générique, sans donnée personnelle", () => {
    expect(deterministicRejectReasonQuestion("C'est combien pour un site vitrine ?")).toBeNull();
  });
});

describe("reviewExample (§6 — revue LLM des exemples appris)", () => {
  it("une vraie fuite (lien de paiement) ne déclenche AUCUN appel LLM (coût zéro)", async () => {
    const llm = countingLlm("ignoré");
    const result = await reviewExample(
      llm,
      "modele-test",
      {
        question: "Comment je paie ?",
        reponse: "Tu peux régler ici : checkout.stripe.com/pay/xyz, merci à toi.",
        theme: "paiement",
      },
      [],
      silentLogger(),
    );
    expect(result.garder).toBe(false);
    expect(result.motif).toMatch(/paiement/);
    expect(llm.calls).toBe(0);
  });

  it("une fuite dans la QUESTION brute (pas la réponse) rejette aussi sans appel LLM", async () => {
    const llm = countingLlm("ignoré");
    const result = await reviewExample(
      llm,
      "modele-test",
      {
        question: "Rappelle-moi au 06 12 34 56 78 stp",
        reponse: "Oui carrément, je regarde ça avec toi et je te tiens au courant très vite.",
        theme: "",
      },
      [],
      silentLogger(),
    );
    expect(result.garder).toBe(false);
    expect(result.motif).toMatch(/téléphone/);
    expect(llm.calls).toBe(0);
  });

  it("filet déterministe appliqué À NOUVEAU sur la QUESTION reformulée par le LLM (fuite après coup)", async () => {
    const llm = fakeLlm(
      JSON.stringify({
        garder: true,
        motif: "réutilisable",
        question: "Écris-moi à jacob.client@exemple.com pour la suite",
        reponse: "Oui carrément, je te tiens au courant dès que possible.",
        theme: "contact",
      }),
    );
    const result = await reviewExample(
      llm,
      "modele-test",
      { question: "Question initiale propre.", reponse: "Une réponse initiale propre et assez longue pour passer le filtre.", theme: "" },
      [],
      silentLogger(),
    );
    expect(result.garder).toBe(false);
    expect(result.motif).toMatch(/mail/);
  });

  it("un exemple propre passe par le LLM et renvoie la reformulation", async () => {
    const llm = fakeLlm(
      JSON.stringify({
        garder: true,
        motif: "réutilisable",
        question: "Un client demande le délai de livraison.",
        reponse: "Ça dépend du projet, mais on te tient au courant à chaque étape.",
        theme: "delai",
      }),
    );
    const result = await reviewExample(
      llm,
      "modele-test",
      { question: "Salut Jacob, tu peux me dire le délai stp ?", reponse: "Ça dépend du projet, mais on te tient au courant à chaque étape.", theme: "" },
      ["Site vitrine", "Boutique en ligne"],
      silentLogger(),
    );
    expect(result.garder).toBe(true);
    expect(result.theme).toBe("delai");
    expect(result.question).toContain("délai de livraison");
  });

  it("filet déterministe appliqué À NOUVEAU sur la réponse reformulée par le LLM (fuite après coup)", async () => {
    const llm = fakeLlm(
      JSON.stringify({
        garder: true,
        motif: "réutilisable",
        question: "Question générique ?",
        reponse: "Rappelle-moi au 06 12 34 56 78 si besoin d'infos complémentaires.",
        theme: "contact",
      }),
    );
    const result = await reviewExample(
      llm,
      "modele-test",
      { question: "Q ?", reponse: "Une réponse initiale propre et assez longue pour passer le filtre.", theme: "" },
      [],
      silentLogger(),
    );
    expect(result.garder).toBe(false);
    expect(result.motif).toMatch(/téléphone/);
  });

  it("échec de l'appel LLM : l'exception REMONTE (jamais de garder:false silencieux)", async () => {
    const llm = failingLlm();
    await expect(
      reviewExample(
        llm,
        "modele-test",
        { question: "Q ?", reponse: "Une réponse initiale propre et assez longue pour passer le filtre.", theme: "" },
        [],
        silentLogger(),
      ),
    ).rejects.toThrow();
  });
});

describe("buildStyleGuide (§6 — guide de style appris)", () => {
  it("aucun message : renvoie une chaîne vide sans appeler le LLM", async () => {
    const llm = countingLlm("ignoré");
    const guide = await buildStyleGuide(llm, "modele-test", [], silentLogger());
    expect(guide).toBe("");
    expect(llm.calls).toBe(0);
  });

  it("produit une liste de règles à partir des derniers messages", async () => {
    const llm = fakeLlm("- Toujours tutoyer\n- Jamais de point d'exclamation\n- Phrases courtes");
    const guide = await buildStyleGuide(
      llm,
      "modele-test",
      ["Salut, ça marche.", "Ok nickel, je te tiens au courant."],
      silentLogger(),
    );
    expect(guide).toContain("tutoyer");
  });

  it("échec LLM : ne lève jamais, renvoie une chaîne vide", async () => {
    const llm = failingLlm();
    const guide = await buildStyleGuide(llm, "modele-test", ["un message"], silentLogger());
    expect(guide).toBe("");
  });
});

describe("core.examples (repo)", () => {
  it("capture() tronque à 600 caractères et refuse une question vide", () => {
    const core = testCore();
    const id = core.examples.capture({
      waId: "336",
      question: "a".repeat(700),
      reponse: "b".repeat(700),
      messageId: 1,
    });
    expect(id).not.toBeNull();
    const [row] = core.examples.list();
    expect(row?.question.length).toBe(600);
    expect(row?.reponse.length).toBe(600);
    expect(row?.statut).toBe("en_attente");

    expect(core.examples.capture({ waId: "336", question: "   ", reponse: "quelque chose", messageId: 2 })).toBeNull();
    expect(core.examples.list()).toHaveLength(1);
    core.close();
  });

  it("list() filtre par statut, actifs() ne renvoie que 'actif', stamp() ignore 'en_attente'", () => {
    const core = testCore();
    const id1 = core.examples.capture({ waId: "336", question: "Q1", reponse: "R1 assez longue pour passer.", messageId: 1 })!;
    const id2 = core.examples.capture({ waId: "336", question: "Q2", reponse: "R2 assez longue pour passer.", messageId: 2 })!;
    core.examples.setStatut(id1, "actif");
    core.examples.setStatut(id2, "rejete", "montant détecté");

    expect(core.examples.list("actif")).toHaveLength(1);
    expect(core.examples.list("rejete")[0]?.motifRejet).toBe("montant détecté");
    expect(core.examples.actifs()).toHaveLength(1);
    expect(core.examples.stamp().n).toBe(1); // seul l'actif compte, pas le rejeté
    core.close();
  });

  it("list() FIFO pour le timer de revue : { limit, order: 'asc' } trie du plus ancien au plus récent", () => {
    const core = testCore();
    const idA = core.examples.capture({ waId: "336", question: "A", reponse: "Réponse A assez longue.", messageId: 1 })!;
    const idB = core.examples.capture({ waId: "336", question: "B", reponse: "Réponse B assez longue.", messageId: 2 })!;
    const fifo = core.examples.list("en_attente", { limit: 10, order: "asc" });
    expect(fifo.map((r) => r.id)).toEqual([idA, idB]);
    core.close();
  });

  it("removeByMessageId() supprime l'exemple lié à un message", () => {
    const core = testCore();
    core.examples.capture({ waId: "336", question: "Q", reponse: "Réponse assez longue pour passer.", messageId: 42 });
    expect(core.examples.removeByMessageId(42)).toBe(true);
    expect(core.examples.list()).toHaveLength(0);
    expect(core.examples.removeByMessageId(42)).toBe(false); // déjà supprimé
    core.close();
  });
});

describe("core.messages.deleteHuman (§7)", () => {
  it("supprime uniquement un message role='human'", () => {
    const core = testCore();
    const userId = core.messages.insert("336", "user", "Bonjour");
    const humanId = core.messages.insert("336", "human", "Réponse manuelle de Jacob");
    const assistantId = core.messages.insert("336", "assistant", "Réponse du bot");

    expect(core.messages.deleteHuman(userId)).toBe(false);
    expect(core.messages.deleteHuman(assistantId)).toBe(false);
    expect(core.messages.history("336", 10)).toHaveLength(3);

    expect(core.messages.deleteHuman(humanId)).toBe(true);
    expect(core.messages.history("336", 10)).toHaveLength(2);
    expect(core.messages.deleteHuman(humanId)).toBe(false); // déjà supprimé
    core.close();
  });

  it("insert() renvoie l'id AUTOINCREMENT (nécessaire pour capture({ messageId }))", () => {
    const core = testCore();
    const id1 = core.messages.insert("336", "user", "un");
    const id2 = core.messages.insert("336", "human", "deux");
    expect(typeof id1).toBe("number");
    expect(id2).toBeGreaterThan(id1);
    core.close();
  });

  it("suppression en cascade : deleteHuman(id) puis examples.removeByMessageId(id)", () => {
    const core = testCore();
    const humanId = core.messages.insert("336", "human", "Réponse manuelle capturée comme exemple");
    core.examples.capture({
      waId: "336",
      question: "Question du client",
      reponse: "Réponse manuelle capturée comme exemple",
      messageId: humanId,
    });
    expect(core.examples.list()).toHaveLength(1);

    expect(core.messages.deleteHuman(humanId)).toBe(true);
    expect(core.examples.removeByMessageId(humanId)).toBe(true);
    expect(core.examples.list()).toHaveLength(0);
    core.close();
  });

  it("lastHumanMessages() : les N derniers messages 'human', tous contacts confondus", () => {
    const core = testCore();
    core.messages.insert("336a", "user", "question client A");
    core.messages.insert("336a", "human", "réponse A1");
    core.messages.insert("336b", "human", "réponse B1");
    core.messages.insert("336a", "human", "réponse A2");

    const last = core.messages.lastHumanMessages(2);
    expect(last).toHaveLength(2);
    expect(last[0]?.contenu).toBe("réponse A2"); // le plus récent d'abord
    expect(last[1]?.contenu).toBe("réponse B1");
    core.close();
  });
});
