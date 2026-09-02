import type { Metadata } from "next";
import { cache } from "react";
import { getRuntime } from "@/lib/core";
import { buildSiteData, type SiteData } from "./data";

/**
 * Accès au view-model du site depuis les composants serveur. `cache()` de
 * React dédoublonne l'appel au sein d'une même requête (layout + page +
 * generateMetadata) ; rien n'est mis en cache entre deux requêtes — le site
 * reflète la base instantanément.
 */
export const getSiteData = cache((): SiteData => buildSiteData(getRuntime().core));

const FALLBACK_BASE = "http://localhost:3001";

/**
 * Origine publique du site (sitemap, robots, Open Graph) :
 * `SITE_URL`, sinon le réglage `dashboard_url` (réduit à son origine — il peut
 * pointer vers `/admin`), sinon localhost.
 */
export const siteBaseUrl = cache((): URL => {
  const candidates = [process.env.SITE_URL, getRuntime().core.settings.get("dashboard_url")];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value) continue;
    try {
      return new URL(new URL(value).origin);
    } catch {
      // valeur invalide : on passe au candidat suivant
    }
  }
  return new URL(FALLBACK_BASE);
});

// ─── Métadonnées ─────────────────────────────────────────────────────────────

type SiteOpenGraph = NonNullable<Metadata["openGraph"]>;

/** Titre complet d'une page : `<titre> — <marque>`, la forme du template `%s — <marque>`. */
export function siteTitle(site: SiteData, title: string): string {
  return `${title} — ${site.content.brand.name}`;
}

/**
 * Open Graph complet d'une page (type, locale, site_name, titre suffixé).
 * Next ne fusionne pas `openGraph` entre layout et page : chaque page doit
 * redonner l'objet entier, sinon site_name / locale / type disparaissent.
 */
export function siteOpenGraph(
  site: SiteData,
  page: { title: string; description: string; url: string },
): SiteOpenGraph {
  return {
    type: "website",
    locale: "fr_FR",
    siteName: site.content.brand.name,
    title: siteTitle(site, page.title),
    description: page.description,
    url: page.url,
  };
}
