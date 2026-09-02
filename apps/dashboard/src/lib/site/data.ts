import type { Core, MenuRow, PriceType, PricingRow } from "@arbi/core";
import {
  normalizeSiteContent,
  renderSiteContent,
  type SiteChatLine,
  type SiteContent,
  type SiteFaqItem,
  type SitePoleContent,
  type SiteServiceContent,
  type TemplateContext,
} from "./content";
import {
  euro,
  formatPhoneFr,
  inkOf,
  PALETTE,
  poleSlug,
  priceLong,
  priceShort,
  serviceSlug,
  slugify,
  telegramHref,
  waHref,
} from "./format";

/**
 * View-model du site vitrine : TOUT est dérivé de la base (menu_poles, pricing
 * actif, telegram_contact, group_link, site_content). Aucune donnée
 * conversation/lead/alerte/facturation ne transite par ici.
 */

// ─── Types du view-model ─────────────────────────────────────────────────────

export interface SiteService {
  key: string;
  slug: string;
  label: string;
  categorie: string;
  priceType: PriceType;
  prixMin: number | null;
  unite: string;
  priceShort: string;
  priceLong: string;
  affichage: string | null;
  perimetre: string;
  bullets: string[];
  punch: string;
  desc: string;
  args: string[];
  faq: SiteFaqItem[];
  poleId: string;
  poleSlug: string;
  /** Page de vente du service. */
  href: string;
  /** Lien WhatsApp pré-rempli. */
  waHref: string;
}

export interface SiteGroup {
  name: string;
  services: SiteService[];
}

export interface SiteProcessStep {
  n: string;
  label: string;
}

export interface SitePole {
  id: string;
  slug: string;
  /** Numéro d'affichage sur 2 chiffres ("01"). */
  num: string;
  /** Titre du pôle dans menu_poles (ou catégorie pour un pôle virtuel). */
  title: string;
  color: string;
  ink: string;
  glyph: string;
  cat: string;
  nameA: string;
  nameB: string;
  /** `nameA nameB` */
  name: string;
  from: string;
  lines: string[];
  tag: string;
  claim: string;
  sub: string;
  includes: string[];
  offersTitle: string;
  process: SiteProcessStep[];
  ctaTitle: string;
  groups: SiteGroup[];
  /** Services du pôle, dans l'ordre d'affichage des groupes. */
  services: SiteService[];
  href: string;
  waHref: string;
  /** Pôle créé automatiquement pour une catégorie sans pôle déclaré. */
  virtual: boolean;
}

export interface SiteFeaturedData {
  service: SiteService;
  pole: SitePole;
  kicker: string;
  title: string;
  text: string;
  cta: string;
  chat: SiteChatLine[];
  waHref: string;
}

export interface SiteStats {
  poleCount: number;
  serviceCount: number;
  /** Prix minimum global formaté (`<min> €`), "sur devis" si aucun service chiffré. */
  minPrice: string;
}

export interface SiteData {
  /** Contenu normalisé ET rendu (balises remplacées). */
  content: SiteContent;
  whatsapp: { e164: string; digits: string; display: string; href: string };
  telegram: { contact: string; href: string };
  groupLink: string;
  poles: SitePole[];
  services: SiteService[];
  featured: SiteFeaturedData | null;
  stats: SiteStats;
  hero: { rail: string[]; bigNum: string };
  findPole(slug: string): SitePole | undefined;
  findService(pole: SitePole, slug: string): SiteService | undefined;
}

type SiteCore = Pick<Core, "settings" | "pricing">;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BULLETS_MAX = 12;
const DESC_MAX = 120;
const DEFAULT_GLYPH = "◆";
const EXTRA_GROUP = "OFFRES";

/** Comparaison de catégories : minuscules, sans accents. */
function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Segment de périmètre réservé au bot (consigne interne), jamais affiché. */
const INTERNAL_NOTE_RE = /tarif non enregistr|ne pas chiffrer/i;

/** Périmètre débarrassé des consignes internes au bot. */
function publicPerimetre(perimetre: string): string {
  return perimetre
    .split(/(?<=\.)\s+/)
    .filter((sentence) => !INTERNAL_NOTE_RE.test(sentence))
    .join(" ")
    .replace(/\s*[.]\s*$/, "")
    .trim();
}

