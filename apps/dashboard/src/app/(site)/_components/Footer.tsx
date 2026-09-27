import type { SiteData } from "@/lib/site/data";
import { WaLink } from "./WaLink";

export function Footer({ site }: { site: SiteData }) {
  return (
    <footer className="aj-footer">
      <span>{site.content.footer.line}</span>
      <span className="aj-footer-links">
        <WaLink href={site.whatsapp.href} className="aj-footer-link">
          WhatsApp
        </WaLink>
        {site.groupLink && (
          <WaLink href={site.groupLink} className="aj-footer-link">
            Groupe privé
          </WaLink>
        )}
      </span>
    </footer>
  );
}
