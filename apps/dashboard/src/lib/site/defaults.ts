import type { SiteContent } from "./content";

/**
 * Seed du contenu marketing du site vitrine — transcription fidèle de
 * site-copy.json (copie produite par le panel de copywriters).
 * AUCUN montant en dur : les prix passent par les balises {{price:clé}} et
 * viennent de la table pricing (vérifié par data.test.ts).
 */
export const DEFAULT_SITE_CONTENT: SiteContent = {
  whatsapp: "+33756975687",
  brand: {
    name: "ARBI JACOB",
    tagline: "BUSINESS LAUNCHER"
  },
  hero: {
    titleA: "Business",
    titleB: "Launcher",
    claim: "Arbi Jacob ne vend pas des prestations. Il lance des business : le site, le trafic, les fournisseurs, la boîte. Tu arrives avec une idée, tu repars avec une machine qui tourne, en ligne, à ton nom.",
    sub: "{{count:poles}} pôles, une seule équipe, un seul fil WhatsApp. Tu écris, on répond.",
    ctaPrimary: "Écris sur WhatsApp",
    ctaSecondary: "Telegram",
    waText: "Salut, je veux lancer un business."
  },
  ticker: [
    "SITES",
    "E-COMMERCE",
    "APPS & SAAS",
    "BOTS IA",
    "TRAFIC",
    "SOURCING CHINE",
    "REVENTE VINTED",
    "LLC & LTD"
  ],
  cardsTitleA: "Choisis ton business.",
  cardsTitleB: "On le lance.",
  cardsHint: "Survole une carte : elle te dit ce qu'il y a dedans et le prix de départ. Clique : la page de vente complète, tarifs ligne par ligne.",
  featured: {
    serviceKey: "bot_whatsapp",
    kicker: "OFFRE PHARE",
    title: "Le bot WhatsApp\n{{price:bot_whatsapp}}",
    text: "Écris-nous : c'est lui qui répond. Il accueille, il trie, il donne les tarifs, et il ne dort jamais. Branché sur ton CRM, il note tout et te prévient. Quand ça devient sérieux, il passe la main à Arbi. Ce que tu testes ici, c'est ce que tes clients auront chez toi.",
    cta: "Tester le bot",
    chat: [
      {
        from: "client",
        text: "Salut, je veux une boutique en ligne"
      },
      {
        from: "bot",
        text: "Boutique e-commerce, {{price:boutique}} : catalogue, panier, paiement CB, livraison, codes promo. Tu vends quoi ?"
      },
      {
        from: "client",
        text: "Des sneakers, sourcées en Chine"
      },
      {
        from: "bot",
        text: "China Accès : 7 à 10 h de coaching en appel pour trouver tes fournisseurs, et des agents sur place si tu veux. Je passe le relais à Arbi pour le tarif ?"
      }
    ]
  },
  stepsTitle: "Comment on lance",
  steps: [
    {
      title: "Tu écris",
      text: "WhatsApp ou Telegram, avec ton idée même mal ficelée. Le bot répond tout de suite, Arbi prend la suite."
    },
    {
      title: "On cadre",
      text: "Trois questions : objectif, budget, délai. On choisit les pôles utiles et on te chiffre."
    },
    {
      title: "On construit",
      text: "Conception, développement, tests. Tu valides, on met en ligne."
    },
    {
      title: "Ça tourne",
      text: "Maintenance en option. Trafic, fournisseurs, structure : on branche le reste quand tu es prêt."
    }
  ],
  cta: {
    title: "Dis-nous ce que tu veux lancer.",
    text: "Un message suffit. Pas de formulaire, pas de rendez-vous à caler. Tu ressors avec un cadrage et un devis.",
    primary: "Écris sur WhatsApp",
    secondary: "Groupe privé Telegram"
  },
  footer: {
    line: "Arbi Jacob — {{list:poles}}."
  },
  pagesCtaText: "Réponse directe sur WhatsApp ou Telegram, sans formulaire. Le bot répond tout de suite, Arbi sous 24 h.",
  genericFaq: [
    {
      q: "C'est quoi le délai ?",
      a: "Il est écrit dans le devis, pas deviné. Tu as une deadline ? Dis-la dès le premier message : on te dit tout de suite si elle tient et on cale le planning dessus."
    },
    {
      q: "Comment se passe le paiement ?",
      a: "Les modalités sont écrites dans le devis, pas devinées. Trafic Pro se règle comptant ou en 4 fois, Vinted Pro donne accès dès le paiement. Tout se règle avec Arbi en direct, jamais via le bot."
    },
    {
      q: "À qui appartient ce qu'on livre ?",
      a: "À toi. Le domaine, les comptes, les accès : tout est à ton nom dès la mise en ligne. La maintenance est une option, jamais une condition pour garder ton site."
    }
  ],
  poles: {
    digital: {
      order: 1,
      slug: "ghost-studio",
      color: "#FF6A2B",
      glyph: "◧",
      cat: "DIGITAL",
      nameA: "Ghost",
      nameB: "Studio",
      from: "",
      lines: [
        "Sites, boutiques, apps, bots IA, data, infra",
        "Devis chiffré ligne par ligne, avant le code",
        "Livré en ligne, maintenu si tu veux"
      ],
      tag: "Le pôle qui construit la machine : site, boutique, app, bots, data, infra. Tout sort d'ici.",
      claim: "Ton site, ta boutique, ton app, tes bots. Huit familles de prestations, une seule équipe qui conçoit, code, teste et met en ligne. Tu arrives avec l'idée, tu valides un devis chiffré poste par poste, tu repars avec un projet qui tourne. La maintenance, seulement si tu la veux.",
      sub: "Un logo {{price:logo}}, un site vitrine {{price:site_vitrine}}, une data platform {{price:data_platform}} : on prend ton projet là où il en est.",
      includes: [
        "Design personnalisé, pas un template retouché",
        "Développement, tests et mise en ligne par la même équipe",
        "Domaine, SSL et Analytics inclus dès le site vitrine",
        "Maintenance en option, jamais imposée"
      ],
      offersTitle: "Tous les tarifs Ghost Studio, famille par famille",
      process: [
        "Ta demande : tu écris l'idée, le type de projet, les fonctions, ton budget si tu l'as, le délai.",
        "L'étude : on décortique ton besoin, on garde les briques qui servent, on écarte ce qui coûte pour rien.",
        "Le devis : chaque poste chiffré. Tu valides avant qu'on écrive une ligne de code.",
        "Conception & développement : le design d'abord, le code ensuite, sur ce qu'on a validé ensemble.",
        "Tests & mise en ligne : on vérifie, on corrige, on publie. Le jour J, ça tourne.",
        "Maintenance : en option. Serveurs, SSL, sauvegardes, monitoring : on gère, tu bosses."
      ],
      ctaTitle: "Envoie ton projet, on te chiffre ça.",
      match: {
        categories: [
          "Digital"
        ],
        serviceKeys: []
      },
      groups: [
        {
          name: "SITES INTERNET",
          serviceKeys: [
            "site_vitrine",
            "site_vitrine_premium"
          ]
        },
        {
          name: "E-COMMERCE",
          serviceKeys: [
            "boutique",
            "ecommerce_avance"
          ]
        },
        {
          name: "CRÉATION DE MARQUE",
          serviceKeys: [
            "brand_starter",
            "brand_launch",
            "brand_premium"
          ]
        },
        {
          name: "GRAPHISME",
          serviceKeys: [
            "logo",
            "filtre",
            "flyer"
          ]
        },
        {
          name: "APPLICATIONS",
          serviceKeys: [
            "app_web",
            "mvp_saas",
            "logiciel_metier",
            "marketplace",
            "app_mobile",
            "app_mobile_avancee"
          ]
        },
        {
          name: "IA & BOTS",
          serviceKeys: [
            "automatisation",
            "bot_telegram",
            "bot_discord",
            "integration_ia",
            "bot_whatsapp",
            "agent_ia",
            "automatisation_avancee"
          ]
        },
        {
          name: "DATA & API",
          serviceKeys: [
            "integration_api",
            "systeme_paiement",
            "migration_donnees",
            "dashboard",
            "creation_api",
            "crm_erp",
            "dashboard_multi",
            "data_platform"
          ]
        },
        {
          name: "JEUX & INFRASTRUCTURE",
          serviceKeys: [
            "mini_jeu",
            "jeu_video",
            "hebergement",
            "infra_business",
            "infra_critical"
          ]
        }
      ]
    },
    trafic_pro: {
      order: 2,
      slug: "trafic-pro",
      color: "#7C2AE8",
      glyph: "↗",
      cat: "FORMATION",
      nameA: "Trafic",
      nameB: "Pro",
      from: "",
      lines: [
        "7 modules vidéo, 1 h 15 minimum chacun",
        "Telegram, X, Snapchat, TikTok, Instagram",
        "2 business : trafic Telegram, comptes à thème"
      ],
      tag: "Partir de zéro. Comprendre les algos. Monter une audience ciblée. Apprendre à la monétiser.",
      claim: "Sept modules vidéo, cinq plateformes, deux business. D'un côté, tu génères du trafic et tu le rediriges vers un canal Telegram que tu apprends à revendre. De l'autre, tu montes des comptes à thème et tu apprends à y vendre de la pub. Arbi filme la méthode, tu l'appliques.",
      sub: "{{price:trafic_pro}}. Deux façons de régler, un seul et même accès complet aux 7 modules.",
      includes: [
        "Introduction et règles générales des plateformes",
        "Canal public Telegram et revente de trafic",
        "Twitter/X, Snapchat, TikTok, Instagram : un module chacun",
        "1 h 15 à 1 h 30 de vidéo minimum par module"
      ],
      offersTitle: "Les deux façons de prendre la formation",
      process: [
        "Tu écris sur WhatsApp : le bot te répond tout de suite et te détaille le programme.",
        "Tu choisis ta formule, comptant ou en 4 fois, et tu règles directement avec Arbi.",
        "Tu reçois ton accès aux 7 modules et tu démarres."
      ],
      ctaTitle: "Prêt à envoyer ton premier trafic ?",
      match: {
        categories: [],
        serviceKeys: [
          "trafic_pro"
        ]
      },
      groups: [
        {
          name: "ACCÈS",
          serviceKeys: [
            "trafic_pro"
          ]
        }
      ]
    },
    china_acces: {
      order: 3,
      slug: "china-acces",
      color: "#22E1B9",
      glyph: "◍",
      cat: "SOURCING",
      nameA: "China",
      nameB: "Accès",
      from: "sur demande",
      lines: [
        "10 ans de terrain à Guangzhou et Shenzhen",
        "Fournisseurs, négo usine, WeChat, agents",
        "7 à 10 h de coaching en appel, en direct"
      ],
      tag: "Dix ans de terrain en Chine, condensés en 7 à 10 heures d'appel. Ou un agent sur place.",
      claim: "Trouver des fournisseurs fiables, retrouver un produit par photo, parler aux usines et négocier, gérer WeChat et les applis chinoises, monter ton compte de vente et ton tunnel. Le programme va jusqu'aux premières ventes, en appel, sur ton projet.",
      sub: "Coaching en direct, pas une vidéo préenregistrée. Formation et agents se prennent ensemble ou séparément. Tarif sur demande.",
      includes: [
        "Fournisseurs fiables : trouver, vérifier, négocier",
        "Recherche produit, y compris par photo",
        "WeChat, applis chinoises, compte de vente, tunnel",
        "Agents à Guangzhou et Shenzhen, avec ou sans formation"
      ],
      offersTitle: "Formation, agents, ou les deux",
      process: [
        "Tu écris sur WhatsApp. Le bot répond, Arbi prend le relais et cale ton profil : produit, budget, niveau.",
        "Le coaching : 7 à 10 heures d'appel selon ton profil. Fournisseurs, négo, WeChat, compte de vente, tunnel.",
        "Le terrain : tu commandes seul, ou un agent à Guangzhou ou Shenzhen fait le relais sur place.",
        "La réception : compte en général 10 à 15 jours pour recevoir tes produits."
      ],
      ctaTitle: "Tu veux sourcer quoi ? Écris, on te donne le tarif.",
      match: {
        categories: [
          "China"
        ],
        serviceKeys: []
      },
      groups: [
        {
          name: "COACHING & AGENTS",
          serviceKeys: [
            "china_acces_formation",
            "china_acces_agents"
          ]
        }
      ]
    },
    vinted_pro: {
      order: 4,
      slug: "vinted-pro",
      color: "#2B5BFF",
      glyph: "◆",
      cat: "REVENTE",
      nameA: "Vinted",
      nameB: "Pro",
      from: "",
      lines: [
        "Produits, niches, annonces, mots-clés",
        "Prix, fournisseurs, croissance du compte",
        "Outils, organisation, accompagnement"
      ],
      tag: "Acheter juste, vendre propre, tenir le rythme : la méthode complète, pas des astuces.",
      claim: "Une méthode complète, dans l'ordre : quels produits chercher et dans quelles niches, comment écrire l'annonce et ses mots-clés, fixer le prix, faire grossir le compte, trouver des fournisseurs. Plus l'organisation, les outils, et Arbi pour tes questions.",
      sub: "{{price:vinted_pro}}, un seul tarif, tout le programme. Accès immédiat après paiement, accompagnement inclus.",
      includes: [
        "Recherche de produits et de niches",
        "Annonces, mots-clés et prix",
        "Croissance du compte et fournisseurs",
        "Organisation, outils, ressources, accompagnement"
      ],
      offersTitle: "Un seul tarif, tout le programme",
      process: [
        "Tu écris sur WhatsApp : le bot te détaille le programme et répond à tes questions.",
        "Le paiement se règle avec Arbi en direct, jamais avec le bot.",
        "Accès immédiat au programme complet : tu commences le jour même.",
        "Tu avances, tu poses tes questions, on t'accompagne."
      ],
      ctaTitle: "Lance ton compte cette semaine.",
      match: {
        categories: [],
        serviceKeys: [
          "vinted_pro"
        ]
      },
      groups: [
        {
          name: "FORMATION",
          serviceKeys: [
            "vinted_pro"
          ]
        }
      ]
    },
    crea_societe: {
      order: 5,
      slug: "societes",
      color: "#1C1C1E",
      glyph: "▤",
      cat: "STRUCTURE",
      nameA: "Sociétés",
      nameB: "à l'international",
      from: "sur devis",
      lines: [
        "LLC USA, LTD UK, LTD Hong Kong",
        "On choisit, on crée, on t'accompagne",
        "Banque et paiement : Wise, Mercury, Stripe"
      ],
      tag: "Ta structure là où ton business en a besoin : États-Unis, Royaume-Uni ou Hong Kong.",
      claim: "Tu nous dis ce que tu vends, à qui, et où tu veux encaisser. On compare LLC et LTD sur ton cas, on crée la société qui colle, puis on t'accompagne sur la banque et le paiement : Wise, Mercury, Payoneer, Stripe. Tu repars avec une structure en place, pas un dossier à finir seul.",
      sub: "Tarif sur devis, selon la juridiction et le montage. L'ouverture d'un compte bancaire reste soumise aux critères de chaque établissement.",
      includes: [
        "Choix de la structure selon ton projet",
        "Création de la société dans la juridiction retenue",
        "Accompagnement banque : Wise, Mercury, Payoneer",
        "Encaissement : Stripe et alternatives"
      ],
      offersTitle: "Les trois juridictions",
      process: [
        "Tu décris ton projet : activité, clients visés, où tu veux encaisser.",
        "On compare LLC USA, LTD UK et LTD Hong Kong sur ton cas, pas sur une idée générale.",
        "On crée la société dans la juridiction retenue.",
        "On t'accompagne sur la banque et le paiement. Fiscalité et compta : on te renvoie vers un pro."
      ],
      ctaTitle: "Dis-nous ton projet, on te dit quelle structure.",
      match: {
        categories: [
          "Société"
        ],
        serviceKeys: []
      },
      groups: [
        {
          name: "JURIDICTIONS",
          serviceKeys: [
            "societe_llc_usa",
            "societe_ltd_uk",
            "societe_ltd_hk"
          ]
        }
      ]
    }
  },
  services: {
    trafic_pro: {
      punch: "La méthode filmée, plateforme par plateforme. Tu sors avec un plan, pas une liste de conseils.",
      desc: "Formation vidéo Telegram, X, Snapchat, TikTok et Instagram : algorithmes, trafic, audience ciblée, monétisation. Un seul accès complet.",
      args: [
        "Business 1 : générer du trafic, construire une audience ciblée, la rediriger vers un canal Telegram et revendre ce trafic. Arbi peut t'aider à trouver des débouchés.",
        "Business 2 : créer des comptes à thème, développer l'audience, vendre des placements pub, varier les leviers de monétisation. Arbi peut t'aider à trouver des annonceurs.",
        "Sept modules d'au moins 1 h 15 chacun : intro, règles générales, puis un module par plateforme. Plusieurs heures de vidéo, pas un résumé ni un PDF."
      ],
      faq: [
        {
          q: "Je pars de zéro, sans aucun compte. C'est pour moi ?",
          a: "Oui. La formation commence par l'introduction et les règles générales avant d'attaquer chaque plateforme une par une. Tu n'as besoin d'aucune audience au départ."
        },
        {
          q: "Comptant ou en 4 fois, il y a une différence de contenu ?",
          a: "Aucune. Les 7 modules et les deux business sont les mêmes dans les deux cas. Seul le montant total change : {{price:trafic_pro}}. Tu règles avec Arbi, jamais via le bot."
        },
        {
          q: "Combien de temps de vidéo au total ?",
          a: "Chaque module fait 1 h 15 à 1 h 30 minimum, et il y en a sept. Compte plusieurs heures de vidéo au total."
        }
      ]
    },
    china_acces_formation: {
      punch: "Dix ans de Chine dans ton oreille. 7 à 10 heures d'appel, en direct, jusqu'aux premières ventes.",
      desc: "Fournisseurs, recherche par photo, négo usine, WeChat, travail avec agents, compte de vente, tunnel. En appel, calé sur ton profil.",
      args: [
        "Pas une vidéo que tu regardes à moitié : des appels en direct, sur ton produit, avec tes questions. Le volume d'heures s'adapte à ton niveau.",
        "Retrouver un produit par photo, écrire à l'usine, négocier, passer par WeChat et les applis chinoises : tu le fais en appel, pas en théorie.",
        "Compte de vente, tunnel, réseaux sociaux : on ne s'arrête pas à la commande. Le programme couvre jusqu'aux premières ventes."
      ],
      faq: [
        {
          q: "C'est une formation vidéo ?",
          a: "Non. C'est du coaching en appel, en direct, environ 7 à 10 heures selon ton profil et tes besoins. Tu avances sur ton projet, pas sur un cas d'école."
        },
        {
          q: "Je dois déjà avoir un produit ?",
          a: "Non. Trouver le produit et le fournisseur fait partie du programme. Si tu as déjà une idée, on va plus vite et on passe du temps sur la suite."
        },
        {
          q: "Les agents sont inclus ?",
          a: "Non, les deux sont indépendants. La formation t'apprend à travailler avec des agents ; le réseau de Guangzhou et Shenzhen est un service à part, avec ou sans la formation."
        }
      ]
    },
    china_acces_agents: {
      punch: "Quelqu'un à Guangzhou ou Shenzhen qui bosse pour toi. Issu du réseau d'Arbi, pas d'un annuaire.",
      desc: "Un réseau d'agents sur place, constitué depuis des années. Formation ou pas, tu peux les prendre seuls.",
      args: [
        "Tu n'es pas en Chine, eux oui. Marchés, centres commerciaux, usines : un relais de confiance entre toi et les fournisseurs.",
        "Pas un contact trouvé la veille : un réseau construit sur des années de présence à Guangzhou et Shenzhen.",
        "Tu sais déjà sourcer et il te manque juste le relais sur place ? Tu prends les agents seuls. Tarif sur demande, on en parle sur WhatsApp."
      ],
      faq: [
        {
          q: "Je dois suivre la formation pour avoir un agent ?",
          a: "Non. Formation et agents sont indépendants : les agents seuls si tu sais déjà quoi sourcer, les deux si tu pars de zéro."
        },
        {
          q: "Comment se passe la mise en relation ?",
          a: "Tu écris sur WhatsApp, tu décris ton produit et ta commande. Arbi regarde ce qu'il te faut, te met en relation avec le bon agent et te donne le tarif en direct."
        },
        {
          q: "Ils sont où exactement ?",
          a: "À Guangzhou et Shenzhen, sur les marchés et dans les centres commerciaux. Des agents sur place, pas à distance."
        }
      ]
    },
    vinted_pro: {
      punch: "Fini l'achat au hasard : tu sais quoi chercher, comment l'annoncer, à quel prix, et comment tenir.",
      desc: "Tout le programme, accès immédiat : produits, niches, annonces, mots-clés, prix, compte, fournisseurs, organisation, outils.",
      args: [
        "Tu arrêtes de deviner : tu apprends à repérer les produits et les niches qui ont de la demande avant d'acheter quoi que ce soit.",
        "Une annonce, c'est un titre, des mots-clés et un prix. On te montre comment écrire les trois, proprement, sur chaque fiche.",
        "Fournisseurs, organisation, outils : tu repars avec un système pour tenir le rythme. Et tu n'es pas lâché seul, l'accompagnement fait partie du programme."
      ],
      faq: [
        {
          q: "Je pars de zéro, c'est pour moi ?",
          a: "Oui. Le programme démarre à la recherche de produits et de niches, puis déroule tout : annonces, prix, compte, fournisseurs, organisation. Tu suis dans l'ordre, à ton rythme, et si tu bloques, tu écris."
        },
        {
          q: "Quand est-ce que j'ai accès ?",
          a: "Immédiatement après le paiement. Le règlement se fait avec Arbi en direct, jamais via le bot : tu écris sur WhatsApp, il te donne les modalités."
        },
        {
          q: "Je dois déjà avoir du stock ou des fournisseurs ?",
          a: "Non. Trouver les produits et les fournisseurs fait partie du programme, avec l'organisation et les outils pour gérer tes achats et tes annonces."
        }
      ]
    },
    societe_llc_usa: {
      punch: "Une LLC aux États-Unis. Tu vends en ligne, tu veux encaisser en dollars : on monte le dossier avec toi.",
      desc: "Création de la LLC, puis accompagnement sur la banque et le paiement : Wise, Mercury, Payoneer, Stripe.",
      args: [
        "On regarde ton activité et tes clients avant de te dire LLC. Si une LTD colle mieux à ton projet, on te le dit avant de lancer quoi que ce soit.",
        "Le dossier de création, on le monte ensemble. Tu réponds aux questions, on avance. Tu n'es jamais seul face aux formulaires.",
        "Banque et paiement : on t'oriente vers Wise, Mercury, Payoneer ou Stripe selon ton cas. Chaque établissement garde ses propres critères d'ouverture."
      ],
      faq: [
        {
          q: "La LLC, c'est la bonne structure pour moi ?",
          a: "On ne répond pas avant de connaître ton projet. Activité, clients, endroit où tu veux encaisser : trois questions, et on te dit si la LLC colle ou si une LTD fait mieux le job."
        },
        {
          q: "Le compte bancaire est inclus ?",
          a: "L'accompagnement, oui : on prépare le dossier avec toi et on t'oriente vers Wise, Mercury ou Payoneer. L'ouverture reste soumise aux critères et à l'appréciation de chaque établissement : la décision finale lui appartient."
        },
        {
          q: "Vous donnez des conseils fiscaux ?",
          a: "Non. On s'occupe de la structure, de la création et de la banque. Fiscalité, juridique, compta : ça dépend de ton activité, de ta résidence et de ta situation, on te renvoie vers un professionnel."
        }
      ]
    },
    societe_ltd_uk: {
      punch: "La LTD au Royaume-Uni. Une structure proche, que tes clients européens connaissent, montée avec toi.",
      desc: "Création de la LTD et accompagnement banque et paiement. L'ouverture du compte reste soumise aux critères de chaque établissement.",
      args: [
        "Tu bosses avec des clients en Europe ? La LTD parle leur langue. On vérifie avec toi que c'est la bonne case avant de la cocher.",
        "Création prise en charge étape par étape. Tu envoies ce qu'on te demande sur WhatsApp, on s'occupe de la suite.",
        "Tu veux comparer avec la LLC ou Hong Kong ? On te pose les différences côte à côte, sans jargon, et tu décides en connaissance de cause."
      ],
      faq: [
        {
          q: "C'est quoi la différence avec une LLC ?",
          a: "Deux pays, deux cadres, deux façons d'encaisser. On te les explique côte à côte selon ton activité et tes clients, puis on tranche ensemble. Pour la fiscalité et la compta, on te renvoie vers un professionnel."
        },
        {
          q: "Vous gérez aussi la compta ?",
          a: "Non. On s'arrête à la structure, la création et l'accompagnement banque et paiement. Compta, fiscalité, juridique : on te renvoie vers un pro."
        },
        {
          q: "C'est combien ?",
          a: "Sur devis, selon ce qu'on monte. Tu écris sur WhatsApp, le bot pose les bonnes questions, et on te donne le tarif en direct."
        }
      ]
    },
    societe_ltd_hk: {
      punch: "La LTD à Hong Kong. Tu sources en Chine, tu vends à l'international : ta structure à côté des usines.",
      desc: "Création de la société à Hong Kong et accompagnement sur la banque et le paiement. Le prolongement naturel de China Accès.",
      args: [
        "Tu sources en Chine ou tu vends vers l'Asie ? On regarde si Hong Kong a du sens pour ton flux avant de créer quoi que ce soit.",
        "On monte la création avec toi, du choix du nom au dossier complet. Tu suis chaque étape sur WhatsApp.",
        "Banque et paiement : on t'accompagne sur les solutions qui marchent avec Hong Kong, pour encaisser et régler tes fournisseurs. Chaque établissement garde ses critères."
      ],
      faq: [
        {
          q: "Je viens de China Accès, ça s'enchaîne ?",
          a: "Oui. Tu sais déjà sourcer et négocier ; ici on met la structure et le paiement derrière. Coaching, agents sur place et société à Hong Kong se prennent séparément ou ensemble."
        },
        {
          q: "Pourquoi Hong Kong plutôt que le Royaume-Uni ?",
          a: "Ça dépend de là où sont tes clients, tes fournisseurs et ta devise. Si ton business tourne surtout en Europe ou aux États-Unis, une autre structure fera peut-être mieux le job. On regarde ça ensemble."
        },
        {
          q: "Le compte bancaire, c'est acquis ?",
          a: "Non. On prépare le dossier avec toi et on t'oriente vers les solutions adaptées, mais chaque banque ou service de paiement décide selon ses propres critères et à sa propre appréciation."
        }
      ]
    },
    site_vitrine: {
      punch: "Cinq pages propres, à ton nom, en ligne. Un client cherche ton activité ? Tu as une adresse à lui donner.",
      desc: "Jusqu'à 5 pages, design perso, responsive, SEO de base. Domaine, SSL, Analytics, hébergement, mise en ligne : rien à installer.",
      args: [
        "Plus de page Facebook qui dort. Ton activité, tes offres, ton numéro : cinq pages max, un design à ton image, lisible sur téléphone. De quoi te présenter proprement.",
        "Tu ne repars pas avec une maquette, tu repars avec un site en ligne, sur ton domaine, en HTTPS. Domaine, SSL, hébergement, mise en ligne : on gère, tu valides.",
        "Analytics posé dès le départ : tu vois qui vient, sur quelle page. Tu veux qu'on veille dessus ensuite ? {{label:hebergement}} {{price:hebergement}}, en option."
      ],
      faq: [
        {
          q: "5 pages, ça suffit pour quoi ?",
          a: "Accueil, présentation, prestations, réalisations ou avis, contact : le format qui couvre la plupart des activités. Il t'en faut plus ? On chiffre sur devis avant de démarrer."
        },
        {
          q: "Il faut quoi pour démarrer ?",
          a: "Ton activité, ce que tu vends, à qui. Textes, photos et logo si tu les as ; sinon on part de zéro. Pas d'identité du tout ? {{label:brand_starter}} la pose avant, et le site s'appuie dessus. Tu écris sur WhatsApp, on cale le reste."
        },
        {
          q: "Le prix « dès », il comprend quoi ?",
          a: "C'est le point de départ pour le périmètre standard : jusqu'à 5 pages, domaine, SSL, Analytics, hébergement à la mise en ligne. Une page en plus, une fonction en plus : on chiffre au devis, tu valides, ensuite on construit."
        }
      ]
    },
    site_vitrine_premium: {
      punch: "Le site qui fait dire « ok, ils sont sérieux » avant même le premier message.",
      desc: "Direction artistique, UX/UI sur mesure, animations, CMS pour éditer sans nous, intégrations externes, SEO, Analytics, performance.",
      args: [
        "Pas un template retouché : une direction artistique rien que pour toi. Typos, couleurs, mouvement, parcours pensé pour ton visiteur. Ton positionnement se lit à l'écran.",
        "Le CMS te rend autonome : un texte, une photo, une offre, tu modifies toi-même sans repasser par nous. Et tes outils existants se branchent au site via les intégrations.",
        "Performance et SEO travaillés dès la conception : ça charge vite, Google le lit bien, Analytics mesure. Pour que ça tienne, {{label:hebergement}} {{price:hebergement}}."
      ],
      faq: [
        {
          q: "Vitrine ou vitrine premium ?",
          a: "Vitrine : être en ligne proprement avec l'essentiel. Premium : ton image est ton argument, tu veux une direction artistique dédiée, des animations et la main sur tes contenus. On tranche ensemble sur WhatsApp, puis on chiffre."
        },
        {
          q: "Je peux modifier le site moi-même après la livraison ?",
          a: "Oui, c'est le rôle du CMS. Textes, images, pages : tu mets à jour sans toucher au code. Pour une refonte ou une nouvelle fonction, tu nous écris et on chiffre."
        },
        {
          q: "J'ai déjà un site, on peut repartir de zéro ?",
          a: "Oui. On reprend ton contenu et ta marque si elle existe, on reconstruit avec une direction artistique dédiée, et ton nom de domaine reste le tien. Le montant final se cale sur devis après l'étude de ton besoin."
        }
      ]
    },
    boutique: {
      punch: "Tu as le produit. On livre la boutique : catalogue, panier, paiement CB, livraison. En ligne, prête à vendre.",
      desc: "Catalogue, panier et checkout, paiement CB, livraison, codes promo, gestion des commandes, domaine, SSL, Analytics, mise en ligne.",
      args: [
        "Tu ne bricoles rien. Paiement CB, livraison, codes promo : tout est branché et testé avant la mise en ligne. Toi, tu ajoutes tes produits et tu envoies le lien.",
        "Domaine, SSL, Analytics : compris dès le départ. Ta boutique est à ton nom, sécurisée, et tu vois d'où viennent tes visiteurs dès le premier jour.",
        "Tes commandes, tu les gères depuis ton back-office. Quand les relances te mangent tes journées, on branche l'{{label:automatisation}} {{price:automatisation}}."
      ],
      faq: [
        {
          q: "Je peux gérer mes produits moi-même après la livraison ?",
          a: "Oui. Catalogue, prix, codes promo, commandes : tu as la main depuis ton back-office, sans repasser par nous à chaque changement. Tu préfères qu'on veille dessus ? {{label:hebergement}} {{price:hebergement}}, en option, jamais imposée."
        },
        {
          q: "Le prix de départ, il couvre quoi ?",
          a: "Le périmètre de base : catalogue, panier, paiement CB, livraison, codes promo, domaine, SSL, Analytics, mise en ligne. Un besoin en plus fait évoluer le devis, et tu le sais avant de signer."
        },
        {
          q: "Boutique ou e-commerce avancé, je prends quoi ?",
          a: "Une langue, une devise, pas d'abonnement ni de CRM ? La boutique suffit. Multilingue, abonnements, stocks avancés, ERP : c'est l'{{label:ecommerce_avance}} {{price:ecommerce_avance}}. Écris-nous, on tranche avec toi au cadrage."
        }
      ]
    },
    ecommerce_avance: {
      punch: "Plusieurs langues, plusieurs devises, des abonnements, un CRM branché. La boutique taillée pour le volume.",
      desc: "Design personnalisé, multilingue et multi-devise, abonnements, CRM et automatisation, stocks avancés, ERP/API, espace client et dashboard.",
      args: [
        "Tu vends hors de France ? Chaque client commande dans sa langue et paie dans sa devise. Toi, tu gardes un seul back-office.",
        "CRM et automatisation sont dans le périmètre, pas en option : chaque commande alimente ta base client, les e-mails et les relances partent sans toi.",
        "Stocks avancés, ERP/API, espace client, dashboard : ta boutique parle à tes outils et tes chiffres restent au même endroit. À ton design, pas un template."
      ],
      faq: [
        {
          q: "J'ai déjà une boutique, vous pouvez la faire évoluer ?",
          a: "Oui, on prend le projet là où il en est. On regarde ce qui existe, on reprend tes données si besoin ({{label:migration_donnees}} {{price:migration_donnees}}) et on ajoute ce qui manque : langues, abonnements, CRM, stocks."
        },
        {
          q: "Les abonnements, ça marche comment ?",
          a: "Tes clients s'abonnent directement sur la boutique, le paiement se renouvelle tout seul, et tu suis tes abonnés depuis ton dashboard. Les formules, on les cadre avec toi avant de développer."
        },
        {
          q: "Je peux connecter mes outils existants ?",
          a: "Oui, c'est le rôle de la brique ERP/API. Tu as déjà un CRM ou un ERP, on le branche. Tu n'en as pas, on en met un en place et on le relie à la boutique. On liste tes outils au cadrage, chaque connexion est chiffrée dans le devis."
        }
      ]
    },
    brand_starter: {
      punch: "Ton nom, ton logo, tes couleurs : une marque qu'on reconnaît au premier scroll.",
      desc: "Positionnement, logo et ses variantes, couleurs, typos, univers graphique, mini brand book, assets réseaux. Tout prêt à poster.",
      args: [
        "Le positionnement d'abord, le logo ensuite. On cale ce que tu vends, à qui, pourquoi toi. Puis on dessine : ta marque parle à tes clients, pas à ton ego.",
        "Le mini brand book, c'est ta règle du jeu. Tu changes de graphiste, tu bosses avec un pote : tout le monde sort la même marque, pas trois versions.",
        "Les assets réseaux arrivent prêts à poster. Et quand il te faut un site derrière, on enchaîne : {{label:site_vitrine}} {{price:site_vitrine}}, même équipe, même univers."
      ],
      faq: [
        {
          q: "J'ai déjà un logo, tu repars dessus ?",
          a: "Tu nous l'envoies. S'il tient la route, on construit l'univers autour : variantes, couleurs, typos, assets. Sinon on te le dit cash et on repart proprement. Dans les deux cas, tu finis avec une identité cohérente."
        },
        {
          q: "C'est quoi la différence avec un logo seul ?",
          a: "Le {{label:logo}} {{price:logo}}, c'est un logo, point. Le Brand Starter, c'est une marque : positionnement, variantes du logo, palette, typos, mini brand book et assets réseaux prêts à l'emploi."
        },
        {
          q: "Le site est inclus ?",
          a: "Non, le Brand Starter c'est l'identité. Pour la marque et le site dans le même projet, regarde le {{label:brand_launch}} {{price:brand_launch}}. Sinon on ajoute un {{label:site_vitrine}} à part."
        }
      ]
    },
    brand_launch: {
      punch: "Marque, site, encaissement, e-mails pro : tu sors avec un business en ligne, pas une maquette.",
      desc: "Identité complète, site vitrine ou boutique, domaine et e-mails pro, solution d'encaissement, Analytics et SEO initial. Mis en ligne.",
      args: [
        "Une seule équipe pour l'identité et le site. Pas un logo d'un côté et un template de l'autre : ce que tu vois à l'écran, c'est ta marque.",
        "Domaine, e-mails pro, encaissement : tout ce qui traîne d'habitude pendant des semaines, on le règle avant la mise en ligne. Tu te concentres sur ce que tu vends.",
        "Analytics et SEO initial posés dès le départ : tu vois qui passe et d'où. Pour que ça reste en ligne et à jour : {{label:hebergement}} {{price:hebergement}}."
      ],
      faq: [
        {
          q: "Site vitrine ou boutique, je choisis quoi ?",
          a: "Tu présentes une activité : vitrine. Tu vends des produits avec paiement en ligne : boutique. Dis-nous ce que tu vends, on tranche ensemble au cadrage et on fixe le périmètre dans le devis."
        },
        {
          q: "Le prix affiché, c'est le prix final ?",
          a: "C'est un prix de départ. Le devis dépend du type de site, du nombre de pages ou de produits et des intégrations demandées. Tu reçois un chiffrage ligne par ligne avant qu'on lance quoi que ce soit."
        },
        {
          q: "Je peux encaisser dès la mise en ligne ?",
          a: "La solution d'encaissement est installée et testée avant la mise en ligne. L'activation de ton compte dépend du prestataire de paiement et de son processus de validation."
        }
      ]
    },
    brand_premium: {
      punch: "Identité, guidelines, pubs, landing pages, CRM : ta marque au complet, équipée pour tenir la distance.",
      desc: "Identité approfondie, brand guidelines, templates réseaux, supports pub, landing pages et copywriting, CRM, tracking, automatisations.",
      args: [
        "Guidelines complètes et templates réseaux : tu postes, tu délègues, tu lances des pubs, le rendu reste le tien. Ta marque ne se dilue pas quand tu grandis.",
        "Landing pages écrites et montées par nous, supports pub assortis : message, visuel et bouton pensés ensemble. Ton trafic atterrit sur une page faite pour ça.",
        "CRM, tracking, automatisations : chaque contact est enregistré, chaque source est mesurée, les relances partent seules. Tu pilotes aux chiffres, pas au feeling."
      ],
      faq: [
        {
          q: "Pourquoi pas juste le Brand Launch ?",
          a: "Le {{label:brand_launch}} te met en ligne : identité et site. Le Premium t'équipe pour la suite : guidelines, templates, supports pub, landing pages, CRM, tracking, automatisations. Si tu comptes lancer des campagnes, c'est celui-là."
        },
        {
          q: "Le site est compris dans le Premium ?",
          a: "Le Premium inclut les landing pages. Pour un site complet ou une boutique, on l'ajoute au devis ou on part sur le {{label:brand_launch}} selon ton besoin. Dis-nous ce que tu vends, on cale le bon montage."
        },
        {
          q: "Tu écris aussi les textes ?",
          a: "Oui, le copywriting des landing pages est inclus. On écrit dans le ton fixé par les guidelines, tu valides, on intègre. Les templates réseaux te servent ensuite à décliner toi-même sans repartir de zéro."
        }
      ]
    },
    logo: {
      punch: "Ton nom mérite une vraie signature. Un logo net, prêt à poser partout, à prix ferme.",
      desc: "Création de ton logo, livré en vectoriel et en exports web. Tarif fixe {{price:logo}} : tu sais ce que tu paies avant d'écrire.",
      args: [
        "Un client te juge en une seconde. Un logo net sur ton profil, ta carte, ton site : tu passes de « c'est qui ? » à « c'est sérieux ».",
        "Vectoriel plus exports web : il reste net sur une story comme sur une enseigne. Tu le poses partout, tu ne le refais jamais.",
        "Il te faut toute l'identité ? Positionnement, variantes, couleurs, typos, mini brand book, assets réseaux : c'est le {{label:brand_starter}} {{price:brand_starter}}."
      ],
      faq: [
        {
          q: "Je dois t'envoyer quoi pour démarrer ?",
          a: "Ton nom, ton activité, l'ambiance que tu veux, et des logos que tu aimes si tu en as. Tu envoies ça sur WhatsApp, on part de là."
        },
        {
          q: "Le prix, c'est vraiment ferme ?",
          a: "Oui. Le logo est en tarif fixe, pas un « dès ». Déclinaisons, charte, univers complet ? Ça devient un projet de marque, chiffré à part."
        },
        {
          q: "Je peux l'utiliser où ?",
          a: "Partout : site, réseaux, cartes, flyers, packaging. Le vectoriel s'adapte à toutes les tailles sans perdre en qualité."
        }
      ]
    },
    filtre: {
      punch: "Un filtre à ton nom sur Snap ou Insta, à tes couleurs, que tes clients peuvent porter en story.",
      desc: "Filtre Snapchat ou Instagram aux couleurs de ta marque, publié sur ton compte. Prix ferme {{price:filtre}}, tu choisis la plateforme.",
      args: [
        "Un filtre, c'est ta marque dans la story de quelqu'un d'autre. Pas une pub qu'on zappe : un truc que tes clients choisissent de porter.",
        "Soirée, boutique, lancement : le lieu a son filtre signé, chaque photo prise sur place porte ton nom. Ton affichage, sans passer par la pub.",
        "Tu lances une marque ? Le filtre complète les assets réseaux du {{label:brand_starter}} : même logo, mêmes couleurs, du feed jusqu'aux stories."
      ],
      faq: [
        {
          q: "Snapchat ou Instagram, il faut choisir ?",
          a: "Un filtre, une plateforme. Tu me dis où sont tes clients, on fait celui-là. Tu veux les deux ? Tu le dis sur WhatsApp, on cale ça."
        },
        {
          q: "Il te faut quoi de ma part ?",
          a: "Ton logo ou tes couleurs si tu les as, ton compte, et l'idée : cadre, effet, texte. Pas de logo ? On en fait un d'abord, tarif fixe {{price:logo}}."
        },
        {
          q: "Il sort sur quel compte ?",
          a: "Sur le tien, à ton nom. C'est toi que tes abonnés voient quand ils l'utilisent, pas nous. À toi de le partager à tes clients."
        }
      ]
    },
    flyer: {
      punch: "Un flyer qui se lit en deux secondes et qu'on garde. Print ou écran, prêt à sortir.",
      desc: "Création de ton flyer, livré en version print et en version web. Prix ferme {{price:flyer}} : ton offre, ton visuel, ton contact.",
      args: [
        "Ouverture, promo, événement, offre : le message en gros, le contact en clair. Celui qui le lit sait quoi faire juste après.",
        "Une seule création, deux usages. Le print pour la rue, le comptoir, la vitrine. Le web pour la story, le DM, le groupe Telegram.",
        "Ton flyer envoie les gens quelque part. Rien pour les recevoir ? Le {{label:site_vitrine}} {{price:site_vitrine}} : 5 pages, domaine, SSL, mis en ligne."
      ],
      faq: [
        {
          q: "Print et web, c'est le même fichier ?",
          a: "Non, deux exports. Un prêt pour l'imprimeur, un taillé pour les écrans. Tu déposes le premier, tu postes le second."
        },
        {
          q: "L'impression est comprise ?",
          a: "Non, le tarif couvre la création. Tu fais imprimer chez l'imprimeur de ton choix avec le fichier livré. Un doute sur le format ? Tu demandes sur WhatsApp."
        },
        {
          q: "Ça prend combien de temps ?",
          a: "Ça dépend du brief et de la charge du moment. On te donne le délai en direct sur WhatsApp, réponse sous 24 h."
        }
      ]
    },
    app_web: {
      punch: "Ton outil, dans un navigateur. Rien à installer : tu ouvres, ça tourne.",
      desc: "SaaS, CRM, ERP léger, dashboard, portail client, réservation : ton outil sur mesure, développé, testé et mis en ligne.",
      args: [
        "Un seul lien pour ton équipe et tes clients : données, comptes, actions, tableaux de bord au même endroit, à jour, depuis n'importe quel poste.",
        "Sur mesure, ça veut dire zéro fonction inutile. On code ce que ton business fait vraiment, pas un logiciel générique que tu subis.",
        "Livré en ligne, pas en maquette. Et pour que ça y reste : {{label:hebergement}} {{price:hebergement}}, serveurs, sauvegardes, surveillance. Toi, tu bosses."
      ],
      faq: [
        {
          q: "C'est quoi la différence avec un site ?",
          a: "Un site, ça présente. Une application web, ça travaille : comptes utilisateurs, données, actions, tableaux de bord. C'est un outil, pas une vitrine."
        },
        {
          q: "Je n'ai pas de cahier des charges, c'est bloquant ?",
          a: "Non. Tu écris avec ton idée, même mal ficelée : le type de projet, les fonctions que tu veux, ton budget si tu le connais, ton délai. On étudie, on cadre, tu reçois un devis chiffré ligne par ligne."
        },
        {
          q: "Ça marche sur téléphone ?",
          a: "Oui, dans le navigateur, sur ordinateur comme sur téléphone. Si tu veux une vraie app installée, publiée sur l'App Store et Google Play, regarde {{label:app_mobile}}."
        }
      ]
    },
    mvp_saas: {
      punch: "La première version vendable de ton SaaS : en ligne, abonnements branchés, prête pour de vrais utilisateurs.",
      desc: "Architecture, UX/UI, dashboard, paiement Stripe, abonnements, e-mails, analytics, mise en ligne : ton produit prêt pour de vrais clients.",
      args: [
        "Tu arrêtes de pitcher un PowerPoint. Tu envoies un lien, les gens s'inscrivent, ils testent. La discussion change tout de suite.",
        "Un MVP, c'est le minimum qui se vend, pas une démo : inscription, abonnement, paiement Stripe, e-mails. Le circuit complet, du premier clic à l'abonnement actif.",
        "On construit léger pour lancer vite et ajuster avec le retour terrain. Ensuite ça grandit par briques : {{label:automatisation}} {{price:automatisation}}, IA, API."
      ],
      faq: [
        {
          q: "MVP, ça veut dire bâclé ?",
          a: "Non. Ça veut dire recentré. On garde le cœur de ton idée, on le fait propre et stable, on met en ligne. Les fonctions bonus viennent après, quand tes utilisateurs te disent ce qui manque."
        },
        {
          q: "Le paiement, c'est inclus ?",
          a: "Oui : Stripe intégré, abonnements gérés, e-mails transactionnels et analytics pour suivre ce qui se passe. Le circuit de paiement fait partie du socle, pas d'une option à rajouter après."
        },
        {
          q: "Et si mon idée évolue en cours de route ?",
          a: "Ça arrive tout le temps. L'architecture est pensée pour ça : on ajoute des briques sans tout recommencer. Tu nous dis, on chiffre l'ajout, on avance."
        }
      ]
    },
    logiciel_metier: {
      punch: "Un logiciel taillé sur tes process. Pas l'inverse.",
      desc: "Utilisateurs, documents, CRM, stocks, facturation, reporting, workflows, API, exports Excel/PDF, IA interne. Bâti sur ta façon de bosser.",
      args: [
        "Les logiciels du marché t'imposent leur logique. Ici, c'est ta manière de travailler qui dessine l'outil : tes étapes, tes rôles, tes documents, tes validations.",
        "Clients, stocks, factures, reporting : un seul endroit, avec les exports Excel et PDF quand il te les faut. Plus de ressaisie entre cinq logiciels.",
        "Tes vieux fichiers ne partent pas à la poubelle : {{label:migration_donnees}} {{price:migration_donnees}}, on reprend l'existant proprement avant de basculer."
      ],
      faq: [
        {
          q: "On a déjà des outils, on repart de zéro ?",
          a: "Pas forcément. On connecte ce qui marche, on remplace ce qui bloque. Le logiciel parle à tes outils actuels par API, et tes données existantes sont reprises avec {{label:migration_donnees}}."
        },
        {
          q: "Mon équipe n'est pas très à l'aise avec l'informatique.",
          a: "C'est justement le point : l'interface reprend le vocabulaire et les gestes de ton équipe, pas un menu à quarante onglets. Chaque personne a son accès, et on construit avec vos retours pendant le développement."
        },
        {
          q: "C'est quoi l'IA interne ?",
          a: "Une IA branchée sur tes données à toi : retrouver un dossier, résumer, pré-remplir, classer. Elle bosse dans ton outil, avec tes infos, pas sur internet."
        }
      ]
    },
    marketplace: {
      punch: "Vendeurs d'un côté, acheteurs de l'autre. Toi au milieu, tu tiens la plateforme.",
      desc: "Vendeurs et acheteurs, catalogue, recherche, messagerie, avis, paiements, commissions, litiges, dashboard admin : la plateforme complète.",
      args: [
        "Paiements, commissions, litiges : le mécanisme qui fait tourner une marketplace est là dès le départ. Tu ne bricoles pas ça après coup avec trois outils externes.",
        "Tes vendeurs ont leur espace, tes acheteurs leur recherche, leurs avis, leur messagerie. Toi, tu pilotes tout du dashboard admin : règles, validations, commissions.",
        "Une marketplace repose sur la confiance : notes, avis, messagerie intégrée et gestion des litiges sont compris pour que la plateforme se tienne toute seule."
      ],
      faq: [
        {
          q: "Quelle différence avec une boutique e-commerce ?",
          a: "Une boutique, c'est toi qui vends. Une marketplace, ce sont d'autres vendeurs qui vendent chez toi : chacun son espace, ses produits, ses ventes. Toi, tu fixes les commissions et tu arbitres."
        },
        {
          q: "Comment sont gérés les paiements entre acheteurs et vendeurs ?",
          a: "Le module de paiement est intégré à la plateforme, avec le calcul des commissions et le traitement des litiges. Le schéma exact se cale sur ton modèle pendant l'étude, avant le devis."
        },
        {
          q: "Ça marche sur mobile ?",
          a: "Depuis le navigateur, oui : vendeurs et acheteurs l'utilisent depuis leur téléphone. Pour une app installée sur iPhone et Android, {{label:app_mobile_avancee}} intègre le module marketplace."
        }
      ]
    },
    app_mobile: {
      punch: "Ton app sur iOS et Android, publiée dans les stores. Ta marque à portée de pouce, tous les jours.",
      desc: "iOS et Android, UX/UI, backend, comptes utilisateurs, notifications, API, analytics, tests, publication App Store et Google Play.",
      args: [
        "Une icône sur leur écran d'accueil, une notification quand tu as quelque chose à dire. Le site, on l'oublie. L'app, elle reste.",
        "Une seule commande, deux plateformes : iOS et Android livrés ensemble, avec le backend et l'API qui font tourner l'app derrière.",
        "La publication sur l'App Store et Google Play est comprise : tests, soumission, allers-retours avec Apple et Google. Toi, tu attends le lien de téléchargement."
      ],
      faq: [
        {
          q: "Application mobile ou application web ?",
          a: "Si tes utilisateurs doivent l'ouvrir plusieurs fois par jour et recevoir des notifications, c'est l'app mobile. Pour un outil de gestion consulté au bureau, {{label:app_web}} {{price:app_web}} suffit souvent."
        },
        {
          q: "Ça marche avec mon site ou mon système existant ?",
          a: "Oui : l'API prévue dans le périmètre fait le lien entre l'app et tes outils actuels, site, boutique ou CRM. Tes données restent au même endroit, l'app vient les lire."
        },
        {
          q: "Et après la publication ?",
          a: "Analytics inclus pour suivre l'usage. Les mises à jour se chiffrent au besoin, et le backend peut tourner sur {{label:hebergement}} {{price:hebergement}} pour rester surveillé et sauvegardé."
        }
      ]
    },
    app_mobile_avancee: {
      punch: "Paiements, géoloc, chat, vidéo, IA : l'app qui fait tourner un vrai service, pas une vitrine mobile.",
      desc: "Paiements et abonnements, géolocalisation, chat, audio/vidéo, IA, marketplace, réservation, notifications, dashboard. Le niveau au-dessus.",
      args: [
        "Un service qui se réserve, se paie et se suit depuis le téléphone. Tes clients font tout dans l'app, ton dashboard te montre ce qui se passe.",
        "Chat, appels audio et vidéo, géolocalisation en direct : les fonctions qui demandent du temps réel et une vraie architecture derrière. On la construit.",
        "Une app de ce niveau réclame une infra qui suit : {{label:infra_business}} {{price:infra_business}} ou {{label:infra_critical}} sur devis. On dimensionne selon ton usage."
      ],
      faq: [
        {
          q: "Mobile simple ou avancée, comment je choisis ?",
          a: "Comptes, contenu, notifications : {{label:app_mobile}} suffit. Dès que tu ajoutes du paiement, de la géolocalisation, du chat, de l'audio/vidéo ou de l'IA, tu es sur l'avancée. Écris-nous, on tranche avec toi."
        },
        {
          q: "L'IA dans l'app, ça sert à quoi concrètement ?",
          a: "Ce que tu décides : assistant intégré, recommandations, tri automatique, recherche intelligente. On cadre le cas d'usage pendant l'étude. Pas une IA pour faire joli, une IA qui enlève une tâche."
        },
        {
          q: "Le prix de départ, il comprend quoi exactement ?",
          a: "C'est un point de départ, pas un forfait. Le devis final dépend des briques activées : paiement seul, ou paiement plus chat plus géolocalisation, ce n'est pas le même chantier. Tu reçois le détail ligne par ligne."
        }
      ]
    },
    automatisation: {
      punch: "Tes tâches répétitives tournent sans toi. Tu récupères tes heures.",
      desc: "Des workflows branchés sur ton CRM, tes e-mails, tes données et ton reporting. Tu cadres une fois, ça tourne.",
      args: [
        "Un lead arrive : il est rangé dans le CRM, le mail part, le rapport se remplit. Toi, tu n'as rien touché.",
        "Moins de copier-coller, moins d'oublis. Chaque étape est écrite noir sur blanc et se déroule pareil à chaque fois. Ton process change ? Le workflow suit.",
        "Tu vends en ligne ? C'est la suite logique de ta {{label:boutique}} : commandes, clients et relances traités sans saisie. Plus gros : {{label:automatisation_avancee}}."
      ],
      faq: [
        {
          q: "Quels outils tu peux brancher ?",
          a: "Ton CRM, ta messagerie, tes fichiers de données, ton reporting. On part de ce que tu utilises déjà et on écrit le workflow autour. S'il manque une brique, on te le dit avant le devis."
        },
        {
          q: "C'est quoi le prix de départ ?",
          a: "Ça démarre {{price:automatisation}}. C'est un point de départ : le tarif final dépend du nombre d'étapes et d'outils à connecter. Tu envoies ton process, on chiffre."
        },
        {
          q: "Il faut savoir coder ?",
          a: "Non. Tu décris ce que tu fais à la main aujourd'hui, on le traduit en workflow. Tu repars avec un système lisible, que tu suis sans toucher au code."
        }
      ]
    },
    bot_telegram: {
      punch: "Ton canal Telegram bosse pour toi : commandes, comptes, notifs, sans que tu sois dessus.",
      desc: "Un bot sur ton canal : prise de commande, paiement branché, comptes clients, notifications, routine automatisée. Installé, opérationnel.",
      args: [
        "Un client passe commande, le bot la prend, la note et le tient au courant. Toi, tu vois juste passer la notif.",
        "Accès, comptes, séquences automatiques : ton canal se gère seul. Plus de messages perdus, plus de client qui attend dans la file.",
        "Tu envoies du trafic vers Telegram ? Le bot accueille ce qui arrive et structure la suite. Pour lui donner une vraie conversation, ajoute l'{{label:integration_ia}}."
      ],
      faq: [
        {
          q: "Il fait quoi exactement dans mon canal ?",
          a: "Ce qu'on fixe ensemble au cadrage : accueillir, prendre une commande, gérer les accès et les comptes, envoyer des notifications, dérouler des séquences automatiques. Le périmètre est écrit avant le devis."
        },
        {
          q: "Il peut prendre les paiements ?",
          a: "Il se branche sur ta solution de paiement pour valider une commande : c'est dans le périmètre. On cale ensemble quelle solution, quels produits et quel parcours client."
        },
        {
          q: "Ça marche sur un canal existant ?",
          a: "Oui. On branche le bot sur ton canal ou ton groupe actuel, tu ne repars pas de zéro. Tes abonnés ne changent rien à leurs habitudes."
        }
      ]
    },
    bot_discord: {
      punch: "Ta commu tourne propre, même quand tu dors. Rôles, modération, accès : le bot tient le serveur.",
      desc: "Bot sur mesure pour ton serveur : rôles automatiques, modération, commandes, IA intégrée, tâches automatisées. Installé chez toi.",
      args: [
        "Un membre arrive, il reçoit son rôle et ses accès sans que tu lèves le petit doigt. Les accès payants aussi.",
        "Spam, insultes, liens louches : la modération applique tes règles en continu, sans humeur et sans oubli. Ton serveur reste un endroit où on a envie de rester.",
        "Une commande, une réponse. Avec l'IA dedans, le bot répond aux questions courantes de ta commu et oriente vers le bon salon. Toi, tu gardes les décisions."
      ],
      faq: [
        {
          q: "J'ai déjà un bot gratuit, pourquoi du sur mesure ?",
          a: "Parce qu'il fait exactement ce dont ton serveur a besoin, et rien d'autre : tes règles, tes rôles, tes commandes, ton IA. Pas de fonctions inutiles, pas de limites imposées par un plan."
        },
        {
          q: "L'IA fait quoi dans le bot ?",
          a: "Elle répond aux questions récurrentes de ta commu, résume, oriente. Tu décides de son périmètre et de son ton avant la mise en ligne, et de ce qui remonte à toi."
        },
        {
          q: "Le bot remplace mes modos ?",
          a: "Il fait le boulot ingrat en continu : filtrage, rôles, commandes. Tes modos gardent les décisions qui demandent un humain. Le bot les soulage, il ne les remplace pas."
        }
      ]
    },
    integration_ia: {
      punch: "L'IA branchée dans tes outils, pas dans un onglet à côté.",
      desc: "Chat IA, génération de contenu, analyse de données, recherche intelligente : intégrés dans ton site, ton app ou ton back-office.",
      args: [
        "Tu poses une question, tu as la réponse depuis tes propres données. Fini les recherches à la main dans dix fichiers et les exports à trier.",
        "Contenus, fiches, réponses clients : l'IA sort le premier jet dans ton ton, tu valides. Tu passes ton temps sur ce qui compte.",
        "Ça se branche sur ton site, ton app ou ta {{label:boutique}}. Et si tu veux qu'elle tienne un poste complet à ta place, on monte vers l'{{label:agent_ia}}."
      ],
      faq: [
        {
          q: "Intégration IA ou agent IA, c'est quoi la différence ?",
          a: "L'intégration ajoute une capacité à un outil que tu as déjà : chat, génération, analyse, recherche. L'agent mène une mission de bout en bout : vente, support, qualification, reporting. On te dit lequel colle à ton cas."
        },
        {
          q: "L'IA va dire n'importe quoi à mes clients ?",
          a: "On cadre son périmètre : ce qu'elle sait (tes données), ce qu'elle a le droit de dire, et quand elle passe la main à un humain. Tu valides avant la mise en ligne."
        },
        {
          q: "Il faut déjà avoir un outil ?",
          a: "Idéalement oui : un site, une app, un CRM, une boutique. Si tu pars de zéro, on te construit la base d'abord, l'IA vient ensuite. On cadre ça dès le premier message."
        }
      ]
    },
    bot_whatsapp: {
      punch: "Celui qui te répond si tu écris maintenant. Demain, il répond à tes clients.",
      desc: "Réponses automatiques, support, qualification des prospects, CRM alimenté, notifications, passage à l'humain. Il bosse, tu conclus.",
      args: [
        "Tu veux la preuve ? Écris sur WhatsApp : il accueille, trie, donne les tarifs et passe la main à Arbi quand ça devient sérieux. Exactement ce qu'il fera pour toi.",
        "Tes prospects écrivent à 23 h, il répond à 23 h. Tarifs, offres, questions récurrentes : il les connaît par cœur et les redonne à chaque client.",
        "Branché sur ton CRM, il note tout et te prévient quand un client est chaud. Tu reprends une conversation déjà qualifiée, et tu conclus."
      ],
      faq: [
        {
          q: "Il répond à tout ?",
          a: "Il répond à ce que tu lui as appris : ton catalogue, tes tarifs, tes règles. Hors périmètre, il ne bluffe pas : il prévient et passe la main à un humain."
        },
        {
          q: "Il encaisse les paiements ?",
          a: "Non. Il qualifie, informe et prépare la vente, mais il ne prend jamais d'argent : le paiement se fait avec toi, en direct, sur ta solution habituelle."
        },
        {
          q: "Et si un client veut parler à une vraie personne ?",
          a: "Il bascule : notification chez toi, historique de la conversation sous les yeux, tu reprends là où il s'est arrêté."
        }
      ]
    },
    agent_ia: {
      punch: "Il trie, relance et prépare la vente. Tu arrives pour conclure.",
      desc: "Un agent qui tient un poste : commercial, service client, qualification de leads, recherche et analyse, reporting. Une mission, un cadre.",
      args: [
        "Le bot répond ; l'agent agit. Chaque lead est qualifié, relancé, rangé. Tu ne parles plus qu'à ceux qui sont prêts.",
        "Service client à toute heure, avec tes réponses, tes délais, tes règles. Le client a sa réponse, toi tu as la trace.",
        "Il cherche, il analyse, il te fait le point : un reporting clair, pas un tableau que personne ne lit. Branché sur tes canaux, dont ton {{label:bot_whatsapp}}."
      ],
      faq: [
        {
          q: "En quoi c'est différent d'un simple bot ?",
          a: "Un bot suit un script. Un agent poursuit un objectif : il enchaîne les étapes, décide quoi faire ensuite et rend compte. Le cadre, c'est toi qui le fixes ; l'exécution, c'est lui."
        },
        {
          q: "Je garde le contrôle ?",
          a: "Oui. Tu définis ce qu'il peut faire, dire et envoyer, avec des points de validation humaine là où tu le veux. Rien ne sort du cadre que tu as validé."
        },
        {
          q: "Il remplace un commercial ?",
          a: "Il prend tout l'amont : accueil, questions, tri, relances, compte rendu. La signature et l'encaissement restent dans tes mains. Il t'amène des dossiers propres."
        }
      ]
    },
    automatisation_avancee: {
      punch: "Quand tes outils doivent se parler pour de vrai : IA, API, webhooks, bases de données.",
      desc: "Sur devis. IA intégrée, plateformes connectées, API et webhooks, bases de données : le système complet, chiffré ligne par ligne.",
      args: [
        "Ton CRM, ta boutique, ta base, ton IA : un seul système qui circule. Plus de double saisie, plus d'export à la main.",
        "Chaque événement déclenche la suite : une commande ici, un stock à jour là, un client créé dans le CRM. Ça part, ça se note, ça se relance, sans que personne ne clique.",
        "Sur devis, parce que chaque montage est différent. Tu décris ton système, on cadre l'architecture, tu reçois un chiffrage clair, ligne par ligne."
      ],
      faq: [
        {
          q: "Pourquoi c'est sur devis ?",
          a: "Parce que le prix dépend du nombre d'outils, des volumes et des règles métier. On étudie ton système, on te propose une architecture, puis on chiffre ligne par ligne. Pas de chiffre au doigt mouillé."
        },
        {
          q: "Automatisation simple ou avancée ?",
          a: "Simple : des workflows entre tes outils, {{price:automatisation}}. Avancée : une couche dédiée avec API, webhooks, bases de données et IA. Si tu hésites, écris, on te dit dans quelle case tu es."
        },
        {
          q: "Et après la mise en ligne ?",
          a: "Si tu le veux : {{label:hebergement}} en option, jamais imposé. Sinon on te remet les accès et tu reprends la main."
        }
      ]
    },
    integration_api: {
      punch: "Tes outils se parlent enfin. Tu arrêtes de recopier, l'info circule toute seule.",
      desc: "On connecte tes logiciels et services entre eux : site, boutique, CRM, facturation, messagerie. Testé, mis en prod, ça tourne.",
      args: [
        "Fini la double saisie. Une commande tombe sur ton site, elle arrive dans ton outil de gestion. Tu ne recopies plus rien, tu n'oublies plus rien.",
        "Tu gardes tes outils. On ne te fait pas tout changer : on branche ce que tu as déjà et on construit le pont entre les deux côtés.",
        "Tarif {{price:integration_api}}, selon les outils à relier. Pour enchaîner des actions derrière, l'automatisation {{price:automatisation}} prend le relais."
      ],
      faq: [
        {
          q: "Quels outils tu peux connecter ?",
          a: "Tout ce qui expose une API ou des webhooks : site, boutique, CRM, facturation, messagerie, tableur en ligne, logiciel métier. Envoie ta liste sur WhatsApp, on vérifie ce qui se branche avant de chiffrer."
        },
        {
          q: "Pourquoi un prix « dès » ?",
          a: "Relier deux outils simples et synchroniser cinq systèmes avec des règles métier, ce n'est pas le même chantier. Le prix de départ couvre une connexion cadrée ; le devis, ligne par ligne, précise le reste."
        },
        {
          q: "Ça tient dans le temps ?",
          a: "Livrée testée. Pour la surveiller et la garder à jour quand un outil change de version, il y a {{label:hebergement}} : à toi de voir si tu veux qu'on la suive ou non."
        }
      ]
    },
    systeme_paiement: {
      punch: "Tu vends, ça encaisse. Paiement à l'unité, abonnement ou marketplace : tout est branché.",
      desc: "Checkout, paiement en ligne, abonnements, paiements marketplace. Stripe ou PayPal, installé, testé de bout en bout, prêt à encaisser.",
      args: [
        "Un checkout qui bloque, c'est un client qui part. On installe un parcours clair, testé sur mobile comme sur ordinateur, avec les cas d'erreur gérés.",
        "Abonnement récurrent, checkout classique ou commissions marketplace : on monte le modèle qui colle à ton offre, pas un bouton Payer collé au hasard.",
        "Stripe ou PayPal, tu choisis. Ça démarre {{price:systeme_paiement}}, devis selon ton modèle. Pas encore de boutique ? {{label:boutique}} l'inclut d'entrée."
      ],
      faq: [
        {
          q: "Stripe ou PayPal, lequel choisir ?",
          a: "Ça dépend de ce que tu vends, à qui, et de la structure qui encaisse. On regarde ton cas avant le devis et on te dit lequel s'installe le plus simplement, ou si les deux ont un sens pour toi."
        },
        {
          q: "Je peux encaisser des abonnements ?",
          a: "Oui. Mensuel ou annuel, on configure les formules et le prélèvement récurrent via Stripe ou PayPal. Tu suis tout depuis leur tableau de bord."
        },
        {
          q: "L'argent passe par vous ?",
          a: "Jamais. Le compte Stripe ou PayPal est à ton nom, l'argent arrive chez toi. Nous, on branche et on configure ; toi, tu gardes la main sur ton compte et tes virements."
        }
      ]
    },
    migration_donnees: {
      punch: "Tu changes d'outil, pas de mémoire. Tes données passent d'un système à l'autre, propres et complètes.",
      desc: "Transfert de tes données vers le nouveau système : export, nettoyage, restructuration, contrôle d'intégrité avant la bascule.",
      args: [
        "Le risque quand tu changes d'outil, c'est le trou dans l'historique. Clients, commandes, catalogue : on transfère, on vérifie que tout est là, puis on coupe l'ancien.",
        "On en profite pour nettoyer. Doublons, champs vides, formats bancals : tu repars sur une base propre, pas sur le bazar de l'ancien outil.",
        "Ça démarre {{price:migration_donnees}}, selon le volume et l'état de tes données. Nouveau CRM derrière ? {{label:crm_erp}} {{price:crm_erp}} pour brancher le reste."
      ],
      faq: [
        {
          q: "Mon activité s'arrête pendant la migration ?",
          a: "On travaille sur un export, on prépare tout à côté, on bascule une fois vérifié. L'ancien système reste en place jusqu'à la validation du nouveau ; le créneau exact se cale avec toi au devis."
        },
        {
          q: "Et si les formats ne correspondent pas ?",
          a: "C'est le cœur du travail. On prépare une correspondance champ par champ entre l'ancien et le nouveau système, on transforme ce qui doit l'être et on vérifie le résultat avant de tout passer."
        },
        {
          q: "Comment je sais que rien n'a été perdu ?",
          a: "Par des contrôles d'intégrité : nombre d'enregistrements, totaux, vérifications croisées sur des cas réels. Tu reçois le bilan et tu valides avant qu'on referme l'ancien outil."
        }
      ]
    },
    dashboard: {
      punch: "Tes chiffres au même endroit, à jour. Tu ouvres, tu sais où tu en es.",
      desc: "Un tableau de bord sur mesure : ventes, marketing, finance, logistique. Les indicateurs que tu suis vraiment, un reporting à partager.",
      args: [
        "Fini le tableur du dimanche soir. Tes ventes, tes dépenses, tes stocks se lisent sur un seul écran, pas reconstruits à la main chaque semaine.",
        "On choisit les bons indicateurs avec toi. Pas trente courbes pour faire joli : les quelques chiffres qui décident de ta semaine, sur la période qui t'intéresse.",
        "Ça part {{price:dashboard}} et suit une source principale. Plusieurs outils à croiser, Shopify, Stripe, CRM ? {{label:dashboard_multi}} {{price:dashboard_multi}}."
      ],
      faq: [
        {
          q: "Il se met à jour tout seul ?",
          a: "C'est le principe : le dashboard est branché sur ta source de données et se rafraîchit sans ressaisie. La fréquence se règle selon ce que ton outil permet."
        },
        {
          q: "Quelle différence avec les stats de ma boutique ou de mon CRM ?",
          a: "Tes outils te montrent leurs propres chiffres, à leur façon. Le dashboard reprend ce qui compte pour toi, le présente comme tu le lis, et te sort un reporting prêt à partager à ton équipe ou à un associé."
        }
      ]
    },
    creation_api: {
      punch: "Ta propre API. Documentée, sécurisée, prête à être branchée par tes apps et tes partenaires.",
      desc: "Une API REST sur mesure : endpoints, authentification, documentation claire, sécurisation, maintenance possible dans la durée.",
      args: [
        "Tes données deviennent un produit. Une appli, un partenaire, un revendeur : ils se branchent sur ton API sans toucher à ton système.",
        "Documentation propre, livrée avec. Un dev externe lit la doc et code. Il n'a pas besoin de t'appeler toutes les heures pour comprendre.",
        "Sécurisée dès le départ : clés d'accès et droits. Ça démarre {{price:creation_api}}. Hébergée et surveillée ensuite avec {{label:hebergement}} {{price:hebergement}}."
      ],
      faq: [
        {
          q: "Pourquoi une API plutôt qu'une intégration ?",
          a: "L'intégration relie deux outils précis. L'API ouvre ton système à tout le monde, proprement, avec des règles d'accès. Plusieurs partenaires ou applis doivent se brancher ? C'est l'API. Sinon, on te le dit franchement au cadrage."
        },
        {
          q: "Sécurisée, ça veut dire quoi concrètement ?",
          a: "Authentification par clés ou jetons, droits par utilisateur, chiffrement des échanges. Le niveau exact dépend de la sensibilité de tes données et se fixe au devis."
        },
        {
          q: "Qui la maintient après ?",
          a: "Toi, ton équipe, ou nous. La maintenance fait partie du périmètre si tu la veux : correctifs, mises à jour de sécurité, doc tenue à jour. Chiffrée à part, jamais imposée."
        }
      ]
    },
    crm_erp: {
      punch: "Clients, stocks, factures : un seul outil, synchronisé. Plus rien qui traîne dans trois fichiers.",
      desc: "Connexion de ton CRM ou ERP à ton site, ta boutique et tes outils : synchronisation des données, automatisation des tâches qui reviennent.",
      args: [
        "Un client appelle, tu as tout sous les yeux : historique, commandes, factures, échanges. Tu réponds en sachant de quoi tu parles.",
        "Relances, mises à jour de statut, alertes de stock, création de fiches : ce qui te prend une heure par jour tourne en tâche de fond, sans oubli.",
        "Ça part {{price:crm_erp}}. Ta boutique tourne déjà ? C'est le rebond logique après {{label:boutique}} : on la branche, la vente met le stock à jour, la facture part."
      ],
      faq: [
        {
          q: "Vous travaillez avec quel CRM ou ERP ?",
          a: "Ceux qui exposent une API, ce qui couvre la grande majorité des outils du marché. Dis-nous lesquels tu utilises : on vérifie ce qu'ils permettent avant de chiffrer quoi que ce soit."
        },
        {
          q: "J'ai déjà un CRM, mais personne ne s'en sert.",
          a: "Classique. Souvent c'est parce qu'il n'est relié à rien et qu'il faut tout saisir à la main. On le branche à ta boutique, ta messagerie, ta facturation, et il se remplit tout seul."
        },
        {
          q: "La synchronisation marche dans les deux sens ?",
          a: "Elle peut, selon ce que tes outils autorisent et ce que tu veux. On définit ensemble quelle source fait foi pour chaque donnée, pour éviter que deux systèmes s'écrasent l'un l'autre."
        }
      ]
    },
    dashboard_multi: {
      punch: "Shopify, Stripe, CRM, Analytics : toutes tes sources sur un écran. Tu compares, tu tranches.",
      desc: "Un tableau de bord qui croise CRM, ERP, Shopify, Stripe, Analytics et tes API. Une vue, toutes tes sources, comparées entre elles.",
      args: [
        "Ton trafic dans Analytics, tes ventes dans Shopify, tes encaissements dans Stripe. Séparés, ils ne disent rien. Alignés sur les mêmes dates, tu vois enfin les liens.",
        "Chaque source est connectée directement et rafraîchie automatiquement. Plus d'export du lundi matin, plus de fichier « final-v3 » : la vue est vivante.",
        "Ça démarre {{price:dashboard_multi}}, selon le nombre de sources. Trop de données à structurer ? On passe sur {{label:data_platform}} {{price:data_platform}}."
      ],
      faq: [
        {
          q: "Combien de sources vous branchez ?",
          a: "Celles du périmètre pour commencer : CRM, ERP, Shopify, Stripe, Analytics, API maison. Chaque source supplémentaire est étudiée au cadrage : c'est ce qui fait bouger le devis."
        },
        {
          q: "Et si un outil n'a pas d'API ?",
          a: "On regarde ce qu'il sait exporter et on cherche le chemin. Si ce n'est pas propre, on te le dit avant de chiffrer, pas après."
        },
        {
          q: "C'est quoi la limite avant de passer à la data platform ?",
          a: "Le dashboard multi-sources affiche et compare. Quand tu veux centraliser tout l'historique, retraiter les données en profondeur ou les réutiliser dans d'autres outils, c'est {{label:data_platform}} qui prend le relais."
        }
      ]
    },
    data_platform: {
      punch: "Toutes tes données, centralisées, propres, exploitables. La base sur laquelle tout le reste se construit.",
      desc: "Collecte, stockage centralisé, transformation, exploitation : reporting, exports, alimentation de tes outils. Pensée pour le volume.",
      args: [
        "Un endroit unique où tes données vivent. Boutique, CRM, pub, logistique : tout rentre, tout est nettoyé, tout parle le même langage.",
        "Nettoyées et structurées une fois, réutilisées partout : reporting, outils internes, partenaires. Tu ne refais plus le même travail à chaque question.",
        "C'est le gros chantier data, {{price:data_platform}} sur devis détaillé. Tu n'en es pas encore là ? Commence par {{label:dashboard_multi}} {{price:dashboard_multi}}."
      ],
      faq: [
        {
          q: "C'est pour quelle taille de business ?",
          a: "Pour ceux qui ont plusieurs sources, du volume, et des questions auxquelles un dashboard seul ne répond plus : e-commerce multi-canal, marketplace, SaaS, activité avec du stock et de la logistique."
        },
        {
          q: "Qu'est-ce que je reçois concrètement ?",
          a: "Un socle de données centralisé et documenté, les connecteurs vers tes sources, les traitements qui rendent les données propres et cohérentes, et les sorties prévues au cadrage : reporting, exports ou accès pour tes outils."
        },
        {
          q: "Vous hébergez la plateforme ?",
          a: "On peut : elle tourne sur une infra dimensionnée, surveillée et maintenue, chiffrée à part ({{label:infra_business}}, ou {{label:infra_critical}} sur devis selon les enjeux). Ou sur la tienne, si tu en as déjà une."
        }
      ]
    },
    mini_jeu: {
      punch: "Un jeu dans le navigateur, à tes couleurs. Tes visiteurs jouent au lieu de scroller.",
      desc: "Jeu concours, animation marketing ou expérience interactive : conçu, développé, testé, mis en ligne avec un lien à partager.",
      args: [
        "Un lien, rien à installer. Ton audience clique et joue direct dans le navigateur, sur téléphone comme sur ordi. Zéro friction entre ton post et la partie.",
        "Tout est fait chez nous : mécanique, écrans, développement, tests, mise en ligne. Tu arrives avec l'idée, tu repars avec un jeu qui porte ta marque.",
        "Il se branche sur ce que tu as déjà : site, boutique, campagne. Pour qu'il reste en ligne sans que tu t'en occupes, on ajoute {{label:hebergement}} {{price:hebergement}}."
      ],
      faq: [
        {
          q: "Ça marche sur mobile ?",
          a: "Oui. Le jeu tourne dans le navigateur, sans rien télécharger : un lien suffit, sur téléphone comme sur ordinateur. On le teste avant la mise en ligne."
        },
        {
          q: "Je n'ai pas encore de concept précis ?",
          a: "Pas grave. Dis-nous l'objectif (jeu concours, animation d'une campagne, expérience de marque) et on te propose une mécanique qui colle. On valide ensemble avant de développer."
        },
        {
          q: "Le prix « dès », il couvre quoi ?",
          a: "C'est un prix de départ pour une mécanique simple. Le devis dépend du type de jeu, du nombre d'écrans et des intégrations voulues. Envoie ton idée, on te chiffre ligne par ligne."
        }
      ]
    },
    jeu_video: {
      punch: "Ton concept devient un vrai jeu. Game design, gameplay, backend, multijoueur : on produit tout.",
      desc: "Production complète à partir de ton concept : game design, gameplay, interface, backend et multijoueur si ton projet le demande.",
      args: [
        "Pas besoin d'une équipe de studio. Tu viens avec le concept, on structure le game design, on développe, on teste, on livre. Validé avec toi avant le code.",
        "Un jeu, c'est aussi ce qu'on ne voit pas : le backend et le multijoueur. Une seule équipe sur toute la chaîne, la partie serveur construite en même temps que le reste.",
        "Six étapes, un seul interlocuteur, de la demande à la mise en ligne. Un jeu en ligne a besoin de serveurs qui suivent : {{label:infra_business}} {{price:infra_business}}."
      ],
      faq: [
        {
          q: "Je n'ai qu'une idée, pas de document ?",
          a: "C'est suffisant pour démarrer. Écris-nous l'idée, le type de jeu et ce que le joueur doit ressentir : l'étude sert justement à transformer ça en game design avant le devis."
        },
        {
          q: "Vous faites du multijoueur ?",
          a: "Oui, le multijoueur fait partie du périmètre. Il change la structure du backend et le devis, donc dis-le dès le premier message."
        },
        {
          q: "Pourquoi « dès » et pas un prix fixe ?",
          a: "Parce qu'un jeu se chiffre sur son contenu : écrans, mécaniques, multijoueur ou non. Le prix affiché est le point de départ, le devis détaille le reste, ligne par ligne."
        }
      ]
    },
    hebergement: {
      punch: "Ton site reste en ligne, sauvegardé, surveillé. Tu n'y penses plus.",
      desc: "Serveurs, certificat SSL, sauvegardes, monitoring et sécurité, gérés chaque mois par l'équipe qui a construit ton site.",
      args: [
        "Un site qui tombe un dimanche soir, personne ne le remarque avant lundi. Avec le monitoring, on est prévenus, on intervient, tu bosses.",
        "Sauvegardes, SSL renouvelé, sécurité suivie : les corvées techniques qui te coûtent une soirée si tu les fais toi-même, on les prend. Si un truc casse, on restaure.",
        "La suite logique de ton {{label:site_vitrine}} ou de ta {{label:boutique}} : construit par nous, maintenu par nous. En option, jamais imposé."
      ],
      faq: [
        {
          q: "C'est obligatoire avec un site Ghost Studio ?",
          a: "Non. La maintenance est une option, jamais imposée. Ton site est mis en ligne avec son hébergement ; l'abonnement ajoute le suivi mensuel : sauvegardes, monitoring, sécurité."
        },
        {
          q: "Qu'est-ce qui est compris chaque mois ?",
          a: "Les serveurs, le certificat SSL, les sauvegardes, le monitoring et la sécurité. Le tarif affiché est un point de départ : il dépend de ton site et de ce qu'il faut surveiller. On te le confirme avant de démarrer."
        },
        {
          q: "Et si mon site grossit ?",
          a: "On passe sur {{label:infra_business}} : ressources renforcées, même monitoring, même équipe. Un message sur WhatsApp suffit, tu ne changes rien de ton côté."
        }
      ]
    },
    infra_business: {
      punch: "Plus de trafic, plus d'outils, plus de charge : une stack renforcée et surveillée, gérée pour toi.",
      desc: "Ressources renforcées, monitoring et maintenance suivis chaque mois. Le socle de ta boutique, ton app, tes bots quand ça monte en charge.",
      args: [
        "Boutique, application, bots, dashboard : quand plusieurs briques tournent en même temps, un hébergement simple ne suit plus. Ici, les ressources sont prévues pour ça.",
        "Le monitoring, c'est nous qui le regardons. Un service qui ralentit ou qui plante, on le voit et on intervient : tu n'apprends pas les problèmes par tes clients.",
        "Le socle d'un {{label:ecommerce_avance}} ou d'une {{label:app_web}}. Et si ton activité ne tolère aucune coupure, on passe sur {{label:infra_critical}}, sur devis."
      ],
      faq: [
        {
          q: "Quelle différence avec Hébergement & maintenance ?",
          a: "Même base (serveurs, SSL, sauvegardes, monitoring, sécurité), avec des ressources renforcées et une maintenance plus suivie. C'est l'étape d'après, quand un site simple devient une vraie stack."
        },
        {
          q: "Je n'ai pas d'équipe technique, c'est un problème ?",
          a: "C'est justement le cas prévu. On gère les serveurs, la surveillance et la maintenance. Toi, tu nous écris sur WhatsApp si quelque chose bouge, et on s'en occupe."
        },
        {
          q: "Le tarif est ferme ?",
          a: "Le prix affiché est un point de départ : il dépend des ressources nécessaires et du nombre de services à surveiller. On te donne le montant exact après l'étude, avant de lancer quoi que ce soit."
        }
      ]
    },
    infra_critical: {
      punch: "Quand la panne n'est pas une option : haute dispo, redondance, scaling, plan de reprise.",
      desc: "Architecture haute disponibilité, redondance, scaling et reprise après incident, étudiés et dimensionnés sur devis pour ton activité.",
      args: [
        "Redondance : pas de point unique de défaillance. Si une machine lâche, une autre est déjà là pour prendre le relais pendant qu'on traite l'incident.",
        "Scaling : la charge monte d'un coup, un lancement, un pic de commandes, une saison. Les ressources suivent, l'infra ne s'écroule pas.",
        "Reprise après incident : un plan défini à l'avance, quoi restaurer, dans quel ordre, par qui. Le socle d'une {{label:marketplace}} ou d'une {{label:data_platform}}."
      ],
      faq: [
        {
          q: "Pourquoi sur devis ?",
          a: "Parce qu'il n'existe pas deux infrastructures critiques identiques : niveau de disponibilité visé, volume, contraintes métier. On étudie ton cas et on chiffre une architecture, pas un forfait."
        },
        {
          q: "C'est pour qui ?",
          a: "Pour un service dont l'arrêt bloque ton activité ou tes clients : marketplace, SaaS avec abonnés, plateforme data, outil métier utilisé toute la journée. Pour un site vitrine, {{label:hebergement}} suffit."
        },
        {
          q: "Par où on commence ?",
          a: "Par ta demande sur WhatsApp : ce que tu fais tourner, ce qui ne doit jamais s'arrêter, ce que tu as déjà en place. Le bot qualifie, Arbi prend le relais, puis l'étude et le devis détaillé."
        }
      ]
    }
  }
};
