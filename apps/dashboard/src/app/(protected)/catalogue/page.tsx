import { formatPrice, type PricingRow } from "@arbi/core";
import {
  addMenuPoleAction,
  addServiceAction,
  deleteMenuPoleAction,
  saveCatalogueAction,
  updateMenuPoleAction,
  updatePricingAction,
} from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";

export const dynamic = "force-dynamic";

function PricingRowForm({
  row,
  categories,
  keywords,
}: {
  row: PricingRow;
  categories: string[];
  keywords: string;
}) {
  return (
    <form
      action={updatePricingAction.bind(null, row.serviceKey)}
      className="grid grid-cols-2 items-end gap-2 border-t border-neutral-100 py-3 md:grid-cols-12"
    >
      <div className="col-span-2 md:col-span-3">
        <span className="label">{row.serviceKey}</span>
        <input name="label" defaultValue={row.label} className="input" />
        <div className="mt-1 text-xs text-neutral-400">Affiché : {formatPrice(row)}</div>
      </div>
      <div className="md:col-span-2">
        <span className="label">Pôle / catégorie</span>
        <input name="categorie" defaultValue={row.categorie} className="input" list="categories-list" />
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
      <div className="flex items-center gap-1 md:col-span-2">
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
      <div className="col-span-2 md:col-span-4">
        <span className="label">Affichage sur mesure (optionnel)</span>
        <input name="affichage" defaultValue={row.affichage ?? ""} className="input" />
      </div>
      <div className="col-span-2 md:col-span-8">
        <span className="label">Périmètre inclus</span>
        <input name="perimetre" defaultValue={row.perimetre} className="input" />
      </div>
      <div className="col-span-2 md:col-span-12">
        <span className="label">
          Mots-clés de reconnaissance (séparés par des virgules — ce que les clients tapent)
        </span>
        <input
          name="keywords"
          defaultValue={keywords}
          className="input"
          placeholder="ex. casquette, china, agent en chine"
        />
      </div>
      <datalist id="categories-list">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </form>
  );
}

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  await requireSession();
  const { core } = getRuntime();
  const { msg } = await searchParams;
  const catalogue = core.catalogue.current();
  const versions = core.catalogue.versions(10);
  const pricing = core.pricing.all();
  const categories = [...new Set(pricing.map((p) => p.categorie))];
  const poles = core.settings.get("menu_poles");
  const allSynonyms = core.synonyms.all();
  const keywordsFor = (serviceKey: string) =>
    allSynonyms
      .filter((s) => s.resolution === serviceKey && s.actif === 1)
      .map((s) => s.pattern)
      .join(", ");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Catalogue &amp; tarifs</h1>
      <p className="text-sm text-neutral-500">
        Chaque modification est versionnée et prend effet immédiatement pour le bot, sans
        redéploiement. Aucun prix n&apos;existe ailleurs que dans cette grille.
      </p>

      {msg && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {msg}
        </div>
      )}

      <div className="card">
        <h2 className="mb-1 font-semibold">Pôles du menu WhatsApp</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Ce sont les lignes que le client voit quand le bot envoie le menu. Titre ≤ 24 caractères,
          description ≤ 72, 10 pôles maximum.
        </p>
        {poles.map((pole) => (
          <form
            key={pole.id}
            action={updateMenuPoleAction.bind(null, pole.id)}
            className="grid grid-cols-2 items-end gap-2 border-t border-neutral-100 py-2 md:grid-cols-12"
          >
            <div className="col-span-2 md:col-span-3">
              <span className="label">Titre ({pole.id})</span>
              <input name="title" defaultValue={pole.title} maxLength={24} className="input" required />
            </div>
            <div className="col-span-2 md:col-span-6">
              <span className="label">Description</span>
              <input name="description" defaultValue={pole.description} maxLength={72} className="input" />
            </div>
            <div className="md:col-span-2">
              <button className="btn btn-primary w-full" type="submit">
                💾 Enregistrer
              </button>
            </div>
            <div className="md:col-span-1">
              <button
                className="btn w-full border border-red-200 text-red-600 hover:bg-red-50"
                formAction={deleteMenuPoleAction.bind(null, pole.id)}
              >
                🗑️
              </button>
            </div>
          </form>
        ))}
        <form
          action={addMenuPoleAction}
          className="mt-2 grid grid-cols-2 items-end gap-2 rounded-lg border border-dashed border-neutral-300 p-3 md:grid-cols-12"
        >
          <div className="col-span-2 md:col-span-3">
            <span className="label">Nouveau pôle — titre</span>
            <input name="title" maxLength={24} className="input" placeholder="ex. Crypto Académie" required />
          </div>
          <div className="col-span-2 md:col-span-6">
            <span className="label">Description</span>
            <input name="description" maxLength={72} className="input" placeholder="ex. Formation crypto de A à Z" />
          </div>
          <div className="col-span-2 md:col-span-3">
            <button className="btn btn-primary w-full" type="submit">
              ➕ Ajouter le pôle
            </button>
          </div>
        </form>
      </div>

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
                <PricingRowForm
                  key={row.id}
                  row={row}
                  categories={categories}
                  keywords={keywordsFor(row.serviceKey)}
                />
              ))}
          </details>
        ))}
      </div>

      <div className="card">
        <h2 className="mb-1 font-semibold">➕ Ajouter un service / une activité</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Le service entre immédiatement dans le cerveau du bot : prix encadré par la grille,
          reconnaissance par mots-clés. Pense à compléter le catalogue texte ci-dessous pour que le
          bot sache quoi en dire.
        </p>
        <form action={addServiceAction} className="grid grid-cols-2 items-end gap-2 md:grid-cols-12">
          <div className="col-span-2 md:col-span-3">
            <span className="label">Nom du service *</span>
            <input name="label" className="input" placeholder="ex. Formation crypto" required />
          </div>
          <div className="md:col-span-2">
            <span className="label">Pôle / catégorie</span>
            <input name="categorie" className="input" list="categories-list" placeholder="ex. Formation" />
          </div>
          <div className="md:col-span-2">
            <span className="label">Type de prix</span>
            <select name="type" defaultValue="FROM" className="input">
              <option value="FIXED">FIXED (ferme)</option>
              <option value="FROM">FROM (dès)</option>
              <option value="RANGE">RANGE (fourchette)</option>
              <option value="QUOTE">QUOTE (devis)</option>
            </select>
          </div>
          <div className="md:col-span-1">
            <span className="label">Min €</span>
            <input name="prixMin" className="input" inputMode="numeric" />
          </div>
          <div className="md:col-span-1">
            <span className="label">Max €</span>
            <input name="prixMax" className="input" inputMode="numeric" />
          </div>
          <div className="col-span-2 md:col-span-3">
            <span className="label">Clé technique (optionnel, sinon générée)</span>
            <input name="serviceKey" className="input" placeholder="ex. formation_crypto" />
          </div>
          <div className="col-span-2 md:col-span-6">
            <span className="label">Mots-clés de reconnaissance (virgules)</span>
            <input name="keywords" className="input" placeholder="ex. crypto, bitcoin, formation crypto" />
          </div>
          <div className="col-span-2 md:col-span-4">
            <span className="label">Périmètre inclus</span>
            <input name="perimetre" className="input" placeholder="ex. 6 modules vidéo + suivi 1 mois" />
          </div>
          <div className="col-span-2 md:col-span-2">
            <button className="btn btn-primary w-full" type="submit">
              ➕ Ajouter
            </button>
          </div>
        </form>
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
