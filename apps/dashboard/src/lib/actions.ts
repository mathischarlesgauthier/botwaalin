"use server";

import {
  buildStyleGuide,
  checkOutboundMedia,
  classifyQuestionTopics,
  deterministicRejectReason,
  deterministicRejectReasonQuestion,
  DOCUMENT_MAX_ACTIVE,
  extractClientFacts,
  extractText,
  flattenTemplateParam,
  formatAlertText,
  logDecision,
  maskAmounts,
  pollStripePayments,
  safeMediaName,
  summarizeConversation,
  validateE164,
  type AdminNumber,
  type Core,
} from "@arbi/core";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  clearSessionCookie,
  loginRateLimited,
  requireSession,
  setSessionCookie,
  verifyCredentials,
} from "./auth";
import { getRuntime } from "./core";
import { mediaDir } from "./media";
import {
  docsDir,
  generatedDocFilename,
  mimeFor,
  sanitizeDocName,
  validateDocumentUpload,
} from "./documents";
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
import { CONV_FILTER_COOKIE, LEAD_STATUTS } from "./constants";
import { buildSiteData } from "./site/data";
import { createRelanceTemplate, RELANCE_TEMPLATE_NAME } from "./templates";
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

/** Texte tapé perdu en cas d'échec (§4.3) : réaffiché dans le champ, tronqué. */
const DRAFT_MAX_CHARS = 2000;

/** Cause + ce qu'il faut faire (§4.4) — remplace l'ancien message générique. */
function blockedSendMessage(reason: string | undefined): string {
  switch (reason) {
    case "outside_24h_window":
      return "WhatsApp a refusé le texte libre (plus de 24 h depuis le dernier message du client) et aucun template de relance n'est configuré pour prendre le relais — ajoute-en un dans Réglages → Templates WhatsApp.";
    case "opt_out":
      return "le contact s'est désabonné (STOP) : aucun message ne peut plus lui être envoyé.";
    default:
      return `erreur d'envoi (${reason ?? "inconnue"}) — réessaie dans quelques instants.`;
  }
}

/**
 * Longueur max du texte injecté dans la variable du template : Meta rejette un
 * corps HYDRATÉ de plus de 1024 caractères (erreur 132018) — on laisse de la
 * marge pour le texte fixe du template autour de la variable.
 */
const TEMPLATE_PARAM_MAX = 800;

type RelanceOutcome =
  /** Le texte de Jacob est parti tel quel, porté par la variable du template. */
  | { status: "sent_with_text" }
  /** Le template est parti, mais sans le texte (template sans variable). */
  | { status: "sent_template_only" }
  /** Aucun template de relance configuré dans Réglages. */
  | { status: "unavailable" }
  | { status: "failed"; reason?: string };

/**
 * Repli hors fenêtre 24 h : WhatsApp n'accepte plus qu'un template approuvé.
 * Si ce template porte une variable, le message de Jacob passe dedans et
 * arrive intégralement ; sinon on envoie au moins la relance, qui fait
 * réécrire le client et rouvre la fenêtre.
 */
async function sendViaRelanceTemplate(
  core: Core,
  wa: ReturnType<typeof getRuntime>["wa"],
  waId: string,
  text: string,
): Promise<RelanceOutcome> {
  const templateName = core.settings.get("relance_template_name").trim();
  if (!templateName) return { status: "unavailable" };
  const lang = core.contacts.get(waId)?.langue || "fr";

  const withText = await wa.sendTemplate(waId, templateName, lang, [
    {
      type: "body",
      parameters: [{ type: "text", text: flattenTemplateParam(text, TEMPLATE_PARAM_MAX) }],
    },
  ]);
  if (withText.sent) return { status: "sent_with_text" };

  // Nombre de paramètres refusé (132000) parce que le template n'a pas de
  // variable : on retente la relance nue.
  const plain = await wa.sendTemplate(waId, templateName, lang);
  if (plain.sent) return { status: "sent_template_only" };
  return { status: "failed", reason: withText.reason ?? plain.reason };
}

/** Trace commune à tout message effectivement délivré à la main par Jacob. */
function recordHumanMessage(core: Core, waId: string, text: string): void {
  const messageId = core.messages.insert(waId, "human", text);
  core.contacts.setModeHumain(waId, true);
  captureLearnedExample(core, waId, text, messageId);
}

/**
 * Envoi manuel de Jacob. Plus aucun verrou local : il doit toujours pouvoir
 * reprendre la main. On tente le texte libre, et si Meta le refuse parce que
 * la fenêtre 24 h est fermée, on bascule automatiquement sur le template de
 * relance (avec le texte dedans quand le template a une variable).
 */
