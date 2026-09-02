import Link from "next/link";
import { setLeadStatusAction } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";

export const dynamic = "force-dynamic";

const STATUTS = ["nouveau", "en_cours", "devis_envoye", "gagne", "perdu"] as const;
const STATUT_LABEL: Record<string, string> = {
  nouveau: "Nouveau",
  en_cours: "En cours",
  devis_envoye: "Devis envoyé",
  gagne: "Gagné",
  perdu: "Perdu",
};

export default async function LeadsPage() {
  await requireSession();
  const { core } = getRuntime();
  const leads = core.leads.list();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Demandes / Leads</h1>
        <a href="/api/export/leads" className="btn btn-secondary">
          ⬇️ Export CSV
        </a>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-180 text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2 font-medium">Contact</th>
              <th className="px-4 py-2 font-medium">Offre visée</th>
              <th className="px-4 py-2 font-medium">Besoin</th>
              <th className="px-4 py-2 font-medium">Budget</th>
              <th className="px-4 py-2 font-medium">Délai</th>
              <th className="px-4 py-2 font-medium">Score</th>
              <th className="px-4 py-2 font-medium">Statut</th>
              <th className="px-4 py-2 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
              const contact = core.contacts.get(lead.waId);
              return (
                <tr key={lead.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">
                    <Link href={`/admin/conversations/${lead.waId}`} className="font-medium hover:underline">
                      {contact?.nom || `+${lead.waId}`}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{lead.offre}</td>
                  <td className="max-w-60 truncate px-4 py-2 text-neutral-600">{lead.besoin}</td>
                  <td className="px-4 py-2">{lead.budget}</td>
                  <td className="px-4 py-2">{lead.delai}</td>
                  <td className="px-4 py-2 font-semibold">{lead.score}/5</td>
                  <td className="px-4 py-2">
                    <form action={setLeadStatusAction.bind(null, lead.id)}>
                      <select
                        name="statut"
                        defaultValue={lead.statut}
                        className="input w-36"
                      >
                        {STATUTS.map((s) => (
                          <option key={s} value={s}>
                            {STATUT_LABEL[s]}
                          </option>
                        ))}
                      </select>{" "}
                      <button className="btn btn-secondary mt-1" type="submit">
                        OK
                      </button>
                    </form>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-neutral-500">
                    {new Date(lead.ts).toLocaleDateString("fr-FR")}
                  </td>
                </tr>
              );
            })}
            {leads.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-neutral-400">
                  Aucun lead pour l&apos;instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
