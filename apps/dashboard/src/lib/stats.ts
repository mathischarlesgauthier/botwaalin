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
