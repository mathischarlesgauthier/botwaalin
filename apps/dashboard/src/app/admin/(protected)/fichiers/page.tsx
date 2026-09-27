import { OUTBOUND_MEDIA_ACCEPT } from "@arbi/core";
import { addBotFileAction, removeBotFileAction, toggleBotFileAction } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";

export const dynamic = "force-dynamic";

const KIND_ICON: Record<string, string> = {
  image: "🖼️",
  video: "🎥",
  document: "📄",
};

function taille(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

export default async function FichiersPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  await requireSession();
  const { msg } = await searchParams;
  const { core } = getRuntime();
  const files = core.botFiles.list();
  const actifs = files.filter((f) => f.actif === 1).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Fichiers du bot</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Dépose ici les fichiers que le bot peut envoyer lui-même aux clients : plaquette de
          tarifs, photo d&apos;une réalisation, vidéo de démo. Il choisit en fonction de la
          description — c&apos;est elle qui compte, écris-la comme tu expliquerais à un commercial
          quand sortir ce document.
        </p>
      </div>

      {msg && (
        <div
          className={`card text-sm ${msg.startsWith("✅") ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}
        >
          {msg}
        </div>
      )}

      <form action={addBotFileAction} className="card space-y-3">
        <h2 className="font-semibold">Ajouter un fichier</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Nom</label>
            <input
              name="nom"
              className="input"
              placeholder="Plaquette tarifs 2026"
              required
              maxLength={80}
            />
          </div>
          <div>
            <label className="label">Fichier</label>
            <input
              type="file"
              name="fichier"
              accept={OUTBOUND_MEDIA_ACCEPT}
              required
              className="w-full text-xs text-neutral-600 file:mr-2 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-xs file:font-medium"
            />
          </div>
        </div>
        <div>
          <label className="label">Quand le bot doit-il l&apos;envoyer ?</label>
          <input
            name="description"
            className="input"
            placeholder="Quand le client demande les tarifs détaillés de Ghost Studio"
            required
            maxLength={200}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" type="submit">
            ➕ Ajouter
          </button>
          <span className="text-xs text-neutral-400">
            Photo JPEG/PNG ≤ 5 Mo · vidéo MP4 ≤ 16 Mo · PDF ≤ 95 Mo (limites WhatsApp).
          </span>
        </div>
      </form>

      <div className="card space-y-2">
        <h2 className="font-semibold">
          Bibliothèque ({actifs} actif{actifs > 1 ? "s" : ""} sur {files.length})
        </h2>
        {files.length === 0 && (
          <p className="text-sm text-neutral-400">
            Aucun fichier pour l&apos;instant — le bot n&apos;en enverra aucun.
          </p>
        )}
        {files.map((file) => (
          <div
            key={file.id}
            className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3 ${
              file.actif === 1 ? "border-neutral-200" : "border-neutral-100 bg-neutral-50 opacity-60"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span>{KIND_ICON[file.kind] ?? "📎"}</span>
                <span className="font-medium">{file.nom}</span>
                <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
                  {file.cle}
                </code>
                {file.actif !== 1 && <span className="badge badge-neutre">désactivé</span>}
              </div>
              <div className="mt-1 text-sm text-neutral-600">{file.description}</div>
              <div className="mt-1 text-xs text-neutral-400">
                {taille(file.taille)} · envoyé {file.envois} fois ·{" "}
                <a
                  href={`/api/media/${file.fichier}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-neutral-600"
                >
                  aperçu
                </a>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <form action={toggleBotFileAction.bind(null, file.id)}>
                <button className="btn btn-secondary" type="submit">
                  {file.actif === 1 ? "Désactiver" : "Réactiver"}
                </button>
              </form>
              <form action={removeBotFileAction.bind(null, file.id)}>
                <button className="btn btn-secondary" type="submit">
                  🗑️
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
