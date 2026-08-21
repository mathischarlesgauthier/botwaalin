import type Anthropic from "@anthropic-ai/sdk";
import type { AdminNumber, Core } from "./db";
import { summarizeConversation } from "./llm";
import type { Logger } from "./logger";
import { logDecision } from "./logger";
import type { WhatsAppClient } from "./whatsapp";

export interface AlertInput {
  waId: string;
  motif: string;
  intention: string;
  categorie: string;
  dernierMessage: string;
}

export interface AlertDeps {
  core: Core;
  wa: WhatsAppClient;
  llm: Anthropic;
  model: string;
  log: Logger;
  /** Repli e-mail (facultatif) : clé API Resend + expéditeur. */
  resendApiKey?: string;
  emailFrom?: string;
  fetchFn?: typeof fetch;
}

/** Une seule ligne : les paramètres de template WhatsApp refusent les sauts de ligne. */
function flat(text: string, max = 550): string {
  return text.replace(/\s*\n+\s*/g, " · ").replace(/\s+/g, " ").trim().slice(0, max) || "—";
}

export function formatAlertText(input: {
  clientLabel: string;
  categorie: string;
  intention: string;
  resume: string;
  motif: string;
  dernierMessage: string;
  dashboardUrl: string;
  waId: string;
}): string {
  const lien = input.dashboardUrl
    ? `\n\n→ Reprendre : ${input.dashboardUrl.replace(/\/$/, "")}/conversations/${input.waId}`
    : "";
  return `🔔 NOUVELLE ALERTE — ARBI JACOB

Client : ${input.clientLabel}
Catégorie : ${input.categorie}
Intention : ${input.intention || "—"}

Résumé : ${input.resume}
Blocage : ${input.motif}
Dernier message : « ${input.dernierMessage} »${lien}`;
}

async function sendEmailFallback(
  deps: AlertDeps,
  subject: string,
  text: string,
): Promise<boolean> {
  const to = deps.core.settings.get("alert_email_to");
  if (!deps.resendApiKey || !to) return false;
  const fetchFn = deps.fetchFn ?? fetch;
  try {
    const response = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deps.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: deps.emailFrom || "alerte@arbijacob.local",
        to: [to],
        subject,
        text,
      }),
    });
    return response.ok;
  } catch (err) {
    deps.log.error({ err: String(err) }, "alert_email_failed");
    return false;
  }
}

/**
 * Déclenche une alerte : enregistrement, résumé automatique, notification
 * WhatsApp admin (template → texte libre → e-mail), bascule en attente.
 * Idempotent : si une alerte est déjà ouverte pour le contact, ne re-notifie pas.
 */
export async function triggerAlert(
  deps: AlertDeps,
  input: AlertInput,
): Promise<{ alertId: number; notifiedVia: string; deduped: boolean }> {
  const { core, log } = deps;

  if (core.alerts.hasOpenFor(input.waId)) {
    const existing = core.alerts.open().find((a) => a.waId === input.waId);
    logDecision(log, "alert_deduped", { waId: input.waId, motif: input.motif });
    return { alertId: existing?.id ?? 0, notifiedVia: existing?.notifiedVia ?? "", deduped: true };
  }

  const contact = core.contacts.get(input.waId);
  const clientLabel = contact?.nom ? `${contact.nom} (+${input.waId})` : `+${input.waId}`;
  const transcript = core.messages.history(input.waId, 40);
  const resume = await summarizeConversation(deps.llm, deps.model, transcript, log, contact?.nom);

  const alertId = core.alerts.create({
    waId: input.waId,
    categorie: input.categorie,
    intention: input.intention,
    motif: input.motif,
    resume,
    dernierMessage: input.dernierMessage,
  });
  core.contacts.setStatut(input.waId, "alerte");
  logDecision(log, "alert_created", { waId: input.waId, alertId, motif: input.motif });

  const dashboardUrl = core.settings.get("dashboard_url");
  const templateName = core.settings.get("alert_template_name");
  const fullText = formatAlertText({
    clientLabel,
    categorie: input.categorie,
    intention: input.intention,
    resume,
    motif: input.motif,
    dernierMessage: input.dernierMessage,
    dashboardUrl,
    waId: input.waId,
  });

  const admins = core.settings.get("admin_numbers") as AdminNumber[];
  const active = admins.filter((a) => a.actif && a.number);
  const channels: string[] = [];

  for (const admin of active) {
    const adminWaId = admin.number.replace(/[^\d]/g, "");

    // 1) Template approuvé (seul canal fiable hors fenêtre 24 h)
    const templateResult = await deps.wa.sendTemplate(adminWaId, templateName, "fr", [
      {
        type: "body",
        parameters: [
          { type: "text", text: flat(clientLabel, 80) },
          { type: "text", text: flat(input.categorie, 40) },
          { type: "text", text: flat(input.intention || "—", 40) },
          { type: "text", text: flat(resume) },
          { type: "text", text: flat(input.motif, 120) },
          { type: "text", text: flat(input.dernierMessage, 200) },
        ],
      },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: input.waId }],
      },
    ]);
    if (templateResult.sent) {
      channels.push(`template:${adminWaId}`);
      continue;
    }

    // 2) Texte libre (fonctionne si l'admin a écrit au bot dans les 24 h)
    const textResult = await deps.wa.sendText(adminWaId, fullText);
    if (textResult.sent) {
      channels.push(`texte:${adminWaId}`);
      continue;
    }

    logDecision(log, "alert_whatsapp_notify_failed", {
      alertId,
      admin: adminWaId,
      template: templateResult.reason,
      texte: textResult.reason,
    });
  }

  // 3) Repli e-mail si aucun WhatsApp n'est passé
  if (channels.length === 0) {
    const emailed = await sendEmailFallback(deps, `🔔 Alerte ARBI JACOB — ${clientLabel}`, fullText);
    if (emailed) channels.push("email");
  }

  const notifiedVia = channels.join(",") || "aucune";
  core.alerts.setNotifiedVia(alertId, notifiedVia);
  logDecision(log, "alert_notified", { alertId, notifiedVia, admins: active.length });
  return { alertId, notifiedVia, deduped: false };
}
