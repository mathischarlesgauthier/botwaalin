import { validateE164 } from "@arbi/core";
import { DEFAULT_SITE_CONTENT } from "./defaults";
import { slugify } from "./format";

/**
 * Contenu marketing du site vitrine (réglage `site_content`, JSON libre côté
 * core). Ce module possède les types, la normalisation (deep-merge avec le
 * seed, jamais de crash sur un JSON inattendu) et le templating des balises
 * `{{price:clé}}`, `{{label:clé}}`, `{{count:poles}}`, `{{min:price}}`,
 * `{{list:poles}}`.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SiteChatLine {
  from: "client" | "bot";
  text: string;
}
export interface SiteStep {
  title: string;
  text: string;
}
export interface SiteFaqItem {
  q: string;
  a: string;
}
export interface SitePoleGroup {
  name: string;
  serviceKeys: string[];
}
export interface SitePoleMatch {
  categories?: string[];
  serviceKeys?: string[];
}
export interface SitePoleContent {
  order?: number; // ordre d'affichage (défaut : position dans menu_poles)
  slug?: string; // ex. "ghost-studio" (défaut : id du pôle avec _ → -)
  color?: string; // hex, défaut : palette cyclique selon l'index
  glyph?: string; // ex. "◧"
  cat?: string; // ex. "DIGITAL" (petite capitale)
  nameA?: string;
  nameB?: string; // titre sur 2 lignes (défaut : title coupé au 1er espace)
  from?: string; // override du prix de départ affiché ("" = calculé)
  lines?: string[]; // 3 lignes révélées au survol de la carte
  tag?: string; // accroche du bloc coloré de la page
  claim?: string;
  sub?: string;
  includes?: string[]; // 4 cases
  offersTitle?: string; // ex. "Tous les tarifs Ghost Studio"
  process?: string[]; // étapes ([] = section masquée)
  ctaTitle?: string;
  match?: SitePoleMatch; // quels services (pricing) appartiennent au pôle
  groups?: SitePoleGroup[]; // sous-familles ; services non listés → groupe "OFFRES"
}
export interface SiteServiceContent {
  punch?: string; // accroche 1 ligne (hero page service)
  desc?: string; // description courte carte (défaut : périmètre tronqué)
  args?: string[]; // 3 arguments marketing (page service)
  faq?: SiteFaqItem[]; // optionnel
}
export interface SiteFeatured {
  serviceKey: string;
  kicker: string;
  title: string;
  text: string;
  cta: string;
  chat: SiteChatLine[];
}
export interface SiteContent {
  whatsapp: string; // E.164
  brand: { name: string; tagline: string };
  hero: {
    titleA: string;
    titleB: string;
    claim: string;
    sub: string;
    ctaPrimary: string;
    ctaSecondary: string;
    waText: string;
  };
  ticker: string[];
  cardsTitleA: string;
  cardsTitleB: string;
  cardsHint: string;
  featured: SiteFeatured | null;
  stepsTitle: string;
  steps: SiteStep[];
  cta: { title: string; text: string; primary: string; secondary: string };
  footer: { line: string };
  pagesCtaText: string;
  genericFaq: SiteFaqItem[]; // Q/R génériques pour les pages service sans FAQ propre
  poles: Record<string, SitePoleContent>; // clé = id du pôle (menu_poles)
  services: Record<string, SiteServiceContent>; // clé = serviceKey
}

// ─── Bornes ──────────────────────────────────────────────────────────────────

/** Longueur maximale d'un champ texte. */
export const SITE_FIELD_MAX = 2000;
/** Nombre maximal d'éléments d'une liste. */
export const SITE_LIST_MAX = 30;
/** Longueur maximale d'une clé (id de pôle, serviceKey). */
const KEY_MAX = 60;

// ─── Normalisation ───────────────────────────────────────────────────────────

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clean(value: string): string {
  return value.trim().slice(0, SITE_FIELD_MAX);
}

/** Chaîne obligatoire : valeur stockée trimée, sinon (absente ou vide) le défaut. */
function str(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const out = clean(value);
  return out === "" ? fallback : out;
}

/** Chaîne optionnelle : même règle, le défaut pouvant être absent. */
function optStr(value: unknown, fallback: string | undefined): string | undefined {
  if (typeof value !== "string") return fallback;
  const out = clean(value);
  return out === "" ? fallback : out;
}

/** Liste de chaînes : si un tableau est stocké il fait foi (filtré, même vide), sinon le défaut. */
function strList(value: unknown, fallback: string[] | undefined): string[] | undefined {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter((item): item is string => typeof item === "string")
    .map(clean)
    .filter(Boolean)
    .slice(0, SITE_LIST_MAX);
}

function hexColor(value: unknown, fallback: string | undefined): string | undefined {
  if (typeof value !== "string") return fallback;
  const raw = value.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(raw)) return raw;
  const short = /^#([0-9A-F])([0-9A-F])([0-9A-F])$/.exec(raw);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return fallback;
}

