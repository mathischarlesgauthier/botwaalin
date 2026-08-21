import { formatPrice, type PricingRow } from "@arbi/core";
import { saveCatalogueAction, updatePricingAction } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";

export const dynamic = "force-dynamic";

function PricingRowForm({ row }: { row: PricingRow }) {
  return (
    <form
      action={updatePricingAction.bind(null, row.serviceKey)}
      className="grid grid-cols-2 items-end gap-2 border-t border-neutral-100 py-3 md:grid-cols-12"
    >
      <div className="col-span-2 md:col-span-3">
        <span className="label">{row.serviceKey}</span>
        <input name="label" defaultValue={row.label} className="input" />
        <div className="mt-1 text-xs text-neutral-400">
          Affiché : {formatPrice(row)} · {row.categorie}
        </div>
      </div>
      <div className="md:col-span-2">
        <span className="label">Type</span>
        <select name="type" defaultValue={row.type} className="input">
          <option value="FIXED">FIXED (ferme)</option>
          <option value="FROM">FROM (dès)</option>
          <option value="RANGE">RANGE (fourchette)</option>
          <option value="QUOTE">QUOTE (devis)</option>
        </select>
      </div>
      <div className="md:col-span-1">
        <span className="label">Min €</span>
        <input name="prixMin" defaultValue={row.prixMin ?? ""} className="input" inputMode="numeric" />
      </div>
      <div className="md:col-span-1">
        <span className="label">Max €</span>
        <input name="prixMax" defaultValue={row.prixMax ?? ""} className="input" inputMode="numeric" />
      </div>
      <div className="col-span-2 md:col-span-3">
        <span className="label">Affichage sur mesure (optionnel)</span>
        <input name="affichage" defaultValue={row.affichage ?? ""} className="input" />
      </div>
      <div className="flex items-center gap-1 md:col-span-1">
        <input type="checkbox" name="actif" defaultChecked={row.actif === 1} id={`actif-${row.id}`} />
        <label htmlFor={`actif-${row.id}`} className="text-xs">
          Actif
        </label>
      </div>
      <div className="md:col-span-1">
        <button className="btn btn-primary w-full" type="submit">
          💾
        </button>
      </div>
      <div className="col-span-2 md:col-span-12">
        <span className="label">Périmètre inclus</span>
        <input name="perimetre" defaultValue={row.perimetre} className="input" />
      </div>
    </form>
  );
}

export default async function CataloguePage() {
  await requireSession();
  const { core } = getRuntime();
  const catalogue = core.catalogue.current();
  const versions = core.catalogue.versions(10);
  const pricing = core.pricing.all();
  const categories = [...new Set(pricing.map((p) => p.categorie))];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Catalogue &amp; tarifs</h1>
      <p className="text-sm text-neutral-500">
        Chaque modification est versionnée et prend effet immédiatement pour le bot, sans
        redéploiement. Aucun prix n&apos;existe ailleurs que dans cette grille.
      </p>

      <div className="card">
        <h2 className="mb-3 font-semibold">Grille tarifaire</h2>
        {categories.map((categorie) => (
          <details key={categorie} open={categorie !== "Digital"} className="mb-2">
            <summary className="cursor-pointer py-1 font-medium">
              {categorie} ({pricing.filter((p) => p.categorie === categorie).length})
            </summary>
            {pricing
              .filter((p) => p.categorie === categorie)
              .map((row) => (
                <PricingRowForm key={row.id} row={row} />
              ))}
          </details>
        ))}
      </div>

      <div className="card">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Catalogue (base de connaissances, version #{catalogue.id})</h2>
          <div className="text-xs text-neutral-400">
            Dernières versions :{" "}
            {versions.map((v) => `#${v.id}${v.note ? ` (${v.note.slice(0, 25)})` : ""}`).join(" · ")}
          </div>
        </div>
        <form action={saveCatalogueAction} className="space-y-2">
          <textarea
            name="contenu"
            defaultValue={catalogue.contenu}
            rows={28}
            className="input font-mono text-xs"
          />
          <div className="flex gap-2">
            <input name="note" className="input flex-1" placeholder="Note de version (optionnel)" />
            <button className="btn btn-primary" type="submit">
              💾 Publier une nouvelle version
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
