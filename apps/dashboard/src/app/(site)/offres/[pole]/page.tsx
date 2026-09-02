import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSiteData, siteOpenGraph } from "@/lib/site/server";
import { PageCta } from "../../_components/PageCta";
import { ServiceCard } from "../../_components/ServiceCard";
import { WaLink } from "../../_components/WaLink";

export const dynamic = "force-dynamic";

type Params = Promise<{ pole: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { pole: slug } = await params;
  const site = getSiteData();
  const pole = site.findPole(slug);
  if (!pole) return {};
  return {
    title: pole.name,
    description: pole.claim,
    alternates: { canonical: pole.href },
    openGraph: siteOpenGraph(site, { title: pole.name, description: pole.claim, url: pole.href }),
  };
}

export default async function PolePage({ params }: { params: Params }) {
  const { pole: slug } = await params;
  const site = getSiteData();
  const pole = site.findPole(slug);
  if (!pole) notFound();
  const { hero } = site.content;

  return (
    <main className="aj-page">
      <div className="aj-back-wrap">
        <Link href="/" className="aj-back">
          ← Tous les business
        </Link>
      </div>

      <section className="aj-phero">
        <div>
          <div className="aj-phero-title-row">
            <span className="aj-phero-num" style={{ color: pole.ink }} aria-hidden="true">
              {pole.num}
            </span>
            <h1 className="aj-ph1">
              {pole.nameA}
              <br />
              {pole.nameB}
            </h1>
          </div>
          <p className="aj-phero-claim">{pole.claim}</p>
          {pole.sub && <p className="aj-phero-sub">{pole.sub}</p>}
          <div className="aj-phero-ctas">
            <WaLink href={pole.waHref} className="aj-btn-dark">
              {hero.ctaPrimary}
            </WaLink>
            <span className="aj-phero-from">{pole.from}</span>
          </div>
        </div>
        <div className="aj-pblock-wrap">
          <div className="aj-pblock" style={{ background: pole.color }}>
            <div className="aj-pblock-circle" />
            <div className="aj-pblock-ring" />
            <div className="aj-pblock-cat">{pole.cat}</div>
            <div className="aj-pblock-tag">{pole.tag}</div>
          </div>
        </div>
      </section>

      {pole.includes.length > 0 && (
        <section className="aj-psec">
          <div className="aj-includes">
            {pole.includes.map((item) => (
              <div key={item} className="aj-include" style={{ borderTopColor: pole.color }}>
                {item}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="aj-psec">
        <h2 className="aj-ph2">{pole.offersTitle}</h2>
        {pole.groups.map((group) => (
          <div key={group.name} className="aj-group">
            <div className="aj-group-name">{group.name}</div>
            <div className="aj-offers">
              {group.services.map((service) => (
                <ServiceCard key={service.key} service={service} ink={pole.ink} />
              ))}
            </div>
          </div>
        ))}
      </section>

      {pole.process.length > 0 && (
        <section className="aj-psec">
          <h2 className="aj-ph2">Le déroulé, étape par étape</h2>
          <div className="aj-process">
            {pole.process.map((step) => (
              <div key={step.n} className="aj-process-step">
                <div className="aj-process-num" style={{ color: pole.ink }}>
                  {step.n}
                </div>
                <div className="aj-process-label">{step.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <PageCta site={site} title={pole.ctaTitle} waHref={pole.waHref} ink={pole.ink} />
    </main>
  );
}
