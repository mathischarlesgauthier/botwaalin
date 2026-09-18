"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { regenerateSummaryAction } from "@/lib/actions";

/**
 * Met le résumé à jour tout seul à l'ouverture de la conversation, quand il est
 * en retard sur les messages. Le calcul ne peut pas vivre dans le rendu serveur
 * (il appelle le LLM et retarderait l'affichage de toute la page) : on affiche
 * donc la conversation immédiatement, puis on régénère en arrière-plan.
 *
 * `lastMessageId` sert de garde plutôt qu'un simple booléen : on mémorise
 * l'état pour lequel une tentative a déjà eu lieu. Un message arrivé pendant le
 * calcul laisse le résumé périmé — avec un booléen, l'indicateur « Mise à jour…
 * » resterait alors affiché pour toujours sans qu'aucune régénération ne soit
 * en cours. Aucune boucle possible : l'action écrit toujours un résumé (un
 * vrai, ou son texte de repli) et n'est retentée qu'après un nouveau rendu.
 */
export function SummaryAutoRefresh({
  waId,
  stale,
  lastMessageId,
}: {
  waId: string;
  stale: boolean;
  lastMessageId: number;
}) {
  const router = useRouter();
  const tentePour = useRef<number | null>(null);
  const [state, setState] = useState<"idle" | "running" | "failed">("idle");

  useEffect(() => {
    if (!stale || tentePour.current === lastMessageId) return;
    tentePour.current = lastMessageId;
    setState("running");
    // Pas de drapeau d'annulation : l'action est un effet de bord serveur, pas
    // une requête à abandonner. En dev, le double montage de StrictMode
    // annulerait le `router.refresh()` et l'écran resterait figé sur
    // « Mise à jour… » alors que le résumé est bien écrit.
    regenerateSummaryAction(waId)
      .then(() => {
        setState("idle");
        router.refresh();
      })
      .catch(() => setState("failed"));
  }, [stale, lastMessageId, waId, router]);

  if (!stale) return null;
  if (state === "failed") {
    return (
      <span className="text-xs text-amber-600">
        Mise à jour impossible — utilise « Régénérer ».
      </span>
    );
  }
  if (state === "running") {
    return <span className="text-xs text-neutral-400">Mise à jour du résumé…</span>;
  }
  return <span className="text-xs text-neutral-400">Résumé en retard sur la conversation.</span>;
}