export async function sendHumanMessageAction(waId: string, formData: FormData): Promise<void> {
  await requireSession();
  const text = String(formData.get("message") ?? "").trim();
  if (!text) return;
  const { core, wa, log } = getRuntime();
  const result = await wa.sendText(waId, text, { manual: true });
  if (result.sent) {
    recordHumanMessage(core, waId, text);
    revalidatePath(`/admin/conversations/${waId}`);
    // Redirect explicite (comme deleteHumanMessageAction) : sans lui, l'URL
    // garde un éventuel ancien `?msg=...&draft=...` d'un échec précédent, et
    // la bannière ⚠️ « Message NON envoyé » resterait affichée après un envoi
    // qui vient pourtant de réussir.
    redirect(`/admin/conversations/${waId}`);
  }

  if (result.reason === "outside_24h_window") {
    const fallback = await sendViaRelanceTemplate(core, wa, waId, text);
    logDecision(log, "human_send_outside_window", {
      waId,
      metaCode: result.metaCode,
      fallback: fallback.status,
    });
    if (fallback.status === "sent_with_text") {
      recordHumanMessage(core, waId, text);
      revalidatePath(`/admin/conversations/${waId}`);
      const msg = encodeURIComponent(
        "✅ Fenêtre 24 h fermée : ton message est parti via le template de relance.",
      );
      redirect(`/admin/conversations/${waId}?msg=${msg}`);
    }
    if (fallback.status === "sent_template_only") {
      core.messages.insert(waId, "human", "[Template de relance envoyé — fenêtre 24 h fermée]");
      core.contacts.setModeHumain(waId, true);
      revalidatePath(`/admin/conversations/${waId}`);
      const msg = encodeURIComponent(
        "⚠️ Fenêtre 24 h fermée : seule la relance est partie, ton texte n'a pas pu être joint. Ajoute une variable {{1}} au template dans Réglages pour qu'il porte ton message.",
      );
      const draft = encodeURIComponent(text.slice(0, DRAFT_MAX_CHARS));
      redirect(`/admin/conversations/${waId}?msg=${msg}&draft=${draft}`);
    }
    if (fallback.status === "failed") {
      const draft = encodeURIComponent(text.slice(0, DRAFT_MAX_CHARS));
      const msg = encodeURIComponent(
        `⚠️ Message NON envoyé : fenêtre 24 h fermée et le template de relance a échoué (${fallback.reason ?? "raison inconnue"}).`,
      );
      redirect(`/admin/conversations/${waId}?msg=${msg}&draft=${draft}`);
    }
    // `unavailable` : aucun template configuré → message d'aide ci-dessous.
  }

  // Échec réel : ne pas perdre le message en silence.
  logDecision(log, "human_send_blocked", { waId, reason: result.reason, metaCode: result.metaCode });
  const draft = encodeURIComponent(text.slice(0, DRAFT_MAX_CHARS));
  const msg = encodeURIComponent(`⚠️ Message NON envoyé : ${blockedSendMessage(result.reason)}`);
  redirect(`/admin/conversations/${waId}?msg=${msg}&draft=${draft}`);
}

/** Légende WhatsApp : 1024 caractères maximum, on coupe avant l'appel. */
const CAPTION_MAX_CHARS = 1000;

/** Nombre de fichiers acceptés en un seul envoi. */
const MEDIA_BATCH_MAX = 10;

/** Nom montré au client pour un document : le sien, nettoyé de tout chemin. */
function documentFilename(original: string): string {
  const base = original.split(/[/\\]/).pop() ?? "document";
  return base.trim().slice(0, 100) || "document";
}

/**
 * Envoi d'un ou PLUSIEURS fichiers depuis le back-office (photos, vidéos,
 * PDF, tableurs). Chacun est archivé sur le volume — même dossier que les
 * médias reçus, donc visible dans le fil —, déposé chez Meta, puis envoyé dans
 * l'ordre de sélection. Un échec sur un fichier n'empêche pas les suivants :
 * le bilan est rendu à la fin.
 */
