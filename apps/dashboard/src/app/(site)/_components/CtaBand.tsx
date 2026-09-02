import type { SiteData } from "@/lib/site/data";
import { WaLink } from "./WaLink";

/** CTA final dégradé de l'accueil : WhatsApp + groupe privé Telegram (masqué si vide). */
export function CtaBand({ site }: { site: SiteData }) {
  const { cta } = site.content;
  const contact = [site.whatsapp.display, site.telegram.contact].filter(Boolean).join(" · ");
  return (
    <section className="aj-section aj-sec-cta">
      <div data-reveal="1" className="aj-cta">
        <h2 className="aj-cta-title">{cta.title}</h2>
        <p className="aj-cta-text">{cta.text}</p>
        <div className="aj-cta-btns">
          <WaLink href={site.whatsapp.href} className="aj-btn-white">
            {cta.primary}
          </WaLink>
          {site.groupLink && (
            <WaLink href={site.groupLink} className="aj-btn-outline-white">
              {cta.secondary}
            </WaLink>
          )}
        </div>
        {contact && <p className="aj-cta-contact">{contact}</p>}
      </div>
    </section>
  );
}
