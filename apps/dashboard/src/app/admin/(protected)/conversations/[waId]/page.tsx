import {
  displayMediaText,
  OUTBOUND_MEDIA_ACCEPT,
  OUTBOUND_MEDIA_MAX_BYTES,
  serviceWindow,
} from "@arbi/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addFactAction,
  addNoteAction,
  deleteHumanMessageAction,
  markAlertTreatedAction,
  regenerateFactsAction,
  regenerateSummaryAction,
  releaseToBotAction,
  removeFactAction,
  sendHumanMediaAction,
  sendHumanMessageAction,
  sendRelanceTemplateAction,
  takeOverAction,
  toggleFactAction,
} from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { formatDuration } from "@/lib/time";
import { MediaPicker } from "./media-picker";
import { SummaryAutoRefresh } from "./summary-refresh";

export const dynamic = "force-dynamic";

const ROLE_STYLE: Record<string, { wrap: string; bubble: string; label: string }> = {
  user: { wrap: "justify-start", bubble: "bg-white border border-neutral-200", label: "Client" },
  assistant: { wrap: "justify-end", bubble: "bg-emerald-50 border border-emerald-200", label: "Bot" },
  human: { wrap: "justify-end", bubble: "bg-amber-50 border border-amber-300", label: "Jacob" },
};

