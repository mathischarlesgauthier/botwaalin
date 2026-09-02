import Link from "next/link";
import {
  resetSiteContentAction,
  saveSiteGeneralAction,
  saveSitePoleAction,
  saveSiteServiceAction,
} from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import {
  normalizeSiteContent,
  SITE_FIELD_MAX,
  type SiteFaqItem,
  type SitePoleContent,
  type SiteServiceContent,
} from "@/lib/site/content";
import { PALETTE, poleSlug } from "@/lib/site/format";
import { getSiteData } from "@/lib/site/server";

export const dynamic = "force-dynamic";

// ─── Petits composants de formulaire (style des pages existantes) ────────────

function Field({
  name,
  label,
  value,
  placeholder,
  hint,
  required,
  mono,
}: {
  name: string;
  label: string;
  value?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        name={name}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        maxLength={SITE_FIELD_MAX}
        required={required}
        className={`input${mono ? " font-mono" : ""}`}
      />
      {hint && <span className="mt-1 block text-xs text-neutral-400">{hint}</span>}
    </label>
  );
}

function Area({
  name,
  label,
  value,
  placeholder,
  hint,
  rows = 3,
}: {
  name: string;
  label: string;
  value?: string;
  placeholder?: string;
  hint?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <textarea
        name={name}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        rows={rows}
        className="input"
      />
      {hint && <span className="mt-1 block text-xs text-neutral-400">{hint}</span>}
    </label>
  );
}

/** N champs répétés (même `name`) : autant que d'éléments existants, au moins `min`. */
function RepeatedFields({
  name,
  label,
  values,
  min,
}: {
  name: string;
  label: string;
  values: string[];
  min: number;
}) {
  const count = Math.max(min, values.length);
  return (
    <div>
      <span className="label">{label}</span>
      <div className="space-y-1">
        {Array.from({ length: count }, (_, i) => (
          <input
            key={i}
            name={name}
            defaultValue={values[i] ?? ""}
            maxLength={SITE_FIELD_MAX}
            className="input"
            placeholder={`${i + 1}.`}
          />
        ))}
      </div>
    </div>
  );
}

