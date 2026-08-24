"use server";

import {
  formatAlertText,
  pollStripePayments,
  summarizeConversation,
  validateE164,
  type AdminNumber,
} from "@arbi/core";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  clearSessionCookie,
  loginRateLimited,
  requireSession,
  setSessionCookie,
  verifyCredentials,
} from "./auth";
import { getRuntime } from "./core";

// ── Auth ──

export async function loginAction(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const headerStore = await headers();
  // X-Forwarded-For est forgeable par le client : on ne s'y fie que derrière
  // un reverse proxy de confiance (DASHBOARD_TRUST_PROXY=1). Sinon, compteur
  // global — plus strict mais non contournable.
  const trustProxy = process.env.DASHBOARD_TRUST_PROXY === "1";
  const ip = trustProxy
    ? headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
    : "global";
  if (loginRateLimited(ip)) {
    return { error: "Trop de tentatives. Réessaie dans 15 minutes." };
  }
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "Identifiants requis." };
  const ok = await verifyCredentials(username, password);
  if (!ok) return { error: "Identifiants incorrects." };
  await setSessionCookie(username);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}

// ── Conversations ──

export async function sendHumanMessageAction(waId: string, formData: FormData): Promise<void> {
  await requireSession();
  const text = String(formData.get("message") ?? "").trim();
  if (!text) return;
  const { core, wa } = getRuntime();
  const result = await wa.sendText(waId, text);
  if (result.sent) {
    core.messages.insert(waId, "human", text);
    core.contacts.setModeHumain(waId, true);
    revalidatePath(`/conversations/${waId}`);
    return;
  }
  // Échec (fenêtre 24 h fermée, opt-out…) : ne pas perdre le message en silence.
  const reason =
    result.reason === "outside_24h_window"
      ? "fenêtre de service 24 h fermée — le client doit t'écrire d'abord (ou utiliser un template)"
      : result.reason === "opt_out"
        ? "le contact s'est désabonné (STOP)"
        : `erreur d'envoi (${result.reason ?? "inconnue"})`;
  redirect(`/conversations/${waId}?msg=${encodeURIComponent(`⚠️ Message NON envoyé : ${reason}`)}`);
}

export async function takeOverAction(waId: string): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  core.contacts.setModeHumain(waId, true);
  revalidatePath(`/conversations/${waId}`);
  revalidatePath("/conversations");
}

export async function releaseToBotAction(waId: string): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  core.contacts.setModeHumain(waId, false);
  revalidatePath(`/conversations/${waId}`);
  revalidatePath("/conversations");
}

export async function regenerateSummaryAction(waId: string): Promise<void> {
  await requireSession();
  const { core, llm, model, log } = getRuntime();
  const contact = core.contacts.get(waId);
  const resume = await summarizeConversation(
    llm,
    model,
    core.messages.history(waId, 60),
    log,
    contact?.nom,
  );
  // Écriture ciblée : ne touche qu'au résumé, sans écraser l'état vivant du
  // bot (course inter-processus).
  core.state.setResume(waId, resume);
  revalidatePath(`/conversations/${waId}`);
}

export async function addNoteAction(waId: string, formData: FormData): Promise<void> {
  await requireSession();
  const texte = String(formData.get("note") ?? "").trim();
  if (!texte) return;
  getRuntime().core.notes.add(waId, texte);
  revalidatePath(`/conversations/${waId}`);
}

export async function markAlertTreatedAction(alertId: number, waId: string): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  core.alerts.markTreated(alertId);
  core.contacts.setStatut(waId, "en_cours");
  revalidatePath(`/conversations/${waId}`);
  revalidatePath("/conversations");
  revalidatePath("/");
}

// ── Leads ──