function faqList(value: unknown, fallback: SiteFaqItem[] | undefined): SiteFaqItem[] | undefined {
  if (!Array.isArray(value)) return fallback;
  const out: SiteFaqItem[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const q = str(item.q, "");
    const a = str(item.a, "");
    if (q && a) out.push({ q, a });
  }
  return out.slice(0, SITE_LIST_MAX);
}

function stepList(value: unknown, fallback: SiteStep[]): SiteStep[] {
  if (!Array.isArray(value)) return fallback;
  const out: SiteStep[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const title = str(item.title, "");
    const text = str(item.text, "");
    if (title || text) out.push({ title, text });
  }
  return out.slice(0, SITE_LIST_MAX);
}

function chatList(value: unknown, fallback: SiteChatLine[]): SiteChatLine[] {
  if (!Array.isArray(value)) return fallback;
  const out: SiteChatLine[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const from = item.from === "bot" ? "bot" : item.from === "client" ? "client" : null;
    const text = str(item.text, "");
    if (from && text) out.push({ from, text });
  }
  return out.slice(0, SITE_LIST_MAX);
}

function groupList(value: unknown, fallback: SitePoleGroup[] | undefined): SitePoleGroup[] | undefined {
  if (!Array.isArray(value)) return fallback;
  const out: SitePoleGroup[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const name = str(item.name, "");
    if (!name) continue;
    out.push({ name, serviceKeys: strList(item.serviceKeys, []) ?? [] });
  }
  return out.slice(0, SITE_LIST_MAX);
}

function normalizePole(raw: unknown, base: SitePoleContent): SitePoleContent {
  const r = isRecord(raw) ? raw : {};
  const slug = optStr(r.slug, undefined);
  const match = isRecord(r.match)
    ? {
        categories: strList(r.match.categories, base.match?.categories ?? []) ?? [],
        serviceKeys: strList(r.match.serviceKeys, base.match?.serviceKeys ?? []) ?? [],
      }
    : base.match;
  const out: SitePoleContent = {
    order:
      typeof r.order === "number" && Number.isFinite(r.order) ? Math.round(r.order) : base.order,
    slug: slug ? slugify(slug) || base.slug : base.slug,
    color: hexColor(r.color, base.color),
    glyph: optStr(r.glyph, base.glyph),
    cat: optStr(r.cat, base.cat),
    nameA: optStr(r.nameA, base.nameA),
    nameB: optStr(r.nameB, base.nameB),
    // `from` : une chaîne présente (même vide) est explicite — vide = prix calculé.
    from: typeof r.from === "string" ? clean(r.from) : base.from,
    lines: strList(r.lines, base.lines),
    tag: optStr(r.tag, base.tag),
    claim: optStr(r.claim, base.claim),
    sub: optStr(r.sub, base.sub),
    includes: strList(r.includes, base.includes),
    offersTitle: optStr(r.offersTitle, base.offersTitle),
    process: strList(r.process, base.process),
    ctaTitle: optStr(r.ctaTitle, base.ctaTitle),
    match,
    groups: groupList(r.groups, base.groups),
  };
  return stripUndefined(out);
}

function normalizeService(raw: unknown, base: SiteServiceContent): SiteServiceContent {
  const r = isRecord(raw) ? raw : {};
  return stripUndefined({
    punch: optStr(r.punch, base.punch),
    desc: optStr(r.desc, base.desc),
    args: strList(r.args, base.args),
    faq: faqList(r.faq, base.faq),
  });
}

function stripUndefined<T extends object>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = item;
  }
  return out as T;
}

/** Clés d'un dictionnaire stocké, filtrées (chaînes courtes non vides). */
function recordKeys(...sources: unknown[]): string[] {
  const keys = new Set<string>();
  for (const source of sources) {
    if (!isRecord(source)) continue;
    for (const key of Object.keys(source)) {
      const k = key.trim();
      if (k && k.length <= KEY_MAX) keys.add(k);
    }
  }
  return [...keys];
}

/**
 * Deep-merge DEFAULT_SITE_CONTENT ← valeur stockée. Chaînes trimées, tableaux
 * filtrés, hex et E.164 validés (sinon défaut). Ne lève jamais.
 */
