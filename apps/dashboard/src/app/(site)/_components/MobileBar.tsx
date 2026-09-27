import type { SiteData } from "@/lib/site/data";
import { WaLink } from "./WaLink";

/** Barre CTA fixe en bas d'écran sous 860 px (affichage géré en CSS). */
export function MobileBar({ site }: { site: SiteData }) {
  const { hero } = site.content;
  return (
    <div className="aj-mobile-bar">
      <WaLink href={site.whatsapp.href} className="aj-mobile-wa">
        {hero.ctaPrimary}
      </WaLink>
    </div>
  );
}
