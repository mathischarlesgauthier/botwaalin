import type { AdminNumber } from "@arbi/core";
import {
  addAdminNumberAction,
  removeAdminNumberAction,
  saveGeneralSettingsAction,
  testAdminNumberAction,
  toggleAdminNumberAction,
  toggleBotAction,
} from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";

export const dynamic = "force-dynamic";

export default async function ReglagesPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  await requireSession();
  const { msg } = await searchParams;
  const { core } = getRuntime();
  const adminNumbers = core.settings.get("admin_numbers") as AdminNumber[];
  const history = core.settings.history("admin_numbers", 10);
  const botActif = core.settings.get("bot_actif");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Réglages</h1>
      {msg && <div className="card border-emerald-300 bg-emerald-50 text-sm">{msg}</div>}

      <div className="card flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Bot {botActif ? "🟢 actif" : "🔴 désactivé"}</h2>
          <p className="text-sm text-neutral-500">
            Désactivé, le bot ne répond plus à personne (les messages restent enregistrés).
          </p>
        </div>
        <form action={toggleBotAction}>
          <button className={`btn ${botActif ? "btn-danger" : "btn-primary"}`} type="submit">
            {botActif ? "Désactiver le bot" : "Réactiver le bot"}
          </button>
        </form>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Numéros WhatsApp de notification (alertes)</h2>
        <p className="text-sm text-neutral-500">
          Chaque alerte est envoyée à tous les numéros actifs (template approuvé, puis repli texte
          libre / e-mail). Format E.164 : +33612345678.
        </p>
        <ul className="space-y-2">
          {adminNumbers.map((admin) => (
            <li
              key={admin.number}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 p-2"
            >
              <span className={`font-mono ${admin.actif ? "" : "text-neutral-400 line-through"}`}>
                {admin.number}
              </span>
              <span className={`badge ${admin.actif ? "badge-bot" : "badge-neutre"}`}>
                {admin.actif ? "actif" : "désactivé"}
              </span>
              <div className="flex gap-2">
                <form action={testAdminNumberAction.bind(null, admin.number)}>
                  <button className="btn btn-secondary" type="submit">
                    📤 Envoyer un message de test
                  </button>
                </form>
                <form action={toggleAdminNumberAction.bind(null, admin.number)}>
                  <button className="btn btn-secondary" type="submit">
                    {admin.actif ? "Désactiver" : "Activer"}
                  </button>
                </form>
                <form action={removeAdminNumberAction.bind(null, admin.number)}>
                  <button className="btn btn-danger" type="submit">
                    Supprimer
                  </button>
                </form>
              </div>
            </li>
          ))}
          {adminNumbers.length === 0 && (
            <li className="text-sm font-medium text-red-600">
              ⚠️ Aucun numéro configuré : les alertes ne seront notifiées nulle part.
            </li>
          )}
        </ul>
        <form action={addAdminNumberAction} className="flex gap-2">
          <input
            name="number"
            className="input flex-1 font-mono"
            placeholder="+33612345678"
            required
          />
          <button className="btn btn-primary" type="submit">
            ➕ Ajouter
          </button>
        </form>
        {history.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm text-neutral-500">
              Historique des modifications ({history.length})
            </summary>
            <ul className="mt-2 space-y-1 text-xs text-neutral-500">
              {history.map((entry) => (
                <li key={entry.id}>
                  {new Date(entry.changedAt).toLocaleString("fr-FR")} : {entry.oldValue ?? "∅"} →{" "}
                  {entry.newValue}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <form action={saveGeneralSettingsAction} className="card space-y-3">
        <h2 className="font-semibold">Paramètres généraux</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Contact Telegram (closing)</label>
            <input
              name="telegram_contact"
              defaultValue={core.settings.get("telegram_contact")}
              className="input"
            />
          </div>
          <div>
            <label className="label">Lien du groupe privé</label>
            <input name="group_link" defaultValue={core.settings.get("group_link")} className="input" />
          </div>
          <div>
            <label className="label">URL publique du dashboard (liens d&apos;alerte)</label>
            <input
              name="dashboard_url"
              defaultValue={core.settings.get("dashboard_url")}
              className="input"
              placeholder="https://exemple.com/admin"
            />
          </div>
          <div>
            <label className="label">E-mail de repli pour les alertes</label>
            <input
              name="alert_email_to"
              defaultValue={core.settings.get("alert_email_to")}
              className="input"
              placeholder="jacob@exemple.com"
            />
          </div>
          <div>
            <label className="label">Réactivation auto du bot après (heures)</label>
            <input
              name="reactivation_delay_h"
              type="number"
              min={1}
              max={168}
              defaultValue={core.settings.get("reactivation_delay_h")}
              className="input"
            />
          </div>
          <div>
            <label className="label">Seuil d&apos;alerte (échanges sans progression)</label>
            <input
              name="alert_threshold"
              type="number"
              min={1}
              max={10}
              defaultValue={core.settings.get("alert_threshold")}
              className="input"
            />
          </div>
        </div>
        <div>
          <label className="label">Message type — niveau 4 (intervention humaine)</label>
          <textarea
            name="niveau4_message"
            defaultValue={core.settings.get("niveau4_message")}
            rows={4}
            className="input"
          />
          <p className="mt-1 text-xs text-neutral-400">
            Le marqueur {"{telegram}"} est remplacé par le contact Telegram ci-dessus.
          </p>
        </div>
        <button className="btn btn-primary" type="submit">
          💾 Enregistrer
        </button>
      </form>
    </div>
  );
}