export async function sendHumanMediaAction(waId: string, formData: FormData): Promise<void> {
  await requireSession();
  const { core, wa, log } = getRuntime();
  const fichiers = formData
    .getAll("fichier")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const legende = String(formData.get("legende") ?? "")
    .trim()
    .slice(0, CAPTION_MAX_CHARS);

  if (fichiers.length === 0) mediaRedirect(waId, "⚠️ Aucun fichier sélectionné.");
  if (fichiers.length > MEDIA_BATCH_MAX) {
    mediaRedirect(waId, `⚠️ ${MEDIA_BATCH_MAX} fichiers maximum en une fois.`);
  }

  const envoyes: string[] = [];
  const echecs: string[] = [];
  let horsFenetre = false;

  for (const [index, file] of fichiers.entries()) {
    const check = checkOutboundMedia({ name: file.name, size: file.size, type: file.type });
    if (!check.ok) {
      echecs.push(`${file.name} — ${check.message}`);
      continue;
    }
    const mime = check.mime;
    const stored = safeMediaName(randomUUID(), mime);
    const dir = mediaDir();
    // Un seul passage en mémoire : le même buffer sert à l'archivage et au
    // dépôt chez Meta.
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, stored), buffer);
    } catch (err) {
      log.error({ err: String(err), waId }, "outbound_media_write_failed");
      echecs.push(`${file.name} — enregistrement impossible sur le serveur`);
      continue;
    }
    const cleanup = async (): Promise<void> => {
      await unlink(join(dir, stored)).catch(() => undefined);
    };

    const mediaId = await wa.uploadMedia(buffer, mime, stored);
    if (!mediaId) {
      await cleanup();
      echecs.push(`${file.name} — refusé par WhatsApp`);
      continue;
    }

    const result = await wa.sendMedia(waId, check.kind, mediaId, {
      // La légende n'accompagne que le PREMIER fichier : répétée sur chacun,
      // le client la recevrait autant de fois qu'il y a de pièces jointes.
      caption: index === 0 && legende ? legende : undefined,
      // Sans `filename`, un document arrive chez le client sous son nom
      // technique (un UUID) au lieu de « tarifs 2026.xlsx ».
      ...(check.kind === "document" ? { filename: documentFilename(file.name) } : {}),
      manual: true,
    });
    if (!result.sent) {
      await cleanup();
      logDecision(log, "human_media_send_failed", {
        waId,
        kind: check.kind,
        reason: result.reason,
        metaCode: result.metaCode,
      });
      if (result.reason === "outside_24h_window") horsFenetre = true;
      echecs.push(`${file.name} — ${result.reason ?? "échec d'envoi"}`);
      continue;
    }

    // Le fichier est PARTI chez le client : on ne supprime plus rien. Si
    // l'écriture en base casse, on le journalise sans faire croire à un échec
    // d'envoi, ce qui pousserait à le renvoyer une seconde fois.
    const etiquette =
      check.kind === "image"
        ? "[Photo envoyée]"
        : check.kind === "video"
          ? "[Vidéo envoyée]"
          : `[Document envoyé : ${documentFilename(file.name)}]`;
    try {
      core.messages.insert(
        waId,
        "human",
        index === 0 && legende ? `${etiquette} ${legende}` : etiquette,
        result.messageId ?? null,
        Date.now(),
        { type: check.kind, file: stored, mime },
      );
    } catch (err) {
      log.error({ err: String(err), waId, stored }, "human_media_record_failed");
    }
    envoyes.push(file.name);
    logDecision(log, "human_media_sent", { waId, kind: check.kind, bytes: file.size });
  }

  if (envoyes.length > 0) core.contacts.setModeHumain(waId, true);
  revalidatePath(`/admin/conversations/${waId}`);

  if (echecs.length === 0) redirect(`/admin/conversations/${waId}`);
  if (envoyes.length === 0 && horsFenetre) {
    mediaRedirect(
      waId,
      "⚠️ Rien n'est parti : plus de 24 h depuis le dernier message du client. Écris-lui d'abord un message ; dès qu'il répond, tu pourras envoyer des fichiers.",
    );
  }
  mediaRedirect(
    waId,
    envoyes.length > 0
      ? `⚠️ ${envoyes.length} fichier(s) envoyé(s) sur ${fichiers.length}. Échec : ${echecs.join(" · ")}`
      : `⚠️ Aucun fichier envoyé. ${echecs.join(" · ")}`,
  );
}

function mediaRedirect(waId: string, message: string): never {
  redirect(`/admin/conversations/${waId}?msg=${encodeURIComponent(message)}`);
}

/**
 * Relance en un clic hors fenêtre 24 h : Jacob choisit un message
 * pré-enregistré, il part dans la variable du template approuvé. C'est le
 * chemin normal pour reprendre contact — plus besoin de comprendre ce qu'est
 * un template.
 */
export async function sendQuickRelanceAction(waId: string, index: number): Promise<void> {
  await requireSession();
  const { core, wa, log } = getRuntime();
  const messages = core.settings.get("relance_messages");
  const texte = (messages[index] ?? "").trim();
  if (!texte) {
    mediaRedirect(waId, "⚠️ Ce message de relance n'existe plus — vérifie dans Réglages.");
  }

  // Si la fenêtre est encore ouverte, un texte libre passe : inutile de
  // consommer un template payant.
  const direct = await wa.sendText(waId, texte, { manual: true });
  if (direct.sent) {
    recordHumanMessage(core, waId, texte);
    revalidatePath(`/admin/conversations/${waId}`);
    redirect(`/admin/conversations/${waId}`);
  }

  const fallback = await sendViaRelanceTemplate(core, wa, waId, texte);
  logDecision(log, "quick_relance", { waId, index, fallback: fallback.status });
  if (fallback.status === "sent_with_text") {
    recordHumanMessage(core, waId, texte);
    revalidatePath(`/admin/conversations/${waId}`);
    redirect(`/admin/conversations/${waId}?msg=${encodeURIComponent("✅ Relance envoyée.")}`);
  }
  if (fallback.status === "sent_template_only") {
    core.messages.insert(waId, "human", "[Relance envoyée — fenêtre 24 h fermée]");
    core.contacts.setModeHumain(waId, true);
    revalidatePath(`/admin/conversations/${waId}`);
    mediaRedirect(
      waId,
      "⚠️ La relance est partie, mais sans ton texte : le template n'a pas de variable {{1}}. Recrée-le depuis Réglages.",
    );
  }
  mediaRedirect(
    waId,
    fallback.status === "unavailable"
      ? "⚠️ Aucun template de relance n'est prêt. Va dans Réglages → Relances et clique sur « Créer le template »."
      : `⚠️ Relance non envoyée (${fallback.reason ?? "raison inconnue"}). Le template doit être APPROVED côté Meta.`,
  );
}

/** Longueur d'un message de relance : il doit tenir dans la variable du template. */
const RELANCE_MESSAGE_MAX = 600;
const RELANCE_MESSAGES_MAX = 8;

export async function addRelanceMessageAction(formData: FormData): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  const texte = String(formData.get("message") ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, RELANCE_MESSAGE_MAX);
  if (!texte) reglagesRedirect("⚠️ Écris d'abord le message.");
  const messages = core.settings.get("relance_messages");
  if (messages.length >= RELANCE_MESSAGES_MAX) {
    reglagesRedirect(`⚠️ Maximum ${RELANCE_MESSAGES_MAX} messages — supprimes-en un d'abord.`);
  }
  if (messages.some((m) => m.toLowerCase() === texte.toLowerCase())) {
    reglagesRedirect("⚠️ Ce message existe déjà.");
  }
  core.settings.set("relance_messages", [...messages, texte]);
  revalidatePath("/admin/reglages");
  revalidatePath("/admin/conversations", "layout");
  reglagesRedirect("✅ Message de relance ajouté.");
}