export function normalizeSiteContent(raw: unknown): SiteContent {
  const d = DEFAULT_SITE_CONTENT;
  const r = isRecord(raw) ? raw : {};
  const brand = isRecord(r.brand) ? r.brand : {};
  const hero = isRecord(r.hero) ? r.hero : {};
  const cta = isRecord(r.cta) ? r.cta : {};
  const footer = isRecord(r.footer) ? r.footer : {};

  let featured: SiteFeatured | null;
  if (r.featured === null) {
    featured = null;
  } else if (isRecord(r.featured)) {
    const base: SiteFeatured = d.featured ?? {
      serviceKey: "",
      kicker: "",
      title: "",
      text: "",
      cta: "",
      chat: [],
    };
    featured = {
      serviceKey: str(r.featured.serviceKey, base.serviceKey).slice(0, KEY_MAX),
      kicker: str(r.featured.kicker, base.kicker),
      title: str(r.featured.title, base.title),
      text: str(r.featured.text, base.text),
      cta: str(r.featured.cta, base.cta),
      chat: chatList(r.featured.chat, base.chat),
    };
  } else {
    featured = d.featured;
  }

  const poles: Record<string, SitePoleContent> = {};
  for (const id of recordKeys(d.poles, r.poles)) {
    const stored = isRecord(r.poles) ? r.poles[id] : undefined;
    poles[id] = normalizePole(stored, d.poles[id] ?? {});
  }
  const services: Record<string, SiteServiceContent> = {};
  for (const key of recordKeys(d.services, r.services)) {
    const stored = isRecord(r.services) ? r.services[key] : undefined;
    services[key] = normalizeService(stored, d.services[key] ?? {});
  }

  return {
    whatsapp:
      typeof r.whatsapp === "string" && validateE164(r.whatsapp) ? r.whatsapp.trim() : d.whatsapp,
    brand: {
      name: str(brand.name, d.brand.name),
      tagline: str(brand.tagline, d.brand.tagline),
    },
    hero: {
      titleA: str(hero.titleA, d.hero.titleA),
      titleB: str(hero.titleB, d.hero.titleB),
      claim: str(hero.claim, d.hero.claim),
      sub: str(hero.sub, d.hero.sub),
      ctaPrimary: str(hero.ctaPrimary, d.hero.ctaPrimary),
      ctaSecondary: str(hero.ctaSecondary, d.hero.ctaSecondary),
      waText: str(hero.waText, d.hero.waText),
    },
    ticker: strList(r.ticker, d.ticker) ?? [],
    cardsTitleA: str(r.cardsTitleA, d.cardsTitleA),
    cardsTitleB: str(r.cardsTitleB, d.cardsTitleB),
    cardsHint: str(r.cardsHint, d.cardsHint),
    featured,
    stepsTitle: str(r.stepsTitle, d.stepsTitle),
    steps: stepList(r.steps, d.steps),
    cta: {
      title: str(cta.title, d.cta.title),
      text: str(cta.text, d.cta.text),
      primary: str(cta.primary, d.cta.primary),
      secondary: str(cta.secondary, d.cta.secondary),
    },
    footer: { line: str(footer.line, d.footer.line) },
    pagesCtaText: str(r.pagesCtaText, d.pagesCtaText),
    genericFaq: faqList(r.genericFaq, d.genericFaq) ?? [],
    poles,
    services,
  };
}

// ─── Templating ──────────────────────────────────────────────────────────────

export interface TemplateContext {
  /** Prix court d'un service actif, `undefined` si inconnu/inactif. */
  price: (serviceKey: string) => string | undefined;
  /** Libellé d'un service actif, `undefined` si inconnu/inactif. */
  label: (serviceKey: string) => string | undefined;
  /** Nombre de pôles affichés. */
  poleCount: number;
  /** Prix minimum global (déjà formaté). */
  minPrice: string;
  /** Noms des pôles affichés, séparés par des virgules (pied de page). */
  poleList: string;
}

const TAG_RE = /\{\{\s*(price|label|count|min|list)\s*:\s*([A-Za-z0-9_-]+)\s*\}\}/g;

/** Retire les espaces en trop laissés par une balise vide (sans toucher aux espaces français avant : ; ! ?). */
function tidySpaces(text: string): string {
  return text
    .replace(/ {2,}/g, " ")
    .replace(/ +([,.)])/g, "$1")
    .replace(/\( +/g, "(")
    .replace(/^ +| +$/gm, "")
    .trim();
}

/**
 * Remplace les balises d'un texte. Clé inconnue ou service inactif → chaîne
 * vide, puis nettoyage des doubles espaces.
 */
export function renderTemplate(text: string, ctx: TemplateContext): string {
  if (!text.includes("{{")) return text;
  const replaced = text.replace(TAG_RE, (_match, kind: string, key: string) => {
    switch (kind) {
      case "price":
        return ctx.price(key) ?? "";
      case "label":
        return ctx.label(key) ?? "";
      case "count":
        return key === "poles" ? String(ctx.poleCount) : "";
      case "min":
        return key === "price" ? ctx.minPrice : "";
      case "list":
        return key === "poles" ? ctx.poleList : "";
      default:
        return "";
    }
  });
  return tidySpaces(replaced);
}

function mapStrings(value: unknown, fn: (text: string) => string): unknown {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, fn));
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = mapStrings(item, fn);
    return out;
  }
  return value;
}

/** Applique `renderTemplate` à TOUTES les chaînes du contenu (structure conservée). */
export function renderSiteContent(content: SiteContent, ctx: TemplateContext): SiteContent {
  return mapStrings(content, (text) => renderTemplate(text, ctx)) as SiteContent;
}
