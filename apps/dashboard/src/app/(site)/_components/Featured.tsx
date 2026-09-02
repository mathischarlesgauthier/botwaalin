import type { SiteFeaturedData } from "@/lib/site/data";
import { WaLink } from "./WaLink";

/** Offre phare : bloc noir + faux chat. Le titre peut contenir un saut de ligne. */
export function Featured({ featured }: { featured: SiteFeaturedData }) {
  const titleLines = featured.title.split("\n").filter(Boolean);
  return (
    <section className="aj-section aj-sec-featured">
      <div data-reveal="1" className="aj-featured">
        <div>
          <div className="aj-kicker-teal">{featured.kicker}</div>
          <h2 className="aj-featured-title">
            {titleLines.map((line, index) => (
              <span key={line}>
                {index > 0 && <br />}
                {line}
              </span>
            ))}
          </h2>
          <p className="aj-featured-text">{featured.text}</p>
          <WaLink href={featured.waHref} className="aj-btn-teal">
            {featured.cta}
          </WaLink>
        </div>
        <div className="aj-chat">
          {featured.chat.map((line, index) => (
            <div
              key={`${index}-${line.from}`}
              className={`aj-bubble ${line.from === "client" ? "aj-bubble--client" : "aj-bubble--bot"}`}
            >
              {line.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