export async function removeRelanceMessageAction(index: number): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  const messages = core.settings.get("relance_messages");
  if (index < 0 || index >= messages.length) reglagesRedirect("⚠️ Message introuvable.");
  core.settings.set(
    "relance_messages",
    messages.filter((_m, i) => i !== index),
  );
  revalidatePath("/admin/reglages");
  revalidatePath("/admin/conversations", "layout");
  reglagesRedirect("✅ Message supprimé.");
}

/**
 * Crée le template de relance chez Meta et l'enregistre comme template actif.
 * Remplace la saisie manuelle d'un nom qu'il fallait deviner.
 */
export async function createRelanceTemplateAction(): Promise<void> {
  await requireSession();
  const { core, log } = getRuntime();
  const result = await createRelanceTemplate();
  logDecision(log, "relance_template_create", { ok: result.ok, status: result.status });
  if (!result.ok) {
    // Déjà créé côté Meta : on adopte le nom au lieu de traiter ça en erreur.
    if (/already exists/i.test(result.error ?? "")) {
      core.settings.set("relance_template_name", RELANCE_TEMPLATE_NAME);
      revalidatePath("/admin/reglages");
      reglagesRedirect(
        `✅ Le template « ${RELANCE_TEMPLATE_NAME} » existait déjà chez Meta — il est maintenant utilisé.`,
      );
    }
    reglagesRedirect(`⚠️ Création refusée par Meta : ${result.error ?? "raison inconnue"}`);
  }
  core.settings.set("relance_template_name", RELANCE_TEMPLATE_NAME);
  revalidatePath("/admin/reglages");
  reglagesRedirect(
    result.status === "APPROVED"
      ? "✅ Template créé et approuvé — tes relances partent dès maintenant."
      : `✅ Template soumis à Meta (statut ${result.status ?? "PENDING"}). L'approbation prend de quelques minutes à 24 h ; les relances fonctionneront ensuite.`,
  );
}

function reglagesRedirect(message: string): never {
  redirect(`/admin/reglages?msg=${encodeURIComponent(message)}`);
}

/**
 * Capture d'un exemple appris (§6) depuis un envoi manuel réussi : les 3
 * derniers messages `user` avant la réponse, concaténés. N'insère rien si la
 * conversation n'a aucun message client avant (repo.capture le garantit déjà
 * via question.trim() === "", mais on évite ici l'appel superflu).
 */
function captureLearnedExample(
  core: Core,
  waId: string,
  reponse: string,
  messageId: number,
): void {
  const before = core.messages
    .history(waId, 50)
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => m.contenu.trim())
    .filter(Boolean);
  if (before.length === 0) return;
  core.examples.capture({ waId, question: before.join(" / "), reponse, messageId });
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

/**
 * (Re)calcule le résumé d'une conversation. Appelée par le bouton
 * « Régénérer », et automatiquement à l'ouverture de la conversation quand le
 * résumé est en retard sur les messages (cf. `SummaryAutoRefresh`).
 *
 * Le marqueur `lastMessageId` est capturé AVANT l'appel LLM : si un message
 * arrive pendant le calcul, le résumé reste marqué périmé et sera refait, au
 * lieu d'être considéré comme à jour à tort.
 */
