/**
 * Seed du moteur tarifaire. Ce fichier n'est lu qu'au premier démarrage pour
 * remplir la table `pricing` : ensuite LA BASE FAIT AUTORITÉ et le dashboard
 * (page Catalogue & tarifs) est le seul endroit où modifier un prix.
 */

export type PriceType = "FIXED" | "FROM" | "QUOTE" | "RANGE";

export interface PricingSeed {
  serviceKey: string;
  label: string;
  categorie: string;
  type: PriceType;
  prixMin?: number;
  prixMax?: number;
  unite?: "" | "mois";
  perimetre: string;
  affichage?: string;
}

export const PRICING_SEED: PricingSeed[] = [
  // ─── GHOST STUDIO — Sites internet ───
  {
    serviceKey: "site_vitrine",
    label: "Site vitrine",
    categorie: "Digital",
    type: "FROM",
    prixMin: 750,
    perimetre:
      "Jusqu'à 5 pages, design personnalisé, responsive, SEO de base, domaine, SSL, Analytics, hébergement et mise en ligne",
  },
  {
    serviceKey: "site_vitrine_premium",
    label: "Site vitrine premium",
    categorie: "Digital",
    type: "FROM",
    prixMin: 1500,
    perimetre:
      "Direction artistique, UX/UI sur mesure, animations, CMS, intégrations externes, SEO, Analytics, performance",
  },
  // ─── E-commerce ───
  {
    serviceKey: "boutique",
    label: "Boutique e-commerce",
    categorie: "Digital",
    type: "FROM",
    prixMin: 750,
    perimetre:
      "Catalogue, panier/checkout, paiement CB, livraison, codes promo, gestion des commandes, domaine, SSL, Analytics, mise en ligne",
  },
  {
    serviceKey: "ecommerce_avance",
    label: "E-commerce avancé",
    categorie: "Digital",
    type: "FROM",
    prixMin: 2500,
    perimetre:
      "Design personnalisé, multilingue/multi-devise, abonnements, CRM et automatisation, stocks avancés, ERP/API, espace client et dashboard",
  },
  // ─── Création de marque ───
  {
    serviceKey: "brand_starter",
    label: "Brand Starter",
    categorie: "Digital",
    type: "FROM",
    prixMin: 750,
    perimetre:
      "Positionnement, logo et variantes, couleurs et typographies, univers graphique, mini brand book, assets réseaux sociaux",
  },
  {
    serviceKey: "brand_launch",
    label: "Brand Launch",
    categorie: "Digital",
    type: "FROM",
    prixMin: 1500,
    perimetre:
      "Identité complète, site ou e-commerce, domaine et e-mails pro, solution d'encaissement, Analytics et SEO initial, mise en ligne",
  },
  {
    serviceKey: "brand_premium",
    label: "Brand Premium",
    categorie: "Digital",
    type: "FROM",
    prixMin: 3000,
    perimetre:
      "Identité approfondie, brand guidelines, templates réseaux sociaux, supports publicitaires, landing pages et copywriting, CRM, tracking, automatisations",
  },
  // ─── Graphisme (prix fermes) ───
  {
    serviceKey: "logo",
    label: "Logo",
    categorie: "Digital",
    type: "FIXED",
    prixMin: 50,
    perimetre: "Création de logo",
  },
  {
    serviceKey: "filtre",
    label: "Filtre Snapchat / Instagram",
    categorie: "Digital",
    type: "FIXED",
    prixMin: 50,
    perimetre: "Filtre pour Snapchat ou Instagram",
  },
  {
    serviceKey: "flyer",
    label: "Flyer",
    categorie: "Digital",
    type: "FIXED",
    prixMin: 70,
    perimetre: "Création de flyer",
  },
  // ─── Applications & logiciels ───
  {
    serviceKey: "app_web",
    label: "Application web",
    categorie: "Digital",
    type: "FROM",
    prixMin: 3000,
    perimetre:
      "SaaS, CRM, ERP léger, dashboard, portail client, B2B, marketplace, logiciel métier, réservation",
  },
  {
    serviceKey: "mvp_saas",
    label: "MVP SaaS",
    categorie: "Digital",
    type: "FROM",
    prixMin: 3500,
    perimetre:
      "Architecture, dashboard, UX/UI, application, paiement Stripe, abonnements, e-mails, analytics, mise en ligne",
  },
  {
    serviceKey: "logiciel_metier",
    label: "Logiciel métier sur mesure",
    categorie: "Digital",
    type: "FROM",
    prixMin: 5000,
    perimetre:
      "Utilisateurs, documents, CRM/commercial, stocks, facturation, reporting, workflows, API, exports Excel/PDF, IA interne",
  },
  {
    serviceKey: "marketplace",
    label: "Marketplace",
    categorie: "Digital",
    type: "FROM",
    prixMin: 5000,
    perimetre:
      "Vendeurs/acheteurs, messagerie, catalogue, recherche, avis et notes, dashboard admin, paiements, litiges, commissions",
  },
  {
    serviceKey: "app_mobile",
    label: "Application mobile",
    categorie: "Digital",
    type: "FROM",
    prixMin: 5000,
    perimetre:
      "iOS + Android, UX/UI, backend, comptes utilisateurs, notifications, API, analytics, tests, publication App Store et Google Play",
  },
  {
    serviceKey: "app_mobile_avancee",
    label: "Application mobile avancée",
    categorie: "Digital",
    type: "FROM",
    prixMin: 10000,
    perimetre:
      "Paiements, abonnements, géolocalisation, chat, audio/vidéo, IA, marketplace, réservation, notifications, dashboard",
  },
  // ─── IA, automatisation & bots ───
  {
    serviceKey: "automatisation",
    label: "Automatisation",
    categorie: "Digital",
    type: "FROM",
    prixMin: 750,
    perimetre: "Workflows, CRM, e-mails, données, reporting",
  },
  {
    serviceKey: "bot_telegram",
    label: "Bot Telegram",
    categorie: "Digital",
    type: "FROM",
    prixMin: 1000,
    perimetre: "Commandes, paiements, comptes, notifications, automatisation",
  },
  {
    serviceKey: "bot_discord",
    label: "Bot Discord",
    categorie: "Digital",
    type: "FROM",
    prixMin: 1000,
    perimetre: "Rôles, modération, commandes, IA, automatisation",
  },
  {
    serviceKey: "integration_ia",
    label: "Intégration IA",
    categorie: "Digital",
    type: "FROM",
    prixMin: 1500,
    perimetre: "Chat IA, génération de contenu, analyse, recherche intelligente",
  },
  {
    serviceKey: "bot_whatsapp",
    label: "Bot WhatsApp",
    categorie: "Digital",
    type: "FROM",
    prixMin: 1500,
    perimetre: "Réponses automatiques, support, qualification, CRM, notifications",
  },
  {
    serviceKey: "agent_ia",
    label: "Agent IA",
    categorie: "Digital",
    type: "FROM",
    prixMin: 2500,
    perimetre:
      "Commercial, service client, qualification de leads, recherche et analyse, reporting",
  },
  {
    serviceKey: "automatisation_avancee",
    label: "Automatisation avancée",
    categorie: "Digital",
    type: "QUOTE",
    perimetre: "Intégration IA, outils et plateformes, API et webhooks, bases de données",
  },
  // ─── Data, API & business ───
  {
    serviceKey: "integration_api",
    label: "Intégration API",
    categorie: "Digital",
    type: "FROM",
    prixMin: 750,
    perimetre: "Connexion entre logiciels et services",
  },
  {
    serviceKey: "systeme_paiement",
    label: "Système de paiement",
    categorie: "Digital",
    type: "FROM",
    prixMin: 750,
    perimetre: "Paiements, abonnements, checkout, marketplace, Stripe/PayPal",
  },
  {
    serviceKey: "migration_donnees",
    label: "Migration de données",
    categorie: "Digital",
    type: "FROM",
    prixMin: 1000,
    perimetre: "Transfert, nettoyage, structure, intégrité",
  },
  {
    serviceKey: "dashboard",
    label: "Dashboard",
    categorie: "Digital",
    type: "FROM",
    prixMin: 1500,
    perimetre: "Ventes, marketing, finance, logistique, reporting",
  },
  {
    serviceKey: "creation_api",
    label: "Création d'API",
    categorie: "Digital",
    type: "FROM",
    prixMin: 1500,
    perimetre: "API REST, documentation, sécurisation, maintenance",
  },
  {
    serviceKey: "crm_erp",
    label: "CRM / ERP",
    categorie: "Digital",
    type: "FROM",
    prixMin: 1500,
    perimetre: "Connexion, synchronisation, automatisation",
  },
  {
    serviceKey: "dashboard_multi",
    label: "Dashboard multi-sources",
    categorie: "Digital",
    type: "FROM",
    prixMin: 2500,
    perimetre: "CRM, ERP, Shopify, Stripe, Analytics, API",
  },
  {
    serviceKey: "data_platform",
    label: "Data platform",
    categorie: "Digital",
    type: "FROM",
    prixMin: 5000,
    perimetre: "Centralisation, transformation, exploitation des données",
  },
  // ─── Jeux & infrastructure ───
  {
    serviceKey: "mini_jeu",
    label: "Mini-jeu web",
    categorie: "Digital",
    type: "FROM",
    prixMin: 2500,
    perimetre: "Jeux concours, marketing, expériences interactives",
  },
  {
    serviceKey: "jeu_video",
    label: "Jeu vidéo sur mesure",
    categorie: "Digital",
    type: "FROM",
    prixMin: 7500,
    perimetre: "Game design, gameplay, interface, backend, multijoueur",
  },
  {
    serviceKey: "hebergement",
    label: "Hébergement & maintenance",
    categorie: "Digital",
    type: "FROM",
    prixMin: 50,
    unite: "mois",
    perimetre: "Serveurs, SSL, sauvegardes, monitoring, sécurité",
  },
  {
    serviceKey: "infra_business",
    label: "Infrastructure business",
    categorie: "Digital",
    type: "FROM",
    prixMin: 150,
    unite: "mois",
    perimetre: "Ressources renforcées, monitoring, maintenance",
  },
  {
    serviceKey: "infra_critical",
    label: "Infrastructure critical",
    categorie: "Digital",
    type: "QUOTE",
    perimetre: "Haute dispo, redondance, scaling, reprise après incident",
  },
  // ─── Formations ───
  {
    serviceKey: "trafic_pro",
    label: "Trafic Pro",
    categorie: "Formation",
    type: "FIXED",
    prixMin: 1100,
    prixMax: 1500,
    perimetre:
      "Formation vidéo Twitter/X, Snapchat, TikTok, Instagram, Telegram — 7 modules d'au moins 1 h 15 chacun, 2 business intégrés",
    affichage: "1 100 € comptant, ou 1 500 € en 4 fois",
  },
  {
    serviceKey: "vinted_pro",
    label: "Vinted Pro",
    categorie: "Formation",
    type: "FIXED",
    prixMin: 300,
    perimetre:
      "Formation achat/revente Vinted : niches, annonces, mots-clés, prix, fournisseurs, organisation, outils, accompagnement. Accès immédiat après paiement",
  },
  {
    serviceKey: "china_acces_formation",
    label: "China Accès — formation",
    categorie: "China",
    type: "QUOTE",
    perimetre:
      "Environ 7 à 10 heures d'appels/coaching selon le profil : fournisseurs, sourcing, négociation, WeChat, agents, compte de vente, tunnel de vente. Tarif non enregistré : ne pas chiffrer",
  },
  {
    serviceKey: "china_acces_agents",
    label: "China Accès — agents sur place",
    categorie: "China",
    type: "QUOTE",
    perimetre:
      "Agents à Guangzhou/Shenzhen, réseau constitué depuis des années. Indépendants de la formation. Tarif non enregistré : ne pas chiffrer",
  },
  // ─── Création de société ───
  {
    serviceKey: "societe_llc_usa",
    label: "LLC (USA)",
    categorie: "Société",
    type: "QUOTE",
    perimetre:
      "Création de société aux USA, banques et solutions de paiement (Wise, Mercury, Payoneer, Stripe). Tarif non enregistré : ne pas chiffrer",
  },
  {
    serviceKey: "societe_ltd_uk",
    label: "LTD (Royaume-Uni)",
    categorie: "Société",
    type: "QUOTE",
    perimetre:
      "Création de société au Royaume-Uni, accompagnement banques et paiement. Tarif non enregistré : ne pas chiffrer",
  },
  {
    serviceKey: "societe_ltd_hk",
    label: "LTD (Hong Kong)",
    categorie: "Société",
    type: "QUOTE",
    perimetre:
      "Création de société à Hong Kong, accompagnement banques et paiement. Tarif non enregistré : ne pas chiffrer",
  },
];

