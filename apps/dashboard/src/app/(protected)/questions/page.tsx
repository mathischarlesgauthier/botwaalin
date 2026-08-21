import Link from "next/link";
import { addFaqAnswerAction } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { groupQuestions } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string }>;
}) {
  await requireSession();
  const { onglet = "frequentes" } = await searchParams;
  const { core } = getRuntime();

  const groups = groupQuestions(core);
  const unanswered = core.questions.unanswered(100);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Questions</h1>

      <div className="flex gap-2">
        <Link
          href="/questions?onglet=frequentes"
          className={`btn ${onglet === "frequentes" ? "btn-primary" : "btn-secondary"}`}
        >
          Questions fréquentes ({groups.length})
        </Link>
        <Link
          href="/questions?onglet=sans-reponse"
          className={`btn ${onglet === "sans-reponse" ? "btn-primary" : "btn-secondary"}`}
        >
          Sans réponse ({unanswered.length})
        </Link>
      </div>

      {onglet === "frequentes" && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-140 text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-400">
              <tr>
                <th className="px-4 py-2 font-medium">Question (regroupée par similarité)</th>
                <th className="px-4 py-2 font-medium">Occurrences</th>
                <th className="px-4 py-2 font-medium">Intention</th>
                <th className="px-4 py-2 font-medium">Catégorie</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group, i) => (
                <tr key={i} className="border-t border-neutral-100">
                  <td className="px-4 py-2">{group.representative}</td>
                  <td className="px-4 py-2 font-semibold">×{group.count}</td>
                  <td className="px-4 py-2 text-neutral-600">{group.intention}</td>
                  <td className="px-4 py-2 text-neutral-600">{group.categorie}</td>
                </tr>
              ))}
              {groups.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                    Pas encore de questions enregistrées.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {onglet === "sans-reponse" && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-500">
            Ces questions ont déclenché une alerte ou un passage au niveau 4. Ajouter une réponse
            l&apos;écrit directement dans le catalogue (section « FAQ apprise ») : c&apos;est la boucle
            d&apos;apprentissage du bot — la réponse est disponible immédiatement, sans redéploiement.
          </p>
          {unanswered.map((question) => (
            <div key={question.id} className="card">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{question.texte}</div>
                <Link
                  href={`/conversations/${question.waId}`}
                  className="text-sm text-neutral-500 hover:underline"
                >
                  Voir la conversation →
                </Link>
              </div>
              <form
                action={addFaqAnswerAction.bind(null, question.id)}
                className="flex flex-col gap-2 md:flex-row"
              >
                <input type="hidden" name="question" value={question.texte} />
                <input
                  name="reponse"
                  className="input flex-1"
                  placeholder="La réponse officielle à ajouter à la base de connaissances…"
                  required
                />
                <button className="btn btn-primary" type="submit">
                  ➕ Ajouter la réponse à la base
                </button>
              </form>
            </div>
          ))}
          {unanswered.length === 0 && (
            <div className="card text-center text-neutral-400">
              Aucune question sans réponse 🎉
            </div>
          )}
        </div>
      )}
    </div>
  );
}
