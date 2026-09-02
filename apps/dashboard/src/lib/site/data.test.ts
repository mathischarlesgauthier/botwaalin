import { createCore, type Core } from "@arbi/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeSiteContent, renderTemplate } from "./content";
import { buildSiteData, createTemplateContext } from "./data";
import { DEFAULT_SITE_CONTENT } from "./defaults";
import { formatPhoneFr, inkOf, priceShort, slugify, telegramHref, waHref } from "./format";

let core: Core;

beforeEach(() => {
  core = createCore({ dbPath: ":memory:" });
});

afterEach(() => {
  core.close();
});

function addService(input: {
  serviceKey: string;
  label: string;
  categorie: string;
  type?: string;
  prixMin?: number | null;
}) {
  core.pricing.create({
    serviceKey: input.serviceKey,
    label: input.label,
    categorie: input.categorie,
    type: input.type ?? "FROM",
    prixMin: input.prixMin ?? 900,
    prixMax: null,
    unite: "",
    perimetre: "Un, deux, trois",
    affichage: null,
    actif: 1,
  });
}

describe("buildSiteData — pôles", () => {
  it("expose les 5 pôles du design, dans l'ordre, avec les bons slugs", () => {
    const data = buildSiteData(core);
    expect(data.poles.map((p) => p.slug)).toEqual([
      "ghost-studio",
      "trafic-pro",
      "china-acces",
      "vinted-pro",
      "societes",
    ]);
    expect(data.poles.map((p) => p.num)).toEqual(["01", "02", "03", "04", "05"]);
    expect(data.poles.map((p) => p.id)).toEqual([
      "digital",
      "trafic_pro",
      "china_acces",
      "vinted_pro",
      "crea_societe",
    ]);
    expect(data.hero.rail).toEqual(["01", "03", "05"]);
    expect(data.hero.bigNum).toBe("05");
    expect(data.findPole("ghost-studio")?.id).toBe("digital");
    expect(data.findPole("crea_societe")?.slug).toBe("societes");
    expect(data.findPole("inconnu")).toBeUndefined();
  });

  it("Ghost Studio : 8 groupes, 36 services, les QUOTE en « sur devis »", () => {
    const data = buildSiteData(core);
    const ghost = data.findPole("ghost-studio");
    expect(ghost).toBeDefined();
    if (!ghost) return;
    expect(ghost.groups).toHaveLength(8);
    expect(ghost.services).toHaveLength(36);
    expect(ghost.groups.map((g) => g.name)).toEqual([
      "SITES INTERNET",
      "E-COMMERCE",
      "CRÉATION DE MARQUE",
      "GRAPHISME",
      "APPLICATIONS",
      "IA & BOTS",
      "DATA & API",
      "JEUX & INFRASTRUCTURE",
    ]);
    const quote = ghost.services.filter((s) => s.priceShort === "sur devis").map((s) => s.key);
    expect(quote.sort()).toEqual(["automatisation_avancee", "infra_critical"]);
    expect(data.findService(ghost, "site-vitrine")?.key).toBe("site_vitrine");
    expect(data.findService(ghost, "site_vitrine")?.href).toBe("/offres/ghost-studio/site-vitrine");
    expect(ghost.color).toBe("#FF6A2B");
    expect(ghost.ink).toBe("#C24300");
    expect(ghost.process).toHaveLength(6);
    expect(ghost.process[0]?.n).toBe("01");
  });

  it("Trafic Pro : prix court « 1 100 € » et prix long = affichage", () => {
    const data = buildSiteData(core);
    const pole = data.findPole("trafic-pro");
    expect(pole?.services).toHaveLength(1);
    const trafic = pole?.services[0];
    expect(trafic?.priceShort).toBe("1 100 €");
    expect(trafic?.priceLong).toBe("1 100 € comptant, ou 1 500 € en 4 fois");
    expect(trafic?.affichage).toBe("1 100 € comptant, ou 1 500 € en 4 fois");
    expect(pole?.from).toBe("1 100 €");
    expect(pole?.sub.startsWith("1 100 €.")).toBe(true);
  });

  it("prix de départ : calculé pour Ghost Studio, override du seed pour China Accès", () => {
    const data = buildSiteData(core);
    expect(data.findPole("ghost-studio")?.from).toBe("dès 50 €");
    expect(data.findPole("china-acces")?.from).toBe("sur demande");
    expect(data.findPole("vinted-pro")?.from).toBe("300 €");
    expect(data.findPole("societes")?.from).toBe("sur devis");
  });

  it("stats : tarif minimum global et nombre de pôles", () => {
    const data = buildSiteData(core);
    expect(data.stats.minPrice).toBe("50 €");
    expect(data.stats.poleCount).toBe(5);
    expect(data.stats.serviceCount).toBe(data.services.length);
    expect(data.content.hero.sub.startsWith("5 pôles,")).toBe(true);
  });

  it("un pôle sans service actif disparaît", () => {
    core.pricing.update("china_acces_formation", { actif: 0 });
    core.pricing.update("china_acces_agents", { actif: 0 });
    const data = buildSiteData(core);
    expect(data.findPole("china-acces")).toBeUndefined();
    expect(data.stats.poleCount).toBe(4);
    expect(data.poles.map((p) => p.num)).toEqual(["01", "02", "03", "04"]);
    expect(data.content.hero.sub.startsWith("4 pôles,")).toBe(true);
  });
});