/** Table de synonymes seed (éditable ensuite en base / dashboard). */
export const SYNONYMS_SEED: Array<{ pattern: string; resolution: string }> = [
  { pattern: "appli", resolution: "app_mobile" },
  { pattern: "application", resolution: "app_mobile" },
  { pattern: "site pour vendre", resolution: "boutique" },
  { pattern: "boutique", resolution: "boutique" },
  { pattern: "boutique en ligne", resolution: "boutique" },
  { pattern: "e-commerce", resolution: "boutique" },
  { pattern: "ecommerce", resolution: "boutique" },
  { pattern: "site", resolution: "site_vitrine" },
  { pattern: "site vitrine", resolution: "site_vitrine" },
  { pattern: "site internet", resolution: "site_vitrine" },
  { pattern: "bot whatsapp", resolution: "bot_whatsapp" },
  { pattern: "automatisation whatsapp", resolution: "bot_whatsapp" },
  { pattern: "bot telegram", resolution: "bot_telegram" },
  { pattern: "bot discord", resolution: "bot_discord" },
  { pattern: "agent ia", resolution: "agent_ia" },
  { pattern: "ia qui repond", resolution: "agent_ia" },
  { pattern: "societe us", resolution: "societe_llc_usa" },
  { pattern: "societe aux states", resolution: "societe_llc_usa" },
  { pattern: "societe americaine", resolution: "societe_llc_usa" },
  { pattern: "llc", resolution: "societe_llc_usa" },
  { pattern: "societe anglaise", resolution: "societe_ltd_uk" },
  { pattern: "societe uk", resolution: "societe_ltd_uk" },
  { pattern: "ltd", resolution: "societe_ltd_uk" },
  { pattern: "societe hk", resolution: "societe_ltd_hk" },
  { pattern: "societe hong kong", resolution: "societe_ltd_hk" },
  { pattern: "fournisseur chine", resolution: "china_acces_agents" },
  { pattern: "agent chine", resolution: "china_acces_agents" },
  { pattern: "agent", resolution: "china_acces_agents" },
  { pattern: "sourcing", resolution: "china_acces_formation" },
  { pattern: "formation chine", resolution: "china_acces_formation" },
  { pattern: "china", resolution: "china_acces_formation" },
  { pattern: "logo", resolution: "logo" },
  { pattern: "flyer", resolution: "flyer" },
  { pattern: "filtre", resolution: "filtre" },
  { pattern: "trafic pro", resolution: "trafic_pro" },
  { pattern: "formation reseaux", resolution: "trafic_pro" },
  { pattern: "vinted", resolution: "vinted_pro" },
  { pattern: "saas", resolution: "mvp_saas" },
  { pattern: "marketplace", resolution: "marketplace" },
  { pattern: "hebergement", resolution: "hebergement" },
  { pattern: "maintenance", resolution: "hebergement" },
];

/** Réponses types aux objections (seed du réglage `objections`). */
export const OBJECTIONS_SEED: Record<string, string> = {
  cest_cher:
    "Recentrer sur le périmètre inclus, pas sur le prix : détailler tout ce qu'il y a dans la prestation (livrables, accompagnement, mise en ligne).",
  je_vais_reflechir:
    "Proposer un échange direct avec Jacob pour avancer, sans relancer plusieurs fois.",
  moins_cher_ailleurs:
    "Comparer le contenu de la prestation point par point, sans jamais dénigrer le concurrent.",
  ca_marche_vraiment:
    "Décrire la méthode et le contenu concret, sans jamais promettre un résultat ou un revenu.",
};
