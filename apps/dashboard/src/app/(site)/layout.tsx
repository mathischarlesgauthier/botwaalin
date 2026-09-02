import type { Metadata } from "next";
import { getSiteData, siteBaseUrl, siteOpenGraph, siteTitle } from "@/lib/site/server";
import { Footer } from "./_components/Footer";
import { Header } from "./_components/Header";
import { MobileBar } from "./_components/MobileBar";
import { RevealObserver } from "./_components/RevealObserver";
import { SiteFonts } from "./_components/SiteFonts";
import "./site.css";

// Le site lit SQLite à chaque requête : « je modifie le back → le site change ».
export const dynamic = "force-dynamic";

// Retire la classe `no-js` posée par le layout racine : sans JavaScript, les
// blocs [data-reveal] restent visibles (cf. site.css). Script constant, sans
// aucune donnée — la seule façon d'émettre un script inline en React.
const NO_JS_SCRIPT = "document.documentElement.classList.remove('no-js')";

export function generateMetadata(): Metadata {
  const site = getSiteData();
  const { brand, hero } = site.content;
  const homeTitle = `${hero.titleA} ${hero.titleB}`;
  return {
    metadataBase: siteBaseUrl(),
    title: { default: siteTitle(site, homeTitle), template: `%s — ${brand.name}` },
    description: hero.claim,
    openGraph: siteOpenGraph(site, { title: homeTitle, description: hero.claim, url: "/" }),
  };
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const site = getSiteData();
  return (
    <>
      <SiteFonts />
      <script dangerouslySetInnerHTML={{ __html: NO_JS_SCRIPT }} />
      <div className="aj-root">
        <div aria-hidden="true" className="aj-bg">
          <div className="aj-blob-1" />
          <div className="aj-blob-2" />
          <div className="aj-blob-3" />
          <div className="aj-blob-4" />
        </div>
        <Header site={site} />
        {children}
        <Footer site={site} />
        <MobileBar site={site} />
      </div>
      <RevealObserver />
    </>
  );
}
