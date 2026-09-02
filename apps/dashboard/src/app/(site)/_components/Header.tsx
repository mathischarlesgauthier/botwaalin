import Link from "next/link";
import type { SiteData } from "@/lib/site/data";
import { WaLink } from "./WaLink";

export function Header({ site }: { site: SiteData }) {
  const { brand, hero } = site.content;
  return (
    <header className="aj-header">
      <div className="aj-header-in">
        <Link href="/" className="aj-brand">
          {brand.name}
        </Link>
        <span className="aj-tagline">{brand.tagline}</span>
        <div className="aj-spacer" />
        <WaLink href={site.whatsapp.href} className="aj-btn-header">
          {hero.ctaPrimary}
        </WaLink>
      </div>
    </header>
  );
}