describe("buildSiteData — services", () => {
  it("désactiver un service le retire du site et vide sa balise", () => {
    core.pricing.update("logo", { actif: 0 });
    const data = buildSiteData(core);
    expect(data.services.some((s) => s.key === "logo")).toBe(false);
    const ghost = data.findPole("ghost-studio");
    expect(ghost?.services).toHaveLength(35);
    expect(ghost?.groups.find((g) => g.name === "GRAPHISME")?.services.map((s) => s.key)).toEqual([
      "filtre",
      "flyer",
    ]);
    // La balise {{price:logo}} du sous-titre est vidée proprement.
    expect(ghost?.sub.startsWith("Un logo , ")).toBe(false);
    expect(ghost?.sub.startsWith("Un logo, un site vitrine dès 750 €")).toBe(true);
    // Le minimum global suit (logo à 50 € retiré, filtre à 50 € reste).
    expect(data.stats.minPrice).toBe("50 €");
  });

  it("une catégorie inconnue crée un pôle virtuel", () => {
    addService({ serviceKey: "wallet_crypto", label: "Wallet crypto", categorie: "Crypto" });
    const data = buildSiteData(core);
    expect(data.stats.poleCount).toBe(6);
    const crypto = data.findPole("crypto");
    expect(crypto).toBeDefined();
    expect(crypto?.virtual).toBe(true);
    expect(crypto?.num).toBe("06");
    expect(crypto?.title).toBe("Crypto");
    expect(crypto?.nameA).toBe("Crypto");
    expect(crypto?.services.map((s) => s.key)).toEqual(["wallet_crypto"]);
    expect(crypto?.groups.map((g) => g.name)).toEqual(["CRYPTO"]);
    expect(crypto?.from).toBe("dès 900 €");
    expect(crypto?.href).toBe("/offres/crypto");
    expect(data.content.hero.sub.startsWith("6 pôles,")).toBe(true);
    const service = crypto?.services[0];
    expect(service?.bullets).toEqual(["Un", "deux", "trois"]);
    expect(service?.desc).toBe("Un, deux, trois");
    expect(service?.href).toBe("/offres/crypto/wallet-crypto");
  });

  it("le pied de page liste les pôles affichés dynamiquement", () => {
    expect(buildSiteData(core).content.footer.line).toBe(
      "Arbi Jacob — Ghost Studio, Trafic Pro, China Accès, Vinted Pro, Sociétés à l'international.",
    );
    addService({ serviceKey: "wallet_crypto", label: "Wallet crypto", categorie: "Crypto Académie" });
    expect(buildSiteData(core).content.footer.line).toBe(
      "Arbi Jacob — Ghost Studio, Trafic Pro, China Accès, Vinted Pro, Sociétés à l'international, Crypto Académie.",
    );
  });

  it("catégorie « Trafic-Pro » : pôle virtuel au slug distinct du pôle déclaré, service atteignable", () => {
    addService({ serviceKey: "coaching_ads", label: "Coaching Ads", categorie: "Trafic-Pro" });
    const data = buildSiteData(core);
    expect(data.stats.poleCount).toBe(6);
    expect(new Set(data.poles.map((p) => p.slug)).size).toBe(6);
    const declared = data.findPole("trafic-pro");
    expect(declared?.id).toBe("trafic_pro");
    expect(declared?.virtual).toBe(false);
    const virtual = data.poles.find((p) => p.virtual);
    expect(virtual?.id).toBe("trafic-pro");
    expect(virtual?.slug).toBe("trafic-pro-2");
    expect(virtual?.href).toBe("/offres/trafic-pro-2");
    expect(data.findPole("trafic-pro-2")).toBe(virtual);
    const service = data.services.find((s) => s.key === "coaching_ads");
    expect(service?.href).toBe("/offres/trafic-pro-2/coaching-ads");
    const resolved = data.findPole("trafic-pro-2");
    expect(resolved && data.findService(resolved, "coaching-ads")?.key).toBe("coaching_ads");
    // L'id du pôle déclaré reste un alias ; le slug est unique dans le sitemap.
    expect(data.findPole("trafic_pro")?.id).toBe("trafic_pro");
    expect(new Set([...data.poles, ...data.services].map((x) => x.href)).size).toBe(
      data.poles.length + data.services.length,
    );
  });

  it("un slug de contenu en collision ne détourne jamais l'adresse d'un autre pôle", () => {
    core.settings.set("site_content", { poles: { trafic_pro: { slug: "Ghost Studio" } } });
    const data = buildSiteData(core);
    expect(data.findPole("ghost-studio")?.id).toBe("digital");
    expect(data.findPole("trafic_pro")?.slug).toBe("ghost-studio-2");
    expect(data.findPole("ghost-studio-2")?.id).toBe("trafic_pro");
  });

  it("un service ajouté en catégorie Digital atterrit dans le groupe par défaut de Ghost Studio", () => {
    addService({ serviceKey: "nouveau_digital", label: "Nouveau service", categorie: "Digital" });
    const data = buildSiteData(core);
    expect(data.stats.poleCount).toBe(5);
    const ghost = data.findPole("ghost-studio");
    expect(ghost?.services).toHaveLength(37);
    expect(ghost?.groups).toHaveLength(9);
    const extra = ghost?.groups[8];
    expect(extra?.name).toBe("OFFRES");
    expect(extra?.services.map((s) => s.key)).toEqual(["nouveau_digital"]);
    expect(extra?.services[0]?.poleSlug).toBe("ghost-studio");
  });

  it("les consignes internes du périmètre ne sont jamais exposées", () => {
    const data = buildSiteData(core);
    for (const service of data.services) {
      expect(service.perimetre).not.toMatch(/ne pas chiffrer|non enregistré/i);
      for (const bullet of service.bullets) expect(bullet).not.toMatch(/ne pas chiffrer/i);
    }
    const agents = data.services.find((s) => s.key === "china_acces_agents");
    expect(agents?.bullets).toEqual([
      "Agents à Guangzhou/Shenzhen",
      "réseau constitué depuis des années. Indépendants de la formation",
    ]);
  });

  it("liens WhatsApp et Telegram dérivés des réglages", () => {
    const data = buildSiteData(core);
    expect(data.whatsapp.e164).toBe("+33756975687");
    expect(data.whatsapp.display).toBe("+33 7 56 97 56 87");
    expect(data.whatsapp.href).toBe(
      "https://wa.me/33756975687?text=" + encodeURIComponent("Salut, je veux lancer un business."),
    );
    expect(data.telegram.href).toBe("https://t.me/Jacob13013");
    expect(data.groupLink).toBe("https://t.me/+P6Vba87ei95lZGJk");
    const ghost = data.findPole("ghost-studio");
    expect(ghost?.waHref).toBe(
      "https://wa.me/33756975687?text=" + encodeURIComponent("Salut, je viens de la page Ghost Studio."),
    );
    const bot = data.services.find((s) => s.key === "bot_whatsapp");
    expect(bot?.waHref).toBe(
      "https://wa.me/33756975687?text=" +
        encodeURIComponent("Salut, je suis intéressé par Bot WhatsApp (Ghost Studio) — dès 1 500 €."),
    );
  });

  it("offre phare : titre rendu, masquée si le service est inactif", () => {
    const data = buildSiteData(core);
    expect(data.featured?.service.key).toBe("bot_whatsapp");
    expect(data.featured?.title).toBe("Le bot WhatsApp\ndès 1 500 €");
    expect(data.featured?.chat[1]?.text.startsWith("Boutique e-commerce, dès 750 € :")).toBe(true);
    expect(data.featured?.waHref).toBe(
      "https://wa.me/33756975687?text=" +
        encodeURIComponent("Salut, je suis intéressé par Bot WhatsApp — dès 1 500 €."),
    );
    core.pricing.update("bot_whatsapp", { actif: 0 });
    expect(buildSiteData(core).featured).toBeNull();
  });

  it("le prix affiché suit la base : logo 50 → 60", () => {
    core.pricing.update("logo", { prixMin: 60 });
    const data = buildSiteData(core);
    expect(data.services.find((s) => s.key === "logo")?.priceShort).toBe("60 €");
    expect(data.findPole("ghost-studio")?.sub.startsWith("Un logo 60 €,")).toBe(true);
    expect(data.stats.minPrice).toBe("50 €");
  });
});

