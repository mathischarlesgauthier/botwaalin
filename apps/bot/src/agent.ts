import type Anthropic from "@anthropic-ai/sdk";
import {
  allowedAmounts,
  amountsIn,
  checkStyleRules,
  findForeignPrices,
  logDecision,
  registerMarkers,
  triggerAlert,
  PAYMENT_OUTBOUND_RE,
  type AlertDeps,
  type ConversationStateData,
  type Core,
  type Logger,
  type WhatsAppClient,
} from "@arbi/core";
import type { Analysis } from "./brain";
import { buildDynamicContext, buildStaticPrompt } from "./prompt";
import { executeTool, toolDefinitions, type ToolContext } from "./tools";

interface HistoryRow {
  role: string;
  contenu: string;
}

// Filet déterministe anti-encaissement : déplacé dans @arbi/core (packages/core/src/pricing.ts)
// pour que packages/core/src/learning.ts puisse aussi s'en servir (rejet des
// exemples appris) sans dépendance circulaire vers apps/bot. Ré-exporté ici
// pour ne rien casser côté appelants existants de ce module.
export { PAYMENT_OUTBOUND_RE };

/** Qualificatifs acceptés autour d'un prix « dès » (jamais présenté comme final). */
const FROM_QUALIFIER_RE =
  /(à partir de|a partir de|d[èe]s\s|commenc|d[ée]marr|d[ée]but|minimum|entre\s|prix de d[ée]part|selon (le|ton) projet)/i;

/**
 * Convertit l'historique en messages Anthropic : rôles consécutifs fusionnés,
 * premier tour "user", tout tour assistant final tronqué (prefill interdit —
 * défense en profondeur : generate() refuse déjà un historique ne se terminant
 * pas par un tour client). Les messages de Jacob (role human) apparaissent
 * côté assistant, préfixés.
 */
export function toAnthropicMessages(history: HistoryRow[]): Anthropic.Messages.MessageParam[] {
  const messages: Anthropic.Messages.MessageParam[] = [];
  for (const row of history) {
    const role: "user" | "assistant" = row.role === "user" ? "user" : "assistant";
    const contenu = row.role === "human" ? `[Réponse de Jacob] ${row.contenu}` : row.contenu;
    if (messages.length === 0 && role !== "user") continue;
    const last = messages.at(-1);
    if (last && last.role === role && typeof last.content === "string") {
      last.content = `${last.content}\n${contenu}`;
    } else {
      messages.push({ role, content: contenu });
    }
  }
  while (messages.at(-1)?.role === "assistant") {
    messages.pop();
  }
  return messages;
}

export interface AgentDeps {
  core: Core;
  client: Anthropic;
  model: string;
  wa: WhatsAppClient;
  alertDeps: AlertDeps;
  log: Logger;
  maxTokens?: number;
  maxIterations?: number;
}

export interface AgentResult {
  text: string | null;
  alertFired: boolean;
  niveau4Sent: boolean;
  /**
   * Persistance de l'état (marqueurs de style, flags groupe/cross-sell,
   * replyCount) — appelée par respond() UNIQUEMENT quand la réponse est
   * retenue, pour qu'une réponse jetée par la régénération ne pollue pas
   * l'état de la conversation.
   */
  commit?: () => void;
}

export class SalesAgent {
  private staticPrompt = "";
  private allowed = new Set<string>();
  private fromOnlyAmounts = new Set<string>();
  private versionStamp = "";
  private readonly maxTokens: number;
  private readonly maxIterations: number;

  constructor(private readonly deps: AgentDeps) {
    this.maxTokens = deps.maxTokens ?? 1024;
    this.maxIterations = deps.maxIterations ?? 6;
    this.refreshKnowledge();
  }

