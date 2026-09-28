import type Anthropic from "@anthropic-ai/sdk";
import {
  billingStatus,
  extractClientFacts,
  logDecision,
  summarizeConversation,
  normalizeText,
  triggerAlert,
  type AlertDeps,
  type Core,
  type Logger,
  type WhatsAppClient,
} from "@arbi/core";
import type { SalesAgent } from "./agent";
import { analyzeInbound, type Analysis } from "./brain";
import { sendNiveau4 } from "./tools";
import type { InboundItem } from "./queue";

/**
 * Garde-fou de coût de l'extraction de mémoire client (§5) : au plus un
 * déclenchement toutes les 4 minutes par contact. Mémoire du process (un
 * seul processus bot en prod, le dashboard n'appelle jamais cette fonction) :
 * un redémarrage remet le throttle à zéro, impact négligeable.
 */
const FACTS_EXTRACTION_INTERVAL_MS = 4 * 60 * 1000;
const factsExtractionThrottle = new Map<string, number>();

/**
 * Tâche de fond, jamais awaited dans le chemin de réponse : extrait des faits
 * durables de la conversation et les mémorise, au plus une fois toutes les
 * 4 minutes par contact.
 */
function scheduleFactsExtraction(
  core: Core,
  llm: Anthropic,
  model: string,
  log: Logger,
  waId: string,
  analysis: Analysis,
): void {
  // Plus conditionné à `progressed` : ce drapeau ne repasse à true que
  // lorsqu'un champ d'état passe de vide à rempli, donc plus jamais après
  // deux ou trois messages. Le bot n'extrayait alors qu'UNE fois par
  // conversation, sur un transcript quasi vide — d'où l'impression qu'il ne
  // retient rien. Seul le throttle limite désormais le coût.
  const lastRun = factsExtractionThrottle.get(waId) ?? 0;
  const nowTs = Date.now();
  if (nowTs - lastRun < FACTS_EXTRACTION_INTERVAL_MS) return;
  factsExtractionThrottle.set(waId, nowTs);

  const transcript = core.messages
    .history(waId, 40)
    .map((m) => `${m.role}: ${m.contenu}`)
    .join("\n");
  const existingFacts = core.facts.actifs(waId, 20).map((f) => f.fait);
  void extractClientFacts(llm, model, transcript, existingFacts, log)
    .then((faits) => {
      for (const fait of faits) core.facts.add(waId, fait, "auto");
    })
    .catch((err) => {
      log.error({ waId, err: String(err) }, "extract_client_facts_task_failed");
    });
}

/**
 * Résumé de conversation entretenu par le BOT lui-même. Sans ça, il n'existait
 * que si Jacob ouvrait la fiche au back-office : une conversation jamais
 * consultée n'avait aucun résumé, et tout ce qui sortait de la fenêtre
 * d'historique était perdu pour le modèle.
 *
 * Déclenché au-delà de SUMMARY_MIN_MESSAGES lignes — avant, l'historique
 * suffit — et au plus une fois par tranche de SUMMARY_EVERY_MESSAGES.
 */
const SUMMARY_MIN_MESSAGES = 16;
const SUMMARY_EVERY_MESSAGES = 10;

function scheduleSummaryRefresh(
  core: Core,
  llm: Anthropic,
  model: string,
  log: Logger,
  waId: string,
): void {
  const dernier = core.messages.lastMessageId(waId);
  const state = core.state.get(waId);
  const transcript = core.messages.history(waId, 60);
  if (transcript.length < SUMMARY_MIN_MESSAGES) return;
  if (dernier - state.resumeMessageId < SUMMARY_EVERY_MESSAGES) return;

  const contact = core.contacts.get(waId);
  void summarizeConversation(llm, model, transcript, log, contact?.nom)
    .then((resume) => {
      core.state.setResume(waId, resume, dernier);
      logDecision(log, "summary_refreshed_by_bot", { waId, couvertJusqua: dernier });
    })
    .catch((err) => {
      log.error({ waId, err: String(err) }, "summary_refresh_failed");
    });
}

export const OPTOUT_CONFIRMATION =
  "C'est noté ✅ Tu ne recevras plus de messages de notre part. Écris START si tu changes d'avis.";
