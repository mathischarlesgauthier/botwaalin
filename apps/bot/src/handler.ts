import {
  logDecision,
  normalizeText,
  triggerAlert,
  type AlertDeps,
  type Core,
  type Logger,
  type WhatsAppClient,
} from "@arbi/core";
import type { SalesAgent } from "./agent";
import { analyzeInbound } from "./brain";
import { sendNiveau4 } from "./tools";
import type { InboundItem } from "./queue";

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
      const telegram = core.settings.get("telegram_contact");
      const message = `Parfait 👍 Écris directement à Jacob sur Telegram : ${telegram} — réponse rapide garantie.`;
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
      if (sendResult.sent) core.messages.insert(waId, "assistant", result.text);
      logDecision(log, "reply_dispatched", { waId, sent: sendResult.sent, reason: sendResult.reason });
    } else {
      logDecision(log, "no_reply", { waId, niveau4: result.niveau4Sent, alerte: result.alertFired });
    }
    core.questions.record({ ...questionDraft, repondue: !result.alertFired && !result.niveau4Sent });
  };
}
