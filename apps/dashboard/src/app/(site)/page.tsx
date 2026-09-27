import { getSiteData } from "@/lib/site/server";
import { CtaBand } from "./_components/CtaBand";
import { Featured } from "./_components/Featured";
import { HeroIllustration } from "./_components/HeroIllustration";
import { PoleCard } from "./_components/PoleCard";
import { Steps } from "./_components/Steps";
import { Ticker } from "./_components/Ticker";
import { WaLink } from "./_components/WaLink";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const site = getSiteData();
  const { hero, ticker, cardsTitleA, cardsTitleB, cardsHint, stepsTitle, steps } = site.content;

  return (
    <main className="aj-main">
      <section className="aj-hero">
        <div className="aj-hero-copy">
          <div className="aj-hero-row">
            <div className="aj-rail" aria-hidden="true">
              <span className="aj-rail-arrow">↑</span>
              {site.hero.rail.map((num) => (
                <span key={num}>{num}</span>
              ))}
              <span className="aj-rail-arrow">↓</span>
            </div>
            <div>
              <div className="aj-hero-title-row">
                <span className="aj-hero-num" aria-hidden="true">
                  {site.hero.bigNum}
                </span>
                <h1 className="aj-h1">
                  {hero.titleA}
                  <br />
                  {hero.titleB}
                </h1>
              </div>
              <p className="aj-hero-claim">{hero.claim}</p>
              <p className="aj-hero-sub">{hero.sub}</p>
              <div className="aj-hero-ctas">
                <WaLink href={site.whatsapp.href} className="aj-btn-orange">
                  {hero.ctaPrimary}
                </WaLink>
              </div>
              <div className="aj-stats">
                <div className="aj-stat aj-stat--orange">
                  <div className="aj-stat-label">PÔLES</div>
                  <div className="aj-stat-value">{site.hero.bigNum}</div>
                  <div className="aj-stat-bar" />
                </div>
                <div className="aj-stat aj-stat--dark">
                  <div className="aj-stat-label">TARIFS DÈS</div>
                  <div className="aj-stat-value">{site.stats.minPrice}</div>
                  <div className="aj-stat-bar" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="aj-hero-art">
          <HeroIllustration />
        </div>
      </section>

      <Ticker items={ticker} />

      <section id="business" className="aj-section aj-sec-cards">
        <div data-reveal="1" className="aj-cards-head">
          <h2 className="aj-h2">
            {cardsTitleA}
            <br />
            {cardsTitleB}
          </h2>
          <p className="aj-cards-hint">{cardsHint}</p>
        </div>
        <div data-reveal="2" className="aj-cards">
          {site.poles.map((pole) => (
            <PoleCard key={pole.id} pole={pole} />
          ))}
        </div>
      </section>

      {site.featured && <Featured featured={site.featured} />}

      <Steps title={stepsTitle} steps={steps} />

      <CtaBand site={site} />
    </main>
  );
}
