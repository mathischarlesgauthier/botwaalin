import Link from "next/link";
import type { SiteService } from "@/lib/site/data";
import { WaLink } from "./WaLink";

/**
 * Carte service (page pôle, « Dans le même pôle ») : label → page service,
 * prix en couleur `ink`, affichage secondaire éventuel, bouton WhatsApp
 * « Je veux ça » et lien « Détails → ».
 */
export function ServiceCard({ service, ink }: { service: SiteService; ink: string }) {
  return (
    <div className="aj-offer">
      <div className="aj-offer-head">
        <Link href={service.href} className="aj-offer-label">
          {service.label}
        </Link>
        <span className="aj-offer-price" style={{ color: ink }}>
          {service.priceShort}
        </span>
      </div>
      {service.affichage && <p className="aj-offer-affichage">{service.affichage}</p>}
      <p className="aj-offer-desc">{service.desc}</p>
      <div className="aj-offer-foot">
        <WaLink href={service.waHref} className="aj-btn-pill">
          Je veux ça
        </WaLink>
        <Link href={service.href} className="aj-offer-more">
          Détails →
        </Link>
      </div>
    </div>
  );
}