export async function setLeadStatusAction(leadId: number, formData: FormData): Promise<void> {
  await requireSession();
  const statut = String(formData.get("statut") ?? "nouveau");
  const allowed = ["nouveau", "en_cours", "devis_envoye", "gagne", "perdu"];
  if (!allowed.includes(statut)) return;
  getRuntime().core.leads.setStatut(leadId, statut);
  revalidatePath("/leads");
}

// ── Questions → base de connaissances ──

export async function addFaqAnswerAction(questionId: number, formData: FormData): Promise<void> {
  await requireSession();
  const question = String(formData.get("question") ?? "").trim();
  const reponse = String(formData.get("reponse") ?? "").trim();
  if (!question || !reponse) return;
  const { core } = getRuntime();
  core.catalogue.appendFaq(question, reponse);
  core.questions.markAnswered(questionId);
  revalidatePath("/questions");
  revalidatePath("/catalogue");
}

// ── Catalogue & tarifs ──

export async function saveCatalogueAction(formData: FormData): Promise<void> {
  await requireSession();
  const contenu = String(formData.get("contenu") ?? "");
  const note = String(formData.get("note") ?? "édition dashboard").trim() || "édition dashboard";
  if (!contenu.trim()) return;
  getRuntime().core.catalogue.save(contenu, note);
  revalidatePath("/catalogue");
}

function parseKeywords(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,;\n]/)
        .map((k) => k.trim().toLowerCase().slice(0, 60))
        .filter(Boolean),
    ),
  ].slice(0, 30);
}

function slugify(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export async function updatePricingAction(serviceKey: string, formData: FormData): Promise<void> {
  await requireSession();
  const type = String(formData.get("type") ?? "FROM");
  if (!["FIXED", "FROM", "QUOTE", "RANGE"].includes(type)) return;
  const parseAmount = (name: string): number | null => {
    const raw = String(formData.get(name) ?? "").replace(/\s/g, "");
    if (!raw) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  const { core } = getRuntime();
  core.pricing.update(serviceKey, {
    label: String(formData.get("label") ?? "").trim() || undefined,
    categorie: String(formData.get("categorie") ?? "").trim() || undefined,
    type,
    prixMin: parseAmount("prixMin"),
    prixMax: parseAmount("prixMax"),
    affichage: String(formData.get("affichage") ?? "").trim() || null,
    perimetre: String(formData.get("perimetre") ?? "").trim(),
    actif: formData.get("actif") === "on" ? 1 : 0,
  });
  if (formData.get("keywords") !== null) {
    core.synonyms.replaceForResolution(serviceKey, parseKeywords(String(formData.get("keywords"))));
  }
  revalidatePath("/catalogue");
}

export async function addServiceAction(formData: FormData): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  const label = String(formData.get("label") ?? "").trim();
  const categorie = String(formData.get("categorie") ?? "").trim() || "Digital";
  const type = String(formData.get("type") ?? "QUOTE");
  if (!label || !["FIXED", "FROM", "QUOTE", "RANGE"].includes(type)) {
    redirect("/catalogue?msg=" + encodeURIComponent("⚠️ Nom du service requis."));
  }
  const serviceKey = slugify(String(formData.get("serviceKey") ?? "").trim() || label);
  if (!serviceKey) {
    redirect("/catalogue?msg=" + encodeURIComponent("⚠️ Impossible de générer une clé pour ce service."));
  }
  if (core.pricing.byKey(serviceKey)) {
    redirect("/catalogue?msg=" + encodeURIComponent(`⚠️ Le service « ${serviceKey} » existe déjà.`));
  }
  const parseAmount = (name: string): number | null => {
    const raw = String(formData.get(name) ?? "").replace(/\s/g, "");
    if (!raw) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  core.pricing.create({
    serviceKey,
    label,
    categorie,
    type,
    prixMin: parseAmount("prixMin"),
    prixMax: parseAmount("prixMax"),
    unite: "",
    perimetre: String(formData.get("perimetre") ?? "").trim(),
    affichage: String(formData.get("affichage") ?? "").trim() || null,
    actif: 1,
  });
  const keywords = parseKeywords(String(formData.get("keywords") ?? ""));
  // Le libellé sert toujours de mot-clé : le service est reconnaissable d'emblée.
  core.synonyms.replaceForResolution(serviceKey, [...new Set([label.toLowerCase(), ...keywords])]);
  revalidatePath("/catalogue");
  redirect("/catalogue?msg=" + encodeURIComponent(`✅ Service « ${label} » ajouté (${serviceKey}).`));
}

// ── Pôles du menu WhatsApp ──

const POLE_TITLE_MAX = 24;
const POLE_DESC_MAX = 72;

export async function addMenuPoleAction(formData: FormData): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  const title = String(formData.get("title") ?? "").trim().slice(0, POLE_TITLE_MAX);
  const description = String(formData.get("description") ?? "").trim().slice(0, POLE_DESC_MAX);
  if (!title) redirect("/catalogue?msg=" + encodeURIComponent("⚠️ Titre du pôle requis."));
  const poles = core.settings.get("menu_poles");
  if (poles.length >= 10) {
    redirect("/catalogue?msg=" + encodeURIComponent("⚠️ 10 pôles maximum (limite WhatsApp)."));
  }
  const id = slugify(title) || `pole_${poles.length + 1}`;
  if (poles.some((p) => p.id === id)) {
    redirect("/catalogue?msg=" + encodeURIComponent(`⚠️ Le pôle « ${title} » existe déjà.`));
  }
  core.settings.set("menu_poles", [...poles, { id, title, description }]);
  revalidatePath("/catalogue");
  redirect("/catalogue?msg=" + encodeURIComponent(`✅ Pôle « ${title} » ajouté au menu WhatsApp.`));
}

export async function updateMenuPoleAction(id: string, formData: FormData): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  const title = String(formData.get("title") ?? "").trim().slice(0, POLE_TITLE_MAX);
  const description = String(formData.get("description") ?? "").trim().slice(0, POLE_DESC_MAX);
  if (!title) return;
  const poles = core.settings.get("menu_poles");
  core.settings.set(
    "menu_poles",
    poles.map((p) => (p.id === id ? { ...p, title, description } : p)),
  );
  revalidatePath("/catalogue");
}

