/**
 * Diagnostic des templates WhatsApp approuvés côté Meta (§4.6). Lecture seule
 * (GET Graph API) : pas de server action, appelée directement depuis la page
 * Réglages quand `?check=1` est présent.
 */

export interface TemplateStatus {
  name: string;
  status: string;
  language: string;
}

export interface TemplateCheckResult {
  ok: boolean;
  templates: TemplateStatus[];
  error?: string;
}

export async function checkWhatsAppTemplates(): Promise<TemplateCheckResult> {
  const wabaId = process.env.WABA_ID ?? "";
  const token = process.env.WHATSAPP_TOKEN ?? "";
  const apiBase = process.env.GRAPH_API_BASE ?? "https://graph.facebook.com/v21.0";
  if (!wabaId || !token) {
    return {
      ok: false,
      templates: [],
      error: "WABA_ID ou WHATSAPP_TOKEN non configuré côté serveur — impossible d'interroger Meta.",
    };
  }
  try {
    const response = await fetch(
      `${apiBase}/${wabaId}/message_templates?fields=name,status,language`,
      // Appelé au rendu de la page Réglages : une API lente ne doit pas
      // bloquer l'affichage, l'état s'affiche alors comme indisponible.
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        templates: [],
        error: `Erreur API Meta (${response.status}) : ${body.slice(0, 300)}`,
      };
    }
    const json = (await response.json()) as {
      data?: Array<{ name?: string; status?: string; language?: string }>;
    };
    const templates = (json.data ?? []).map((t) => ({
      name: t.name ?? "",
      status: t.status ?? "",
      language: t.language ?? "",
    }));
    return { ok: true, templates };
  } catch (err) {
    return { ok: false, templates: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/** Nom du template de relance créé automatiquement depuis les Réglages. */
export const RELANCE_TEMPLATE_NAME = "relance_client";

/**
 * Corps du template de relance. La variable {{1}} porte le message choisi par
 * Jacob. Meta refuse un corps qui COMMENCE ou FINIT par une variable : d'où le
 * texte fixe, volontairement minimal pour ne pas alourdir le message.
 */
export const RELANCE_TEMPLATE_BODY = "ARBI JACOB\n\n{{1}}\n\nRéponds ici pour continuer.";

export interface CreateTemplateResult {
  ok: boolean;
  /** Statut Meta à la création (APPROVED, PENDING…). */
  status?: string;
  error?: string;
}

/**
 * Soumet le template de relance à Meta. Évite à l'utilisateur de lancer un
 * script shell et de deviner un nom : un bouton suffit. Meta approuve en
 * quelques minutes à 24 h ; tant que ce n'est pas APPROVED, l'envoi hors
 * fenêtre échoue proprement.
 */
export async function createRelanceTemplate(
  language = "fr",
): Promise<CreateTemplateResult> {
  const wabaId = process.env.WABA_ID ?? "";
  const token = process.env.WHATSAPP_TOKEN ?? "";
  const apiBase = process.env.GRAPH_API_BASE ?? "https://graph.facebook.com/v21.0";
  if (!wabaId || !token) {
    return { ok: false, error: "WABA_ID ou WHATSAPP_TOKEN non configuré côté serveur." };
  }
  try {
    const response = await fetch(`${apiBase}/${wabaId}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: RELANCE_TEMPLATE_NAME,
        language,
        // Un texte libre de relance est classé MARKETING par Meta ; le forcer
        // en UTILITY expose à un refus ou à une reclassification.
        category: "MARKETING",
        components: [
          {
            type: "BODY",
            text: RELANCE_TEMPLATE_BODY,
            example: {
              body_text: [["Salut, je reviens vers toi par rapport à notre conversation."]],
            },
          },
        ],
      }),
    });
    const json = (await response.json().catch(() => ({}))) as {
      status?: string;
      error?: { message?: string; error_user_msg?: string };
    };
    if (!response.ok) {
      const detail = json.error?.error_user_msg || json.error?.message || `HTTP ${response.status}`;
      return { ok: false, error: detail };
    }
    return { ok: true, status: json.status ?? "PENDING" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Un template configuré (ex. `alert_template_name`) est-il bien disponible
 * dans la langue attendue ? Signale le bug prod (#132001) de façon générique.
 */
export function templateLanguageWarning(
  templates: TemplateStatus[],
  name: string,
  lang: string,
): string | null {
  if (!name) return null;
  const matches = templates.filter((t) => t.name === name);
  if (matches.length === 0) {
    return `⚠️ Le template « ${name} » n'existe pas côté Meta (aucune langue). Vérifie son nom exact.`;
  }
  const inLang = matches.find((t) => t.language === lang);
  if (!inLang) {
    return `⚠️ Le template « ${name} » n'existe pas en langue « ${lang} » (#132001) — disponible en : ${matches.map((t) => t.language).join(", ")}. C'est pour ça que les alertes ne partent que par le repli texte.`;
  }
  if (inLang.status !== "APPROVED") {
    return `⚠️ Le template « ${name} » (${lang}) est au statut « ${inLang.status} », pas encore approuvé par Meta.`;
  }
  return null;
}
