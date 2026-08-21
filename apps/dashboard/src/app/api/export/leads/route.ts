import { getSessionUser } from "@/lib/auth";
import { getRuntime } from "@/lib/core";

export const dynamic = "force-dynamic";

function csvEscape(value: string | number | null): string {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return new Response("Non autorisé", { status: 401 });

  const { core } = getRuntime();
  const leads = core.leads.list();
  const header = "contact;wa_id;offre;besoin;budget;delai;score;statut;date";
  const lines = leads.map((lead) => {
    const contact = core.contacts.get(lead.waId);
    return [
      csvEscape(contact?.nom ?? ""),
      csvEscape(lead.waId),
      csvEscape(lead.offre),
      csvEscape(lead.besoin),
      csvEscape(lead.budget),
      csvEscape(lead.delai),
      csvEscape(lead.score),
      csvEscape(lead.statut),
      csvEscape(new Date(lead.ts).toISOString()),
    ].join(";");
  });
  const body = "﻿" + [header, ...lines].join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-arbi-jacob.csv"`,
    },
  });
}