/** Sérialisation FAQ pour textarea : `Question ? | Réponse.` par ligne. */
function faqToText(faq: SiteFaqItem[] | undefined): string {
  return (faq ?? []).map((item) => `${item.q} | ${item.a}`).join("\n");
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function SiteEditorPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; confirm?: string }>;
}) {
  await requireSession();
  const { msg, confirm } = await searchParams;
  const { core } = getRuntime();
  // Contenu normalisé mais NON rendu : les balises {{…}} restent éditables.
  const content = normalizeSiteContent(core.settings.get("site_content"));
  const menu = core.settings.get("menu_poles");
  const pricing = core.pricing.all();
  const activeRows = pricing.filter((row) => row.actif === 1);
  // View-model du site : appartenance service → pôle (y compris pôles virtuels).
  const site = getSiteData();
  const featured = content.featured;
  const stepsCount = Math.max(4, content.steps.length);
  const chatCount = Math.max(4, featured?.chat.length ?? 0);
  const hexPalette = new Set(PALETTE);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Site vitrine</h1>
        <a href="/" target="_blank" rel="noopener" className="btn btn-secondary">
          Voir le site ↗
        </a>
      </div>
      <p className="text-sm text-neutral-500">
        Les prix et libellés viennent de{" "}
        <Link href="/admin/catalogue" className="underline">
          Catalogue &amp; tarifs
        </Link>{" "}
        ; ici on règle les textes marketing. Balises disponibles dans tous les champs :{" "}
        <code>{"{{price:clé}}"}</code>, <code>{"{{label:clé}}"}</code>, <code>{"{{count:poles}}"}</code>,{" "}
        <code>{"{{min:price}}"}</code>, <code>{"{{list:poles}}"}</code>. Un champ vide reprend le texte par défaut. Chaque
        enregistrement est versionné et visible immédiatement sur le site.
      </p>

      {msg && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {msg}
        </div>
      )}

      {confirm === "1" && (
        <form action={resetSiteContentAction} className="card border-red-300 bg-red-50 space-y-2">
          <h2 className="font-semibold text-red-700">Réinitialiser tous les textes du site ?</h2>
          <p className="text-sm text-red-700">
            Tous les textes personnalisés (généraux, pôles, services) seront remplacés par les
            textes par défaut. Les prix et le catalogue ne sont pas touchés. L&apos;ancienne
            version reste dans l&apos;historique des réglages.
          </p>
          <div className="flex gap-2">
            <button className="btn btn-danger" type="submit">
              Oui, réinitialiser
            </button>
            <Link href="/admin/site" className="btn btn-secondary">
              Annuler
            </Link>
          </div>
        </form>
      )}

      {/* ── 1. Général ── */}
      <form action={saveSiteGeneralAction} className="card space-y-4">
        <h2 className="font-semibold">Général</h2>

        <div className="grid gap-3 md:grid-cols-3">
          <Field
            name="whatsapp"
            label="Numéro WhatsApp (liens wa.me)"
            value={content.whatsapp}
            placeholder="+33756975687"
            hint="Format E.164."
            required
            mono
          />
          <Field name="brand_name" label="Nom de la marque" value={content.brand.name} />
          <Field name="brand_tagline" label="Sous-titre de la marque" value={content.brand.tagline} />
        </div>

        <h3 className="text-sm font-semibold">Hero (accueil)</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field name="hero_titleA" label="Titre — ligne 1" value={content.hero.titleA} />
          <Field name="hero_titleB" label="Titre — ligne 2" value={content.hero.titleB} />
          <Area name="hero_claim" label="Accroche" value={content.hero.claim} rows={3} />
          <Area name="hero_sub" label="Sous-texte" value={content.hero.sub} rows={3} />
          <Field name="hero_ctaPrimary" label="Bouton principal" value={content.hero.ctaPrimary} />
          <Field name="hero_ctaSecondary" label="Bouton secondaire" value={content.hero.ctaSecondary} />
          <Field
            name="hero_waText"
            label="Message WhatsApp pré-rempli (accueil, header, barre mobile)"
            value={content.hero.waText}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Area
            name="ticker"
            label="Bandeau défilant (une entrée par ligne)"
            value={content.ticker.join("\n")}
            rows={5}
          />
          <div className="space-y-3">
            <Field name="cardsTitleA" label="Section cartes — titre ligne 1" value={content.cardsTitleA} />
            <Field name="cardsTitleB" label="Section cartes — titre ligne 2" value={content.cardsTitleB} />
            <Area name="cardsHint" label="Section cartes — texte-guide" value={content.cardsHint} rows={2} />
          </div>
        </div>

        <h3 className="text-sm font-semibold">Offre phare</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="featured_serviceKey">
              Service mis en avant
            </label>
            <select
              id="featured_serviceKey"
              name="featured_serviceKey"
              defaultValue={featured?.serviceKey ?? ""}
              className="input"
            >
              <option value="">— Masquer l&apos;offre phare —</option>
              {activeRows.map((row) => (
                <option key={row.serviceKey} value={row.serviceKey}>
                  {row.label} ({row.serviceKey})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-neutral-400">
              Seuls les services actifs sont proposés ; un service désactivé masque la section.
            </p>
          </div>
          <Field name="featured_kicker" label="Surtitre" value={featured?.kicker} placeholder="OFFRE PHARE" />
          <Area
            name="featured_title"
            label="Titre (retour à la ligne = 2e ligne)"
            value={featured?.title}
            rows={2}
          />
          <Area name="featured_text" label="Texte" value={featured?.text} rows={4} />
          <Field name="featured_cta" label="Bouton" value={featured?.cta} />
          <div>
            <span className="label">Faux chat (client / bot)</span>
            <div className="space-y-1">
              {Array.from({ length: chatCount }, (_, i) => {
                const line = featured?.chat[i];
                return (
                  <div key={i} className="flex gap-1">
                    <div className="w-28 shrink-0">
                      <select
                        name="chat_from"
                        defaultValue={line?.from ?? (i % 2 === 0 ? "client" : "bot")}
                        className="input"
                        aria-label={`Émetteur ligne ${i + 1}`}
                      >
                        <option value="client">client</option>
                        <option value="bot">bot</option>
                      </select>
                    </div>
                    <div className="min-w-0 flex-1">
                      <input
                        name="chat_text"
                        defaultValue={line?.text ?? ""}
                        maxLength={SITE_FIELD_MAX}
                        className="input"
                        aria-label={`Texte ligne ${i + 1}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <h3 className="text-sm font-semibold">Étapes « Comment on lance »</h3>
        <Field name="stepsTitle" label="Titre de la section" value={content.stepsTitle} />
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: stepsCount }, (_, i) => {
            const step = content.steps[i];
            return (
              <div key={i} className="space-y-1 rounded-lg border border-neutral-200 p-2">
                <span className="label">Étape {i + 1}</span>
                <input
                  name="step_title"
                  defaultValue={step?.title ?? ""}
                  maxLength={SITE_FIELD_MAX}
                  className="input"
                  placeholder="Titre"
                  aria-label={`Étape ${i + 1} — titre`}
                />
                <textarea
                  name="step_text"
                  defaultValue={step?.text ?? ""}
                  rows={2}
                  className="input"
                  placeholder="Texte"
                  aria-label={`Étape ${i + 1} — texte`}
                />
              </div>
            );
          })}
        </div>

        <h3 className="text-sm font-semibold">CTA final, pied de page, pages d&apos;offres</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Field name="cta_title" label="CTA — titre" value={content.cta.title} />
          <Area name="cta_text" label="CTA — texte" value={content.cta.text} rows={2} />
          <Field name="cta_primary" label="CTA — bouton WhatsApp" value={content.cta.primary} />
          <Field name="cta_secondary" label="CTA — bouton groupe privé" value={content.cta.secondary} />
          <Field name="footer_line" label="Ligne du pied de page" value={content.footer.line} />
          <Area
            name="pagesCtaText"
            label="Texte du CTA des pages d'offres"
            value={content.pagesCtaText}
            rows={2}
          />
        </div>
        <Area
          name="genericFaq"
          label="FAQ générique des pages service (une ligne par question : Question ? | Réponse.)"
          value={faqToText(content.genericFaq)}
          rows={4}
          hint="Utilisée quand un service n'a pas sa propre FAQ. Sans montant, sans promesse de résultat."
        />

        <button className="btn btn-primary" type="submit">
          💾 Enregistrer les textes généraux
        </button>
      </form>

      {/* ── 2. Pôles ── */}
      <div className="card space-y-3">
        <h2 className="font-semibold">Pôles</h2>
        <p className="text-xs text-neutral-500">
          Un formulaire par pôle du menu WhatsApp (l&apos;ordre et les titres du menu se règlent dans
          Catalogue &amp; tarifs). Les services d&apos;un pôle sont ceux de la grille tarifaire qui
          correspondent à ses catégories ou clés ; une catégorie sans pôle déclaré crée
          automatiquement une page.
        </p>
        {menu.map((pole) => {
          const pc: SitePoleContent = content.poles[pole.id] ?? {};
          const presetColor = pc.color && hexPalette.has(pc.color) ? pc.color : "";
          const customColor = pc.color && !hexPalette.has(pc.color) ? pc.color : "";
          const prefix = `pole-${pole.id}`;
          return (
            <details key={pole.id} open className="rounded-lg border border-neutral-200">
              <summary className="cursor-pointer px-3 py-2 font-medium">
                {pole.title}{" "}
                <span className="font-mono text-xs text-neutral-400">
                  {pole.id} → /offres/{pc.slug || poleSlug(pole.id)}
                </span>
              </summary>
              <form action={saveSitePoleAction.bind(null, pole.id)} className="space-y-3 px-3 pb-3">
                <div className="grid gap-3 md:grid-cols-4">
                  <Field
                    name="slug"
                    label="Adresse (slug)"
                    value={pc.slug}
                    placeholder={poleSlug(pole.id)}
                    mono
                  />
                  <div>
                    <label className="label" htmlFor={`${prefix}-color`}>
                      Couleur (palette)
                    </label>
                    <select
                      id={`${prefix}-color`}
                      name="color_preset"
                      defaultValue={presetColor}
                      className="input font-mono"
                    >
                      <option value="">— par défaut —</option>
                      {PALETTE.map((hex) => (
                        <option key={hex} value={hex}>
                          {hex}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Field
                    name="color_hex"
                    label="Couleur libre (hex, prioritaire)"
                    value={customColor}
                    placeholder="#FF6A2B"
                    mono
                  />
                  <Field name="glyph" label="Glyphe" value={pc.glyph} placeholder="◧" />
                  <Field name="cat" label="Catégorie (petite capitale)" value={pc.cat} placeholder="DIGITAL" />
                  <Field name="nameA" label="Nom — ligne 1" value={pc.nameA} />
                  <Field name="nameB" label="Nom — ligne 2" value={pc.nameB} />
                  <Field
                    name="from"
                    label="Prix de départ affiché"
                    value={pc.from}
                    placeholder="vide = calculé depuis la grille"
                    hint="Laisse vide : le prix de départ vient de la grille tarifaire."
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <RepeatedFields name="lines" label="3 lignes révélées au survol de la carte" values={pc.lines ?? []} min={3} />
                  <RepeatedFields name="includes" label="4 cases « inclus »" values={pc.includes ?? []} min={4} />
                  <Area name="tag" label="Accroche du bloc coloré" value={pc.tag} rows={2} />
                  <Area name="claim" label="Accroche principale (hero)" value={pc.claim} rows={3} />
                  <Area name="sub" label="Sous-texte (hero)" value={pc.sub} rows={2} />
                  <Field name="offersTitle" label="Titre de la liste des offres" value={pc.offersTitle} />
                  <Area
                    name="process"
                    label="Déroulé (une étape par ligne ; vide = section masquée)"
                    value={(pc.process ?? []).join("\n")}
                    rows={5}
                  />
                  <div className="space-y-3">
                    <Field name="ctaTitle" label="Titre du CTA final" value={pc.ctaTitle} />
                    <Field
                      name="match_categories"
                      label="Catégories de la grille rattachées (virgules)"
                      value={(pc.match?.categories ?? []).join(", ")}
                      placeholder="Digital"
                    />
                    <Field
                      name="match_serviceKeys"
                      label="Clés de services rattachées (virgules)"
                      value={(pc.match?.serviceKeys ?? []).join(", ")}
                      placeholder="trafic_pro"
                      mono
                    />
                  </div>
                </div>
                <Area
                  name="groups"
                  label="Sous-familles (une par ligne : NOM DU GROUPE: clé1, clé2)"
                  value={(pc.groups ?? [])
                    .map((group) => `${group.name}: ${group.serviceKeys.join(", ")}`)
                    .join("\n")}
                  rows={4}
                  hint="Les services non listés vont dans un groupe « OFFRES »."
                />
                <button className="btn btn-primary" type="submit">
                  💾 Enregistrer ce pôle
                </button>
              </form>
            </details>
          );
        })}
        {menu.length === 0 && (
          <p className="text-sm text-neutral-500">Aucun pôle dans le menu WhatsApp.</p>
        )}
      </div>

      {/* ── 3. Services ── */}
      <div className="card space-y-3">
        <h2 className="font-semibold">Services</h2>
        <p className="text-xs text-neutral-500">
          Textes des cartes et des pages de vente, pour chaque service actif. Le libellé, le prix et
          le périmètre se modifient dans Catalogue &amp; tarifs.
        </p>
        {site.poles.map((pole, poleIndex) => (
          <details key={pole.id} open={poleIndex === 0} className="rounded-lg border border-neutral-200">
            <summary className="cursor-pointer px-3 py-2 font-medium">
              {pole.name}{" "}
              <span className="text-xs text-neutral-400">
                ({pole.services.length} service{pole.services.length > 1 ? "s" : ""}
                {pole.virtual ? " · pôle automatique" : ""})
              </span>
            </summary>
            <div className="space-y-2 px-3 pb-3">
              {pole.services.map((service) => {
                const sc: SiteServiceContent = content.services[service.key] ?? {};
                return (
                  <form
                    key={service.key}
                    action={saveSiteServiceAction.bind(null, service.key)}
                    className="space-y-2 border-t border-neutral-100 py-3"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">
                        {service.label}{" "}
                        <span className="font-mono text-xs text-neutral-400">{service.key}</span>
                      </span>
                      <span className="text-xs text-neutral-500">
                        {service.priceShort} ·{" "}
                        <a href={service.href} target="_blank" rel="noopener" className="underline">
                          voir la page ↗
                        </a>
                      </span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field
                        name="punch"
                        label="Accroche (hero de la page service)"
                        value={sc.punch}
                        placeholder={service.punch}
                      />
                      <Field
                        name="desc"
                        label="Description courte (carte)"
                        value={sc.desc}
                        placeholder={service.desc}
                      />
                      <RepeatedFields name="args" label="3 arguments « pourquoi ça vaut le coup »" values={sc.args ?? []} min={3} />
                      <Area
                        name="faq"
                        label="FAQ propre au service (Question ? | Réponse. — vide = FAQ générique)"
                        value={faqToText(sc.faq)}
                        rows={4}
                      />
                    </div>
                    <button className="btn btn-primary" type="submit">
                      💾 Enregistrer
                    </button>
                  </form>
                );
              })}
            </div>
          </details>
        ))}
        {site.poles.length === 0 && (
          <p className="text-sm text-neutral-500">Aucun service actif dans la grille tarifaire.</p>
        )}
      </div>

      {/* ── 4. Réinitialisation ── */}
      <div className="card flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Réinitialiser</h2>
          <p className="text-sm text-neutral-500">
            Remet tous les textes du site (généraux, pôles, services) aux valeurs par défaut. Les
            prix ne sont pas concernés.
          </p>
        </div>
        <Link href="/admin/site?confirm=1" className="btn btn-danger">
          Réinitialiser tous les textes par défaut
        </Link>
      </div>
    </div>
  );
}
