import Link from "next/link";
import { SUBSCRIPTION_CENTS, type BillingStatus } from "@arbi/core";

const DAY_MS = 24 * 60 * 60 * 1000;

function euros(cents: number): string {
  return (
    (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    " €"
  );
}

function dateFr(ts: number): string {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

/**
 * Bandeau de paiement affiché sur TOUTES les pages du back-office dès que le
 * solde passe sous zéro. Un débit mensuel non réglé coupe le service au bout
 * de GRACE_DAYS jours : le compte à rebours et le lien de paiement doivent
 * rester sous les yeux, pas seulement sur la page Abonnement qu'on ne visite
 * jamais spontanément.
 */
export function BillingBanner({
  billing,
  paymentLink,
  prochainPaiement,
}: {
  billing: BillingStatus;
  paymentLink: string;
  /** Prochaine échéance mensuelle, pour dater la facture à venir. */
  prochainPaiement: number | null;
}) {
  const suspendu = !billing.active;
  const enRetard = billing.balanceCents < 0;
  if (!suspendu && !enRetard) return null;

  const joursRestants =
    billing.cutAt != null ? Math.max(0, Math.ceil((billing.cutAt - Date.now()) / DAY_MS)) : null;

  const bouton = paymentLink ? (
    <a
      href={paymentLink}
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-neutral-700"
    >
      💳 Payer {euros(SUBSCRIPTION_CENTS)}
    </a>
  ) : (
    <Link
      href="/admin/facturation"
      className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-neutral-700"
    >
      Voir mon abonnement →
    </Link>
  );

  if (suspendu) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
        <div className="text-sm text-red-900">
          <div className="font-semibold">🔴 Service suspendu — le bot ne répond plus à tes clients.</div>
          <div>
            Solde : {euros(billing.balanceCents)}. Règle ton abonnement mensuel de{" "}
            {euros(SUBSCRIPTION_CENTS)} pour le réactiver immédiatement.
          </div>
        </div>
        {bouton}
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
      <div className="text-sm text-amber-900">
        <div className="font-semibold">
          ⚠️ Abonnement à régler — solde {euros(billing.balanceCents)}
        </div>
        <div>
          {joursRestants != null && billing.cutAt != null ? (
            <>
              Il te reste{" "}
              <strong>
                {joursRestants === 0
                  ? "moins d'un jour"
                  : `${joursRestants} jour${joursRestants > 1 ? "s" : ""}`}
              </strong>{" "}
              pour payer tes {euros(SUBSCRIPTION_CENTS)} mensuels — coupure du service le{" "}
              <strong>{dateFr(billing.cutAt)}</strong>.
            </>
          ) : (
            // Pas de date de coupure : la dette vient de la consommation API,
            // pas d'un abonnement impayé. Annoncer un délai fixe ici afficherait
            // un compte à rebours qui ne bouge jamais.
            <>
              Ce montant sera ajouté à ta facture
              {prochainPaiement != null ? ` du ${dateFr(prochainPaiement)}` : " du mois prochain"}.
              Aucune coupure prévue d&apos;ici là ; tu peux régler dès maintenant pour repasser au
              vert.
            </>
          )}
        </div>
      </div>
      {bouton}
    </div>
  );
}
