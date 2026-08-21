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
        <form className="flex gap-2" action="/conversations">
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

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-160 text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2 font-medium">Contact</th>
              <th className="px-4 py-2 font-medium">Dernier message</th>
              <th className="px-4 py-2 font-medium">Service</th>
              <th className="px-4 py-2 font-medium">Statut</th>
              <th className="px-4 py-2 font-medium">Score</th>
              <th className="px-4 py-2 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.waId} className="border-t border-neutral-100 hover:bg-neutral-50">
                <td className="px-4 py-2">
                  <Link href={`/conversations/${row.waId}`} className="font-medium hover:underline">
                    {row.nom || `+${row.waId}`}
                  </Link>
                  <div className="text-xs text-neutral-400">+{row.waId}</div>
                </td>
                <td className="max-w-70 truncate px-4 py-2 text-neutral-600">
                  <span className="text-neutral-400">
                    {row.dernierRole === "user" ? "→ " : "← "}
                  </span>
                  {row.dernierMessage}
                </td>
                <td className="px-4 py-2 text-neutral-600">{row.serviceEnCours ?? "—"}</td>
                <td className="px-4 py-2">{statusBadge(row)}</td>
                <td className="px-4 py-2">{row.score ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-2 text-neutral-500">
                  {new Date(row.dernierTs).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  Aucune conversation.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