export async function regenerateSummaryAction(waId: string): Promise<void> {
  await requireSession();
  const { core, llm, model, log } = getRuntime();
  const contact = core.contacts.get(waId);
  const couvertJusqua = core.messages.lastMessageId(waId);
  const resume = await summarizeConversation(
    llm,
    model,
    core.messages.history(waId, 60),
    log,
    contact?.nom,
  );
  // Écriture ciblée : ne touche qu'au résumé, sans écraser l'état vivant du
  // bot (course inter-processus).
  core.state.setResume(waId, resume, couvertJusqua);
  logDecision(log, "summary_regenerated", { waId, couvertJusqua });
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

// ── Mémoire client (§5) ──

const FACT_MAX_CHARS = 300;

export async function addFactAction(waId: string, formData: FormData): Promise<void> {
  await requireSession();
  const fait = String(formData.get("fait") ?? "").trim().slice(0, FACT_MAX_CHARS);
  if (!fait) return;
  getRuntime().core.facts.add(waId, fait, "jacob");
  revalidatePath(`/admin/conversations/${waId}`);
}

export async function removeFactAction(id: number, waId: string): Promise<void> {
  await requireSession();
  getRuntime().core.facts.remove(id);
  revalidatePath(`/admin/conversations/${waId}`);
}

export async function toggleFactAction(id: number, waId: string): Promise<void> {
  await requireSession();
  getRuntime().core.facts.toggle(id);
  revalidatePath(`/admin/conversations/${waId}`);
}

/**
 * Régénère les faits de source `auto` depuis l'historique complet — pas les
 * faits `jacob`/`bot`, jamais touchés par `replaceAuto`. `existingFacts` ne
 * contient QUE les faits non-`auto` : l'extraction repart de zéro sur la
 * partie automatique (c'est le sens de « régénérer »), pas en incrémental.
 */
export async function regenerateFactsAction(waId: string): Promise<void> {
  await requireSession();
  const { core, llm, model, log } = getRuntime();
  const transcript = core.messages
    .history(waId, 60)
    .map((m) => `${m.role === "user" ? "Client" : m.role === "human" ? "Jacob" : "Bot"} : ${m.contenu}`)
    .join("\n");
  const existingFacts = core.facts
    .actifs(waId)
    .filter((f) => f.source !== "auto")
    .map((f) => f.fait);
  const faits = await extractClientFacts(llm, model, transcript, existingFacts, log);
  core.facts.replaceAuto(waId, faits);
  revalidatePath(`/admin/conversations/${waId}`);
}

// ── Suppression d'un message manuel (§7) ──

export async function deleteHumanMessageAction(messageId: number, waId: string): Promise<void> {
  await requireSession();
  const { core, log } = getRuntime();
  // Lu AVANT la suppression : après, plus rien ne relie le fichier au message,
  // et il resterait sur le volume pour toujours.
  const mediaFile = core.messages.mediaFileOf(messageId);
  const deleted = core.messages.deleteHuman(messageId);
  if (deleted) {
    core.examples.removeByMessageId(messageId);
    if (mediaFile) {
      await unlink(join(mediaDir(), mediaFile)).catch((err: unknown) => {
        // Le message est déjà supprimé : on n'échoue pas l'action pour un
        // fichier récalcitrant, on le signale.
        log.error({ err: String(err), mediaFile }, "media_file_delete_failed");
      });
    }
  }
  revalidatePath(`/admin/conversations/${waId}`);
  redirect(`/admin/conversations/${waId}`);
}

// ── Leads ──

/** Appelée directement au changement du menu déroulant (pas de bouton de validation). */
export async function setLeadStatusAction(leadId: number, statut: string): Promise<void> {
  await requireSession();
  if (!(LEAD_STATUTS as readonly string[]).includes(statut)) return;
  getRuntime().core.leads.setStatut(leadId, statut);
  revalidatePath("/admin/leads");
  revalidatePath("/admin");
  revalidatePath("/admin/conversations", "layout");
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

/** Plafond par exécution : borne le coût LLM d'un classement (lots de 40). */
const QUESTION_TOPIC_MAX = 200;

/**
 * Range les questions sous un sujet général. Par défaut, ne traite que les
 * questions pas encore classées (incrémental, peu coûteux) ; `complet = 1`
 * reprend aussi celles qui ont déjà un sujet, en repartant d'une nomenclature
 * vierge.
 */
export async function regenerateQuestionTopicsAction(formData: FormData): Promise<void> {
  await requireSession();
  const { core, llm, model, log } = getRuntime();
  const complet = String(formData.get("complet") ?? "") === "1";

  // Rien n'est effacé avant l'appel : les sujets existants sont écrasés
  // seulement par ce qui revient du LLM. Une panne au milieu laisse donc la
  // nomenclature précédente intacte au lieu de vider la page.
  const pending = complet
    ? core.questions.all(QUESTION_TOPIC_MAX)
    : core.questions.withoutTopic(QUESTION_TOPIC_MAX);
  if (pending.length === 0) {
    questionsRedirect("Toutes les questions sont déjà rangées par sujet.");
  }
  const assigned = await classifyQuestionTopics(
    llm,
    model,
    pending.map((question) => ({ id: question.id, texte: question.texte })),
    // « Tout reclasser » repart d'une nomenclature vierge — c'est justement ce
    // qu'on lui demande quand les sujets actuels ne conviennent plus.
    complet ? [] : core.questions.knownTopics(),
    log,
  );
  for (const [id, sujet] of assigned) core.questions.setTopic(id, sujet);
  logDecision(log, "question_topics_classified", {
    demandees: pending.length,
    classees: assigned.size,
    complet,
  });
  revalidatePath("/admin/questions");
  revalidatePath("/admin");
  const reste = core.questions.withoutTopic(QUESTION_TOPIC_MAX + 1).length;
  questionsRedirect(
    assigned.size === 0
      ? "⚠️ Classement impossible pour l'instant (LLM indisponible) — rien n'a été modifié, la vue par formulation reste utilisable."
      : `✅ ${assigned.size} question(s) rangée(s) par sujet.${
          reste > 0 ? ` ${reste} encore à classer — reclique pour continuer.` : ""
        }`,
  );
}

function questionsRedirect(message: string): never {
  redirect(`/admin/questions?msg=${encodeURIComponent(message)}`);
}

// ── Filtre de la liste des conversations ──

const CONV_FILTER_TTL_S = 30 * 24 * 60 * 60;

/**
 * Applique un filtre ET le mémorise. Sans mémorisation, ouvrir une
 * conversation puis revenir à la liste faisait repartir de zéro : il fallait
 * re-saisir la recherche à chaque aller-retour.
 */
export async function filterConversationsAction(formData: FormData): Promise<void> {
  await requireSession();
  const q = String(formData.get("q") ?? "").trim().slice(0, 100);
  const statut = String(formData.get("statut") ?? "");
  const valide = ["", "alerte", "humain", "bot"].includes(statut) ? statut : "";

  const store = await cookies();
  if (!q && !valide) {
    store.delete(CONV_FILTER_COOKIE);
  } else {
    store.set(CONV_FILTER_COOKIE, JSON.stringify({ q, statut: valide }), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && process.env.DASHBOARD_INSECURE_COOKIE !== "1",
      maxAge: CONV_FILTER_TTL_S,
      path: "/",
    });
  }
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (valide) params.set("statut", valide);
  const query = params.toString();
  redirect(`/admin/conversations${query ? `?${query}` : ""}`);
}

// ── Fichiers envoyables par le bot ──

const BOT_FILE_MAX = 30;

function fichiersRedirect(message: string): never {
  redirect(`/admin/fichiers?msg=${encodeURIComponent(message)}`);
}

/** Clé stable citée par le modèle : ascii, minuscules, sans espace. */
function cleFromNom(nom: string): string {
  const base = nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return base || "fichier";
}

export async function addBotFileAction(formData: FormData): Promise<void> {
  await requireSession();
  const { core, log } = getRuntime();
  const nom = String(formData.get("nom") ?? "").trim().slice(0, 80);
  const description = String(formData.get("description") ?? "").trim().slice(0, 200);
  const file = formData.get("fichier");
  if (!nom || !description) fichiersRedirect("⚠️ Nom et description sont obligatoires.");
  if (!(file instanceof File) || file.size === 0) fichiersRedirect("⚠️ Aucun fichier sélectionné.");
  if (core.botFiles.list().length >= BOT_FILE_MAX) {
    fichiersRedirect(`⚠️ Maximum ${BOT_FILE_MAX} fichiers — supprimes-en un d'abord.`);
  }

  const check = checkOutboundMedia({ name: file.name, size: file.size, type: file.type });
  if (!check.ok) fichiersRedirect(`⚠️ ${check.message}`);

  // Clé unique : suffixe numérique si le nom est déjà pris.
  let cle = cleFromNom(nom);
  for (let i = 2; core.botFiles.byCle(cle) && i < 100; i++) cle = `${cleFromNom(nom)}_${i}`;

  const stored = safeMediaName(randomUUID(), check.mime);
  const dir = mediaDir();
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, stored), Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    log.error({ err: String(err) }, "bot_file_write_failed");
    fichiersRedirect("⚠️ Impossible d'enregistrer le fichier sur le serveur.");
  }

  core.botFiles.create({
    cle,
    nom,
    description,
    fichier: stored,
    mime: check.mime,
    kind: check.kind,
    taille: file.size,
  });
  logDecision(log, "bot_file_added", { cle, kind: check.kind, bytes: file.size });
  revalidatePath("/admin/fichiers");
  fichiersRedirect(`✅ « ${nom} » ajouté — le bot peut désormais l'envoyer.`);
}