export const OPTIN_CONFIRMATION =
  "Avec plaisir 👋 C'est réactivé. Dis-moi ce que je peux faire pour toi.";
export const ALERT_ACK =
  "C'est noté, je fais remonter à Jacob tout de suite. Il revient vers toi rapidement.";
export const RECLAMATION_ACK =
  "Je comprends, et je préfère que Jacob gère ça directement avec toi. Il vient d'être prévenu et te répond au plus vite.";

export function isOptOut(text: string): boolean {
  const n = normalizeText(text);
  return (
    n === "stop" ||
    n === "unsubscribe" ||
    n.includes("desabonne") ||
    n.includes("desinscri") ||
    n.includes("ne plus recevoir") ||
    n.includes("plus de message")
  );
}

export function isOptIn(text: string): boolean {
  const n = normalizeText(text);
  return n === "start" || n === "reprendre" || n.includes("reabonne");
}

export interface HandlerDeps {
  core: Core;
  wa: WhatsAppClient;
  agent: SalesAgent;
  alertDeps: AlertDeps;
  log: Logger;
  /** Coupure de service si la facturation n'est pas à jour (solde ≤ 0). */
  billingEnforced?: boolean;
  /**
   * Client LLM (déjà instrumenté par withUsageMetering) et modèle utilisés
   * pour l'extraction de mémoire client en tâche de fond (§5). Optionnels
   * pour ne rien casser côté tests existants qui ne testent pas cette
   * fonctionnalité : sans eux, l'extraction est simplement désactivée.
   */
  llm?: Anthropic;
  model?: string;
}

/**
 * Orchestration d'un batch débouncé : opt-out → mode humain → bot actif →
 * boutons → routeur 4 niveaux → agent. Les gardes mode humain et bot actif
 * précèdent les boutons : un clic sur un ancien bouton ne doit jamais faire
 * parler le bot pendant que Jacob a la main (ni quand le bot est désactivé).
 */
