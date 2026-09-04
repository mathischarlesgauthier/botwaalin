import type { ExampleRow } from "@arbi/core";
import Link from "next/link";
import {
  activateExampleAction,
  deleteExampleAction,
  regenerateStyleGuideAction,
  rejectExampleAction,
  saveStyleGuideAction,
  updateExampleAction,
} from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";

export const dynamic = "force-dynamic";

const STATUT_LABEL: Record<ExampleRow["statut"], string> = {
  en_attente: "En attente",
  actif: "Actif",
  rejete: "Rejeté",
};

const STATUT_BADGE: Record<ExampleRow["statut"], string> = {
  en_attente: "badge-humain",
  actif: "badge-bot",
  rejete: "badge-alerte",
};

function ExampleCard({ example }: { example: ExampleRow }) {
  return (
    <div className="card space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-400">
        <span className={`badge ${STATUT_BADGE[example.statut]}`}>{STATUT_LABEL[example.statut]}</span>
        <span>
          {new Date(example.createdAt).toLocaleString("fr-FR")}
          {example.theme ? ` · ${example.theme}` : ""} ·{" "}
          <Link href={`/admin/conversations/${example.waId}`} className="hover:underline">
            Voir la conversation →
          </Link>
        </span>
      </div>

      <form action={updateExampleAction.bind(null, example.id)} className="space-y-2">
        <div>
          <span className="label">Question (cas général)</span>
          <textarea name="question" defaultValue={example.question} rows={2} className="input text-sm" />
        </div>
        <div>
          <span className="label">Réponse de Jacob (modèle de ton)</span>
          <textarea name="reponse" defaultValue={example.reponse} rows={3} className="input text-sm" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            name="theme"
            defaultValue={example.theme}
            placeholder="Thème"
            className="input w-40"
          />
          <button className="btn btn-secondary" type="submit">
            💾 Enregistrer
          </button>
        </div>
      </form>

      {example.statut === "rejete" && example.motifRejet && (
        <div className="text-xs text-red-600">Motif du rejet : {example.motifRejet}</div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-2">
        {example.statut !== "actif" && (
          <form action={activateExampleAction.bind(null, example.id)}>
            <button className="btn btn-primary" type="submit">
              ✅ Activer
            </button>
          </form>
        )}
        {example.statut !== "rejete" && (
          <form action={rejectExampleAction.bind(null, example.id)} className="flex gap-1">
            <input name="motif" placeholder="Motif (optionnel)" className="input w-40" />
            <button className="btn btn-secondary" type="submit">
              🚫 Rejeter
            </button>
          </form>
        )}
        <form action={deleteExampleAction.bind(null, example.id)} className="ml-auto">
          <button className="btn btn-danger" type="submit">
            🗑️ Supprimer
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function ApprentissagePage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; msg?: string }>;
}) {
  await requireSession();
  const { statut = "", msg } = await searchParams;
  const { core } = getRuntime();

  const validStatuts: ExampleRow["statut"][] = ["en_attente", "actif", "rejete"];
  const filter = validStatuts.includes(statut as ExampleRow["statut"])
    ? (statut as ExampleRow["statut"])
    : undefined;
  const examples = core.examples.list(filter, { limit: 200 });
  const counts = {
    en_attente: core.examples.count("en_attente"),
    actif: core.examples.count("actif"),
    rejete: core.examples.count("rejete"),
  };
  const styleGuide = core.settings.get("style_guide_appris");
  const styleGuideBrouillon = core.settings.get("style_guide_appris_brouillon");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">🎓 Apprentissage</h1>
      <p className="text-sm text-neutral-500">
        Ces exemples servent de modèle de ton au bot. Les prix ne viennent jamais d&apos;ici.
      </p>
      {msg && <div className="card border-amber-300 bg-amber-50 text-sm">{msg}</div>}

      <div className="card space-y-2">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-semibold">Guide de style appris</h2>
          <form action={regenerateStyleGuideAction}>
            <button className="btn btn-secondary" type="submit">
              🔄 Régénérer depuis les derniers messages
            </button>
          </form>
        </div>
        <p className="text-xs text-neutral-500">
          Injecté dans le prompt juste après la section « Personnalité » du bot. Éditable à la main.
        </p>
        {styleGuideBrouillon && (
          <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
            ⚠️ Brouillon généré en attente de relecture — <strong>pas encore actif</strong> pour le bot (il peut
            contenir un détail repris d&apos;un message client). Relis-le ci-dessous puis clique « Enregistrer »
            pour le publier, ou ignore-le pour garder le guide actuel.
          </div>
        )}
        <form action={saveStyleGuideAction} className="space-y-2">
          <textarea
            name="style_guide_appris"
            defaultValue={styleGuideBrouillon || styleGuide}
            rows={8}
            className="input font-mono text-xs"
            placeholder="- Tutoie toujours le client…"
          />
          <button className="btn btn-primary" type="submit">
            💾 Enregistrer le guide de style
          </button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/apprentissage?statut=en_attente"
          className={`btn ${filter === "en_attente" ? "btn-primary" : "btn-secondary"}`}
        >
          En attente ({counts.en_attente})
        </Link>
        <Link
          href="/admin/apprentissage?statut=actif"
          className={`btn ${filter === "actif" ? "btn-primary" : "btn-secondary"}`}
        >
          Actifs ({counts.actif})
        </Link>
        <Link
          href="/admin/apprentissage?statut=rejete"
          className={`btn ${filter === "rejete" ? "btn-primary" : "btn-secondary"}`}
        >
          Rejetés ({counts.rejete})
        </Link>
        <Link href="/admin/apprentissage" className={`btn ${filter === undefined ? "btn-primary" : "btn-secondary"}`}>
          Tous
        </Link>
      </div>

      <div className="space-y-3">
        {examples.map((example) => (
          <ExampleCard key={example.id} example={example} />
        ))}
        {examples.length === 0 && (
          <div className="card text-center text-neutral-400">Aucun exemple pour ce filtre.</div>
        )}
      </div>
    </div>
  );
}
