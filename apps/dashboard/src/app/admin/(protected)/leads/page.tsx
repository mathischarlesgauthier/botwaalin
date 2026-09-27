import Link from "next/link";
import { LEAD_STATUTS } from "@/lib/constants";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { StatutSelect } from "./statut-select";

export const dynamic = "force-dynamic";

const STATUTS = LEAD_STATUTS;
const STATUT_LABEL: Record<string, string> = {
  nouveau: "Nouveau",
  en_cours: "En cours",
  devis_envoye: "Devis envoyé",
  gagne: "Gagné",
  perdu: "Perdu",
};

const OPTIONS = STATUTS.map((value) => ({ value, label: STATUT_LABEL[value] ?? value }));

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  await requireSession();
  const { statut: filtre = "" } = await searchParams;
  const { core } = getRuntime();
  const tous = core.leads.list();
  const leads = filtre ? tous.filter((lead) => lead.statut === filtre) : tous;
  const compte = (valeur: string) => tous.filter((lead) => lead.statut === valeur).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Demandes / Leads</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Fiches créées automatiquement par le bot quand une conversation devient sérieuse. Ton
            travail : faire avancer le statut, du plus chaud au plus froid (score sur 5).
          </p>
        </div>
        <a href="/api/export/leads" className="btn btn-secondary">
          ⬇️ Export CSV
        </a>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/leads"
          className={`btn ${filtre === "" ? "btn-primary" : "btn-secondary"}`}
        >
          Tous ({tous.length})
        </Link>
        {STATUTS.map((valeur) => (
          <Link
            key={valeur}
            href={`/admin/leads?statut=${valeur}`}
            className={`btn ${filtre === valeur ? "btn-primary" : "btn-secondary"}`}
          >
            {STATUT_LABEL[valeur]} ({compte(valeur)})
          </Link>
        ))}
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
                    <StatutSelect leadId={lead.id} statut={lead.statut} options={OPTIONS} />
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
                  {filtre
                    ? `Aucun lead au statut « ${STATUT_LABEL[filtre] ?? filtre} ».`
                    : "Aucun lead pour l'instant — le bot en créera un dès qu'une conversation aboutira."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