export async function toggleBotFileAction(id: number): Promise<void> {
  await requireSession();
  getRuntime().core.botFiles.toggle(id);
  revalidatePath("/admin/fichiers");
  redirect("/admin/fichiers");
}

export async function removeBotFileAction(id: number): Promise<void> {
  await requireSession();
  const { core, log } = getRuntime();
  const file = core.botFiles.get(id);
  if (!file) fichiersRedirect("⚠️ Fichier introuvable.");
  core.botFiles.remove(id);
  // Le fichier disque part avec l'entrée : sinon il resterait sur le volume
  // sans plus aucune référence.
  await unlink(join(mediaDir(), file.fichier)).catch((err: unknown) => {
    log.error({ err: String(err), fichier: file.fichier }, "bot_file_delete_failed");
  });
  revalidatePath("/admin/fichiers");
  fichiersRedirect(`✅ « ${file.nom} » supprimé.`);
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

// ── Documents de référence pour le prompt (§3) ──

const DOCUMENT_NOTE_MAX_CHARS = 500;

function catalogueRedirect(message: string): never {
  redirect(`/admin/catalogue?msg=${encodeURIComponent(message)}`);
}

export async function uploadDocumentAction(formData: FormData): Promise<void> {
  await requireSession();
  const { core, log } = getRuntime();
  const file = formData.get("fichier");
  const note = String(formData.get("note") ?? "").trim().slice(0, DOCUMENT_NOTE_MAX_CHARS);
  if (!(file instanceof File)) {
    catalogueRedirect("⚠️ Aucun fichier sélectionné.");
  }
  const activeCount = core.documents.actifs().length;
  const validation = validateDocumentUpload({ name: file.name, size: file.size, type: file.type }, activeCount);
  if (!validation.ok) {
    catalogueRedirect(`⚠️ ${validation.message}`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = mimeFor(file.name, file.type);
  const generated = generatedDocFilename(validation.ext);
  const dir = docsDir();
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, generated), buffer);
  } catch (err) {
    log.error({ err: String(err) }, "document_write_failed");
    catalogueRedirect("⚠️ Impossible d'enregistrer le fichier sur le serveur. Réessaie.");
  }

  const { text, reason } = await extractText(buffer, mime, file.name);
  const row = core.documents.create({
    nom: sanitizeDocName(file.name),
    fichier: generated,
    mime,
    taille: buffer.byteLength,
    contenu: text,
    extractionReason: reason ?? "",
    note,
  });
  revalidatePath("/admin/catalogue");
  const extractMsg = reason ? ` (⚠️ ${reason})` : "";
  catalogueRedirect(`✅ Document « ${row.nom} » ajouté${extractMsg}.`);
}

