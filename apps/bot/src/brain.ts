import {
  categoryForService,
  classifyIntent,
  detectTone,
  normalizeText,
  resolveService,
  type ConversationStateData,
  type Core,
  type Intent,
} from "@arbi/core";

export type Route = "agent" | "niveau4" | "alerte_directe";

export interface Analysis {
  intent: Intent;
  serviceKey: string | null;
  categorie: string;
  route: Route;
  motif: string;
  combinedText: string;
}

const BUDGET_RE = /(?:budget|autour de|environ|max|maximum|jusqu'?a)\s*(?:de\s*)?(\d[\d\s]{0,8})\s*(?:€|euros?)/iu;
const DELAY_RE = /\b(urgent|rapidement|au plus vite|cette semaine|ce mois|d'?ici\s+\S+(?:\s+\S+)?|sous\s+\d+\s+(?:jours?|semaines?|mois))\b/iu;

/**
 * Routeur explicite (niveaux 1-4) : met à jour l'état de conversation
 * (registre, service en cours, intention, progression) puis décide de la route.
 * Le contexte est consulté AVANT de décider, jamais après.
 */
export function analyzeInbound(
  core: Core,
  state: ConversationStateData,
  texts: string[],
  alertThreshold: number,
): Analysis {
  const combinedText = texts.join("\n");
  const lastText = texts[texts.length - 1] ?? combinedText;

  // 1) Registre — réévalué à chaque message.
  state.toneRegister = detectTone(lastText, state.toneRegister);

  // 2) Intention.
  const { intent } = classifyIntent(combinedText);

  // 3) Service visé — la mémoire de conversation prime : si rien de nouveau
  //    n'est détecté, on RESTE sur le service en cours (« Et les prix ? »
  //    porte sur le service discuté, pas sur le catalogue entier).
  const resolved = resolveService(combinedText, core.synonyms.active());
  let progressed = false;
  if (resolved && resolved !== state.serviceEnCours) {
    state.serviceEnCours = resolved;
    state.sousCategorie = null;
    progressed = true;
  }

  // 4) Mémoire du besoin / budget / délai — ne jamais redemander une info donnée.
  const budgetMatch = combinedText.match(BUDGET_RE);
  if (budgetMatch?.[1] && !state.budget) {
    state.budget = `${budgetMatch[1].replace(/\s+/g, " ").trim()} €`;
    progressed = true;
  }
  const delayMatch = combinedText.match(DELAY_RE);
  if (delayMatch?.[1] && !state.delai) {
    state.delai = delayMatch[1];
    progressed = true;
  }
  if (!state.besoin && normalizeText(combinedText).split(" ").length >= 4 && intent !== "tarif") {
    state.besoin = combinedText.slice(0, 160);
    progressed = true;
  }
  if (state.serviceEnCours && resolved === null && intent === "sourcing" && !state.sousCategorie) {
    // Ex. « des casquettes » après « je cherche un agent » : précision produit.
    state.sousCategorie = combinedText.slice(0, 80);
    progressed = true;
  }

  // 5) Progression : un échange qui n'apporte ni service, ni info, ni intention
  //    nouvelle incrémente le compteur ; sinon il le remet à zéro.
  if (progressed || intent !== state.lastIntent) {
    state.sansProgression = 0;
  } else {
    state.sansProgression += 1;
  }
  state.lastIntent = intent;

  const categorie = categoryForService(state.serviceEnCours);

  // 6) Route.
  let route: Route = "agent";
  let motif = "";
  if (intent === "reclamation") {
    route = "alerte_directe";
    motif = "réclamation ou problème";
  } else if (intent === "demande_humain") {
    route = "niveau4";
    motif = "le client demande un humain";
  } else if (state.sansProgression >= alertThreshold) {
    route = "alerte_directe";
    motif = `${alertThreshold} échanges sans progression`;
  }

  return { intent, serviceKey: state.serviceEnCours, categorie, route, motif, combinedText };
}