describe("renderTemplate", () => {
  it("remplace les balises et vide les clés inconnues", () => {
    const ctx = createTemplateContext(core.pricing.active(), 5, "50 €", "Ghost Studio, Trafic Pro");
    expect(renderTemplate("{{price:bot_whatsapp}}", ctx)).toBe("dès 1 500 €");
    expect(renderTemplate("Arbi Jacob — {{list:poles}}.", ctx)).toBe("Arbi Jacob — Ghost Studio, Trafic Pro.");
    expect(renderTemplate("Le {{label:logo}} {{price:logo}}, point.", ctx)).toBe("Le Logo 50 €, point.");
    expect(renderTemplate("Prix {{price:inconnu}} ici", ctx)).toBe("Prix ici");
    expect(renderTemplate("{{count:poles}} pôles, dès {{min:price}}", ctx)).toBe("5 pôles, dès 50 €");
    expect(renderTemplate("Tu vends quoi ?", ctx)).toBe("Tu vends quoi ?");
    expect(renderTemplate("{{price:trafic_pro}}", ctx)).toBe("1 100 €");
    expect(renderTemplate("{{price:hebergement}}", ctx)).toBe("dès 50 €/mois");
  });
});

describe("DEFAULT_SITE_CONTENT", () => {
  it("ne contient aucun montant en dur", () => {
    const strings: string[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === "string") strings.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") Object.values(value).forEach(walk);
    };
    walk(DEFAULT_SITE_CONTENT);
    expect(strings.length).toBeGreaterThan(300);
    const offenders = strings.filter((s) => /\d\s*€/.test(s));
    expect(offenders).toEqual([]);
  });

  it("couvre tous les services du seed pricing et les 5 pôles du menu", () => {
    for (const row of core.pricing.active()) {
      expect(DEFAULT_SITE_CONTENT.services[row.serviceKey], row.serviceKey).toBeDefined();
    }
    expect(Object.keys(DEFAULT_SITE_CONTENT.poles).sort()).toEqual(
      core.settings
        .get("menu_poles")
        .map((p) => p.id)
        .sort(),
    );
  });
});

