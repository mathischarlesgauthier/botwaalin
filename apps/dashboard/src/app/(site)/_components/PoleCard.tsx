import Link from "next/link";
import type { SitePole } from "@/lib/site/data";

/** Carte de pôle de l'accueil : toute la carte est un lien, le survol/focus est géré en CSS. */
export function PoleCard({ pole }: { pole: SitePole }) {
  return (
    <Link href={pole.href} className="aj-card" aria-label={`${pole.name} — ${pole.from}`}>
      <div aria-hidden="true" className="aj-card-slab" style={{ background: pole.color }}>
        <div className="aj-card-num">{pole.num}</div>
      </div>
      <div className="aj-card-body">
        <div aria-hidden="true" className="aj-card-glyph">
          {pole.glyph}
        </div>
        <div className="aj-card-cat">{pole.cat}</div>
        <div className="aj-card-name">
          {pole.nameA}
          <br />
          {pole.nameB}
        </div>
        <div className="aj-card-reveal">
          <div className="aj-card-lines">
            {pole.lines.map((line) => (
              <div key={line} className="aj-card-line">
                {line}
              </div>
            ))}
          </div>
        </div>
        <div className="aj-card-foot">
          <span className="aj-card-from">{pole.from}</span>
          <span className="aj-card-arrow" style={{ color: pole.ink }}>
            Voir l&apos;offre →
          </span>
        </div>
      </div>
    </Link>
  );
}
