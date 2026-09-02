import Link from "next/link";

/** 404 du site public (slug de pôle ou de service inconnu). */
export default function SiteNotFound() {
  return (
    <main className="aj-page">
      <section className="aj-notfound">
        <h1 className="aj-ph1">Page introuvable</h1>
        <p>Cette offre n&apos;existe pas ou n&apos;est plus proposée.</p>
        <Link href="/" className="aj-back">
          ← Tous les business
        </Link>
      </section>
    </main>
  );
}
