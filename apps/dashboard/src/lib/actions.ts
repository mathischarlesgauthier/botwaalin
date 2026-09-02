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
import {
  normalizeSiteContent,
  SITE_FIELD_MAX,
  SITE_LIST_MAX,
  type SiteChatLine,
  type SiteContent,
  type SiteFaqItem,
  type SitePoleGroup,
  type SiteStep,
} from "./site/content";
import { buildSiteData } from "./site/data";
// `slugify` local (clés `a_b`) ≠ slug d'URL du site (`a-b`).
import { poleSlug, slugify as urlSlug } from "./site/format";

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
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/admin/login");
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
    revalidatePath(`/admin/conversations/${waId}`);
    return;
  }
  // Échec (fenêtre 24 h fermée, opt-out…) : ne pas perdre le message en silence.
  const reason =
    result.reason === "outside_24h_window"
      ? "fenêtre de service 24 h fermée — le client doit t'écrire d'abord (ou utiliser un template)"
      : result.reason === "opt_out"
        ? "le contact s'est désabonné (STOP)"
        : `erreur d'envoi (${result.reason ?? "inconnue"})`;
  redirect(`/admin/conversations/${waId}?msg=${encodeURIComponent(`⚠️ Message NON envoyé : ${reason}`)}`);
}

export async function takeOverAction(waId: string): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  core.contacts.setModeHumain(waId, true);
  revalidatePath(`/admin/conversations/${waId}`);
  revalidatePath("/admin/conversations");
}

export async function releaseToBotAction(waId: string): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  core.contacts.setModeHumain(waId, false);
  revalidatePath(`/admin/conversations/${waId}`);
  revalidatePath("/admin/conversations");
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
  revalidatePath(`/admin/conversations/${waId}`);
}

export async function addNoteAction(waId: string, formData: FormData): Promise<void> {
  await requireSession();
  const texte = String(formData.get("note") ?? "").trim();
  if (!texte) return;
  getRuntime().core.notes.add(waId, texte);
  revalidatePath(`/admin/conversations/${waId}`);
}

export async function markAlertTreatedAction(alertId: number, waId: string): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  core.alerts.markTreated(alertId);
  core.contacts.setStatut(waId, "en_cours");
  revalidatePath(`/admin/conversations/${waId}`);
  revalidatePath("/admin/conversations");
  revalidatePath("/admin");
}

// ── Leads ──

export async function setLeadStatusAction(leadId: number, formData: FormData): Promise<void> {
  await requireSession();
  const statut = String(formData.get("statut") ?? "nouveau");
  const allowed = ["nouveau", "en_cours", "devis_envoye", "gagne", "perdu"];
  if (!allowed.includes(statut)) return;
  getRuntime().core.leads.setStatut(leadId, statut);
  revalidatePath("/admin/leads");
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
  revalidatePath("/admin/questions");
  revalidatePath("/admin/catalogue");
}

// ── Catalogue & tarifs ──

export async function saveCatalogueAction(formData: FormData): Promise<void> {
  await requireSession();
  const contenu = String(formData.get("contenu") ?? "");
  const note = String(formData.get("note") ?? "édition dashboard").trim() || "édition dashboard";
  if (!contenu.trim()) return;
  getRuntime().core.catalogue.save(contenu, note);
  revalidatePath("/admin/catalogue");
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
  revalidatePath("/admin/catalogue");
}

export async function addServiceAction(formData: FormData): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  const label = String(formData.get("label") ?? "").trim();
  const categorie = String(formData.get("categorie") ?? "").trim() || "Digital";
  const type = String(formData.get("type") ?? "QUOTE");
  if (!label || !["FIXED", "FROM", "QUOTE", "RANGE"].includes(type)) {
    redirect("/admin/catalogue?msg=" + encodeURIComponent("⚠️ Nom du service requis."));
  }
  const serviceKey = slugify(String(formData.get("serviceKey") ?? "").trim() || label);
  if (!serviceKey) {
    redirect("/admin/catalogue?msg=" + encodeURIComponent("⚠️ Impossible de générer une clé pour ce service."));
  }
  if (core.pricing.byKey(serviceKey)) {
    redirect("/admin/catalogue?msg=" + encodeURIComponent(`⚠️ Le service « ${serviceKey} » existe déjà.`));
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
  revalidatePath("/admin/catalogue");
  redirect("/admin/catalogue?msg=" + encodeURIComponent(`✅ Service « ${label} » ajouté (${serviceKey}).`));
}