export async function deleteMenuPoleAction(id: string): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  const poles = core.settings.get("menu_poles");
  if (poles.length <= 1) {
    redirect("/catalogue?msg=" + encodeURIComponent("⚠️ Le menu doit garder au moins un pôle."));
  }
  core.settings.set(
    "menu_poles",
    poles.filter((p) => p.id !== id),
  );
  revalidatePath("/catalogue");
}

// ── Réglages ──

export async function saveGeneralSettingsAction(formData: FormData): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  core.settings.set("telegram_contact", String(formData.get("telegram_contact") ?? "").trim());
  core.settings.set("group_link", String(formData.get("group_link") ?? "").trim());
  core.settings.set("dashboard_url", String(formData.get("dashboard_url") ?? "").trim());
  core.settings.set("alert_email_to", String(formData.get("alert_email_to") ?? "").trim());
  const delay = Number.parseInt(String(formData.get("reactivation_delay_h") ?? "24"), 10);
  if (Number.isFinite(delay) && delay >= 1 && delay <= 168) {
    core.settings.set("reactivation_delay_h", delay);
  }
  const threshold = Number.parseInt(String(formData.get("alert_threshold") ?? "3"), 10);
  if (Number.isFinite(threshold) && threshold >= 1 && threshold <= 10) {
    core.settings.set("alert_threshold", threshold);
  }
  const niveau4 = String(formData.get("niveau4_message") ?? "").trim();
  if (niveau4) core.settings.set("niveau4_message", niveau4);
  revalidatePath("/reglages");
}

export async function toggleBotAction(): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  core.settings.set("bot_actif", !core.settings.get("bot_actif"));
  revalidatePath("/reglages");
  revalidatePath("/");
}