export async function toggleDocumentAction(id: number): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  const row = core.documents.get(id);
  if (!row) return;
  // Réactivation (0 → 1) : revérifier le quota, sinon un cycle désactiver /
  // en uploader un nouveau / réactiver l'ancien dépasse silencieusement les
  // DOCUMENT_MAX_ACTIVE documents actifs (validateDocumentUpload ne protège
  // que l'upload, pas la bascule actif/inactif).
  if (!row.actif && core.documents.actifs().length >= DOCUMENT_MAX_ACTIVE) {
    catalogueRedirect(
      `⚠️ Impossible d'activer « ${row.nom} » : ${DOCUMENT_MAX_ACTIVE} documents actifs maximum. Désactive-en un autre d'abord.`,
    );
  }
  core.documents.update(id, { actif: row.actif ? 0 : 1 });
  revalidatePath("/admin/catalogue");
}

/**
 * Ordre imposé (décision d'architecture) : la ligne DB (source de vérité) est
 * supprimée D'ABORD, puis le fichier disque est retiré en best-effort — pour
 * ne jamais laisser une ligne pointant vers un fichier déjà supprimé.
 */
export async function deleteDocumentAction(id: number): Promise<void> {
  await requireSession();
  const { core, log } = getRuntime();
  const row = core.documents.get(id);
  if (!row) return;
  core.documents.remove(id);
  try {
    await unlink(join(docsDir(), row.fichier));
  } catch (err) {
    log.error({ err: String(err), fichier: row.fichier }, "document_unlink_failed");
  }
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
  const contactDirect = String(formData.get("contact_direct") ?? "").trim();
  // Un contact vide laisserait le bot promettre « écris-lui au  » : on garde
  // la valeur précédente plutôt que d'effacer.
  if (contactDirect) core.settings.set("contact_direct", contactDirect);
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
  const autonomie = String(formData.get("bot_autonomie") ?? "");
  // Liste fermée : une valeur inattendue laisserait le prompt sans consigne
  // d'autonomie du tout.
  if (autonomie === "autonome" || autonomie === "equilibre" || autonomie === "prudent") {
    core.settings.set("bot_autonomie", autonomie);
  }
  const niveau4 = String(formData.get("niveau4_message") ?? "").trim();
  if (niveau4) core.settings.set("niveau4_message", niveau4);
  revalidatePath("/admin/reglages");
}

/** Code langue Meta (ex. "fr", "en_US") — un préfixe ISO 639-1, un pays optionnel. */
const LANG_CODE_RE = /^[a-z]{2,3}(_[A-Za-z0-9]{2,5})?$/;
const TEMPLATE_NAME_MAX_CHARS = 128;

export async function saveTemplateSettingsAction(formData: FormData): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  const alertName = String(formData.get("alert_template_name") ?? "").trim().slice(0, TEMPLATE_NAME_MAX_CHARS);
  core.settings.set("alert_template_name", alertName);

  const alertLang = String(formData.get("alert_template_lang") ?? "").trim();
  if (LANG_CODE_RE.test(alertLang)) core.settings.set("alert_template_lang", alertLang);

  // Vide = pas de template de relance : le bouton disparaît de la page conversation.
  const relance = String(formData.get("relance_template_name") ?? "").trim().slice(0, TEMPLATE_NAME_MAX_CHARS);
  core.settings.set("relance_template_name", relance);
  revalidatePath("/admin/reglages");
  revalidatePath("/admin/conversations");
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

// ── Apprentissage : exemples appris & guide de style (§6) ──

const EXAMPLE_FIELD_MAX_CHARS = 600;
const EXAMPLE_MOTIF_MAX_CHARS = 300;
const STYLE_GUIDE_MAX_CHARS = 4000;

function apprentissageRedirect(message: string): never {
  redirect(`/admin/apprentissage?msg=${encodeURIComponent(message)}`);
}

/**
 * Filtre déterministe « non négociable » (§6) rappliqué à la LIGNE COURANTE en
 * base, jamais au seul contenu du formulaire qui vient d'être soumis : c'est
 * ce qui empêche une activation manuelle de contourner `reviewExample` (le
 * risque le plus sérieux de l'apprentissage — cf. deterministicRejectReason).
 * Renvoie le motif de rejet, ou `null` si la ligne est saine.
 */
function exampleLeakReason(question: string, reponse: string): string | null {
  return deterministicRejectReason(reponse) ?? deterministicRejectReasonQuestion(question);
}

export async function activateExampleAction(id: number): Promise<void> {
  await requireSession();
  const { core } = getRuntime();
  const row = core.examples.get(id);
  if (!row) return;
  const leak = exampleLeakReason(row.question, row.reponse);
  if (leak) {
    core.examples.setStatut(id, "rejete", leak);
    revalidatePath("/admin/apprentissage");
    apprentissageRedirect(`⚠️ Exemple rejeté automatiquement au lieu d'être activé : ${leak}.`);
  }
  // Activation directe, sans passer par `reviewExample` : on neutralise ici
  // les montants, sinon un prix brut partirait dans le prompt partagé.
  const question = maskAmounts(row.question);
  const reponse = maskAmounts(row.reponse);
  if (question !== row.question || reponse !== row.reponse) {
    core.examples.update(id, { question, reponse, theme: row.theme });
  }
  core.examples.setStatut(id, "actif");
  revalidatePath("/admin/apprentissage");
}

