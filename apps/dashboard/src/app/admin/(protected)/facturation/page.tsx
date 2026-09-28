import {
  apiUsageByDay,
  apiUsageSince,
  billingStatus,
  GRACE_DAYS,
  listTransactions,
  nextBillingDate,
  SUBSCRIPTION_CENTS,
} from "@arbi/core";
import { addManualPaymentAction, checkStripePaymentsAction } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";

export const dynamic = "force-dynamic";

function euros(cents: number): string {
  return (
    (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    " €"
  );
}

function dateFr(ts: number): string {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

const TX_LABELS: Record<string, string> = {
  credit_initial: "Crédit de bienvenue (premier mois inclus)",
  abonnement: "Abonnement mensuel",
  paiement: "Paiement reçu",
  ajustement: "Ajustement",
};

export default async function FacturationPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  await requireSession();
  const { core } = getRuntime();
  const { msg } = await searchParams;

  const billing = billingStatus(core);
  const prochain = nextBillingDate(core);
  const paymentLink = core.settings.get("stripe_payment_link_url");
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const usageMonth = apiUsageSince(core, monthStart.getTime());
  const byDay = apiUsageByDay(core, 30);
  const transactions = listTransactions(core, 50);
  const maxDayCents = Math.max(1, ...byDay.map((d) => d.billedCentimes));

  // Le lien Stripe démarre un abonnement RÉCURRENT : une fois un paiement reçu
  // récemment, le prélèvement est automatique — re-proposer le bouton pousserait
  // au double-abonnement.
  const lastPaymentTs = transactions
    .filter((t) => t.type === "paiement")
    .reduce((max, t) => Math.max(max, t.created_at), 0);
  const subscriptionRunning = lastPaymentTs > 0 && Date.now() - lastPaymentTs < 35 * 24 * 60 * 60 * 1000;

  const statusBox = billing.active
    ? billing.cutAt
      ? {
          classes: "border-amber-300 bg-amber-50 text-amber-900",
          title: "⚠️ Paiement en attente",
          detail: `Tout solde négatif se régularise sous ${GRACE_DAYS} jours : sans paiement reçu, le service sera suspendu le ${dateFr(billing.cutAt)}.`,
        }
      : {
          classes: "border-green-300 bg-green-50 text-green-900",
          title: "🟢 Service actif",
          detail:
            billing.balanceCents < 0
              ? "L'abonnement est à jour — la consommation API en cours sera ajoutée à la prochaine facture."
              : "L'abonnement est à jour.",
        }
    : {
        classes: "border-red-300 bg-red-50 text-red-900",
        title: "🔴 Service suspendu",
        detail:
          billing.reason === "credit_api_epuise"
            ? "Le solde est épuisé par la consommation API. Effectue un paiement pour réactiver le bot immédiatement."
            : "L'abonnement n'a pas été réglé dans les délais. Effectue un paiement pour réactiver le bot immédiatement.",
      };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Abonnement & consommation</h1>

      {msg && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {msg}
        </div>
      )}

      <div className={`rounded-lg border px-4 py-3 ${statusBox.classes}`}>
        <div className="font-semibold">{statusBox.title}</div>
        <div className="text-sm">{statusBox.detail}</div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card">
          <div className="label">Solde du compte</div>
          <div
            className={`text-3xl font-bold ${billing.balanceCents <= 0 ? "text-red-600" : billing.balanceCents < 1000 ? "text-amber-600" : ""}`}
          >
            {euros(billing.balanceCents)}
          </div>
          <div className="text-xs text-neutral-500">
            Abonnement {euros(SUBSCRIPTION_CENTS)}/mois + coût API. Le premier mois est inclus.
            {billing.balanceCents < 0 && (
              <>
                {" "}
                <strong className="text-amber-700">
                  Dès que le solde est négatif, tu as {GRACE_DAYS} jours pour le régulariser, sinon
                  le service est coupé.
                </strong>
              </>
            )}
          </div>
        </div>
        <div className="card">
          <div className="label">Coût API — mois en cours</div>
          <div className="text-3xl font-bold">{euros(Math.round(usageMonth.billedCentimes))}</div>
          <div className="text-xs text-neutral-500">
            {usageMonth.calls.toLocaleString("fr-FR")} appels ·{" "}
            {(usageMonth.inputTokens + usageMonth.outputTokens).toLocaleString("fr-FR")} tokens
          </div>
        </div>
        <div className="card flex flex-col justify-between gap-3">
          <div>
            <div className="label">Prochain paiement</div>
            {prochain ? (
              <>
                <div className="text-3xl font-bold">{dateFr(prochain.at)}</div>
                <div
                  className={`text-sm font-medium ${
                    prochain.daysLeft <= 3 ? "text-amber-600" : "text-neutral-600"
                  }`}
                >
                  {prochain.daysLeft === 0
                    ? "C'est aujourd'hui"
                    : prochain.daysLeft === 1
                      ? "Dans 1 jour"
                      : `Dans ${prochain.daysLeft} jours`}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  {euros(SUBSCRIPTION_CENTS)} par mois, prélevés par Stripe.
                </div>
              </>
            ) : (
              <div className="text-sm text-neutral-600">
                Abonnement mensuel de {euros(SUBSCRIPTION_CENTS)}, paiement sécurisé par Stripe.
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {subscriptionRunning ? (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-900">
                ✅ Abonnement en place — prélèvement automatique
                {prochain ? ` le ${dateFr(prochain.at)}` : " chaque mois"}. Inutile de repayer.
              </div>
            ) : paymentLink ? (
              <>
                <a
                  href={paymentLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-neutral-700"
                >
                  💳 Payer mon abonnement
                </a>
                <p className="text-xs text-neutral-500">
                  Le paiement met en place un prélèvement mensuel automatique. Ne paie qu&apos;une
                  seule fois.
                </p>
              </>
            ) : (
              <div className="text-sm text-neutral-500">
                Le lien de paiement sera disponible ici très prochainement.
              </div>
            )}
            <form action={checkStripePaymentsAction}>
              <button
                type="submit"
                className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
              >
                🔄 Vérifier mes paiements
              </button>
            </form>
            <details className="text-xs text-neutral-500">
              <summary className="cursor-pointer">Paiement reçu mais pas détecté ?</summary>
              <form action={addManualPaymentAction} className="mt-2 space-y-2">
                <p>
                  Un règlement par lien unique ne crée pas de facture Stripe, donc la vérification
                  automatique ne le voit pas. Enregistre-le ici : le solde est crédité tout de
                  suite.
                </p>
                <div className="flex gap-2">
                  <input
                    name="montant"
                    type="number"
                    step="0.01"
                    min="0.01"
                    defaultValue={(SUBSCRIPTION_CENTS / 100).toFixed(2)}
                    className="input w-24"
                    aria-label="Montant en euros"
                    required
                  />
                  <input
                    name="note"
                    className="input flex-1"
                    placeholder="Référence (facultatif)"
                    maxLength={120}
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
                >
                  ➕ Enregistrer ce paiement
                </button>
              </form>
            </details>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 text-lg font-semibold">Coût API — 30 derniers jours</h2>
        {byDay.length === 0 ? (
          <p className="text-sm text-neutral-500">Aucune consommation enregistrée pour l&apos;instant.</p>
        ) : (
          <div className="space-y-1">
            {byDay.map((day) => (
              <div key={day.jour} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-neutral-500">
                  {new Date(day.jour + "T00:00:00").toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-neutral-100">
                  <div
                    className="h-full rounded bg-neutral-800"
                    style={{ width: `${Math.max(2, (day.billedCentimes / maxDayCents) * 100)}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right font-medium">
                  {euros(Math.round(day.billedCentimes))}
                </span>
                <span className="w-20 shrink-0 text-right text-xs text-neutral-500">
                  {day.calls} appels
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-3 text-lg font-semibold">Historique du compte</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-neutral-500">Aucune opération pour l&apos;instant.</p>
        ) : (
          <table className="w-full min-w-[480px]">
            <thead>
              <tr className="text-left text-xs uppercase text-neutral-500">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Opération</th>
                <th className="py-2 text-right">Montant</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-t border-neutral-100 text-sm">
                  <td className="py-2 pr-4 text-neutral-600">{dateFr(tx.created_at)}</td>
                  <td className="py-2 pr-4">
                    {TX_LABELS[tx.type] ?? tx.type}
                    {tx.periode ? ` — ${tx.periode}` : ""}
                  </td>
                  <td
                    className={`py-2 text-right font-semibold ${tx.montant_cents < 0 ? "text-neutral-900" : "text-green-700"}`}
                  >
                    {tx.montant_cents > 0 ? "+" : ""}
                    {euros(tx.montant_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-neutral-500">
          Le coût API correspond à la consommation du bot (génération des réponses, résumés,
          alertes). Il est débité du solde au fil de l&apos;eau et détaillé ci-dessus.
        </p>
      </div>
    </div>
  );
}
