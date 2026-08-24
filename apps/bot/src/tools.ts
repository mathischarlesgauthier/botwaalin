import type Anthropic from "@anthropic-ai/sdk";
import {
  describeOffer,
  logDecision,
  triggerAlert,
  type AlertDeps,
  type ConversationStateData,
  type Core,
  type Logger,
  type WhatsAppClient,
} from "@arbi/core";
import { z } from "zod";

export const NIVEAU4_BUTTONS = [
  { id: "btn_rapide", title: "⚡ Réponse rapide" },
  { id: "btn_alerte", title: "🔔 Laisser une alerte" },
] as const;

export function renderNiveau4Message(core: Core): string {
  return core.settings
    .get("niveau4_message")
    .replaceAll("{telegram}", core.settings.get("telegram_contact"));
}

/**
 * Envoie le message standard niveau 4 + les deux boutons interactifs.
 * Renvoie true UNIQUEMENT si un envoi (boutons ou texte) a réellement abouti.
 */
export async function sendNiveau4(
  core: Core,
  wa: WhatsAppClient,
  waId: string,
): Promise<boolean> {
  const message = renderNiveau4Message(core);
  const result = await wa.sendButtons(waId, message, [...NIVEAU4_BUTTONS]);
  if (result.sent) {
    core.messages.insert(waId, "assistant", `${message}\n[Boutons : ⚡ Réponse rapide · 🔔 Laisser une alerte]`);
    return true;
  }
  // Repli sans boutons (ex. si l'interactif est refusé) : texte seul.
  const fallback = await wa.sendText(waId, message);
  if (fallback.sent) {
    core.messages.insert(waId, "assistant", message);
    return true;
  }
  return false;
}

export const toolDefinitions: Anthropic.Messages.Tool[] = [
  {
    name: "get_offer",
    description:
      "Renvoie le détail officiel d'une offre de la grille tarifaire (prix + périmètre inclus). À utiliser avant de citer un prix. La clé est celle entre crochets dans la grille (ex: site_vitrine, boutique, trafic_pro).",
    input_schema: {
      type: "object",
      properties: {
        service_key: { type: "string", description: "Clé de l'offre, ex: site_vitrine" },
      },
      required: ["service_key"],
    },
  },
  {
    name: "save_lead",
    description:
      "Enregistre le lead qualifié en base. À appeler au closing, après le récapitulatif (offre retenue, périmètre, prix ou fourchette, prochaine étape). Score 1 (froid) à 5 (prêt à acheter).",
    input_schema: {
      type: "object",
      properties: {
        offre: { type: "string" },
        besoin: { type: "string" },
        budget: { type: "string" },
        delai: { type: "string" },
        score: { type: "integer", minimum: 1, maximum: 5 },
      },
      required: ["offre", "besoin", "budget", "delai", "score"],
    },
  },
  {
    name: "niveau4_humain",
    description:
      "Niveau 4 — intervention humaine : envoie au client le message standard + les 2 boutons (⚡ réponse rapide via Telegram / 🔔 laisser une alerte). À utiliser quand tu n'as pas l'information, quand le prix n'existe pas dans la grille, pour un devis personnalisé, ou pour finaliser un paiement. Après l'appel, n'ajoute RIEN d'autre.",
    input_schema: {
      type: "object",
      properties: {
        motif: { type: "string", description: "Motif du passage au niveau 4" },
      },
      required: ["motif"],
    },
  },
  {
    name: "raise_alert",
    description:
      "Alerte IMMÉDIATE de Jacob (notification WhatsApp + dashboard) : réclamation, litige, client agressif, négociation, demande de paiement, sujet sensible. Après l'appel, dis simplement au client que Jacob a été prévenu et reviendra vers lui rapidement.",
    input_schema: {
      type: "object",
      properties: {
        motif: { type: "string", description: "Ce qui bloque, en une phrase" },
        categorie: {
          type: "string",
          enum: ["Digital", "China", "Formation", "Société", "Autre"],
        },
      },
      required: ["motif"],
    },
  },
  {
    name: "send_menu",
    description:
      "Envoie la liste interactive WhatsApp des 5 pôles (Digital / Créa société / Trafic Pro / China Accès / Vinted Pro). À utiliser uniquement quand le besoin est totalement flou. N'énumère pas les pôles en texte après l'envoi.",
    input_schema: { type: "object", properties: {} },
  },
];

const getOfferSchema = z.object({ service_key: z.string().min(1) });
const saveLeadSchema = z.object({
  offre: z.string().min(1),
  besoin: z.string().min(1),
  budget: z.string().min(1),
  delai: z.string().min(1),
  score: z.number().int().min(1).max(5),
});
const motifSchema = z.object({
  motif: z.string().min(1),
  categorie: z.string().optional(),
});

