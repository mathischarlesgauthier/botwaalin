import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { SiteService } from "@/lib/site/data";
import { getSiteData, siteBaseUrl, siteOpenGraph } from "@/lib/site/server";
import { PageCta } from "../../../_components/PageCta";
import { ServiceCard } from "../../../_components/ServiceCard";
import { WaLink } from "../../../_components/WaLink";

export const dynamic = "force-dynamic";

type Params = Promise<{ pole: string; service: string }>;

const SIBLINGS_MAX = 3;

/** Première lettre en capitale (les puces viennent du périmètre découpé sur les virgules). */
function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("fr-FR") + text.slice(1);
}

/**
 * Mention discrète sous le prix selon le type (jamais de montant). Omise quand
 * la formulation longue du prix le dit déjà (« … — le prix final dépend du projet »).
 */
function priceNote(service: SiteService): string | null {
  switch (service.priceType) {
    case "FROM":
    case "RANGE":
      return /prix final/i.test(service.priceLong)
        ? null
        : "Prix de départ — le prix final dépend du projet.";
    case "QUOTE":
      return "Tarif sur devis, chiffré après un échange.";
    default:
      return service.prixMin == null ? "Tarif sur devis, chiffré après un échange." : null;
  }
}

/** JSON-LD Service + Offer : le montant n'est renseigné que pour un prix FIXED. */
function jsonLd(service: SiteService, poleName: string, brand: string, url: string): string {
  const offer: Record<string, unknown> = { "@type": "Offer", url };
  if (service.priceType === "FIXED" && service.prixMin != null) {
    offer.priceCurrency = "EUR";
    offer.price = String(service.prixMin);
  }
  const data = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.label,
    description: service.punch,
    category: poleName,
    provider: { "@type": "Organization", name: brand },
    url,
    offers: offer,
  };
  // `<` échappé : les chaînes viennent de la base et ne doivent pas pouvoir fermer le <script>.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function resolve(poleSlug: string, serviceSlug: string) {
  const site = getSiteData();
  const pole = site.findPole(poleSlug);
  const service = pole ? site.findService(pole, serviceSlug) : undefined;
  return { site, pole, service };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { pole: poleSlug, service: serviceSlug } = await params;
  const { site, service } = resolve(poleSlug, serviceSlug);
  if (!service) return {};
  return {
    title: service.label,
    description: service.punch,
    alternates: { canonical: service.href },
    openGraph: siteOpenGraph(site, {
      title: service.label,
      description: service.punch,
      url: service.href,
    }),
  };
}

export default async function ServicePage({ params }: { params: Params }) {
  const { pole: poleSlug, service: serviceSlug } = await params;
  const { site, pole, service } = resolve(poleSlug, serviceSlug);
  if (!pole || !service) notFound();
  const { hero, brand, genericFaq } = site.content;
  const faq = service.faq.length > 0 ? service.faq : genericFaq;
  const siblings = pole.services.filter((other) => other.key !== service.key).slice(0, SIBLINGS_MAX);
  const note = priceNote(service);
  const url = new URL(service.href, siteBaseUrl()).toString();

  return (
    <main className="aj-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(service, pole.name, brand.name, url) }}
      />
      <div className="aj-back-wrap">
        <Link href={pole.href} className="aj-back">
          ← {pole.name}
        </Link>
      </div>

      <section className="aj-phero">
        <div>
          <div className="aj-shero-kicker">
            {pole.cat} · {pole.name}
          </div>
          <h1 className="aj-ph1">{service.label}</h1>
          <div className="aj-sprice-row">
            <span className="aj-sprice" style={{ color: pole.ink }}>
              {service.priceShort}
            </span>
          </div>
          <p className="aj-sprice-long">{service.priceLong}</p>
          {note && <p className="aj-sprice-note">{note}</p>}
          <p className="aj-phero-claim">{service.punch}</p>
          <div className="aj-phero-ctas">
            <WaLink href={service.waHref} className="aj-btn-dark">
              {hero.ctaPrimary}
            </WaLink>
            {site.telegram.href && (
              <WaLink href={site.telegram.href} className="aj-btn-ghost">
                {hero.ctaSecondary}
              </WaLink>
            )}
          </div>
        </div>
        <div className="aj-pblock-wrap">
          <div className="aj-pblock" style={{ background: pole.color }}>
            <div className="aj-pblock-circle" />
            <div className="aj-pblock-ring" />
            <div className="aj-pblock-cat">{pole.cat}</div>
            <div className="aj-pblock-tag">{service.desc}</div>
          </div>
        </div>
      </section>

      {service.bullets.length > 0 && (
        <section className="aj-psec">
          <h2 className="aj-ph2">Ce qui est inclus</h2>
          <div className="aj-includes">
            {service.bullets.map((bullet) => (
              <div key={bullet} className="aj-include" style={{ borderTopColor: pole.color }}>
                {capitalize(bullet)}
              </div>
            ))}
          </div>
        </section>
      )}

      {service.args.length > 0 && (
        <section className="aj-psec">
          <h2 className="aj-ph2">Pourquoi ça vaut le coup</h2>
          <div className="aj-args">
            {service.args.map((arg, index) => (
              <div key={arg} className="aj-arg">
                <div className="aj-arg-num" style={{ color: pole.ink }}>
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="aj-arg-text">{arg}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {pole.process.length > 0 && (
        <section className="aj-psec">
          <h2 className="aj-ph2">Le déroulé</h2>
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

      {faq.length > 0 && (
        <section className="aj-psec">
          <h2 className="aj-ph2">Les questions qu&apos;on nous pose</h2>
          <div className="aj-faq">
            {faq.map((item) => (
              <div key={item.q} className="aj-faq-item">
                <div className="aj-faq-q">{item.q}</div>
                <p className="aj-faq-a">{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {siblings.length > 0 && (
        <section className="aj-psec">
          <h2 className="aj-ph2">Dans le même pôle</h2>
          <div className="aj-offers">
            {siblings.map((other) => (
              <ServiceCard key={other.key} service={other} ink={pole.ink} />
            ))}
          </div>
        </section>
      )}

      <PageCta site={site} title={pole.ctaTitle} waHref={service.waHref} ink={pole.ink} />
    </main>
  );
}