export function createHandler(deps: HandlerDeps) {
  return async function handleBatch(waId: string, items: InboundItem[]): Promise<void> {
    const { core, wa, agent, log } = deps;
    const profileName = [...items].reverse().find((i) => i.profileName)?.profileName;
    core.contacts.upsert(waId, profileName ?? null);
    const contact = core.contacts.get(waId);
    const alreadyOptedOut = Boolean(contact?.optOut);

    // ── Opt-out / opt-in (prioritaire sur tout) ──
    if (items.some((i) => isOptOut(i.text))) {
      if (!alreadyOptedOut) {
        await wa.sendText(waId, OPTOUT_CONFIRMATION);
      }
      core.contacts.setOptOut(waId, true);
      logDecision(log, "opt_out", { waId, alreadyOptedOut });
      return;
    }
    if (alreadyOptedOut) {
      if (items.some((i) => isOptIn(i.text))) {
        core.contacts.setOptOut(waId, false);
        logDecision(log, "opt_in", { waId });
        await wa.sendText(waId, OPTIN_CONFIRMATION);
        return;
      }
      logDecision(log, "ignored_opted_out", { waId });
      return;
    }

    // ── Mode humain : Jacob a repris la main, le bot se tait complètement ──
    if (contact?.modeHumain) {
      logDecision(log, "silent_human_mode", { waId });
      return;
    }

    // ── Bot désactivé globalement (réglage dashboard) ──
    if (!core.settings.get("bot_actif")) {
      logDecision(log, "bot_disabled", { waId });
      return;
    }

    // ── Facturation : service suspendu (abonnement impayé ou crédit API épuisé) ──
    if (deps.billingEnforced) {
      const billing = billingStatus(core);
      if (!billing.active) {
        logDecision(log, "billing_suspended", { waId, reason: billing.reason });
        return;
      }
    }

    const lastText = items[items.length - 1]?.text ?? "";

    // ── Boutons interactifs du niveau 4 ──
    const buttonItem = items.find((i) => i.buttonId);
    if (buttonItem?.buttonId === "btn_alerte") {
      const state = core.state.get(waId);
      const alertResult = await triggerAlert(deps.alertDeps, {
        waId,
        motif: "le client a demandé une alerte (bouton 🔔)",
        intention: state.lastIntent ?? "demande_humain",
        categorie: "Autre",
        dernierMessage: lastText.slice(0, 300),
      });
      // Accusé véridique : on ne dit « Jacob est prévenu » que si un canal a marché.
      const notified = alertResult.notifiedVia !== "" && alertResult.notifiedVia !== "aucune";
      const ack = notified
        ? ALERT_ACK
        : "C'est noté, ta demande est bien enregistrée — Jacob la verra très vite.";
      const ackResult = await wa.sendText(waId, ack);
      if (ackResult.sent) core.messages.insert(waId, "assistant", ack);
      logDecision(log, "button_alert", { waId, notified });
      return;
    }
    if (buttonItem?.buttonId === "btn_rapide") {
      const contact = core.settings.get("contact_direct");
      const message = `Parfait 👍 Écris directement à Jacob au ${contact} — réponse rapide garantie.`;
      const result = await wa.sendText(waId, message);
      if (result.sent) core.messages.insert(waId, "assistant", message);
      logDecision(log, "button_fast", { waId });
      return;
    }

    // ── Routeur explicite (niveaux 1-4) ──
    const state = core.state.get(waId);
    const analysis = analyzeInbound(core, state, items.map((i) => i.text), core.settings.get("alert_threshold"));
    core.state.save(state);
    logDecision(log, "routed", {
      waId,
      intent: analysis.intent,
      service: analysis.serviceKey,
      route: analysis.route,
    });

    const questionDraft = {
      waId,
      texte: analysis.combinedText.slice(0, 500),
      normalise: normalizeText(analysis.combinedText).slice(0, 300),
      intention: analysis.intent,
      categorie: analysis.categorie,
    };

    if (analysis.route === "alerte_directe") {
      const result = await triggerAlert(deps.alertDeps, {
        waId,
        motif: analysis.motif,
        intention: analysis.intent,
        categorie: analysis.categorie,
        dernierMessage: lastText.slice(0, 300),
      });
      // Le compteur repart à zéro : sinon chaque message suivant re-déclenche
      // la route alerte et enferme le client dans une boucle d'accusés.
      state.sansProgression = 0;
      core.state.save(state);
      const ack = analysis.intent === "reclamation" ? RECLAMATION_ACK : ALERT_ACK;
      const ackResult = await wa.sendText(waId, ack);
      if (ackResult.sent) core.messages.insert(waId, "assistant", ack);
      core.questions.record({ ...questionDraft, repondue: false, alerteId: result.alertId });
      return;
    }

    if (analysis.route === "niveau4") {
      const delivered = await sendNiveau4(core, wa, waId);
      if (!delivered) {
        await triggerAlert(deps.alertDeps, {
          waId,
          motif: "échec d'envoi du message niveau 4 (client injoignable)",
          intention: analysis.intent,
          categorie: analysis.categorie,
          dernierMessage: lastText.slice(0, 300),
        });
        logDecision(log, "niveau4_send_failed", { waId });
      }
      core.questions.record({ ...questionDraft, repondue: false });
      return;
    }

    // ── Niveaux 1-3 : agent ──
    const result = await agent.respond(waId, analysis);
    if (result.text) {
      const sendResult = await wa.sendText(waId, result.text);
      if (sendResult.sent) {
        core.messages.insert(waId, "assistant", result.text);
        // Marqué APRÈS l'envoi : si l'envoi échoue, le message client reste
        // « non répondu » et le prochain batch le reprendra.
        if (result.coveredMessageId) core.state.setReplied(waId, result.coveredMessageId);
      }
      logDecision(log, "reply_dispatched", { waId, sent: sendResult.sent, reason: sendResult.reason });
    } else {
      logDecision(log, "no_reply", { waId, niveau4: result.niveau4Sent, alerte: result.alertFired });
    }
    // Une réponse jamais envoyée n'est pas une question traitée : sans ça, le
    // back-office comptait comme répondues des questions restées en plan.
    core.questions.record({
      ...questionDraft,
      repondue: result.text !== null && !result.alertFired && !result.niveau4Sent,
    });

    // ── Mémoire client (§5) : tâche de fond, après l'envoi de la réponse ──
    if (deps.llm && deps.model) {
      scheduleFactsExtraction(core, deps.llm, deps.model, log, waId, analysis);
      scheduleSummaryRefresh(core, deps.llm, deps.model, log, waId);
    }
  };
}