// ── Pôles du menu WhatsApp ──

const POLE_TITLE_MAX = 24;
const POLE_DESC_MAX = 72;

export async function addMenuPoleAction(formData: FormData): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  const title = String(formData.get("title") ?? "").trim().slice(0, POLE_TITLE_MAX);
  const description = String(formData.get("description") ?? "").trim().slice(0, POLE_DESC_MAX);
  if (!title) redirect("/admin/catalogue?msg=" + encodeURIComponent("⚠️ Titre du pôle requis."));
  const poles = core.settings.get("menu_poles");
  if (poles.length >= 10) {
    redirect("/admin/catalogue?msg=" + encodeURIComponent("⚠️ 10 pôles maximum (limite WhatsApp)."));
  }
  const id = slugify(title) || `pole_${poles.length + 1}`;
  if (poles.some((p) => p.id === id)) {
    redirect("/admin/catalogue?msg=" + encodeURIComponent(`⚠️ Le pôle « ${title} » existe déjà.`));
  }
  core.settings.set("menu_poles", [...poles, { id, title, description }]);
  revalidatePath("/admin/catalogue");
  redirect("/admin/catalogue?msg=" + encodeURIComponent(`✅ Pôle « ${title} » ajouté au menu WhatsApp.`));
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
  revalidatePath("/admin/catalogue");
}

export async function deleteMenuPoleAction(id: string): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  const poles = core.settings.get("menu_poles");
  if (poles.length <= 1) {
    redirect("/admin/catalogue?msg=" + encodeURIComponent("⚠️ Le menu doit garder au moins un pôle."));
  }
  core.settings.set(
    "menu_poles",
    poles.filter((p) => p.id !== id),
  );
  revalidatePath("/admin/catalogue");
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
  revalidatePath("/admin/reglages");
}

export async function toggleBotAction(): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  core.settings.set("bot_actif", !core.settings.get("bot_actif"));
  revalidatePath("/admin/reglages");
  revalidatePath("/admin");
}

export async function addAdminNumberAction(formData: FormData): Promise<void> {
  await requireSession();
  const number = String(formData.get("number") ?? "").trim();
  if (!validateE164(number)) {
    redirect("/admin/reglages?msg=" + encodeURIComponent("Numéro invalide : format E.164 attendu (+33612345678)"));
  }
  const { core } = getRuntime();
  const numbers = core.settings.get("admin_numbers") as AdminNumber[];
  if (numbers.some((n) => n.number === number)) {
    redirect("/admin/reglages?msg=" + encodeURIComponent("Ce numéro est déjà dans la liste"));
  }
  core.settings.set("admin_numbers", [...numbers, { number, actif: true }]);
  revalidatePath("/admin/reglages");
  redirect("/admin/reglages?msg=" + encodeURIComponent("Numéro ajouté ✅"));
}

export async function toggleAdminNumberAction(number: string): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  const numbers = core.settings.get("admin_numbers") as AdminNumber[];
  core.settings.set(
    "admin_numbers",
    numbers.map((n) => (n.number === number ? { ...n, actif: !n.actif } : n)),
  );
  revalidatePath("/admin/reglages");
}

export async function removeAdminNumberAction(number: string): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  const numbers = core.settings.get("admin_numbers") as AdminNumber[];
  core.settings.set(
    "admin_numbers",
    numbers.filter((n) => n.number !== number),
  );
  revalidatePath("/admin/reglages");
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
  redirect("/admin/reglages?msg=" + encodeURIComponent(`Test vers ${number} — ${outcome}`));
}

// ── Site vitrine ──

type SiteCore = ReturnType<typeof getRuntime>["core"];

/** Le site public est force-dynamic ; on invalide quand même le cache de routes par sécurité. */
function revalidateSite(): void {
  revalidatePath("/");
  revalidatePath("/offres/[pole]", "page");
  revalidatePath("/offres/[pole]/[service]", "page");
  revalidatePath("/admin/site");
}

function siteRedirect(message: string): never {
  redirect("/admin/site?msg=" + encodeURIComponent(message));
}