  /** Recharge prompt statique + montants autorisés si catalogue/tarifs/documents/exemples/guide de style ont changé. */
  private refreshKnowledge(): void {
    const { core } = this.deps;
    const pricingStampRow = core.sqlite
      .prepare(`SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS m FROM pricing`)
      .get() as { n: number; m: number };
    // Un document désactivé ou un exemple encore en_attente ne compte pas dans
    // ces stamps (documents.stamp()/examples.stamp() ne portent que sur les
    // lignes réellement injectées) : pas de réécriture de cache pour rien.
    const docStamp = core.documents.stamp();
    const exStamp = core.examples.stamp();
    const styleGuideRow = core.sqlite
      .prepare(`SELECT updated_at AS m FROM settings WHERE key = 'style_guide_appris'`)
      .get() as { m: number } | undefined;
    // `bot_autonomie` fait partie de l'empreinte : sans lui, changer le réglage
    // au back-office ne régénérerait pas le prompt en cache.
    const stamp =
      `${core.catalogue.currentVersionId()}:${pricingStampRow.n}:${pricingStampRow.m}` +
      `:${docStamp.n}:${docStamp.m}:${exStamp.n}:${exStamp.m}:${styleGuideRow?.m ?? 0}` +
      `:${core.settings.get("bot_autonomie")}`;
    if (stamp === this.versionStamp) return;
    const catalogue = core.catalogue.current().contenu;
    const rows = core.pricing.active();
    this.staticPrompt = buildStaticPrompt(
      catalogue,
      rows,
      core.documents.actifs(),
      core.examples.actifs(12),
      core.settings.get("style_guide_appris"),
      core.settings.get("bot_autonomie"),
    );
    // INVARIANT §0.1 : allowedAmounts ne prend QUE pricing + catalogue — jamais
    // les documents/exemples appris, qui n'élargissent JAMAIS les montants
    // autorisés en sortie (garde-fou vérifié par test dédié).
    this.allowed = allowedAmounts(rows, catalogue);

    // Montants qui n'existent QUE comme prix de départ (FROM) : ils devront
    // toujours être accompagnés d'un qualificatif « à partir de » / « dès ».
    const fixedAmounts = new Set<string>();
    const fromAmounts = new Set<string>();
    for (const row of rows) {
      const target = row.type === "FROM" ? fromAmounts : fixedAmounts;
      if (row.prixMin != null) target.add(String(row.prixMin));
      if (row.prixMax != null) target.add(String(row.prixMax));
      if (row.affichage) for (const a of amountsIn(row.affichage)) target.add(a);
    }
    this.fromOnlyAmounts = new Set([...fromAmounts].filter((a) => !fixedAmounts.has(a)));

    this.versionStamp = stamp;
    logDecision(this.deps.log, "knowledge_reloaded", { stamp });
  }

  /**
   * Prix « dès » cités comme prix fermes : pour chaque phrase contenant un
   * montant FROM, exige un qualificatif de prix de départ.
   */
  private fromViolations(reply: string): string[] {
    const violations: string[] = [];
    for (const sentence of reply.split(/(?<=[.!?\n])/)) {
      const cited = amountsIn(sentence).filter((a) => this.fromOnlyAmounts.has(a));
      if (cited.length === 0) continue;
      if (!FROM_QUALIFIER_RE.test(sentence)) violations.push(...cited);
    }
    return [...new Set(violations)];
  }

  /**
   * Garde-fou déterministe de sortie : liens/coordonnées de paiement, montant
   * cité pour un service sur devis, montants hors grille. Toute violation
   * remplace la réponse par un renvoi vers Jacob + alerte.
   */
  async guardReply(
    waId: string,
    reply: string,
    analysis: Analysis,
  ): Promise<{ text: string; blocked: boolean }> {
    const { core, log } = this.deps;

    const payment = reply.match(PAYMENT_OUTBOUND_RE);
    if (payment) {
      logDecision(log, "payment_guard_blocked", { waId, match: payment[0] });
      await triggerAlert(this.deps.alertDeps, {
        waId,
        motif: "coordonnées/lien de paiement détectés dans la réponse sortante (garde-fou)",
        intention: analysis.intent,
        categorie: analysis.categorie,
        dernierMessage: analysis.combinedText.slice(0, 300),
      });
      const contact = core.settings.get("contact_direct");
      return {
        text: `Pour tout ce qui touche au paiement, c'est Jacob qui gère en direct : écris-lui au ${contact}. Il a été prévenu de ton message.`,
        blocked: true,
      };
    }

    const serviceRow = analysis.serviceKey ? core.pricing.byKey(analysis.serviceKey) : undefined;
    if (serviceRow?.actif === 1 && serviceRow.type === "QUOTE" && amountsIn(reply).length > 0) {
      logDecision(log, "price_guard_blocked", {
        waId,
        motif: "montant_cite_pour_service_sur_devis",
        service: serviceRow.serviceKey,
      });
      return this.blockedPriceReply(waId, analysis, "montant cité pour un service sur devis");
    }

    const foreign = findForeignPrices(reply, this.allowed);
    if (foreign.length > 0) {
      logDecision(log, "price_guard_blocked", { waId, foreign });
      return this.blockedPriceReply(
        waId,
        analysis,
        "prix demandé non présent et non calculable (garde-fou)",
      );
    }

    return { text: reply, blocked: false };
  }

