import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { computeKpis, topQuestions } from "@/lib/stats";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

function KpiRow({ label, values }: { label: string; values: Array<number | string> }) {
  return (
    <tr className="border-t border-neutral-100">
      <td className="py-2 pr-4 text-sm text-neutral-600">{label}</td>
      {values.map((value, i) => (
        <td key={i} className="py-2 pr-4 text-right text-sm font-semibold">
          {value}
        </td>
      ))}
    </tr>
  );
}

export default async function OverviewPage() {
  await requireSession();
  const { core } = getRuntime();
  const [day, week, month] = [computeKpis(core, DAY), computeKpis(core, 7 * DAY), computeKpis(core, 30 * DAY)];
  const openAlerts = core.alerts.open();
  const top = topQuestions(core, 10);
  const unanswered = core.questions.unanswered(10);
  const maxCat = Math.max(1, ...month.parCategorie.map((c) => c.n));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Vue d&apos;ensemble</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card">
          <div className="label">Alertes ouvertes</div>
          <div className={`text-3xl font-bold ${openAlerts.length > 0 ? "text-red-600" : ""}`}>
            {openAlerts.length}
          </div>
          {openAlerts.length > 0 && (
            <Link href="/admin/conversations?statut=alerte" className="text-sm text-red-600 underline">
              Voir les conversations en alerte →
            </Link>
          )}
        </div>
        <div className="card">
          <div className="label">Conversations (7 j)</div>
          <div className="text-3xl font-bold">{week.conversations}</div>
        </div>
        <div className="card">
          <div className="label">Résolution sans humain (7 j)</div>
          <div className="text-3xl font-bold">
            {week.tauxResolution === null ? "—" : `${week.tauxResolution} %`}
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">KPI</h2>
        <table className="w-full min-w-105">
          <thead>
            <tr className="text-right text-xs uppercase text-neutral-400">
              <th className="text-left font-medium">Indicateur</th>
              <th className="pr-4 font-medium">Aujourd&apos;hui</th>
              <th className="pr-4 font-medium">7 jours</th>
              <th className="pr-4 font-medium">30 jours</th>
            </tr>
          </thead>
          <tbody>
            <KpiRow label="Conversations" values={[day.conversations, week.conversations, month.conversations]} />
            <KpiRow
              label="Nouveaux contacts"
              values={[day.nouveauxContacts, week.nouveauxContacts, month.nouveauxContacts]}
            />
            <KpiRow
              label="Résolution sans humain"
              values={[day, week, month].map((p) =>
                p.tauxResolution === null ? "—" : `${p.tauxResolution} %`,
              )}
            />
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold">Demandes par catégorie (30 j)</h2>
          {month.parCategorie.length === 0 && (
            <p className="text-sm text-neutral-500">Aucune demande enregistrée.</p>
          )}
          <div className="space-y-2">
            {month.parCategorie.map((c) => (
              <div key={c.categorie} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-sm">{c.categorie}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-neutral-100">
                  <div
                    className="h-full rounded bg-neutral-800"
                    style={{ width: `${(c.n / maxCat) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-sm font-semibold">{c.n}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Top 10 des questions posées</h2>
          {top.length === 0 && <p className="text-sm text-neutral-500">Pas encore de questions.</p>}
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {top.map((q, i) => (
              <li key={i}>
                <span className="text-neutral-800">{q.representative}</span>{" "}
                <span className="text-neutral-400">×{q.count}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Questions restées sans réponse</h2>
          <Link href="/admin/questions?onglet=sans-reponse" className="text-sm underline">
            Tout voir →
          </Link>
        </div>
        {unanswered.length === 0 && (
          <p className="text-sm text-neutral-500">Aucune — le bot a réponse à tout 🎉</p>
        )}
        <ul className="space-y-1 text-sm">
          {unanswered.map((q) => (
            <li key={q.id} className="flex items-center gap-2">
              <span className="badge badge-alerte">!</span>
              <Link href={`/admin/conversations/${q.waId}`} className="hover:underline">
                {q.texte}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