/** Contenu stocké, normalisé (deep-merge avec le seed) — base de tout patch. */
function currentSiteContent(core: SiteCore): SiteContent {
  return normalizeSiteContent(core.settings.get("site_content"));
}

/**
 * Adresses (slugs) effectivement prises par les autres pôles : slug explicite
 * ou slug par défaut de chaque pôle du menu / du contenu, plus les pôles
 * virtuels (catégories sans pôle déclaré) du site tel qu'il est servi.
 */
function takenPoleSlugs(core: SiteCore, current: SiteContent, poleId: string): Set<string> {
  const ids = new Set([
    ...core.settings.get("menu_poles").map((pole) => pole.id),
    ...Object.keys(current.poles),
  ]);
  ids.delete(poleId);
  const taken = new Set<string>();
  for (const id of ids) taken.add(current.poles[id]?.slug ?? poleSlug(id));
  for (const pole of buildSiteData(core).poles) {
    if (pole.virtual) {
      taken.add(pole.id);
      taken.add(pole.slug);
    }
  }
  return taken;
}

/**
 * Enregistre l'objet complet normalisé (l'historique des réglages est
 * automatique côté core). `raw` peut contenir des `undefined` : la
 * normalisation les remplace par les défauts du seed.
 */
function saveSiteContent(core: SiteCore, raw: Record<string, unknown>): void {
  core.settings.set("site_content", normalizeSiteContent(raw));
}

/** Champ texte trimé et borné (≤ SITE_FIELD_MAX). */
function siteField(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "")
    .trim()
    .slice(0, SITE_FIELD_MAX);
}

/** Champ optionnel : vide → `undefined` (= valeur par défaut au rendu). */
function siteOptField(formData: FormData, name: string): string | undefined {
  return siteField(formData, name) || undefined;
}

function boundList(items: string[]): string[] {
  return items
    .map((item) => item.trim().slice(0, SITE_FIELD_MAX))
    .filter(Boolean)
    .slice(0, SITE_LIST_MAX);
}

/** Champs répétés (même `name`) → liste bornée, vides retirés. */
function siteRepeated(formData: FormData, name: string): string[] {
  return boundList(formData.getAll(name).map((value) => String(value)));
}

/** Textarea « une entrée par ligne » → liste bornée. */
function siteLines(formData: FormData, name: string): string[] {
  return boundList(String(formData.get(name) ?? "").split(/\r?\n/));
}

/** Champ « a, b, c » (virgules / points-virgules) → liste bornée, dédoublonnée. */
function siteCsv(formData: FormData, name: string): string[] {
  return [...new Set(boundList(String(formData.get(name) ?? "").split(/[,;\n]/)))];
}

/** Textarea `Question ? | Réponse.` par ligne → FAQ (lignes sans « | » ignorées). */
function siteFaq(formData: FormData, name: string): SiteFaqItem[] {
  const out: SiteFaqItem[] = [];
  for (const line of siteLines(formData, name)) {
    const at = line.indexOf("|");
    if (at < 0) continue;
    const q = line.slice(0, at).trim();
    const a = line.slice(at + 1).trim();
    if (q && a) out.push({ q, a });
  }
  return out.slice(0, SITE_LIST_MAX);
}

/** Textarea `NOM DU GROUPE: clé1, clé2` par ligne → groupes de services d'un pôle. */
function siteGroups(formData: FormData, name: string): SitePoleGroup[] {
  const out: SitePoleGroup[] = [];
  for (const line of siteLines(formData, name)) {
    const at = line.indexOf(":");
    if (at < 0) continue;
    const groupName = line.slice(0, at).trim();
    if (!groupName) continue;
    const serviceKeys = [
      ...new Set(
        boundList(line.slice(at + 1).split(/[,;]/)).map((key) => key.toLowerCase()),
      ),
    ];
    out.push({ name: groupName, serviceKeys });
  }
  return out.slice(0, SITE_LIST_MAX);
}

