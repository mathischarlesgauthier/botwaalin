import type { AdminNumber } from "@arbi/core";
import {
  addAdminNumberAction,
  removeAdminNumberAction,
  saveGeneralSettingsAction,
  saveTemplateSettingsAction,
  testAdminNumberAction,
  toggleAdminNumberAction,
  toggleBotAction,
} from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { checkWhatsAppTemplates, templateLanguageWarning } from "@/lib/templates";

export const dynamic = "force-dynamic";

export default async function ReglagesPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; check?: string }>;
}) {
  await requireSession();
  const { msg, check } = await searchParams;
  const { core } = getRuntime();
  const adminNumbers = core.settings.get("admin_numbers") as AdminNumber[];
  const history = core.settings.history("admin_numbers", 10);
  const botActif = core.settings.get("bot_actif");
  const alertTemplateName = core.settings.get("alert_template_name");
  const alertTemplateLang = core.settings.get("alert_template_lang");
  const relanceTemplateName = core.settings.get("relance_template_name");
  const templateCheck = check === "1" ? await checkWhatsAppTemplates() : null;
  const alertWarning = templateCheck?.ok
    ? templateLanguageWarning(templateCheck.templates, alertTemplateName, alertTemplateLang)
    : null;

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

      <div className="card space-y-3">
        <h2 className="font-semibold">Templates WhatsApp</h2>
        <p className="text-sm text-neutral-500">
          Hors fenêtre de service 24 h (§4), seul un template approuvé par Meta peut atteindre un
          client. Ces réglages pilotent les alertes admin et la relance client.
        </p>
        <form action={saveTemplateSettingsAction} className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="label">Template d&apos;alerte admin</label>
            <input
              name="alert_template_name"
              defaultValue={alertTemplateName}
              className="input"
              placeholder="alerte_admin"
            />
          </div>
          <div>
            <label className="label">Langue du template d&apos;alerte</label>
            <input
              name="alert_template_lang"
              defaultValue={alertTemplateLang}
              className="input"
              placeholder="fr"
            />
          </div>
          <div>
            <label className="label">Template de relance client (hors fenêtre 24 h)</label>
            <input
              name="relance_template_name"
              defaultValue={relanceTemplateName}
              className="input"
              placeholder="vide = aucun repli hors fenêtre 24 h"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Passé 24 h sans message du client, WhatsApp refuse le texte libre. Avec un template
              approuvé contenant une variable {"{{1}}"} dans le corps, tes réponses du back-office
              sont envoyées dedans et arrivent quand même.
            </p>
          </div>
          <div className="md:col-span-3">
            <button className="btn btn-primary" type="submit">
              💾 Enregistrer les templates
            </button>
          </div>
        </form>

        <form action="/admin/reglages" className="flex items-center gap-2 border-t border-neutral-100 pt-3">
          <input type="hidden" name="check" value="1" />
          <button className="btn btn-secondary" type="submit">
            🔍 Vérifier mes templates WhatsApp
          </button>
          {templateCheck && !templateCheck.ok && (
            <span className="text-sm text-red-600">{templateCheck.error}</span>
          )}
        </form>

        {templateCheck?.ok && (
          <div className="space-y-2">
            {alertWarning && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {alertWarning}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-100 text-sm">
                <thead className="text-left text-xs uppercase text-neutral-400">
                  <tr>
                    <th className="py-1 pr-4 font-medium">Nom</th>
                    <th className="py-1 pr-4 font-medium">Langue</th>
                    <th className="py-1 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {templateCheck.templates.map((t, i) => (
                    <tr key={`${t.name}-${t.language}-${i}`} className="border-t border-neutral-100">
                      <td className="py-1 pr-4 font-mono">{t.name}</td>
                      <td className="py-1 pr-4">{t.language}</td>
                      <td className="py-1">
                        <span
                          className={`badge ${t.status === "APPROVED" ? "badge-bot" : "badge-neutre"}`}
                        >
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {templateCheck.templates.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-neutral-400">
                        Aucun template trouvé pour ce compte WhatsApp Business.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
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