describe("normalizeSiteContent", () => {
  it("retombe sur le seed pour un JSON inattendu", () => {
    expect(normalizeSiteContent(undefined)).toEqual(DEFAULT_SITE_CONTENT);
    expect(normalizeSiteContent(null)).toEqual(DEFAULT_SITE_CONTENT);
    expect(normalizeSiteContent("n'importe quoi")).toEqual(DEFAULT_SITE_CONTENT);
    expect(normalizeSiteContent([1, 2])).toEqual(DEFAULT_SITE_CONTENT);
    expect(normalizeSiteContent({ hero: 42, poles: "x", featured: 7 })).toEqual(DEFAULT_SITE_CONTENT);
  });

  it("fusionne les valeurs stockées et valide hex / E.164", () => {
    const merged = normalizeSiteContent({
      whatsapp: "0612345678",
      brand: { name: "  MARQUE  " },
      hero: { claim: "" },
      ticker: ["A", " ", 3, "B"],
      poles: {
        digital: { color: "rouge", slug: "Ghost Studio !", from: "", lines: ["x"], process: [] },
        china_acces: { color: "#abc", from: "" },
        nouveau: { nameA: "Nouveau", order: 9 },
      },
      services: { logo: { punch: "Punch !", faq: [{ q: "Q ?", a: "" }, { q: "Q2 ?", a: "R." }] } },
      featured: null,
    });
    expect(merged.whatsapp).toBe(DEFAULT_SITE_CONTENT.whatsapp);
    expect(merged.brand.name).toBe("MARQUE");
    expect(merged.brand.tagline).toBe("BUSINESS LAUNCHER");
    expect(merged.hero.claim).toBe(DEFAULT_SITE_CONTENT.hero.claim);
    expect(merged.ticker).toEqual(["A", "B"]);
    expect(merged.featured).toBeNull();
    expect(merged.poles.digital?.color).toBe("#FF6A2B");
    expect(merged.poles.digital?.slug).toBe("ghost-studio");
    expect(merged.poles.digital?.lines).toEqual(["x"]);
    expect(merged.poles.digital?.process).toEqual([]);
    expect(merged.poles.china_acces?.color).toBe("#AABBCC");
    expect(merged.poles.china_acces?.from).toBe("");
    expect(merged.poles.nouveau).toEqual({ nameA: "Nouveau", order: 9 });
    expect(merged.services.logo?.punch).toBe("Punch !");
    expect(merged.services.logo?.faq).toEqual([{ q: "Q2 ?", a: "R." }]);
    expect(merged.services.logo?.args).toEqual(DEFAULT_SITE_CONTENT.services.logo?.args);
    expect(normalizeSiteContent({ whatsapp: "+33612345678" }).whatsapp).toBe("+33612345678");
  });

  it("un `from` vidé en base redevient calculé", () => {
    core.settings.set("site_content", { poles: { china_acces: { from: "" } } });
    expect(buildSiteData(core).findPole("china-acces")?.from).toBe("sur devis");
  });
});