/** Paires de champs répétés (titre / texte) → étapes ; une paire vide est ignorée. */
function siteSteps(formData: FormData): SiteStep[] {
  const titles = formData.getAll("step_title").map((value) => String(value).trim().slice(0, SITE_FIELD_MAX));
  const texts = formData.getAll("step_text").map((value) => String(value).trim().slice(0, SITE_FIELD_MAX));
  const out: SiteStep[] = [];
  for (let i = 0; i < Math.max(titles.length, texts.length); i += 1) {
    const title = titles[i] ?? "";
    const text = texts[i] ?? "";
    if (title || text) out.push({ title, text });
  }
  return out.slice(0, SITE_LIST_MAX);
}

/** Lignes du faux chat de l'offre phare (émetteur + texte) ; une ligne vide est ignorée. */
function siteChat(formData: FormData): SiteChatLine[] {
  const froms = formData.getAll("chat_from").map((value) => String(value));
  const texts = formData.getAll("chat_text").map((value) => String(value).trim().slice(0, SITE_FIELD_MAX));
  const out: SiteChatLine[] = [];
  for (let i = 0; i < texts.length; i += 1) {
    const text = texts[i] ?? "";
    if (!text) continue;
    out.push({ from: froms[i] === "bot" ? "bot" : "client", text });
  }
  return out.slice(0, SITE_LIST_MAX);
}

const HEX_COLOR_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export async function saveSiteGeneralAction(formData: FormData): Promise<void> {
  await requireSession();
  const whatsapp = siteField(formData, "whatsapp");
  if (!validateE164(whatsapp)) {
    siteRedirect("⚠️ Numéro WhatsApp invalide : format E.164 attendu (+33756975687).");
  }
  const { core } = getRuntime();
  const current = currentSiteContent(core);

  // Offre phare : vide = section masquée ; sinon la clé doit exister dans la grille.
  const featuredKey = siteField(formData, "featured_serviceKey");
  if (featuredKey && !core.pricing.byKey(featuredKey)) {
    siteRedirect(`⚠️ Offre phare : le service « ${featuredKey} » n'existe pas dans la grille tarifaire.`);
  }
  const chat = siteChat(formData);
  const featured = featuredKey
    ? {
        serviceKey: featuredKey,
        kicker: siteOptField(formData, "featured_kicker"),
        title: siteOptField(formData, "featured_title"),
        text: siteOptField(formData, "featured_text"),
        cta: siteOptField(formData, "featured_cta"),
        chat: chat.length > 0 ? chat : undefined,
      }
    : null;

  const ticker = siteLines(formData, "ticker");
  const steps = siteSteps(formData);
  const genericFaq = siteFaq(formData, "genericFaq");

  saveSiteContent(core, {
    ...current,
    whatsapp,
    brand: {
      name: siteOptField(formData, "brand_name"),
      tagline: siteOptField(formData, "brand_tagline"),
    },
    hero: {
      titleA: siteOptField(formData, "hero_titleA"),
      titleB: siteOptField(formData, "hero_titleB"),
      claim: siteOptField(formData, "hero_claim"),
      sub: siteOptField(formData, "hero_sub"),
      ctaPrimary: siteOptField(formData, "hero_ctaPrimary"),
      ctaSecondary: siteOptField(formData, "hero_ctaSecondary"),
      waText: siteOptField(formData, "hero_waText"),
    },
    ticker: ticker.length > 0 ? ticker : undefined,
    cardsTitleA: siteOptField(formData, "cardsTitleA"),
    cardsTitleB: siteOptField(formData, "cardsTitleB"),
    cardsHint: siteOptField(formData, "cardsHint"),
    featured,
    stepsTitle: siteOptField(formData, "stepsTitle"),
    steps: steps.length > 0 ? steps : undefined,
    cta: {
      title: siteOptField(formData, "cta_title"),
      text: siteOptField(formData, "cta_text"),
      primary: siteOptField(formData, "cta_primary"),
      secondary: siteOptField(formData, "cta_secondary"),
    },
    footer: { line: siteOptField(formData, "footer_line") },
    pagesCtaText: siteOptField(formData, "pagesCtaText"),
    genericFaq: genericFaq.length > 0 ? genericFaq : undefined,
  });
  revalidateSite();
  siteRedirect("✅ Textes généraux enregistrés — le site est à jour.");
}

