import type Anthropic from "@anthropic-ai/sdk";
import { REASONING_HEADROOM } from "./llm";
import type { Logger } from "./logger";

/**
 * Mémoire client durable (§5) : extrait, depuis un extrait de conversation,
 * des faits courts et utiles à la vente (identité, activité, produit,
 * contraintes, préférences, historique d'achat). Robuste : ne lève jamais,
 * renvoie [] en cas d'échec — la mémoire client n'est jamais bloquante.
 *
 * Le filtre déterministe « sans montant » est appliqué une seconde fois,
 * indépendamment de cette consigne, par `core.facts.add()` (packages/core/src/db.ts) :
 * même si le modèle désobéit, l'écriture en base reste bloquée.
 */
export async function extractClientFacts(
  llm: Anthropic,
  model: string,
  transcript: string,
  existingFacts: string[],
  log: Logger,
): Promise<string[]> {
  if (!transcript.trim()) return [];
  try {
    const response = await llm.messages.create({
      model,
      // Marge pour le raisonnement du modèle (cf. REASONING_HEADROOM).
      max_tokens: REASONING_HEADROOM,
      system: [
        "Tu extrais des faits durables et utiles à la vente à partir d'une conversation commerciale WhatsApp, en français.",
        "Un fait par ligne, phrase courte, sans numérotation ni tiret en tête de ligne.",
        "Uniquement des faits DURABLES : identité, activité professionnelle, produit ou service recherché, contraintes, préférences, historique d'achat.",
        "JAMAIS de montant ni de prix : les prix vivent uniquement dans la grille tarifaire, jamais dans la mémoire client.",
        "Aucune donnée sensible inutile (pas de coordonnées bancaires, mot de passe, document d'identité).",
        "Ne répète jamais un fait déjà connu (liste ci-dessous) : n'écris que les faits NOUVEAUX.",
        "Si aucun fait nouveau et durable ne se dégage de cet extrait, réponds une réponse vide.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: [
            `Faits déjà connus de ce client :\n${existingFacts.length > 0 ? existingFacts.map((f) => `- ${f}`).join("\n") : "(aucun)"}`,
            `Extrait de conversation :\n${transcript}`,
          ].join("\n\n"),
        },
      ],
    });
    const text = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return text
      .split("\n")
      .map((line) => line.replace(/^[-•*\d.)\s]+/, "").trim())
      .filter((line) => line.length > 0);
  } catch (err) {
    log.error({ err: String(err) }, "extract_client_facts_failed");
    return [];
  }
}
