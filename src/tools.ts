import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CATEGORIES, extractSection, type Categorie } from "./catalogue";
import type { Db } from "./db";
import type { Logger } from "./logger";
import { logDecision } from "./logger";
import type { TelegramNotifier } from "./telegram";
import type { WhatsAppClient } from "./whatsapp";

export const HANDOFF_MESSAGE =
  "Top 👍 Pour la suite (devis, détails, paiement), écris directement à Jacob sur Telegram : @Jacob13013 — réponse sous 24 h, confidentialité garantie.";

export const toolDefinitions: Anthropic.Messages.Tool[] = [
  {
    name: "get_offer",
    description:
      "Renvoie le bloc catalogue complet d'un pôle (offres, prix « à partir de », périmètres). À utiliser avant de présenter une offre pour citer des prix exacts.",
    input_schema: {
      type: "object",
      properties: {
        categorie: {
          type: "string",
          enum: [...CATEGORIES],
          description:
            "Le pôle : digital (GHOST STUDIO), crea_societe (LLC/LTD), trafic_pro, china_acces, vinted_pro",
        },
      },
      required: ["categorie"],
    },
  },
  {
    name: "save_lead",
    description:
      "Enregistre le lead qualifié en base. À appeler au closing, après avoir récapitulé au client : offre visée, besoin, budget, délai. Le score reflète la chaleur du lead (1 = froid, 5 = prêt à acheter).",
    input_schema: {
      type: "object",
      properties: {
        offre: { type: "string", description: "Offre ou pôle visé (ex: 'Site vitrine', 'LLC Wyoming')" },
        besoin: { type: "string", description: "Besoin exprimé par le client, en une phrase" },
        budget: { type: "string", description: "Budget annoncé (ou 'non communiqué')" },
        delai: { type: "string", description: "Délai souhaité (ou 'non communiqué')" },
        score: {
          type: "integer",
          minimum: 1,
          maximum: 5,
          description: "Chaleur du lead de 1 (froid) à 5 (prêt à acheter)",
        },
      },
      required: ["offre", "besoin", "budget", "delai", "score"],
    },
  },
  {
    name: "handoff_human",
    description:
      "Passe la main à Jacob (humain). Envoie au client le contact Telegram @Jacob13013 et notifie l'admin. Obligatoire pour : devis précis, paiement, négociation, litige, réclamation, client agressif, prix absent du catalogue, incertitude, ou 3 messages sans progression.",
    input_schema: {
      type: "object",
      properties: {
        motif: {
          type: "string",
          description: "Motif du handoff (ex: 'devis_paiement', 'prix_hors_catalogue', 'litige')",
        },
      },
      required: ["motif"],
    },
  },
  {
    name: "send_menu",
    description:
      "Envoie au client une liste interactive WhatsApp des 5 pôles (Digital / Créa société / Trafic Pro / China Accès / Vinted Pro). À utiliser quand le besoin est flou ou que le client ne sait pas par où commencer. Ne liste pas les pôles en texte après l'envoi.",
    input_schema: { type: "object", properties: {} },
  },
];

const getOfferSchema = z.object({ categorie: z.enum(CATEGORIES) });
const saveLeadSchema = z.object({
  offre: z.string().min(1),
  besoin: z.string().min(1),
  budget: z.string().min(1),
  delai: z.string().min(1),
  score: z.number().int().min(1).max(5),
});
const handoffSchema = z.object({ motif: z.string().min(1) });

export interface ToolContext {
  waId: string;
  db: Db;
  wa: WhatsAppClient;
  telegram: TelegramNotifier;
  catalogue: string;
  log: Logger;
}

/** Exécute un tool appelé par le modèle et renvoie le résultat (string). */
export async function executeTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<string> {
  logDecision(ctx.log, "tool_call", { waId: ctx.waId, tool: name });

  switch (name) {
    case "get_offer": {
      const parsed = getOfferSchema.safeParse(input);
      if (!parsed.success) {
        return "Erreur : catégorie invalide. Catégories possibles : digital, crea_societe, trafic_pro, china_acces, vinted_pro.";
      }
      const section = extractSection(ctx.catalogue, parsed.data.categorie as Categorie);
      return section || "Section introuvable dans le catalogue — utilise handoff_human.";
    }

    case "save_lead": {
      const parsed = saveLeadSchema.safeParse(input);
      if (!parsed.success) {
        return `Erreur de validation du lead : ${parsed.error.issues.map((i) => i.message).join(", ")}. Corrige et réessaie.`;
      }
      ctx.db.insertLead(ctx.waId, parsed.data);
      ctx.db.setStatut(ctx.waId, "qualifie");
      logDecision(ctx.log, "lead_saved", { waId: ctx.waId, offre: parsed.data.offre, score: parsed.data.score });
      return "Lead enregistré en base.";
    }

    case "handoff_human": {
      const parsed = handoffSchema.safeParse(input);
      const motif = parsed.success ? parsed.data.motif : "non_precise";
      ctx.db.insertHandoff(ctx.waId, motif);
      ctx.db.setStatut(ctx.waId, "handoff");

      const sendResult = await ctx.wa.sendText(ctx.waId, HANDOFF_MESSAGE);
      if (sendResult.sent) {
        ctx.db.insertMessage(ctx.waId, "assistant", HANDOFF_MESSAGE);
      }
      const contact = ctx.db.getContact(ctx.waId);
      await ctx.telegram.notifyAdmin(
        `🤝 Handoff WhatsApp\nClient : +${ctx.waId}${contact?.nom ? ` (${contact.nom})` : ""}\nMotif : ${motif}`,
      );
      logDecision(ctx.log, "handoff", { waId: ctx.waId, motif, clientNotified: sendResult.sent });
      return "Handoff effectué : le client a reçu le contact @Jacob13013 et l'admin est notifié. Conclus en une phrase courte sans redonner le contact.";
    }

    case "send_menu": {
      const sendResult = await ctx.wa.sendMenu(ctx.waId);
      if (sendResult.sent) {
        ctx.db.insertMessage(
          ctx.waId,
          "assistant",
          "[Menu interactif envoyé : Digital / Créa société / Trafic Pro / China Accès / Vinted Pro]",
        );
        return "Menu interactif envoyé au client. Ajoute au plus une phrase courte, sans lister les pôles.";
      }
      return `Échec de l'envoi du menu (${sendResult.reason ?? "inconnu"}). Liste les 5 pôles en texte à la place.`;
    }

    default:
      return `Outil inconnu : ${name}.`;
  }
}