  private async blockedPriceReply(
    waId: string,
    analysis: Analysis,
    motif: string,
  ): Promise<{ text: string; blocked: boolean }> {
    await triggerAlert(this.deps.alertDeps, {
      waId,
      motif,
      intention: analysis.intent,
      categorie: analysis.categorie,
      dernierMessage: analysis.combinedText.slice(0, 300),
    });
    const contact = this.deps.core.settings.get("contact_direct");
    return {
      text: `Bonne question 👌 Pour te donner le tarif exact, je préfère te mettre en direct avec Jacob : écris-lui au ${contact}. Il a aussi été prévenu de ton message.`,
      blocked: true,
    };
  }

  async respond(waId: string, analysis: Analysis): Promise<AgentResult> {
    this.refreshKnowledge();
    for (let pass = 0; pass < 2; pass++) {
      const cursor = this.deps.core.messages.lastUserMessageId(waId);
      const result = await this.generate(waId, analysis);
      if (result.text === null) return result;
      if (pass === 0 && this.deps.core.messages.lastUserMessageId(waId) !== cursor) {
        // Un nouveau message client est arrivé pendant la génération : on
        // JETTE cette réponse (sans persister son état) et on régénère.
        logDecision(this.deps.log, "regenerate_after_new_message", { waId });
        continue;
      }
      result.commit?.();
      return result;
    }
    return { text: null, alertFired: false, niveau4Sent: false };
  }

