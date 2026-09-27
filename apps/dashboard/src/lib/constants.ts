/**
 * Constantes partagées entre pages et actions. Elles ne peuvent pas vivre dans
 * `actions.ts` : un fichier « use server » n'a le droit d'exporter que des
 * fonctions asynchrones.
 */

/** Cookie du dernier filtre de la liste des conversations. */
export const CONV_FILTER_COOKIE = "arbi_conv_filtre";

/** Suivi commercial d'un lead, du plus froid au plus avancé. */
export const LEAD_STATUTS = ["nouveau", "en_cours", "devis_envoye", "gagne", "perdu"] as const;
