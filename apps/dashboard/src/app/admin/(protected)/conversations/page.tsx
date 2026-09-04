import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";

export const dynamic = "force-dynamic";

function statusBadge(row: { modeHumain: number; alertesOuvertes: number; optOut: number; statut: string }) {
  if (row.optOut) return <span className="badge badge-neutre">opt-out</span>;
  if (row.alertesOuvertes > 0) return <span className="badge badge-alerte">alerte</span>;
  if (row.modeHumain) return <span className="badge badge-humain">humain</span>;
  if (row.statut === "cloturee") return <span className="badge badge-neutre">clôturée</span>;
  return <span className="badge badge-bot">bot</span>;
}

// Grille commune à l'en-tête et à chaque ligne : mêmes proportions de colonnes
// (Contact / Dernier message / Service / Statut / Score / Date).
const ROW_GRID = "md:grid-cols-[1.4fr_2.2fr_0.9fr_0.8fr_0.5fr_0.9fr]";

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string }>;
}) {
  await requireSession();
  const { q = "", statut = "" } = await searchParams;
  const { core } = getRuntime();

  let rows = core.conversationOverview();
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.waId.includes(needle) ||
        (r.nom ?? "").toLowerCase().includes(needle) ||
        r.dernierMessage.toLowerCase().includes(needle),
    );
  }
  if (statut === "alerte") rows = rows.filter((r) => r.alertesOuvertes > 0);
  if (statut === "humain") rows = rows.filter((r) => r.modeHumain === 1);
  if (statut === "bot") rows = rows.filter((r) => r.modeHumain === 0 && r.alertesOuvertes === 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Conversations</h1>
        <form className="flex gap-2" action="/admin/conversations">
          <input
            name="q"
            defaultValue={q}
            placeholder="Rechercher contact ou message…"
            className="input w-64"
          />
          <select name="statut" defaultValue={statut} className="input w-32">
            <option value="">Tous</option>
            <option value="alerte">Alerte</option>
            <option value="humain">Humain</option>
            <option value="bot">Bot</option>
          </select>
          <button className="btn btn-secondary" type="submit">
            Filtrer
          </button>
        </form>
      </div>

      {/*
        Remplace le <table> par une liste de <Link> en grid : chaque ligne est
        entièrement cliquable (un <a> ne peut pas envelopper un <tr>), sans
        aucun JavaScript. L'apparence tableau est conservée par les mêmes
        proportions de colonnes sur l'en-tête et les lignes.
      */}
      <div className="card overflow-hidden p-0">
        <div className={`hidden bg-neutral-50 px-4 py-2 text-left text-xs uppercase text-neutral-400 md:grid md:items-center md:gap-4 ${ROW_GRID}`}>
          <div className="font-medium">Contact</div>
          <div className="font-medium">Dernier message</div>
          <div className="font-medium">Service</div>
          <div className="font-medium">Statut</div>
          <div className="font-medium">Score</div>
          <div className="font-medium">Date</div>
        </div>
        <div className="divide-y divide-neutral-100">
          {rows.map((row) => {
            const label = row.nom || `+${row.waId}`;
            return (
              <Link
                key={row.waId}
                href={`/admin/conversations/${row.waId}`}
                aria-label={`Ouvrir la conversation avec ${label}`}
                className={`grid grid-cols-1 gap-1 px-4 py-3 text-sm outline-none hover:bg-neutral-50 focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-900 md:items-center md:gap-4 ${ROW_GRID}`}
              >
                <div>
                  <div className="font-medium text-neutral-900">{label}</div>
                  <div className="text-xs text-neutral-400">+{row.waId}</div>
                </div>
                <div className="truncate text-neutral-600">
                  <span className="text-neutral-400">
                    {row.dernierRole === "user" ? "→ " : "← "}
                  </span>
                  {row.dernierMessage}
                </div>
                <div className="text-neutral-600">{row.serviceEnCours ?? "—"}</div>
                <div>{statusBadge(row)}</div>
                <div className="text-neutral-600">{row.score ?? "—"}</div>
                <div className="whitespace-nowrap text-neutral-500">
                  {new Date(row.dernierTs).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </Link>
            );
          })}
          {rows.length === 0 && (
            <div className="px-4 py-8 text-center text-neutral-400">Aucune conversation.</div>
          )}
        </div>
      </div>
    </div>
  );
}
