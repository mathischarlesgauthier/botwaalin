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
      { headers: { Authorization: `Bearer ${token}` } },
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