export async function rejectExampleAction(id: number, formData: FormData): Promise<void> {
  await requireSession();
  const motif =
    String(formData.get("motif") ?? "").trim().slice(0, EXAMPLE_MOTIF_MAX_CHARS) ||
    "rejeté manuellement depuis le back-office";
  getRuntime().core.examples.setStatut(id, "rejete", motif);
  revalidatePath("/admin/apprentissage");
}

export async function deleteExampleAction(id: number): Promise<void> {
  await requireSession();
  getRuntime().core.examples.remove(id);
  revalidatePath("/admin/apprentissage");
}

export async function updateExampleAction(id: number, formData: FormData): Promise<void> {
  await requireSession();
  const question = String(formData.get("question") ?? "").trim().slice(0, EXAMPLE_FIELD_MAX_CHARS);
  const reponse = String(formData.get("reponse") ?? "").trim().slice(0, EXAMPLE_FIELD_MAX_CHARS);
  const theme = String(formData.get("theme") ?? "").trim().slice(0, 100);
  if (!question || !reponse) return;
  // Même filtre qu'à l'activation (§6) : une édition manuelle ne doit jamais
  // pouvoir réintroduire un montant/paiement/téléphone/e-mail sur une ligne
  // (y compris déjà `actif`, injectée dans le prompt statique partagé).
  const leak = exampleLeakReason(question, reponse);
  if (leak) {
    apprentissageRedirect(`⚠️ Modification refusée : ${leak}.`);
  }
  // Les montants sont neutralisés plutôt que refusés : l'exemple sert de
  // modèle de ton, les prix viennent toujours de la grille.
  getRuntime().core.examples.update(id, {
    question: maskAmounts(question),
    reponse: maskAmounts(reponse),
    theme,
  });
  revalidatePath("/admin/apprentissage");
}

export async function saveStyleGuideAction(formData: FormData): Promise<void> {
  await requireSession();
  const guide = String(formData.get("style_guide_appris") ?? "").trim().slice(0, STYLE_GUIDE_MAX_CHARS);
  const { core } = getRuntime();
  core.settings.set("style_guide_appris", guide);
  // Le brouillon vient d'être publié (ou remplacé par une édition manuelle) :
  // on l'efface pour ne pas le représenter comme « en attente » à la prochaine visite.
  core.settings.set("style_guide_appris_brouillon", "");
  revalidatePath("/admin/apprentissage");
}

/**
 * Génère un brouillon SANS jamais le publier dans le prompt statique partagé :
 * la source (40 derniers messages `human`, tous contacts confondus) peut
 * contenir un prénom ou un détail d'un client précis que le LLM recopierait
 * comme « formule d'ouverture ». Le brouillon attend une relecture explicite
 * de Jacob (bouton « Enregistrer le guide de style ») avant de devenir actif.
 * Ne touche pas au brouillon si le résultat est vide (échec LLM ou aucun message).
 */
export async function regenerateStyleGuideAction(): Promise<void> {
  await requireSession();
  const { core, llm, model, log } = getRuntime();
  const messages = core.messages.lastHumanMessages(40).map((m) => m.contenu);
  const guide = await buildStyleGuide(llm, model, messages, log);
  if (guide.trim()) core.settings.set("style_guide_appris_brouillon", guide);
  revalidatePath("/admin/apprentissage");
}

// ── Facturation ──

/** Montant maximal d'un paiement enregistré à la main (garde-fou de saisie). */
const PAIEMENT_MANUEL_MAX_CENTS = 100_000;

/**
 * Enregistre un paiement REÇU que la sonde Stripe n'a pas vu. Cas réel : un
 * règlement par lien de paiement unique ne génère pas de facture, or la sonde
 * ne parcourt que les factures — l'argent arrive, le solde reste négatif.
 *
 * La ligne est tracée comme « enregistré manuellement » et visible dans
 * l'historique : elle se distingue d'un encaissement Stripe vérifié.
 */
export async function addManualPaymentAction(formData: FormData): Promise<void> {
  await requireSession();
  const { core, log } = getRuntime();
  const euros = Number.parseFloat(String(formData.get("montant") ?? "").replace(",", "."));
  if (!Number.isFinite(euros) || euros <= 0) {
    redirect("/admin/facturation?msg=" + encodeURIComponent("⚠️ Montant invalide."));
  }
  const cents = Math.round(euros * 100);
  if (cents > PAIEMENT_MANUEL_MAX_CENTS) {
    redirect("/admin/facturation?msg=" + encodeURIComponent("⚠️ Montant trop élevé — vérifie la saisie."));
  }
  const note = String(formData.get("note") ?? "").trim().slice(0, 120);
  const now = Date.now();
  core.sqlite
    .prepare(
      `INSERT INTO billing_transactions (type, montant_cents, description, ref, created_at)
       VALUES ('paiement', ?, ?, ?, ?)`,
    )
    .run(
      cents,
      note ? `Paiement enregistré manuellement — ${note}` : "Paiement enregistré manuellement",
      `manuel:${now}`,
      now,
    );
  logDecision(log, "manual_payment_recorded", { cents, note });
  revalidatePath("/admin/facturation");
  revalidatePath("/admin", "layout");
  redirect(
    "/admin/facturation?msg=" +
      encodeURIComponent(
        `✅ Paiement de ${euros.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} € enregistré — le solde est à jour.`,
      ),
  );
}

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