export async function saveSitePoleAction(poleId: string, formData: FormData): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  const menu = core.settings.get("menu_poles");
  const current = currentSiteContent(core);
  const known = menu.some((pole) => pole.id === poleId) || poleId in current.poles;
  if (!known) siteRedirect(`⚠️ Pôle inconnu : « ${poleId} ».`);

  // Couleur : hex libre prioritaire sur la palette ; vide = palette par défaut.
  const color = siteField(formData, "color_hex") || siteField(formData, "color_preset");
  if (color && !HEX_COLOR_RE.test(color)) {
    siteRedirect(`⚠️ Couleur invalide « ${color} » : code hexadécimal attendu (#FF6A2B).`);
  }
  // Adresse : normalisée AVANT le contrôle (c'est la forme slugifiée qui est
  // stockée et servie), refusée si vide ou déjà prise par un autre pôle.
  const slugInput = siteField(formData, "slug");
  const slug = slugInput ? urlSlug(slugInput) : undefined;
  if (slugInput && !slug) {
    siteRedirect(`⚠️ Adresse « ${slugInput} » invalide : lettres, chiffres et tirets attendus.`);
  }
  if (slug && takenPoleSlugs(core, current, poleId).has(slug)) {
    siteRedirect(`⚠️ L'adresse « ${slug} » est déjà utilisée par un autre pôle.`);
  }

  const lines = siteRepeated(formData, "lines");
  const includes = siteRepeated(formData, "includes");
  const polePatch: Record<string, unknown> = {
    order: current.poles[poleId]?.order,
    slug,
    color: color || undefined,
    glyph: siteOptField(formData, "glyph"),
    cat: siteOptField(formData, "cat"),
    nameA: siteOptField(formData, "nameA"),
    nameB: siteOptField(formData, "nameB"),
    // Chaîne toujours présente : vide = prix de départ calculé depuis la grille.
    from: siteField(formData, "from"),
    lines: lines.length > 0 ? lines : undefined,
    tag: siteOptField(formData, "tag"),
    claim: siteOptField(formData, "claim"),
    sub: siteOptField(formData, "sub"),
    includes: includes.length > 0 ? includes : undefined,
    offersTitle: siteOptField(formData, "offersTitle"),
    // Liste explicite : vide = section « déroulé » masquée.
    process: siteLines(formData, "process"),
    ctaTitle: siteOptField(formData, "ctaTitle"),
    match: {
      categories: siteCsv(formData, "match_categories"),
      serviceKeys: siteCsv(formData, "match_serviceKeys").map((key) => key.toLowerCase()),
    },
    groups: siteGroups(formData, "groups"),
  };
  saveSiteContent(core, { ...current, poles: { ...current.poles, [poleId]: polePatch } });
  revalidateSite();
  siteRedirect(`✅ Pôle « ${poleId} » enregistré — le site est à jour.`);
}

export async function saveSiteServiceAction(serviceKey: string, formData: FormData): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  if (!core.pricing.byKey(serviceKey)) {
    siteRedirect(`⚠️ Service inconnu dans la grille tarifaire : « ${serviceKey} ».`);
  }
  const current = currentSiteContent(core);
  const args = siteRepeated(formData, "args");
  const servicePatch: Record<string, unknown> = {
    punch: siteOptField(formData, "punch"),
    desc: siteOptField(formData, "desc"),
    args: args.length > 0 ? args : undefined,
    // Liste explicite : vide = FAQ générique du site.
    faq: siteFaq(formData, "faq"),
  };
  saveSiteContent(core, {
    ...current,
    services: { ...current.services, [serviceKey]: servicePatch },
  });
  revalidateSite();
  siteRedirect(`✅ Service « ${serviceKey} » enregistré — le site est à jour.`);
}

/** Réinitialisation : le formulaire n'est proposé qu'après l'étape ?confirm=1. */
export async function resetSiteContentAction(): Promise<void> {
  await requireSession();
  getRuntime().core.settings.set("site_content", {});
  revalidateSite();
  siteRedirect("✅ Textes du site réinitialisés aux valeurs par défaut.");
}

// ── Facturation ──

export async function checkStripePaymentsAction(): Promise<void> {
  await requireSession();
  const { core, log } = getRuntime();
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key) {
    redirect("/admin/facturation?msg=" + encodeURIComponent("⚠️ Stripe n'est pas configuré."));
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
  revalidatePath("/admin/facturation");
  redirect("/admin/facturation?msg=" + encodeURIComponent(message));
}