/** Périmètre découpé en puces (virgules, points-virgules, « · »), max 12. */
function bulletsOf(perimetre: string): string[] {
  return perimetre
    .split(/[,;·]/)
    .map((part) => part.replace(/\.\s*$/, "").trim())
    .filter((part) => part && !INTERNAL_NOTE_RE.test(part))
    .slice(0, BULLETS_MAX);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:]+$/, "")}…`;
}

/** Services chiffrables (prix de départ connu, hors devis). */
function pricedRows(rows: PricingRow[]): PricingRow[] {
  return rows.filter((row) => row.type !== "QUOTE" && row.prixMin != null);
}

/** Candidats au minimum : services mensuels exclus s'il existe d'autres services. */
function minCandidates(rows: PricingRow[]): PricingRow[] {
  const priced = pricedRows(rows);
  const oneShot = priced.filter((row) => row.unite !== "mois");
  return oneShot.length > 0 ? oneShot : priced;
}

function minPrixOf(rows: PricingRow[]): number | null {
  let min: number | null = null;
  for (const row of minCandidates(rows)) {
    if (row.prixMin != null && (min === null || row.prixMin < min)) min = row.prixMin;
  }
  return min;
}

/** Prix de départ calculé d'un pôle (cf. spec §3). */
function computeFrom(rows: PricingRow[]): string {
  const priced = pricedRows(rows);
  if (priced.length === 0) return "sur devis";
  const only = priced[0];
  if (priced.length === 1 && only && only.type === "FIXED") return priceShort(only);
  const min = minPrixOf(rows);
  return min === null ? "sur devis" : `dès ${euro(min)}`;
}

/** Contexte de templating à partir des services actifs et des pôles affichés. */
export function createTemplateContext(
  rows: PricingRow[],
  poleCount: number,
  minPrice: string,
  poleList: string,
): TemplateContext {
  const byKey = new Map(rows.map((row) => [row.serviceKey, row]));
  return {
    price: (key) => {
      const row = byKey.get(key);
      return row ? priceShort(row) : undefined;
    },
    label: (key) => byKey.get(key)?.label,
    poleCount,
    minPrice,
    poleList,
  };
}

/** Titre d'un pôle sur deux lignes : contenu, sinon titre coupé au premier espace. */
function poleNames(title: string, pc: SitePoleContent): { nameA: string; nameB: string; name: string } {
  const [firstWord, ...restWords] = title.trim().split(/\s+/);
  const nameA = pc.nameA ?? firstWord ?? title;
  const nameB = pc.nameB ?? restWords.join(" ");
  return { nameA, nameB, name: `${nameA} ${nameB}`.trim() };
}

/**
 * Attribue un slug d'URL unique à chaque pôle, dans l'ordre donné (déclarés
 * avant virtuels : un pôle déclaré garde toujours son adresse). Une collision
 * — pôle virtuel « Trafic-Pro » face au pôle déclaré `trafic_pro`, ou deux
 * pôles déclarés au même slug — est suffixée (`trafic-pro-2`).
 */
function uniqueSlug(wanted: string, taken: Set<string>): string {
  let slug = wanted;
  for (let n = 2; taken.has(slug); n += 1) slug = `${wanted}-${n}`;
  taken.add(slug);
  return slug;
}

// ─── Appartenance service → pôle ─────────────────────────────────────────────

interface PoleSeed {
  id: string;
  title: string;
  description: string;
  content: SitePoleContent;
  virtual: boolean;
}

/**
 * Affecte chaque service actif à UN pôle (premier match), dans l'ordre :
 * 1) serviceKey listé dans match.serviceKeys ; 2) catégorie dans
 * match.categories ; 3) catégorie == titre ou id du pôle ; 4) pôle virtuel
 * créé par catégorie. Retourne les pôles (déclarés + virtuels) et la carte
 * serviceKey → id de pôle.
 */
function assignServices(
  declared: PoleSeed[],
  rows: PricingRow[],
  content: SiteContent,
): { poles: PoleSeed[]; assignment: Map<string, string> } {
  const assignment = new Map<string, string>();
  const virtuals: PoleSeed[] = [];

  const step1 = (row: PricingRow) =>
    declared.find((pole) => pole.content.match?.serviceKeys?.includes(row.serviceKey));
  const step2 = (row: PricingRow) => {
    const cat = norm(row.categorie);
    return declared.find((pole) =>
      (pole.content.match?.categories ?? []).some((category) => norm(category) === cat),
    );
  };
  const step3 = (row: PricingRow) => {
    const cat = norm(row.categorie);
    return declared.find((pole) => norm(pole.title) === cat || norm(pole.id) === cat);
  };

  for (const row of rows) {
    const found = step1(row) ?? step2(row) ?? step3(row);
    if (found) {
      assignment.set(row.serviceKey, found.id);
      continue;
    }
    const id = slugify(row.categorie) || "autres";
    let virtual = virtuals.find((pole) => pole.id === id);
    if (!virtual) {
      virtual = {
        id,
        title: row.categorie.trim() || "Autres",
        description: "",
        content: content.poles[id] ?? {},
        virtual: true,
      };
      virtuals.push(virtual);
    }
    assignment.set(row.serviceKey, virtual.id);
  }
  return { poles: [...declared, ...virtuals], assignment };
}

// ─── Construction ────────────────────────────────────────────────────────────

export function buildSiteData(core: SiteCore): SiteData {
  const stored = normalizeSiteContent(core.settings.get("site_content"));
  const menu: MenuRow[] = core.settings.get("menu_poles");
  const rows = core.pricing
    .active()
    .filter((row) => row.actif === 1)
    .sort(
      (a, b) =>
        a.categorie.localeCompare(b.categorie, "fr") || a.label.localeCompare(b.label, "fr"),
    );
  const telegramContact = core.settings.get("telegram_contact").trim();
  const groupLink = core.settings.get("group_link").trim();

  // 1. Pôles déclarés, triés par `order` (défaut : position dans le menu).
  const declared: PoleSeed[] = menu
    .map((row, index) => ({
      seed: {
        id: row.id,
        title: row.title,
        description: row.description,
        content: stored.poles[row.id] ?? {},
        virtual: false,
      },
      order: stored.poles[row.id]?.order ?? index + 1,
      index,
    }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map((entry) => entry.seed);

  // 2. Appartenance des services (sur le contenu non rendu : match ne contient pas de balise).
  const { poles: seeds, assignment } = assignServices(declared, rows, stored);
  const rowsOf = (poleId: string) => rows.filter((row) => assignment.get(row.serviceKey) === poleId);
  const shown = seeds.filter((pole) => rowsOf(pole.id).length > 0);

  // 3. Stats globales puis rendu des balises sur TOUT le contenu.
  const globalMin = minPrixOf(rows);
  const stats: SiteStats = {
    poleCount: shown.length,
    serviceCount: rows.length,
    minPrice: globalMin === null ? "sur devis" : euro(globalMin),
  };
  // `{{list:poles}}` (pied de page) : noms des pôles affichés, lus sur le contenu
  // non rendu — un nom de pôle ne contient pas de balise.
  const poleList = shown
    .map((seed) => poleNames(seed.title, stored.poles[seed.id] ?? {}).name)
    .join(", ");
  const ctx = createTemplateContext(rows, stats.poleCount, stats.minPrice, poleList);
  const content = renderSiteContent(stored, ctx);
  const wa = (text: string) => waHref(content.whatsapp, text);

  // 4. Pôles et services.
  const takenSlugs = new Set<string>();
  const poles: SitePole[] = shown.map((seed, index) => {
    const pc: SitePoleContent = content.poles[seed.id] ?? {};
    const poleRows = rowsOf(seed.id);
    const slug = uniqueSlug(pc.slug || poleSlug(seed.id), takenSlugs);
    const color = pc.color ?? PALETTE[index % PALETTE.length] ?? "#1C1C1E";
    const { nameA, nameB, name } = poleNames(seed.title, pc);

    const toService = (row: PricingRow): SiteService => {
      const sc: SiteServiceContent = content.services[row.serviceKey] ?? {};
      const perimetre = publicPerimetre(row.perimetre);
      const short = priceShort(row);
      return {
        key: row.serviceKey,
        slug: serviceSlug(row.serviceKey),
        label: row.label,
        categorie: row.categorie,
        priceType: row.type as PriceType,
        prixMin: row.prixMin,
        unite: row.unite,
        priceShort: short,
        priceLong: priceLong(row),
        affichage: row.affichage?.trim() || null,
        perimetre,
        bullets: bulletsOf(perimetre),
        punch: sc.punch ?? (perimetre ? truncate(perimetre, DESC_MAX) : row.label),
        desc: sc.desc ?? truncate(perimetre, DESC_MAX),
        args: sc.args ?? [],
        faq: sc.faq ?? [],
        poleId: seed.id,
        poleSlug: slug,
        href: `/offres/${slug}/${serviceSlug(row.serviceKey)}`,
        waHref: wa(`Salut, je suis intéressé par ${row.label} (${name}) — ${short}.`),
      };
    };

    const poleServices = poleRows.map(toService);
    const byKey = new Map(poleServices.map((service) => [service.key, service]));
    const used = new Set<string>();
    const groups: SiteGroup[] = [];
    for (const group of pc.groups ?? []) {
      const items: SiteService[] = [];
      for (const key of group.serviceKeys) {
        const service = byKey.get(key);
        if (!service || used.has(key)) continue;
        used.add(key);
        items.push(service);
      }
      if (items.length > 0) groups.push({ name: group.name, services: items });
    }
    const rest = poleServices.filter((service) => !used.has(service.key));
    if (rest.length > 0) {
      groups.push({ name: pc.groups?.length ? EXTRA_GROUP : name.toUpperCase(), services: rest });
    }
    const services = groups.flatMap((group) => group.services);

    return {
      id: seed.id,
      slug,
      num: pad2(index + 1),
      title: seed.title,
      color,
      ink: inkOf(color),
      glyph: pc.glyph ?? DEFAULT_GLYPH,
      cat: pc.cat ?? seed.title.toUpperCase(),
      nameA,
      nameB,
      name,
      from: pc.from || computeFrom(poleRows),
      lines: pc.lines ?? services.slice(0, 3).map((service) => service.label),
      tag: pc.tag ?? seed.description,
      claim: pc.claim ?? seed.description,
      sub: pc.sub ?? "",
      includes: pc.includes ?? services.slice(0, 4).map((service) => service.label),
      offersTitle: pc.offersTitle ?? `Les offres ${name}`,
      process: (pc.process ?? []).map((label, i) => ({ n: pad2(i + 1), label })),
      ctaTitle: pc.ctaTitle ?? content.cta.title,
      groups,
      services,
      href: `/offres/${slug}`,
      waHref: wa(`Salut, je viens de la page ${name}.`),
      virtual: seed.virtual,
    };
  });

  const services = poles.flatMap((pole) => pole.services);

  // 5. Offre phare : masquée si le service est inactif/inexistant.
  let featured: SiteFeaturedData | null = null;
  if (content.featured) {
    const service = services.find((s) => s.key === content.featured?.serviceKey);
    const pole = service ? poles.find((p) => p.id === service.poleId) : undefined;
    if (service && pole) {
      featured = {
        service,
        pole,
        kicker: content.featured.kicker,
        title: content.featured.title,
        text: content.featured.text,
        cta: content.featured.cta,
        chat: content.featured.chat,
        waHref: wa(`Salut, je suis intéressé par ${service.label} — ${service.priceShort}.`),
      };
    }
  }

  // 6. Hero : rail premier / milieu / dernier numéro, gros numéro = nombre de pôles.
  const nums = poles.map((pole) => pole.num);
  const rail = [...new Set([nums[0], nums[Math.floor(nums.length / 2)], nums[nums.length - 1]])].filter(
    (n): n is string => typeof n === "string",
  );

  // 7. Résolution d'URL : le slug (unique) d'abord ; l'id du pôle (brut ou
  // slugifié) ne sert d'alias que s'il n'est le slug d'aucun pôle.
  const bySlug = new Map(poles.map((pole) => [pole.slug, pole]));
  for (const pole of poles) {
    for (const alias of [pole.id, poleSlug(pole.id)]) {
      if (!bySlug.has(alias)) bySlug.set(alias, pole);
    }
  }

  return {
    content,
    whatsapp: {
      e164: content.whatsapp,
      digits: content.whatsapp.replace(/\D/g, ""),
      display: formatPhoneFr(content.whatsapp),
      href: wa(content.hero.waText),
    },
    telegram: { contact: telegramContact, href: telegramHref(telegramContact) },
    groupLink,
    poles,
    services,
    featured,
    stats,
    hero: { rail, bigNum: pad2(stats.poleCount) },
    findPole: (slug) => bySlug.get(slug),
    findService: (pole, slug) =>
      pole.services.find((service) => service.slug === slug || service.key === slug),
  };
}