export default async function ConversationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ waId: string }>;
  searchParams: Promise<{ msg?: string; draft?: string; confirmDelete?: string }>;
}) {
  await requireSession();
  const { waId } = await params;
  const { msg, draft, confirmDelete } = await searchParams;
  const { core } = getRuntime();
  const contact = core.contacts.get(waId);
  if (!contact) notFound();

  const transcript = core.messages.fullTranscript(waId);
  const state = core.state.get(waId);
  const alerts = core.alerts.listFor(waId);
  const openAlerts = alerts.filter((a) => a.statut === "ouverte");
  const notes = core.notes.list(waId);
  const leads = core.leads.list().filter((l) => l.waId === waId);
  const facts = core.facts.list(waId);

  // Fenêtre de service WhatsApp 24 h (§4.1) : indicateur permanent, purement
  // informatif. Elle ne verrouille PLUS le champ de réponse — Jacob doit
  // toujours pouvoir reprendre la main : hors fenêtre, l'envoi bascule
  // automatiquement sur le template de relance (cf. sendHumanMessageAction).
  // Résumé périmé = un message est arrivé après celui qu'il couvre. Le
  // composant client déclenche alors la régénération en arrière-plan, sans
  // retarder l'affichage de la conversation.
  const lastMessageId = core.messages.lastMessageId(waId);
  const resumeStale = lastMessageId > state.resumeMessageId;

  const windowState = serviceWindow(core.messages.lastInboundTs(waId), Date.now());
  const relanceTemplate = core.settings.get("relance_template_name").trim();
  // Seul l'opt-out (STOP) bloque encore : écrire à un désabonné met en danger
  // le numéro WhatsApp, et Meta refuse l'envoi de toute façon.
  const sendDisabled = contact.optOut === 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/admin/conversations" className="text-sm text-neutral-500 hover:underline">
            ← Conversations
          </Link>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
            {contact.nom || `+${waId}`}
            {contact.modeHumain ? (
              <span className="badge badge-humain align-middle">mode humain</span>
            ) : (
              <span className="badge badge-bot align-middle">bot actif</span>
            )}
            {windowState.open ? (
              <span className="badge badge-bot align-middle">
                🟢 Fenêtre ouverte — expire dans {formatDuration(windowState.msLeft)}
              </span>
            ) : (
              <span className="badge badge-alerte align-middle">
                🔴 Fenêtre fermée
                {windowState.closedSince != null ? ` depuis ${formatDuration(windowState.closedSince)}` : ""}
              </span>
            )}
          </h1>
          <div className="text-sm text-neutral-500">+{waId}</div>
        </div>
        <div className="flex gap-2">
          {contact.modeHumain ? (
            <form action={releaseToBotAction.bind(null, waId)}>
              <button className="btn btn-secondary" type="submit">
                🤖 Rendre la main au bot
              </button>
            </form>
          ) : (
            <form action={takeOverAction.bind(null, waId)}>
              <button className="btn btn-primary" type="submit">
                ✋ Reprendre la conversation
              </button>
            </form>
          )}
        </div>
      </div>

      {msg && (
        <div
          className={`card text-sm ${
            msg.startsWith("✅") ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"
          }`}
        >
          {msg}
        </div>
      )}

      {openAlerts.map((alert) => (
        <div key={alert.id} className="card border-red-300 bg-red-50">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-red-700">🔔 Alerte ouverte — {alert.motif}</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{alert.resume}</div>
              <div className="mt-1 text-xs text-neutral-500">
                Notifiée via : {alert.notifiedVia || "aucun canal"} ·{" "}
                {new Date(alert.createdAt).toLocaleString("fr-FR")}
              </div>
            </div>
            <form action={markAlertTreatedAction.bind(null, alert.id, waId)}>
              <button className="btn btn-secondary" type="submit">
                ✅ Marquer traitée
              </button>
            </form>
          </div>
        </div>
      ))}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="card">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Résumé automatique</h2>
              <div className="flex items-center gap-2">
                <SummaryAutoRefresh
                  waId={waId}
                  stale={resumeStale}
                  lastMessageId={lastMessageId}
                />
                <form action={regenerateSummaryAction.bind(null, waId)}>
                  <button className="btn btn-secondary" type="submit">
                    🔄 Régénérer
                  </button>
                </form>
              </div>
            </div>
            <p className="whitespace-pre-wrap text-sm text-neutral-700">
              {state.resume ||
                (resumeStale
                  ? "Résumé en cours de génération…"
                  : "Pas encore de résumé — clique sur Régénérer.")}
            </p>
          </div>

          <div className="card max-h-140 space-y-2 overflow-y-auto">
            {transcript.map((message) => {
              const style = ROLE_STYLE[message.role] ?? ROLE_STYLE.user!;
              // §1 : ce que le back-office affiche n'est jamais le texte brut
              // destiné au LLM (placeholders « tu ne peux pas la voir »…).
              // Ne change RIEN à ce qui est stocké en base ni à ce que reçoit le LLM.
              const displayText = displayMediaText(message.contenu, message.mediaFile, message.mediaMime);
              const mediaNotRetrieved = message.mediaType !== "" && !message.mediaFile;
              const isHuman = message.role === "human";
              return (
                <div key={message.id} className={`group flex ${style.wrap}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 ${style.bubble}`}>
                    <div className="mb-0.5 flex items-center gap-2 text-xs font-semibold text-neutral-400">
                      <span>
                        {style.label} ·{" "}
                        {new Date(message.ts).toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {isHuman && (
                        <Link
                          href={`/admin/conversations/${waId}?confirmDelete=${message.id}`}
                          title="Retirer de l'historique"
                          aria-label="Retirer ce message de l'historique"
                          className="ml-auto rounded px-1 text-neutral-300 opacity-0 transition-opacity hover:text-red-600 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 group-hover:opacity-100"
                        >
                          🗑
                        </Link>
                      )}
                    </div>
                    {message.mediaFile && (
                      <div className="mb-1">
                        {message.mediaMime.startsWith("image/") ? (
                          <a
                            href={`/api/media/${message.mediaFile}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/media/${message.mediaFile}`}
                              alt={isHuman ? "Photo envoyée par Jacob" : "Photo envoyée par le client"}
                              className="max-h-64 rounded-lg border border-neutral-200"
                            />
                          </a>
                        ) : message.mediaMime.startsWith("audio/") ? (
                          <audio
                            controls
                            preload="none"
                            src={`/api/media/${message.mediaFile}`}
                            className="w-full max-w-xs"
                          />
                        ) : message.mediaMime.startsWith("video/") ? (
                          <video
                            controls
                            preload="none"
                            src={`/api/media/${message.mediaFile}`}
                            className="max-h-64 rounded-lg border border-neutral-200"
                          />
                        ) : (
                          <a
                            href={`/api/media/${message.mediaFile}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 underline"
                          >
                            📎 Ouvrir le fichier reçu
                          </a>
                        )}
                      </div>
                    )}
                    {/* Rien n'est rendu si le résultat est vide (pas de <div> vide). */}
                    {displayText && (
                      <div
                        className={
                          mediaNotRetrieved
                            ? "text-xs italic text-neutral-400"
                            : "whitespace-pre-wrap text-sm"
                        }
                      >
                        {displayText}
                      </div>
                    )}
                    {isHuman && String(confirmDelete) === String(message.id) && (
                      <div className="mt-2 space-y-1 rounded-lg border border-red-200 bg-red-50 p-2 text-xs">
                        <p className="text-red-700">
                          Confirmer la suppression ? Le message reste visible chez le client sur
                          WhatsApp — la suppression ne concerne que l&apos;historique interne et le
                          contexte du bot.
                        </p>
                        <div className="flex gap-2">
                          <form action={deleteHumanMessageAction.bind(null, message.id, waId)}>
                            <button className="btn btn-danger" type="submit">
                              Confirmer la suppression
                            </button>
                          </form>
                          <Link href={`/admin/conversations/${waId}`} className="btn btn-secondary">
                            Annuler
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {transcript.length === 0 && (
              <p className="py-8 text-center text-sm text-neutral-400">Aucun message.</p>
            )}
          </div>

          <div className="card space-y-2">
            <form action={sendHumanMessageAction.bind(null, waId)} className="flex gap-2">
              <input
                name="message"
                className="input flex-1"
                placeholder="Répondre en tant que Jacob (passe la conversation en mode humain)…"
                autoComplete="off"
                required
                disabled={sendDisabled}
                defaultValue={draft ?? ""}
              />
              <button className="btn btn-primary" type="submit" disabled={sendDisabled}>
                Envoyer
              </button>
            </form>
            {/* Formulaire distinct : un envoi de média a son propre corps
                multipart, et un <form> ne peut pas en contenir un autre. */}
            <form
              action={sendHumanMediaAction.bind(null, waId)}
              className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-2"
            >
              <MediaPicker
                disabled={sendDisabled}
                accept={OUTBOUND_MEDIA_ACCEPT}
                maxImageBytes={OUTBOUND_MEDIA_MAX_BYTES.image}
                maxVideoBytes={OUTBOUND_MEDIA_MAX_BYTES.video}
              />
              <input
                name="legende"
                className="input w-full md:w-56"
                placeholder="Légende (facultative)…"
                autoComplete="off"
                disabled={sendDisabled}
              />
              <button className="btn btn-secondary" type="submit" disabled={sendDisabled}>
                📎 Envoyer
              </button>
              <span className="w-full text-xs text-neutral-400">
                Photo JPEG/PNG jusqu&apos;à 5 Mo, vidéo MP4 jusqu&apos;à 16 Mo — limites WhatsApp.
              </span>
            </form>
            {/* En dehors du <form> ci-dessus : un <form> ne peut pas en contenir un autre (HTML). */}
            {contact.optOut === 1 && (
              <div className="rounded-lg bg-neutral-50 p-2 text-xs text-neutral-600">
                Le contact s&apos;est désabonné (STOP) : aucun message ne peut lui être envoyé tant
                qu&apos;il n&apos;a pas réécrit.
              </div>
            )}
            {contact.optOut !== 1 && !windowState.open && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-50 p-2 text-xs text-neutral-600">
                <span>
                  {relanceTemplate
                    ? `Fenêtre 24 h fermée : ton message part quand même — via le template « ${relanceTemplate} », qui le porte s'il a une variable {{1}}.`
                    : "Fenêtre 24 h fermée : WhatsApp refusera le texte libre. Configure un template de relance avec une variable {{1}} pour que tes messages passent quand même."}
                </span>
                {relanceTemplate ? (
                  <form action={sendRelanceTemplateAction.bind(null, waId)}>
                    <button className="btn btn-secondary" type="submit">
                      🔁 Relancer avec le template seul
                    </button>
                  </form>
                ) : (
                  <Link href="/admin/reglages" className="text-neutral-500 underline">
                    Configurer un template de relance dans Réglages →
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card space-y-2 text-sm">
            <h2 className="font-semibold">Contexte commercial</h2>
            <div>
              <span className="label">Intention détectée</span>
              {state.lastIntent ?? "—"}
            </div>
            <div>
              <span className="label">Service en cours</span>
              {state.serviceEnCours ?? "—"}
              {state.sousCategorie ? ` · ${state.sousCategorie}` : ""}
            </div>
            <div>
              <span className="label">Besoin</span>
              {state.besoin ?? "—"}
            </div>
            <div>
              <span className="label">Budget</span>
              {state.budget ?? "—"}
            </div>
            <div>
              <span className="label">Délai</span>
              {state.delai ?? "—"}
            </div>
            <div>
              <span className="label">Offres présentées</span>
              {state.offresPresentees.length > 0 ? state.offresPresentees.join(", ") : "—"}
            </div>
            <div>
              <span className="label">Objections rencontrées</span>
              {state.objections.length > 0 ? state.objections.join(", ") : "—"}
            </div>
            <div>
              <span className="label">Registre</span>
              {state.toneRegister}
            </div>
          </div>

          <div className="card space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">🧠 Mémoire client</h2>
              <form action={regenerateFactsAction.bind(null, waId)}>
                <button className="btn btn-secondary" type="submit">
                  🔄 Régénérer
                </button>
              </form>
            </div>
            <ul className="space-y-1 text-sm">
              {facts.map((fact) => (
                <li
                  key={fact.id}
                  className={`flex items-center justify-between gap-2 rounded-lg border p-2 ${
                    fact.actif ? "border-neutral-200" : "border-neutral-100 text-neutral-400 line-through"
                  }`}
                >
                  <span>
                    {fact.fait} <span className="text-xs text-neutral-400 no-underline">({fact.source})</span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <form action={toggleFactAction.bind(null, fact.id, waId)}>
                      <button
                        className="btn btn-secondary"
                        type="submit"
                        title={fact.actif ? "Désactiver" : "Activer"}
                      >
                        {fact.actif ? "🙈" : "👁️"}
                      </button>
                    </form>
                    <form action={removeFactAction.bind(null, fact.id, waId)}>
                      <button className="btn btn-danger" type="submit" title="Supprimer">
                        🗑
                      </button>
                    </form>
                  </span>
                </li>
              ))}
              {facts.length === 0 && (
                <li className="text-neutral-400">Aucun fait mémorisé pour ce client.</li>
              )}
            </ul>
            <form action={addFactAction.bind(null, waId)} className="flex gap-2">
              <input
                name="fait"
                className="input flex-1"
                placeholder="Ajouter un fait (ex. « gère une boutique Vinted »)"
                required
              />
              <button className="btn btn-secondary" type="submit">
                +
              </button>
            </form>
          </div>

          {leads.length > 0 && (
            <div className="card space-y-2 text-sm">
              <h2 className="font-semibold">Leads</h2>
              {leads.map((lead) => (
                <div key={lead.id} className="rounded-lg border border-neutral-200 p-2">
                  <div className="font-medium">{lead.offre}</div>
                  <div className="text-neutral-500">
                    {lead.budget} · {lead.delai} · score {lead.score}/5 · {lead.statut}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="card space-y-2">
            <h2 className="font-semibold">Notes internes</h2>
            <form action={addNoteAction.bind(null, waId)} className="flex gap-2">
              <input name="note" className="input flex-1" placeholder="Ajouter une note…" required />
              <button className="btn btn-secondary" type="submit">
                +
              </button>
            </form>
            <ul className="space-y-1 text-sm">
              {notes.map((note) => (
                <li key={note.id} className="rounded bg-neutral-50 p-2">
                  <div className="text-xs text-neutral-400">
                    {new Date(note.createdAt).toLocaleString("fr-FR")}
                  </div>
                  {note.texte}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
