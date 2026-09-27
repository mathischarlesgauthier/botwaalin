"use client";

import { useState, useTransition } from "react";
import { setLeadStatusAction } from "@/lib/actions";

/**
 * Statut enregistré dès le choix, sans bouton de validation. Avec un bouton
 * séparé, changer la valeur puis passer à la ligne suivante perdait le
 * changement en silence — l'erreur la plus fréquente sur cette page.
 */
export function StatutSelect({
  leadId,
  statut,
  options,
}: {
  leadId: number;
  statut: string;
  options: Array<{ value: string; label: string }>;
}) {
  const [valeur, setValeur] = useState(statut);
  const [enregistre, setEnregistre] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <span className="flex items-center gap-2">
      <select
        className="input w-36"
        value={valeur}
        disabled={pending}
        onChange={(event) => {
          const suivant = event.target.value;
          setValeur(suivant);
          setEnregistre(false);
          startTransition(async () => {
            await setLeadStatusAction(leadId, suivant);
            setEnregistre(true);
          });
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {pending && <span className="text-xs text-neutral-400">…</span>}
      {!pending && enregistre && <span className="text-xs text-green-600">enregistré</span>}
    </span>
  );
}
