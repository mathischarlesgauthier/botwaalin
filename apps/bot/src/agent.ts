import type Anthropic from "@anthropic-ai/sdk";
import {
  allowedAmounts,
  checkStyleRules,
  findForeignPrices,
  logDecision,
  registerMarkers,
  triggerAlert,
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

/**
 * Convertit l'historique en messages Anthropic : rôles consécutifs fusionnés,
 * premier tour "user", tout tour assistant final tronqué (prefill interdit).
 * Les messages de Jacob (role human) apparaissent côté assistant, préfixés.
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
}

export class SalesAgent {
  private staticPrompt = "";
  private allowed = new Set<string>();
  private versionStamp = "";
  private readonly maxTokens: number;
  private readonly maxIterations: number;

  constructor(private readonly deps: AgentDeps) {
    this.maxTokens = deps.maxTokens ?? 1024;
    this.maxIterations = deps.maxIterations ?? 6;
    this.refreshKnowledge();
  }

  /** Recharge prompt statique + montants autorisés si catalogue/tarifs ont changé. */
  private refreshKnowledge(): void {
    const { core } = this.deps;
    const pricingStampRow = core.sqlite
      .prepare(`SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS m FROM pricing`)
      .get() as { n: number; m: number };
    const stamp = `${core.catalogue.currentVersionId()}:${pricingStampRow.n}:${pricingStampRow.m}`;
    if (stamp === this.versionStamp) return;
    const catalogue = core.catalogue.current().contenu;
    const rows = core.pricing.active();
    this.staticPrompt = buildStaticPrompt(catalogue, rows);
    this.allowed = allowedAmounts(rows, catalogue);
    this.versionStamp = stamp;
    logDecision(this.deps.log, "knowledge_reloaded", { stamp });
  }

  /** Garde-fou déterministe : aucun montant hors grille ne part vers le client. */
  async guardReply(waId: string, reply: string, analysis: Analysis): Promise<{ text: string; blocked: boolean }> {
    const foreign = findForeignPrices(reply, this.allowed);
    if (foreign.length === 0) return { text: reply, blocked: false };
    logDecision(this.deps.log, "price_guard_blocked", { waId, foreign });
    await triggerAlert(this.deps.alertDeps, {
      waId,
      motif: "prix demandé non présent et non calculable (garde-fou)",
      intention: analysis.intent,
      categorie: analysis.categorie,
      dernierMessage: analysis.combinedText.slice(0, 300),
    });
    const telegram = this.deps.core.settings.get("telegram_contact");
    return {
      text: `Bonne question 👌 Pour te donner le tarif exact, je préfère te mettre en direct avec Jacob : écris-lui sur Telegram ${telegram}. Il a aussi été prévenu de ton message.`,
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
        logDecision(this.deps.log, "regenerate_after_new_message", { waId });
        continue;
      }
      return result;
    }
    return { text: null, alertFired: false, niveau4Sent: false };
  }

  private async generate(waId: string, analysis: Analysis): Promise<AgentResult> {
    const { core, client, model, log } = this.deps;
    const state = core.state.get(waId);
    const flags = { alertFired: false, niveau4Sent: false };
    const history = core.messages.history(waId, 20);
    const messages = toAnthropicMessages(history);
    const last = messages.at(-1);
    if (!last || last.role !== "user") {
      logDecision(log, "history_without_pending_user_turn", { waId });
      return { text: null, alertFired: false, niveau4Sent: false };
    }

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

    const dynamicContext = buildDynamicContext(
      state,
      core.settings.get("group_link"),
      core.settings.get("telegram_contact"),
    );
    const system: Anthropic.Messages.TextBlockParam[] = [
      { type: "text", text: this.staticPrompt, cache_control: { type: "ephemeral" } },
      { type: "text", text: dynamicContext },
    ];

    let styleRetried = false;
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

      this.persistTurn(state, guarded.text);
      logDecision(log, "agent_reply", {
        waId,
        iterations: iteration + 1,
        toolsUsed,
        priceBlocked: guarded.blocked,
      });
      return { text: guarded.text, alertFired: flags.alertFired, niveau4Sent: false };
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
    const telegram = this.deps.core.settings.get("telegram_contact");
    const state = this.deps.core.state.get(waId);
    const text = `Je préfère ne pas te répondre à moitié : Jacob a été prévenu et revient vers toi rapidement. Si tu veux aller plus vite, écris-lui directement sur Telegram ${telegram}.`;
    this.persistTurn(state, text);
    return { text, alertFired: true, niveau4Sent: flags.niveau4Sent };
  }
}
