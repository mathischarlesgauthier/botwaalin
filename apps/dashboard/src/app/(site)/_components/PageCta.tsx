import type { SiteData } from "@/lib/site/data";
import { WaLink } from "./WaLink";

/** CTA noir des pages pôle et service : WhatsApp (couleur `ink`) + Telegram. */
export function PageCta({
  site,
  title,
  waHref,
  ink,
}: {
  site: SiteData;
  title: string;
  waHref: string;
  ink: string;
}) {
  const { hero, pagesCtaText } = site.content;
  return (
    <section className="aj-psec-cta">
      <div className="aj-pcta">
        <h2 className="aj-pcta-title">{title}</h2>
        <p className="aj-pcta-text">{pagesCtaText}</p>
        <div className="aj-pcta-btns">
          <WaLink href={waHref} className="aj-btn-ink" style={{ background: ink }}>
            {hero.ctaPrimary}
          </WaLink>
          {site.telegram.href && (
            <WaLink href={site.telegram.href} className="aj-btn-outline-light">
              {hero.ctaSecondary}
            </WaLink>
          )}
        </div>
      </div>
    </section>
  );
}