describe("format", () => {
  it("priceShort couvre les 4 types", () => {
    const base = {
      id: 0,
      serviceKey: "x",
      label: "X",
      categorie: "Digital",
      unite: "",
      perimetre: "",
      affichage: null,
      actif: 1,
      updatedAt: 0,
    };
    expect(priceShort({ ...base, type: "FIXED", prixMin: 1100, prixMax: null })).toBe("1 100 €");
    expect(priceShort({ ...base, type: "FROM", prixMin: 750, prixMax: null })).toBe("dès 750 €");
    expect(priceShort({ ...base, type: "RANGE", prixMin: 750, prixMax: 1500 })).toBe("750 – 1 500 €");
    expect(priceShort({ ...base, type: "QUOTE", prixMin: null, prixMax: null })).toBe("sur devis");
    expect(priceShort({ ...base, type: "FROM", prixMin: null, prixMax: null })).toBe("sur devis");
    expect(priceShort({ ...base, type: "FROM", prixMin: 150, prixMax: null, unite: "mois" })).toBe(
      "dès 150 €/mois",
    );
  });

  it("helpers", () => {
    expect(slugify("Créa société")).toBe("crea-societe");
    expect(slugify("china_acces")).toBe("china-acces");
    expect(inkOf("#22E1B9")).toBe("#076A55");
    expect(inkOf("#ffffff")).toBe("#B3B3B3");
    expect(inkOf("bleu")).toBe("#1C1C1E");
    expect(formatPhoneFr("+33756975687")).toBe("+33 7 56 97 56 87");
    expect(formatPhoneFr("+447911123456")).toBe("+44 79 11 12 34 56");
    expect(telegramHref("@Jacob13013")).toBe("https://t.me/Jacob13013");
    expect(telegramHref("https://t.me/+abc")).toBe("https://t.me/+abc");
    expect(telegramHref("")).toBe("");
    expect(waHref("+33 7 56 97 56 87", "Salut ça va ?")).toBe(
      "https://wa.me/33756975687?text=Salut%20%C3%A7a%20va%20%3F",
    );
  });
});
