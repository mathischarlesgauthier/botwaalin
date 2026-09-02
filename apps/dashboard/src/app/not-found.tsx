import type { Metadata } from "next";
import Link from "next/link";
import { SiteFonts } from "./(site)/_components/SiteFonts";
import "./(site)/site.css";

export const metadata: Metadata = {
  title: "Page introuvable",
};

/**
 * 404 des URL hors de toute route (ex. `/foo`) : rendue dans le layout racine
 * seul, donc avec l'habillage du site public et en français. Les 404 levés
 * dans le site (`notFound()`) passent par `(site)/not-found.tsx`.
 */
export default function RootNotFound() {
  return (
    <>
      <SiteFonts />
      <div className="aj-root">
        <main className="aj-page">
          <section className="aj-notfound">
            <h1 className="aj-ph1">Page introuvable</h1>
            <p>Cette page n&apos;existe pas ou n&apos;est plus proposée.</p>
            <Link href="/" className="aj-back">
              ← Tous les business
            </Link>
          </section>
        </main>
      </div>
    </>
  );
}