export interface ToolContext {
  waId: string;
  core: Core;
  wa: WhatsAppClient;
  alertDeps: AlertDeps;
  state: ConversationStateData;
  log: Logger;
  /** Positionné à true si une alerte/niveau4 a été déclenché pendant le tour. */
  flags: { alertFired: boolean; niveau4Sent: boolean };
  lastClientMessage: string;
}

export async function executeTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<string> {
  const { core, wa, waId, log } = ctx;
  logDecision(log, "tool_call", { waId, tool: name });

  switch (name) {
    case "get_offer": {
      const parsed = getOfferSchema.safeParse(input);
      if (!parsed.success) return "Erreur : service_key manquant.";
      const row = core.pricing.byKey(parsed.data.service_key.trim());
      if (!row || row.actif !== 1) {
        const keys = core.pricing
          .active()
          .map((p) => p.serviceKey)
          .join(", ");
        return `Clé inconnue. Clés valides : ${keys}. Si l'offre demandée n'existe pas dans la grille : niveau4_humain.`;
      }
      if (!ctx.state.offresPresentees.includes(row.label)) {
        ctx.state.offresPresentees.push(row.label);
      }
      return describeOffer(row);
    }

    case "save_lead": {
      const parsed = saveLeadSchema.safeParse(input);
      if (!parsed.success) {
        return `Erreur de validation du lead : ${parsed.error.issues.map((i) => i.message).join(", ")}.`;
      }
      core.leads.insert(waId, parsed.data);
      core.contacts.setStatut(waId, "qualifie");
      logDecision(log, "lead_saved", { waId, offre: parsed.data.offre, score: parsed.data.score });
      return "Lead enregistré.";
    }

    case "niveau4_humain": {
      const parsed = motifSchema.safeParse(input);
      const motif = parsed.success ? parsed.data.motif : "non précisé";
      const delivered = await sendNiveau4(core, wa, waId);
      if (!delivered) {
        // Client injoignable (fenêtre 24 h, erreur API…) : ne pas mentir au
        // modèle ni figer le statut — alerter Jacob via la cascade (le
        // template admin passe même hors fenêtre côté client).
        await triggerAlert(ctx.alertDeps, {
          waId,
          motif: `échec d'envoi du message niveau 4 (${motif})`,
          intention: ctx.state.lastIntent ?? "",
          categorie: "Autre",
          dernierMessage: ctx.lastClientMessage,
        });
        ctx.flags.alertFired = true;
        logDecision(log, "niveau4_send_failed", { waId, motif });
        return "ÉCHEC d'envoi du message standard (WhatsApp indisponible). Jacob a été alerté. Réponds au client en une phrase courte en l'orientant vers Telegram.";
      }
      ctx.flags.niveau4Sent = true;
      core.contacts.setStatut(waId, "attente_choix");
      logDecision(log, "niveau4_sent", { waId, motif });
      return "Message standard + boutons envoyés au client. Ta réponse doit être VIDE : n'ajoute rien.";
    }

    case "raise_alert": {
      const parsed = motifSchema.safeParse(input);
      const motif = parsed.success ? parsed.data.motif : "non précisé";
      const categorie = parsed.success && parsed.data.categorie ? parsed.data.categorie : "Autre";
      const result = await triggerAlert(ctx.alertDeps, {
        waId,
        motif,
        intention: ctx.state.lastIntent ?? "",
        categorie,
        dernierMessage: ctx.lastClientMessage,
      });
      ctx.flags.alertFired = true;
      return result.deduped
        ? "Une alerte était déjà ouverte pour ce client : Jacob est déjà prévenu. Rassure simplement le client."
        : "Alerte envoyée à Jacob. Dis au client que Jacob a été prévenu et reviendra vers lui rapidement, sans en faire trop.";
    }

    case "send_menu": {
      const result = await wa.sendMenu(waId, core.settings.get("menu_poles"));
      if (result.sent) {
        core.messages.insert(
          waId,
          "assistant",
          "[Menu interactif envoyé : Digital / Créa société / Trafic Pro / China Accès / Vinted Pro]",
        );
        return "Menu envoyé. Ajoute au plus une phrase courte, sans lister les pôles.";
      }
      return `Échec de l'envoi du menu (${result.reason ?? "inconnu"}). Liste les 5 pôles en texte à la place.`;
    }

    default:
      return `Outil inconnu : ${name}.`;
  }
}
