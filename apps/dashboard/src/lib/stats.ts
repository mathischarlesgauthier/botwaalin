import { levenshtein, type Core } from "@arbi/core";

export interface PeriodKpis {
  conversations: number;
  nouveauxContacts: number;
  parCategorie: Array<{ categorie: string; n: number }>;
  tauxResolution: number | null;
}

export function computeKpis(core: Core, sinceMs: number): PeriodKpis {
  const since = Date.now() - sinceMs;
  const conversations = (
    core.sqlite
      .prepare(`SELECT COUNT(DISTINCT wa_id) AS n FROM messages WHERE role='user' AND ts >= ?`)
      .get(since) as { n: number }
  ).n;
  const nouveauxContacts = (
    core.sqlite
      .prepare(`SELECT COUNT(*) AS n FROM contacts WHERE created_at >= ?`)
      .get(since) as { n: number }
  ).n;
  const parCategorie = core.sqlite
    .prepare(
      `SELECT categorie, COUNT(*) AS n FROM questions WHERE created_at >= ? GROUP BY categorie ORDER BY n DESC`,
    )
    .all(since) as Array<{ categorie: string; n: number }>;
  const escalated = (
    core.sqlite
      .prepare(
        `SELECT COUNT(DISTINCT wa_id) AS n FROM alerts WHERE created_at >= ?`,
      )
      .get(since) as { n: number }
  ).n;
  const tauxResolution =
    conversations > 0 ? Math.round(((conversations - escalated) / conversations) * 100) : null;
  return { conversations, nouveauxContacts, parCategorie, tauxResolution };
}

export interface QuestionGroup {
  representative: string;
  count: number;
  intention: string;
  categorie: string;
}

/**
 * Regroupe les questions par similarité (normalisation + Levenshtein).
 * Approximation lexicale de la « similarité sémantique » — sans dépendance
 * à un service d'embeddings.
 */
export function groupQuestions(core: Core, limit = 300): QuestionGroup[] {
  const rows = core.sqlite
    .prepare(
      `SELECT normalise, MAX(texte) AS texte, COUNT(*) AS n,
              MAX(intention) AS intention, MAX(categorie) AS categorie
       FROM questions
       GROUP BY normalise
       ORDER BY n DESC, MAX(id) DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{
    normalise: string;
    texte: string;
    n: number;
    intention: string;
    categorie: string;
  }>;

  const groups: Array<QuestionGroup & { key: string }> = [];
  for (const row of rows) {
    const tolerance = Math.max(2, Math.floor(row.normalise.length / 5));
    const existing = groups.find(
      (g) =>
        Math.abs(g.key.length - row.normalise.length) <= tolerance &&
        levenshtein(g.key, row.normalise) <= tolerance,
    );
    if (existing) {
      existing.count += row.n;
    } else {
      groups.push({
        key: row.normalise,
        representative: row.texte,
        count: row.n,
        intention: row.intention,
        categorie: row.categorie,
      });
    }
  }
  return groups
    .sort((a, b) => b.count - a.count)
    .map(({ key: _key, ...group }) => group);
}

export function topQuestions(core: Core, limit = 10): QuestionGroup[] {
  return groupQuestions(core).slice(0, limit);
}

export interface TopicGroup {
  sujet: string;
  count: number;
  sansReponse: number;
  /** Catégorie la plus représentée du sujet (indication, pas une vérité). */
  categorie: string;
  /** Formulations réelles les plus fréquentes — le détail derrière le thème. */
  exemples: Array<{ texte: string; count: number }>;
}

/**
 * Vue thématique des questions : un thème général par ligne (« Tarifs et
 * devis »…) plutôt qu'une liste de formulations quasi identiques. Le sujet est
 * attribué par `classifyQuestionTopics` et stocké en base ; ici on ne fait
 * qu'agréger.
 */
export function groupQuestionsByTopic(core: Core): TopicGroup[] {
  // Agrégation faite par SQLite, pas en JS : les totaux restent justes quel que
  // soit le volume (une fenêtre de N lignes sous-compterait en silence), et on
  // ne rapatrie qu'une ligne par sujet.
  const totaux = core.sqlite
    .prepare(
      `SELECT sujet,
              COUNT(*) AS n,
              SUM(CASE WHEN repondue = 0 THEN 1 ELSE 0 END) AS sans_reponse
       FROM questions WHERE sujet <> ''
       GROUP BY sujet ORDER BY n DESC, sujet ASC`,
    )
    .all() as Array<{ sujet: string; n: number; sans_reponse: number }>;
  if (totaux.length === 0) return [];

  // Une ligne par formulation distincte : sert aux exemples ET à la catégorie
  // dominante (pondérée par le nombre d'occurrences).
  const formes = core.sqlite
    .prepare(
      `SELECT sujet, MAX(texte) AS texte, MAX(categorie) AS categorie, COUNT(*) AS n
       FROM questions WHERE sujet <> ''
       GROUP BY sujet, normalise ORDER BY n DESC`,
    )
    .all() as Array<{ sujet: string; texte: string; categorie: string; n: number }>;

  const parSujet = new Map<
    string,
    { exemples: Array<{ texte: string; count: number }>; categories: Map<string, number> }
  >();
  for (const forme of formes) {
    let entry = parSujet.get(forme.sujet);
    if (!entry) {
      entry = { exemples: [], categories: new Map() };
      parSujet.set(forme.sujet, entry);
    }
    // `formes` est déjà trié par fréquence : les 3 premières vues sont le top 3.
    if (entry.exemples.length < 3) entry.exemples.push({ texte: forme.texte, count: forme.n });
    entry.categories.set(forme.categorie, (entry.categories.get(forme.categorie) ?? 0) + forme.n);
  }

  return totaux.map((total) => {
    const entry = parSujet.get(total.sujet);
    const categorie =
      [...(entry?.categories ?? new Map<string, number>()).entries()].sort(
        (a, b) => b[1] - a[1],
      )[0]?.[0] ?? "Autre";
    return {
      sujet: total.sujet,
      count: total.n,
      sansReponse: total.sans_reponse,
      categorie,
      exemples: entry?.exemples ?? [],
    };
  });
}

/** Questions pas encore rangées sous un sujet (le classement n'a pas tourné). */
export function countQuestionsWithoutTopic(core: Core): number {
  return (
    core.sqlite.prepare(`SELECT COUNT(*) AS n FROM questions WHERE sujet = ''`).get() as {
      n: number;
    }
  ).n;
}
