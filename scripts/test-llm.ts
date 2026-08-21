// Test de bout en bout du cerveau de l'agent contre l'endpoint LLM configuré
// dans .env (sans WhatsApp) : prompt réel + grille tarifaire réelle + question client.
import { createCore, createLlmClient } from "@arbi/core";
import { join } from "node:path";
import { buildStaticPrompt } from "../apps/bot/src/prompt";
import { toolDefinitions } from "../apps/bot/src/tools";

async function main() {
  const model = process.env.ANTHROPIC_MODEL ?? "kimi-k2.6";
  const client = createLlmClient({
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    baseUrl: process.env.ANTHROPIC_BASE_URL || undefined,
    model,
  });
  const core = createCore({
    dbPath: ":memory:",
    catalogueSeedPath: join(__dirname, "..", "data", "catalogue.md"),
  });
  const system = buildStaticPrompt(core.catalogue.current().contenu, core.pricing.active());

  console.log(`Endpoint : ${process.env.ANTHROPIC_BASE_URL || "api.anthropic.com"} | modèle : ${model}`);

  const response = await client.messages.create({
    model,
    max_tokens: 512,
    system,
    tools: toolDefinitions,
    messages: [{ role: "user", content: "Salut, c'est combien un site vitrine ?" }],
  });

  console.log("stop_reason:", response.stop_reason);
  for (const block of response.content) {
    if (block.type === "text") console.log("TEXTE:", block.text);
    if (block.type === "tool_use") console.log("TOOL_USE:", block.name, JSON.stringify(block.input));
  }
  core.close();
}

main().catch((err) => {
  console.error("ÉCHEC:", err instanceof Error ? err.message : err);
  process.exit(1);
});