  private async generate(waId: string, analysis: Analysis): Promise<AgentResult> {
    const { core, client, model, log } = this.deps;
    const state = core.state.get(waId);
    const flags = { alertFired: false, niveau4Sent: false };
    const history = core.messages.history(waId, 20);

    // Si le dernier tour n'est pas un message client, le batch a déjà été
    // couvert (régénération précédente, réponse de Jacob…) : on se tait au
    // lieu de produire une seconde réponse au même message.
    if (history.at(-1)?.role !== "user") {
      logDecision(log, "history_without_pending_user_turn", { waId });
      return { text: null, alertFired: false, niveau4Sent: false };
    }
    const messages = toAnthropicMessages(history);

    const toolCtx: ToolContext = {
      waId,
      core,
      wa: this.deps.wa,
      alertDeps: this.deps.alertDeps,
      state,
      log,
      flags,
      lastClientMessage: analysis.combinedText.slice(0, 300),
    };

    // Mémoire client (§5) : 10 faits les plus récents (facts.actifs trie id
    // DESC) — jamais mis en cache (dynamicContext n'a pas de cache_control),
    // donc facturés à plein tarif à CHAQUE message ; 10 plutôt que les 20
    // stockables pour limiter ce coût récurrent.
    const dynamicContext = buildDynamicContext(
      state,
      core.settings.get("group_link"),
      core.settings.get("contact_direct"),
      core.facts.actifs(waId, 10),
    );
    const system: Anthropic.Messages.TextBlockParam[] = [
      { type: "text", text: this.staticPrompt, cache_control: { type: "ephemeral" } },
      { type: "text", text: dynamicContext },
    ];

    let styleRetried = false;
    let fromRetried = false;
    let budget = this.maxTokens;
    let toolsUsed = false;

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      const response = await client.messages.create({
        model,
        max_tokens: budget,
        system,
        tools: toolDefinitions,
        messages,
      });

      if (response.stop_reason === "refusal") {
        logDecision(log, "agent_refusal", { waId });
        return this.safetyFallback(waId, analysis, "refus du modèle", flags);
      }

      if (response.stop_reason === "max_tokens") {
        if (budget === this.maxTokens) {
          budget = this.maxTokens * 4;
          logDecision(log, "agent_retry_larger_budget", { waId, budget });
          continue;
        }
        logDecision(log, "agent_truncated", { waId });
        return this.safetyFallback(waId, analysis, "réponse tronquée", flags);
      }

      if (response.stop_reason === "tool_use") {
        toolsUsed = true;
        const toolUses = response.content.filter(
          (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
        );
        messages.push({ role: "assistant", content: response.content });
        const results: Anthropic.Messages.ToolResultBlockParam[] = [];
        for (const toolUse of toolUses) {
          let output: string;
          let isError = false;
          try {
            output = await executeTool(toolUse.name, toolUse.input, toolCtx);
          } catch (err) {
            log.error({ waId, tool: toolUse.name, err: String(err) }, "tool_error");
            output = "Erreur interne de l'outil. Utilise niveau4_humain.";
            isError = true;
          }
          results.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: output,
            ...(isError ? { is_error: true } : {}),
          });
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      let text = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      // Niveau 4 déjà envoyé par l'outil : la réponse texte doit rester vide.
      if (flags.niveau4Sent) {
        this.persistTurn(state, "");
        logDecision(log, "agent_reply", { waId, niveau4: true });
        return { text: null, alertFired: flags.alertFired, niveau4Sent: true };
      }

      if (!text) {
        this.persistTurn(state, "");
        return { text: null, alertFired: flags.alertFired, niveau4Sent: false };
      }

      // Anti-répétition des marqueurs de style : une seule régénération.
      const styleCheck = checkStyleRules(text, state.styleMarkers, state.replyCount);
      if (!styleCheck.ok && !styleRetried) {
        styleRetried = true;
        logDecision(log, "style_regenerate", { waId, violations: styleCheck.violations });
        messages.push({ role: "assistant", content: text });
        messages.push({
          role: "user",
          content: `[Consigne interne, invisible pour le client] Reformule ta dernière réponse SANS expression familière (${styleCheck.violations.join(" ; ")}). Garde exactement le même fond.`,
        });
        continue;
      }
      if (!styleCheck.ok) {
        logDecision(log, "style_violation_sent", { waId, violations: styleCheck.violations });
      }

      // Prix « dès » présenté comme prix ferme : une régénération, sinon blocage.
      const fromViolations = this.fromViolations(text);
      if (fromViolations.length > 0 && !fromRetried) {
        fromRetried = true;
        logDecision(log, "from_price_regenerate", { waId, amounts: fromViolations });
        messages.push({ role: "assistant", content: text });
        messages.push({
          role: "user",
          content: `[Consigne interne, invisible pour le client] Les montants ${fromViolations.join(", ")} € sont des prix DE DÉPART : reformule en le disant explicitement (« à partir de », « dès », « le prix final dépend du projet »). Garde le même fond.`,
        });
        continue;
      }
      if (fromViolations.length > 0) {
        logDecision(log, "from_price_blocked", { waId, amounts: fromViolations });
        const blocked = await this.blockedPriceReply(
          waId,
          analysis,
          "prix de départ présenté comme un prix final (garde-fou)",
        );
        flags.alertFired = true;
        return {
          text: blocked.text,
          alertFired: true,
          niveau4Sent: false,
          commit: () => this.persistTurn(state, blocked.text),
        };
      }

      // Lien du groupe privé : jamais deux fois dans une conversation.
      const groupLink = core.settings.get("group_link");
      if (groupLink && text.includes(groupLink)) {
        if (state.groupLinkSent) {
          text = text
            .split("\n")
            .filter((line) => !line.includes(groupLink))
            .join("\n")
            .trim();
          logDecision(log, "group_link_stripped", { waId });
        } else {
          state.groupLinkSent = true;
        }
      }

      // Cross-sell : un seul rebond par conversation (détection heuristique).
      if (/\b(si tu veux aussi|je peux aussi te|pense aussi à|en complément)\b/i.test(text)) {
        state.crossSellDone = true;
      }

      const guarded = await this.guardReply(waId, text, analysis);
      if (guarded.blocked) flags.alertFired = true;

      logDecision(log, "agent_reply", {
        waId,
        iterations: iteration + 1,
        toolsUsed,
        blocked: guarded.blocked,
      });
      return {
        text: guarded.text,
        alertFired: flags.alertFired,
        niveau4Sent: false,
        commit: () => this.persistTurn(state, guarded.text),
      };
    }

    logDecision(log, "agent_max_iterations", { waId, toolsUsed });
    if (toolsUsed) {
      this.persistTurn(state, "");
      return { text: null, alertFired: flags.alertFired, niveau4Sent: flags.niveau4Sent };
    }
    return this.safetyFallback(waId, analysis, "boucle sans réponse", flags);
  }

  private persistTurn(state: ConversationStateData, sentReply: string): void {
    if (sentReply) {
      state.styleMarkers = registerMarkers(state.styleMarkers, sentReply, state.replyCount);
      state.replyCount += 1;
    }
    this.deps.core.state.save(state);
  }

  private async safetyFallback(
    waId: string,
    analysis: Analysis,
    motif: string,
    flags: { alertFired: boolean; niveau4Sent: boolean },
  ): Promise<AgentResult> {
    await triggerAlert(this.deps.alertDeps, {
      waId,
      motif,
      intention: analysis.intent,
      categorie: analysis.categorie,
      dernierMessage: analysis.combinedText.slice(0, 300),
    });
    const contact = this.deps.core.settings.get("contact_direct");
    const state = this.deps.core.state.get(waId);
    const text = `Je préfère ne pas te répondre à moitié : Jacob a été prévenu et revient vers toi rapidement. Si tu veux aller plus vite, écris-lui directement au ${contact}.`;
    return {
      text,
      alertFired: true,
      niveau4Sent: flags.niveau4Sent,
      commit: () => this.persistTurn(state, text),
    };
  }
}
