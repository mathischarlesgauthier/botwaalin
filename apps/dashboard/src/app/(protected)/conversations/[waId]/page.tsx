import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addNoteAction,
  markAlertTreatedAction,
  regenerateSummaryAction,
  releaseToBotAction,
  sendHumanMessageAction,
  takeOverAction,
} from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";

export const dynamic = "force-dynamic";

const ROLE_STYLE: Record<string, { wrap: string; bubble: string; label: string }> = {
  user: { wrap: "justify-start", bubble: "bg-white border border-neutral-200", label: "Client" },
  assistant: { wrap: "justify-end", bubble: "bg-emerald-50 border border-emerald-200", label: "Bot" },
  human: { wrap: "justify-end", bubble: "bg-amber-50 border border-amber-300", label: "Jacob" },
};

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ waId: string }>;
}) {
  await requireSession();
  const { waId } = await params;
  const { core } = getRuntime();
  const contact = core.contacts.get(waId);
  if (!contact) notFound();

  const transcript = core.messages.fullTranscript(waId);
  const state = core.state.get(waId);
  const alerts = core.alerts.listFor(waId);
  const openAlerts = alerts.filter((a) => a.statut === "ouverte");
  const notes = core.notes.list(waId);
  const leads = core.leads.list().filter((l) => l.waId === waId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/conversations" className="text-sm text-neutral-500 hover:underline">
            ← Conversations
          </Link>
          <h1 className="text-2xl font-bold">
            {contact.nom || `+${waId}`}{" "}
            {contact.modeHumain ? (
              <span className="badge badge-humain align-middle">mode humain</span>
            ) : (
              <span className="badge badge-bot align-middle">bot actif</span>
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
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Résumé automatique</h2>
              <form action={regenerateSummaryAction.bind(null, waId)}>
                <button className="btn btn-secondary" type="submit">
                  🔄 Régénérer
                </button>
              </form>
            </div>
            <p className="whitespace-pre-wrap text-sm text-neutral-700">
              {state.resume || "Pas encore de résumé — clique sur Régénérer."}
            </p>
          </div>

          <div className="card max-h-140 space-y-2 overflow-y-auto">
            {transcript.map((message) => {
              const style = ROLE_STYLE[message.role] ?? ROLE_STYLE.user!;
              return (
                <div key={message.id} className={`flex ${style.wrap}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 ${style.bubble}`}>
                    <div className="mb-0.5 text-xs font-semibold text-neutral-400">
                      {style.label} ·{" "}
                      {new Date(message.ts).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div className="whitespace-pre-wrap text-sm">{message.contenu}</div>
                  </div>
                </div>
              );
            })}
            {transcript.length === 0 && (
              <p className="py-8 text-center text-sm text-neutral-400">Aucun message.</p>
            )}
          </div>

          <form action={sendHumanMessageAction.bind(null, waId)} className="card flex gap-2">
            <input
              name="message"
              className="input flex-1"
              placeholder="Répondre en tant que Jacob (passe la conversation en mode humain)…"
              autoComplete="off"
              required
            />
            <button className="btn btn-primary" type="submit">
              Envoyer
            </button>
          </form>
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
