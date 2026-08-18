// Test de bout en bout du cerveau de l'agent contre l'endpoint LLM configuré
// dans .env (sans WhatsApp) : system prompt réel + tools réels + question client.
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "../src/agent";
import { loadCatalogue } from "../src/catalogue";
import { toolDefinitions } from "../src/tools";

async function main() {
  const baseURL = process.env.ANTHROPIC_BASE_URL || undefined;
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    ...(baseURL ? { baseURL } : {}),
  });
  const system = buildSystemPrompt(loadCatalogue("data/catalogue.md"));

  console.log(`Endpoint : ${baseURL ?? "api.anthropic.com"} | modèle : ${model}`);

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
}

main().catch((err) => {
  console.error("ÉCHEC:", err instanceof Error ? err.message : err);
  process.exit(1);
});
