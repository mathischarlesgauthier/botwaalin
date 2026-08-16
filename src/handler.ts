import type { Db } from "./db";
import type { Logger } from "./logger";
import { logDecision } from "./logger";
import type { InboundItem } from "./queue";
import type { SendResult } from "./whatsapp";

export const OPTOUT_CONFIRMATION =
  "C'est noté ✅ Tu ne recevras plus de messages de notre part. Écris START si tu changes d'avis.";
export const OPTIN_CONFIRMATION =
  "Avec plaisir 👋 C'est réactivé. Dis-moi ce que je peux faire pour toi.";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** STOP / « désabonne-moi » et variantes. */
export function isOptOut(text: string): boolean {
  const n = normalize(text);
  return (
    n === "stop" ||
    n === "unsubscribe" ||
    n.includes("desabonne") ||
    n.includes("desinscri") ||
    n.includes("ne plus recevoir") ||
    n.includes("plus de message")
  );
}

/** START / reprise après opt-out. */
export function isOptIn(text: string): boolean {
  const n = normalize(text);
  return n === "start" || n === "reprendre" || n.includes("reabonne");
}

export interface HandlerDeps {
  db: Db;
  wa: { sendText(waId: string, text: string): Promise<SendResult> };
  agent: { respond(waId: string): Promise<string | null> };
  log: Logger;
}

/**
 * Traite un batch débouncé de messages entrants d'un contact :
 * opt-out/opt-in d'abord, sinon réponse de l'agent.
 */
export function createHandler(deps: HandlerDeps) {
  return async function handleBatch(waId: string, items: InboundItem[]): Promise<void> {
    const { db, wa, agent, log } = deps;
    const profileName = [...items].reverse().find((i) => i.profileName)?.profileName;
    db.upsertContact(waId, profileName ?? null);
    const contact = db.getContact(waId);
    const alreadyOptedOut = Boolean(contact?.opt_out);

    if (items.some((i) => isOptOut(i.text))) {
      if (!alreadyOptedOut) {
        // Confirmation unique, envoyée AVANT de poser le flag (sinon le gate la bloque).
        await wa.sendText(waId, OPTOUT_CONFIRMATION);
      }
      db.setOptOut(waId, true);
      logDecision(log, "opt_out", { waId, alreadyOptedOut });
      return;
    }

    if (alreadyOptedOut) {
      if (items.some((i) => isOptIn(i.text))) {
        db.setOptOut(waId, false);
        logDecision(log, "opt_in", { waId });
        await wa.sendText(waId, OPTIN_CONFIRMATION);
        return;
      }
      // Plus aucun envoi vers un contact opt-out.
      logDecision(log, "ignored_opted_out", { waId });
      return;
    }

    logDecision(log, "agent_run", { waId, batchSize: items.length });
    const reply = await agent.respond(waId);
    if (!reply) {
      logDecision(log, "no_reply", { waId });
      return;
    }

    const result = await wa.sendText(waId, reply);
    if (result.sent) {
      db.insertMessage(waId, "assistant", reply);
    }
    logDecision(log, "reply_dispatched", { waId, sent: result.sent, reason: result.reason });
  };
}