export async function addAdminNumberAction(formData: FormData): Promise<void> {
  await requireSession();
  const number = String(formData.get("number") ?? "").trim();
  if (!validateE164(number)) {
    redirect("/reglages?msg=" + encodeURIComponent("Numéro invalide : format E.164 attendu (+33612345678)"));
  }
  const { core } = getRuntime();
  const numbers = core.settings.get("admin_numbers") as AdminNumber[];
  if (numbers.some((n) => n.number === number)) {
    redirect("/reglages?msg=" + encodeURIComponent("Ce numéro est déjà dans la liste"));
  }
  core.settings.set("admin_numbers", [...numbers, { number, actif: true }]);
  revalidatePath("/reglages");
  redirect("/reglages?msg=" + encodeURIComponent("Numéro ajouté ✅"));
}

export async function toggleAdminNumberAction(number: string): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  const numbers = core.settings.get("admin_numbers") as AdminNumber[];
  core.settings.set(
    "admin_numbers",
    numbers.map((n) => (n.number === number ? { ...n, actif: !n.actif } : n)),
  );
  revalidatePath("/reglages");
}

export async function removeAdminNumberAction(number: string): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  const numbers = core.settings.get("admin_numbers") as AdminNumber[];
  core.settings.set(
    "admin_numbers",
    numbers.filter((n) => n.number !== number),
  );
  revalidatePath("/reglages");
}

export async function testAdminNumberAction(number: string): Promise<void> {
  await requireSession();
  const { core, wa } = getRuntime();
  const waId = number.replace(/[^\d]/g, "");
  const text = formatAlertText({
    clientLabel: "TEST du dashboard",
    categorie: "Autre",
    intention: "test",
    resume: "Ceci est un message de test envoyé depuis Dashboard → Réglages.",
    motif: "test d'envoi",
    dernierMessage: "test",
    dashboardUrl: core.settings.get("dashboard_url"),
    waId: "test",
  });
  const templateResult = await wa.sendTemplate(waId, core.settings.get("alert_template_name"), "fr", [
    {
      type: "body",
      parameters: [
        { type: "text", text: "TEST du dashboard" },
        { type: "text", text: "Autre" },
        { type: "text", text: "test" },
        { type: "text", text: "Message de test envoyé depuis Dashboard → Réglages" },
        { type: "text", text: "test d'envoi" },
        { type: "text", text: "test" },
      ],
    },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "test" }] },
  ]);
  let outcome = `template : ${templateResult.sent ? "envoyé ✅" : `échec (${templateResult.reason})`}`;
  if (!templateResult.sent) {
    const textResult = await wa.sendText(waId, text);
    outcome += ` · texte libre : ${textResult.sent ? "envoyé ✅" : `échec (${textResult.reason})`}`;
  }
  redirect("/reglages?msg=" + encodeURIComponent(`Test vers ${number} — ${outcome}`));
}

// ── Facturation ──

export async function checkStripePaymentsAction(): Promise<void> {
  await requireSession();
  const { core, log } = getRuntime();
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key) {
    redirect("/facturation?msg=" + encodeURIComponent("⚠️ Stripe n'est pas configuré."));
  }
  let message: string;
  try {
    const credited = await pollStripePayments(core, key, log);
    message =
      credited > 0
        ? `✅ ${credited} paiement${credited > 1 ? "s" : ""} trouvé${credited > 1 ? "s" : ""} et crédité${credited > 1 ? "s" : ""}.`
        : "Aucun nouveau paiement trouvé. Un paiement peut mettre quelques minutes à apparaître.";
  } catch (err) {
    message = "⚠️ Vérification impossible pour le moment. Réessaie dans quelques minutes.";
    log.error({ err: String(err) }, "stripe_poll_action_failed");
  }
  revalidatePath("/facturation");
  redirect("/facturation?msg=" + encodeURIComponent(message));
}
