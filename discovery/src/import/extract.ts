/**
 * Media extraction for Personal Import.
 *
 * `parseInput` turns pasted text or an uploaded file (.txt, .csv, .json,
 * .html) into raw candidates. `extractFromHtml` reads a gallery-style page
 * aggressively but on a best-effort basis. `finalize` normalises, collapses
 * size variants, deduplicates against the batch and the library, applies the
 * safety gate, and proposes titles.
 *
 * All of this is pure and synchronous. HTML is parsed with DOMParser, which
 * builds an inert document: page scripts never run and nothing it references
 * is fetched.
 */
import { checkQuery } from '../data/safety';
import { hashString } from '../lib/prng';
import type { Candidate, CandidateFlag, CandidateOrigin, DropCounts, ImportSummary, MediaType } from './types';
import {
  MEDIA_URL_RE,
  classifyUrl,
  extOf,
  hasSizeToken,
  hostOf,
  isAdHost,
  looksLikePageUrl,
  isMediaUrl,
  looksLikeJunk,
  looksLikeThumb,
  normalizeUrl,
  prettyFilename,
  sameSite,
  sizeFromUrl,
  variantKey,
} from './urls';

export interface RawCandidate {
  url: string;
  mediaType: MediaType;
  origin: CandidateOrigin;
  title?: string;
  /** Shared by many items (e.g. og:title), so only a fallback. */
  titleWeak?: boolean;
  originalUrl: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  tags?: string[];
  notes?: string;
  score: number;
  groupId?: string;
  role?: 'next' | 'prev' | 'subpage';
}

export interface Extraction {
  candidates: RawCandidate[];
  dropped: DropCounts;
  pageTitle?: string;
}

export const MIN_SIZE = 200;
const MAX_ITEMS = 2000;

export const emptyDrops = (): DropCounts => ({ junk: 0, ads: 0, refused: 0, invalid: 0, overflow: 0 });

export function addDrops(a: DropCounts, b: DropCounts): DropCounts {
  return { junk: a.junk + b.junk, ads: a.ads + b.ads, refused: a.refused + b.refused, invalid: a.invalid + b.invalid, overflow: (a.overflow ?? 0) + (b.overflow ?? 0) };
}

/** Keep the first MAX_ITEMS; count the rest so the summary can say so. */
function capped(e: Extraction): Extraction {
  if (e.candidates.length <= MAX_ITEMS) return e;
  return { ...e, candidates: e.candidates.slice(0, MAX_ITEMS), dropped: { ...e.dropped, overflow: e.dropped.overflow + e.candidates.length - MAX_ITEMS } };
}

// ---------------------------------------------------------------------------
// Input: text, CSV, JSON, HTML

export type InputKind = 'text' | 'csv' | 'json' | 'html' | 'export';

export interface ParsedInput extends Extraction {
  kind: InputKind;
}

const URL_IN_TEXT = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const MD_LINK = /\[([^\]\n]{1,120})\]\(((?:https?:\/\/|www\.)[^\s)]+)\)/g;

function trimUrlPunct(u: string): string {
  // Sentence punctuation and closing brackets that cling to pasted URLs.
  let s = u.replace(/[.,;:!?]+$/, '');
  while (/[)\]}]$/.test(s) && (s.match(/[([{]/g)?.length ?? 0) < (s.match(/[)\]}]/g)?.length ?? 0)) s = s.slice(0, -1);
  return s;
}

function directCandidate(url: string, extra: Partial<RawCandidate> = {}): RawCandidate {
  const given = Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)) as Partial<RawCandidate>;
  return {
    origin: 'direct',
    score: 10,
    ...sizeFromUrl(url),
    ...given,
    url,
    mediaType: given.mediaType ?? classifyUrl(url),
    originalUrl: given.originalUrl ?? url,
  };
}

/** Plain text: one or many URLs, optionally with a title on the same line or as a Markdown link. */
export function parseText(text: string): Extraction {
  const out: RawCandidate[] = [];
  const dropped = emptyDrops();
  for (const line of text.split(/\r?\n/)) {
    const md = [...line.matchAll(MD_LINK)];
    for (const m of md) {
      const url = normalizeUrl(trimUrlPunct(m[2]));
      if (url) out.push(directCandidate(url, { title: m[1].trim() }));
      else dropped.invalid++;
    }
    // Bare URLs that share a line with Markdown links still count.
    const rest = md.length ? line.replace(MD_LINK, ' ') : line;
    const urls = [...rest.matchAll(URL_IN_TEXT)].map((m) => trimUrlPunct(m[0]));
    if (!urls.length) continue;
    // "Sunset at the pier | https://…" → a title for a single-URL line.
    let title: string | undefined;
    if (urls.length === 1 && !md.length) {
      const rest = line.replace(urls[0], ' ').replace(/^[\s\-–—|:•*>#\d.)]+|[\s\-–—|:•]+$/g, '').trim();
      if (rest.length >= 2 && rest.length <= 100 && /[a-z]/i.test(rest)) title = rest;
    }
    for (const raw of urls) {
      const url = normalizeUrl(raw);
      if (url) out.push(directCandidate(url, title ? { title } : {}));
      else dropped.invalid++;
    }
  }
  return { candidates: out, dropped };
}

/** Minimal RFC-4180-ish CSV reader (quoted fields, escaped quotes, CRLF). */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const head = text.split('\n')[0];
  const count = (ch: string) => head.split(ch).length - 1;
  const delim = count('\t') > count(',') && count('\t') >= count(';') ? '\t' : count(';') > count(',') ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

const COL = {
  url: /^(url|link|href|src|source|image|image[ _]?url|video|video[ _]?url|media|media[ _]?url|file|content[ _]?url)$/i,
  title: /^(title|name|caption|label|alt|description)$/i,
  tags: /^(tags?|keywords?|labels?|categories)$/i,
  type: /^(type|media[ _]?type|kind)$/i,
  original: /^(original|original[ _]?url|page|page[ _]?url|origin|referrer|source[ _]?page)$/i,
  thumb: /^(thumb|thumbnail|thumbnail[ _]?url|poster|preview)$/i,
};

function splitTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(/[,;|#]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function asMediaType(v: unknown): MediaType | undefined {
  const s = String(v ?? '').toLowerCase();
  if (/image|photo|picture|img/.test(s)) return 'image';
  if (/video|clip|movie/.test(s)) return 'video';
  if (/page|link|html|original/.test(s)) return 'page';
  return undefined;
}

export function parseCsv(text: string): Extraction {
  const rows = parseCsvRows(text);
  const out: RawCandidate[] = [];
  const dropped = emptyDrops();
  if (!rows.length) return { candidates: out, dropped };
  const header = rows[0].map((h) => h.trim());
  const idx = (re: RegExp) => header.findIndex((h) => re.test(h));
  const urlCol = idx(COL.url);
  if (urlCol >= 0) {
    const t = idx(COL.title);
    const g = idx(COL.tags);
    const k = idx(COL.type);
    const o = idx(COL.original);
    const th = idx(COL.thumb);
    for (const r of rows.slice(1)) {
      const url = normalizeUrl(r[urlCol] ?? '');
      if (!url) {
        if ((r[urlCol] ?? '').trim()) dropped.invalid++;
        continue;
      }
      out.push(
        directCandidate(url, {
          title: t >= 0 ? r[t]?.trim() || undefined : undefined,
          tags: g >= 0 ? splitTags(r[g]) : undefined,
          mediaType: (k >= 0 ? asMediaType(r[k]) : undefined) ?? classifyUrl(url),
          originalUrl: (o >= 0 ? normalizeUrl(r[o] ?? '') : null) ?? url,
          thumbnailUrl: (th >= 0 ? normalizeUrl(r[th] ?? '') : null) ?? undefined,
        }),
      );
    }
    return { candidates: out, dropped };
  }
  // No recognisable header: scan every cell, first URL per row, first plain cell as its title.
  for (const r of rows) {
    const cells = r.map((c) => c.trim());
    const urls = cells.filter((c) => /^(?:https?:\/\/|www\.)/i.test(c));
    const title = cells.find((c) => c && !/^(?:https?:\/\/|www\.)/i.test(c) && c.length <= 100 && /[a-z]/i.test(c));
    urls.forEach((u, i) => {
      const url = normalizeUrl(u);
      if (url) out.push(directCandidate(url, i === 0 && title ? { title } : {}));
      else dropped.invalid++;
    });
  }
  return { candidates: out, dropped };
}

const URL_KEYS = ['url', 'src', 'href', 'link', 'contentUrl', 'contentURL', 'file', 'image', 'video', 'original', 'full', 'large', 'source', 'media', 'download'];
const TITLE_KEYS = ['title', 'name', 'caption', 'alt', 'label', 'headline'];

/** JSON: our own batch export, arrays of URLs, or any object tree with URL-ish fields. */
export function parseJson(text: string): Extraction & { kind: InputKind } {
  const data = JSON.parse(text) as unknown;
  const out: RawCandidate[] = [];
  const dropped = emptyDrops();
  if (data && typeof data === 'object' && (data as { app?: string }).app === 'ph-discovery-import') {
    const items = (data as { items?: unknown[] }).items ?? [];
    for (const it of items) {
      if (!it || typeof it !== 'object') continue;
      const o = it as Record<string, unknown>;
      const url = normalizeUrl(String(o.url ?? ''));
      if (!url) {
        dropped.invalid++;
        continue;
      }
      out.push(
        directCandidate(url, {
          title: typeof o.title === 'string' ? o.title : undefined,
          tags: splitTags(o.tags),
          mediaType: asMediaType(o.mediaType) ?? classifyUrl(url),
          originalUrl: normalizeUrl(String(o.originalUrl ?? '')) ?? url,
          thumbnailUrl: normalizeUrl(String(o.thumbnailUrl ?? '')) ?? undefined,
          notes: typeof o.notes === 'string' ? o.notes.slice(0, 2000) : undefined,
        }),
      );
    }
    return { ...capped({ candidates: out, dropped }), kind: 'export' };
  }
  const seen = new Set<string>();
  const push = (raw: string, extra: Partial<RawCandidate> = {}) => {
    const url = normalizeUrl(raw);
    if (!url) return;
    if (seen.has(url) || out.length >= MAX_ITEMS) return;
    seen.add(url);
    out.push(directCandidate(url, extra));
  };
  const walk = (v: unknown, depth: number) => {
    if (depth > 10 || out.length >= MAX_ITEMS) return;
    if (typeof v === 'string') {
      if (/^(?:https?:)?\/\//i.test(v.trim())) push(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    const urlKey = URL_KEYS.find((k) => typeof o[k] === 'string' && /^(?:https?:)?\/\//i.test((o[k] as string).trim()));
    if (urlKey) {
      const titleKey = TITLE_KEYS.find((k) => typeof o[k] === 'string' && (o[k] as string).trim());
      const thumbKey = ['thumbnail', 'thumbnailUrl', 'thumb', 'poster', 'preview'].find((k) => typeof o[k] === 'string');
      push(o[urlKey] as string, {
        title: titleKey ? (o[titleKey] as string).trim().slice(0, 140) : undefined,
        tags: splitTags(o.tags ?? o.keywords),
        mediaType: asMediaType(o.mediaType ?? o.type) ?? undefined,
        thumbnailUrl: thumbKey ? normalizeUrl(o[thumbKey] as string) ?? undefined : undefined,
        width: typeof o.width === 'number' ? o.width : undefined,
        height: typeof o.height === 'number' ? o.height : undefined,
      });
    }
    for (const [k, x] of Object.entries(o)) if (k !== urlKey) walk(x, depth + 1);
  };
  walk(data, 0);
  return { candidates: out, dropped, kind: 'json' };
}

export function looksLikeHtml(text: string): boolean {
  return /<(?:!doctype html|html|head|body|img|picture|video|a\s|meta|div|figure|article)\b/i.test(text.slice(0, 20000));
}

/** Base URL of a saved page: <base>, canonical, og:url, or Chrome's "saved from url=" stamp. */
export function savedPageBase(doc: Document, html: string): string | undefined {
  const cands = [
    doc.querySelector('base[href]')?.getAttribute('href'),
    doc.querySelector('link[rel~="canonical"]')?.getAttribute('href'),
    doc.querySelector('meta[property="og:url"]')?.getAttribute('content'),
    /<!--\s*saved from url=\(\d+\)(\S+?)\s*-->/i.exec(html)?.[1],
  ];
  for (const c of cands) {
    const u = c ? normalizeUrl(c) : null;
    if (u) return u;
  }
  return undefined;
}

export function parseInput(text: string, opts: { filename?: string } = {}): ParsedInput {
  const name = opts.filename?.toLowerCase() ?? '';
  const trimmed = text.trim();
  if (!trimmed) return { candidates: [], dropped: emptyDrops(), kind: 'text' };
  if (name.endsWith('.json') || /^[[{]/.test(trimmed)) {
    try {
      const j = parseJson(trimmed);
      return { ...capped(j), kind: j.kind };
    } catch {
      if (name.endsWith('.json')) return { ...capped(parseText(trimmed)), kind: 'text' };
    }
  }
  if (name.endsWith('.html') || name.endsWith('.htm') || looksLikeHtml(trimmed)) {
    const doc = new DOMParser().parseFromString(trimmed, 'text/html');
    const base = savedPageBase(doc, trimmed);
    return { ...capped(extractFromDocument(doc, base)), kind: 'html' };
  }
  if (name.endsWith('.csv') || name.endsWith('.tsv')) return { ...capped(parseCsv(trimmed)), kind: 'csv' };
  // Pasted spreadsheet rows with a header still count as CSV.
  const first = trimmed.split(/\r?\n/)[0];
  if (/[,;\t]/.test(first) && first.split(/[,;\t]/).some((h) => COL.url.test(h.trim()))) return { ...capped(parseCsv(trimmed)), kind: 'csv' };
  return { ...capped(parseText(trimmed)), kind: 'text' };
}

// ---------------------------------------------------------------------------
// HTML gallery extraction

const CHROME_SEL = 'header, footer, nav, aside, [role="banner"], [role="navigation"], [role="contentinfo"], [role="complementary"]';
const AD_CLASS = /(?:^|[\s_-])(ad|ads|advert|advertisement|adsbygoogle|ad-slot|adslot|sponsor|sponsored|promo|promoted|banner)(?:$|[\s_-])/i;
const CONTENT_CLASS = /(gallery|photo|image|media|content|post|entry|article|main|thumb|grid|slide|carousel|lightbox|album|pics?|masonry|portfolio|viewer|figure)/i;
const GALLERY_PATH = /\/(image|images|img|photo|photos|gallery|galleries|media|content|album|albums|pics?|picture|pictures|set|sets)\//i;
const NAV_TEXT = /^(?:next|prev|previous|older|newer|next page|previous page|older posts|newer posts|›|»|→|‹|«|←|>|<|>>|<<)$/i;

const LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-url', 'data-echo', 'data-img', 'data-image'];
const FULL_ATTRS = ['data-orig-file', 'data-full', 'data-full-src', 'data-fullsrc', 'data-large', 'data-large-file', 'data-large_image', 'data-zoom-image', 'data-zoom-src', 'data-hires', 'data-hi-res', 'data-highres', 'data-original-src', 'data-src-large'];
const SRCSET_ATTRS = ['srcset', 'data-srcset', 'data-lazy-srcset'];
const BG_ATTRS = ['data-bg', 'data-background', 'data-background-image', 'data-bg-src', 'data-bgset'];

/** Attributes lightbox scripts (PhotoSwipe, Fancybox, lightGallery, Magnific, GLightbox…) keep the full-size file in. */
const LIGHTBOX_FULL_ATTRS = ['data-pswp-src', 'data-full', 'data-full-src', 'data-fullsrc', 'data-large', 'data-big', 'data-zoom', 'data-zoom-src', 'data-zoom-image', 'data-hires', 'data-original', 'data-image', 'data-img', 'data-src', 'data-href', 'data-download-url'];
const LIGHTBOX_MARK_ATTRS = ['data-fancybox', 'data-lightbox', 'data-pswp-src', 'data-pswp-width', 'data-lg-size', 'data-glightbox', 'data-featherlight', 'data-magnify', 'data-gallery-item', 'data-size'];
const LIGHTBOX_CLASS = /(lightbox|fancybox|swipebox|magnific|mfp-image|photoswipe|pswp|glightbox|lg-item|lightgallery|venobox|colorbox|featherlight|image-popup|popup-image|zoom-image|full-?size)/i;

/** True when a link is driven by a lightbox: its target is shown as a picture, extension or not. */
function isLightbox(a: Element): boolean {
  if (LIGHTBOX_MARK_ATTRS.some((x) => a.hasAttribute(x))) return true;
  if (/\b(lightbox|gallery|prettyphoto|shadowbox)\b/i.test(a.getAttribute('rel') ?? '')) return true;
  if (/iframe|ajax|inline|video|youtube|vimeo/i.test(a.getAttribute('data-type') ?? '')) return false;
  return LIGHTBOX_CLASS.test(classOf(a));
}

/** Full-size dimensions lightboxes publish: data-pswp-width/height, data-size="1600x1200", data-lg-size="1600-1200". */
function lightboxDims(a: Element): { width?: number; height?: number } {
  const w = num(a.getAttribute('data-pswp-width') ?? a.getAttribute('data-width'));
  const h = num(a.getAttribute('data-pswp-height') ?? a.getAttribute('data-height'));
  if (w) return { width: w, height: h };
  const m = /^(\d{2,5})\s*[x×-]\s*(\d{2,5})/.exec(a.getAttribute('data-size') ?? a.getAttribute('data-lg-size') ?? '');
  return m ? { width: +m[1], height: +m[2] } : {};
}

/** The full-size URL a lightbox item points at: a data-* attribute first, then (for lightbox links) the href itself. */
function lightboxTarget(holder: Element, base: string): string | null {
  for (const attr of LIGHTBOX_FULL_ATTRS) {
    const v = holder.getAttribute(attr);
    if (!v || v.trim().startsWith('{') || v.trim().startsWith('[')) continue;
    const u = normalizeUrl(v, base);
    if (u && classifyUrl(u) !== 'video' && !(classifyUrl(u) === 'page' && looksLikePageUrl(u))) return u;
  }
  if (holder.tagName === 'A' && isLightbox(holder)) {
    const href = normalizeUrl(holder.getAttribute('href') ?? '', base);
    if (href && classifyUrl(href) !== 'video' && !(classifyUrl(href) === 'page' && looksLikePageUrl(href))) return href;
  }
  return null;
}

interface Ctx {
  base: string;
  page: string;
  out: Map<string, RawCandidate>;
  dropped: DropCounts;
}

function classOf(el: Element): string {
  return `${el.getAttribute('class') ?? ''} ${el.id ?? ''}`;
}

/** Walk ancestors (bounded) and score where an element sits on the page. */
function placement(el: Element): number {
  let score = 0;
  if (el.closest(CHROME_SEL)) score -= 2;
  let node: Element | null = el;
  let content = false;
  for (let i = 0; node && i < 8; i++, node = node.parentElement) {
    const cls = classOf(node);
    if (AD_CLASS.test(cls) || node.hasAttribute('data-ad') || node.tagName === 'INS') return score - 4;
    if (!content && (node.tagName === 'MAIN' || node.tagName === 'ARTICLE' || node.tagName === 'FIGURE' || CONTENT_CLASS.test(cls))) content = true;
  }
  return score + (content ? 1 : 0);
}

function num(v: string | null | undefined): number | undefined {
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Parse a srcset the way the HTML spec does: a URL is a run of non-whitespace
 * (so commas inside it, as in Cloudinary's `w_400,h_300`, are kept), a trailing
 * comma ends a bare candidate, and descriptors run to the next comma.
 */
export function parseSrcset(srcset: string): { url: string; w?: number; x?: number }[] {
  const out: { url: string; w?: number; x?: number }[] = [];
  let i = 0;
  const n = srcset.length;
  while (i < n) {
    while (i < n && (/\s/.test(srcset[i]) || srcset[i] === ',')) i++;
    if (i >= n) break;
    let j = i;
    while (j < n && !/\s/.test(srcset[j])) j++;
    let url = srcset.slice(i, j);
    i = j;
    let desc = '';
    if (/,+$/.test(url)) url = url.replace(/,+$/, '');
    else {
      let k = i;
      while (k < n && srcset[k] !== ',') k++;
      desc = srcset.slice(i, k).trim();
      i = k;
    }
    if (!url) continue;
    const entry: { url: string; w?: number; x?: number } = { url };
    for (const d of desc.split(/\s+/).filter(Boolean)) {
      const m = /^(\d+(?:\.\d+)?)([wx])$/i.exec(d);
      if (m) entry[m[2].toLowerCase() as 'w' | 'x'] = parseFloat(m[1]);
    }
    out.push(entry);
  }
  return out;
}

/** Best entry of a srcset: largest `w`, else largest `x`, else the last. */
export function bestFromSrcset(srcset: string, base: string): { url: string; width?: number } | null {
  const parts = parseSrcset(srcset);
  if (!parts.length) return null;
  const best = parts.reduce((a, b) => {
    if ((b.w ?? 0) !== (a.w ?? 0)) return (b.w ?? 0) > (a.w ?? 0) ? b : a;
    return (b.x ?? 1) >= (a.x ?? 1) ? b : a;
  });
  const url = normalizeUrl(best.url, base);
  return url ? { url, width: best.w } : null;
}

function add(ctx: Ctx, c: RawCandidate, opts: { direct?: boolean } = {}) {
  if (ctx.out.size >= MAX_ITEMS) return;
  if (isAdHost(c.url)) {
    ctx.dropped.ads++;
    return;
  }
  if (!opts.direct && c.mediaType !== 'page') {
    const w = c.width ?? 0;
    const h = c.height ?? 0;
    const tracking = (w && w <= 3) || (h && h <= 3);
    const svg = extOf(c.url) === 'svg';
    const tinySvg = svg && Math.max(w, h) < 64;
    const known = Math.max(w, h);
    // A junk-looking name only sinks images that aren't known to be big.
    if (tracking || tinySvg || (looksLikeJunk(c.url) && !(known >= 400))) {
      ctx.dropped.junk++;
      return;
    }
    if (known && known < MIN_SIZE) c.score -= 3;
    else if (known >= 800) c.score += 1;
    if (looksLikeThumb(c.url) && c.origin !== 'link') c.score -= 0.5;
  }
  const prev = ctx.out.get(c.url);
  if (!prev) {
    ctx.out.set(c.url, c);
    return;
  }
  // Same URL seen twice on the page (og:image + the gallery): keep the stronger read, merge the rest.
  const keep = c.score > prev.score ? c : prev;
  const other = keep === c ? prev : c;
  ctx.out.set(c.url, {
    ...keep,
    title: keep.title && !keep.titleWeak ? keep.title : other.title && !other.titleWeak ? other.title : keep.title ?? other.title,
    titleWeak: keep.title && !keep.titleWeak ? false : other.title && !other.titleWeak ? false : keep.titleWeak ?? other.titleWeak,
    width: keep.width ?? other.width,
    height: keep.height ?? other.height,
    thumbnailUrl: keep.thumbnailUrl ?? other.thumbnailUrl,
    originalUrl: keep.originalUrl !== ctx.page ? keep.originalUrl : other.originalUrl,
    score: Math.max(keep.score, other.score) + 0.5,
  });
}

function textTitle(s: string | null | undefined): string | undefined {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (t.length < 2 || t.length > 140) return undefined;
  if (/^(image|photo|picture|img|thumbnail|thumb|untitled|null|undefined|\d+)$/i.test(t)) return undefined;
  if (/\.(jpe?g|png|webp|gif|avif|mp4|webm)$/i.test(t)) return undefined;
  return t;
}

function figureCaption(el: Element): string | undefined {
  const fig = el.closest('figure');
  return textTitle(fig?.querySelector('figcaption')?.textContent);
}

function metaTags(doc: Document, ctx: Ctx, pageTitle?: string) {
  const metas = [...doc.querySelectorAll('meta[property], meta[name]')];
  const prop = (m: Element) => (m.getAttribute('property') ?? m.getAttribute('name') ?? '').toLowerCase();
  const val = (key: string) => metas.find((m) => prop(m) === key)?.getAttribute('content');
  const ogW = num(val('og:image:width'));
  const ogH = num(val('og:image:height'));
  const videoType = (val('og:video:type') ?? '').toLowerCase();
  const keys = ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src', 'og:video', 'og:video:url', 'og:video:secure_url', 'twitter:player:stream'];
  const poster = normalizeUrl(val('og:image') ?? val('twitter:image') ?? '', ctx.base) ?? undefined;
  for (const m of metas) {
    const k = prop(m);
    if (!keys.includes(k)) continue;
    const url = normalizeUrl(m.getAttribute('content') ?? '', ctx.base);
    if (!url) continue;
    const isVideo = k.includes('video') || k.includes('player:stream');
    let type: MediaType = classifyUrl(url);
    if (isVideo && type === 'page' && videoType.startsWith('video/')) type = 'video';
    if (isVideo && type !== 'video') continue; // embed players aren't playable media
    if (!isVideo && type === 'page') type = 'image'; // og:image without an extension is still an image
    add(ctx, {
      url,
      mediaType: type,
      origin: 'meta',
      title: pageTitle,
      titleWeak: true,
      originalUrl: ctx.page,
      thumbnailUrl: type === 'video' ? poster : undefined,
      width: !isVideo ? ogW : undefined,
      height: !isVideo ? ogH : undefined,
      score: isVideo ? 4 : 2.5,
    });
  }
  const linkImg = normalizeUrl(doc.querySelector('link[rel="image_src"]')?.getAttribute('href') ?? '', ctx.base);
  if (linkImg) add(ctx, { url: linkImg, mediaType: 'image', origin: 'meta', originalUrl: ctx.page, score: 2, title: pageTitle, titleWeak: true });
}

function videos(doc: Document, ctx: Ctx) {
  for (const v of doc.querySelectorAll('video')) {
    const poster = normalizeUrl(v.getAttribute('poster') ?? v.getAttribute('data-poster') ?? '', ctx.base) ?? undefined;
    const title = textTitle(v.getAttribute('title') ?? v.getAttribute('aria-label')) ?? figureCaption(v);
    const srcs = [v.getAttribute('src'), v.getAttribute('data-src'), ...[...v.querySelectorAll('source')].flatMap((s) => [s.getAttribute('src'), s.getAttribute('data-src')])];
    for (const s of srcs) {
      const url = s ? normalizeUrl(s, ctx.base) : null;
      if (!url) continue;
      const type = classifyUrl(url);
      // A <source> without an extension is still declared video by its element.
      add(ctx, { url, mediaType: type === 'image' ? 'image' : 'video', origin: 'video', title, originalUrl: ctx.page, thumbnailUrl: poster, score: 5 + placement(v) });
    }
  }
}

/** One candidate per <img>/<picture>: the largest believable source, with the visible one as its thumbnail. */
function images(doc: Document, ctx: Ctx, groups: Map<string, RawCandidate[]>) {
  for (const el of doc.querySelectorAll('img, picture source[srcset], picture source[data-srcset]')) {
    if (el.tagName === 'SOURCE' && el.parentElement?.querySelector('img')) continue; // the <img> inside handles it
    let best: { url: string; width?: number; origin: CandidateOrigin } | null = null;
    for (const a of FULL_ATTRS) {
      const u = normalizeUrl(el.getAttribute(a) ?? '', ctx.base);
      if (u && classifyUrl(u) !== 'video') {
        best = { url: u, origin: 'lazy' };
        break;
      }
    }
    const pictureSets = el.tagName === 'IMG' ? [...(el.parentElement?.tagName === 'PICTURE' ? el.parentElement.querySelectorAll('source') : [])] : [];
    for (const holder of [el, ...pictureSets]) {
      if (best) break;
      for (const a of SRCSET_ATTRS) {
        const set = holder.getAttribute(a);
        const b = set ? bestFromSrcset(set, ctx.base) : null;
        if (b) {
          best = { url: b.url, width: b.width, origin: 'srcset' };
          break;
        }
      }
    }
    if (!best) {
      for (const a of LAZY_ATTRS) {
        const u = normalizeUrl(el.getAttribute(a) ?? '', ctx.base);
        if (u) {
          best = { url: u, origin: 'lazy' };
          break;
        }
      }
    }
    const src = normalizeUrl(el.getAttribute('src') ?? '', ctx.base);
    if (!best && src) best = { url: src, origin: 'img' };
    if (!best) continue;

    const w = num(el.getAttribute('width')) ?? best.width ?? sizeFromUrl(best.url).width;
    const h = num(el.getAttribute('height')) ?? sizeFromUrl(best.url).height;
    // Attribute sizes describe the displayed thumbnail; a srcset/full URL is at least that big.
    const sized = best.origin === 'img' ? { width: w, height: h } : { width: best.width ?? sizeFromUrl(best.url).width, height: sizeFromUrl(best.url).height };
    const title = textTitle(el.getAttribute('alt')) ?? textTitle(el.getAttribute('title')) ?? figureCaption(el) ?? textTitle(el.getAttribute('aria-label'));
    const thumb = src && src !== best.url ? src : undefined;
    const anchor = el.closest('a[href]');
    const href = anchor ? normalizeUrl(anchor.getAttribute('href') ?? '', ctx.base) : null;
    // lightGallery and friends also put the full-size file on a wrapper, not just the link.
    const holder = anchor ?? el.parentElement?.closest('[data-pswp-src], [data-full], [data-large], [data-big], [data-zoom-src], [data-src], [data-href]') ?? null;
    const boxed = holder && holder !== el ? lightboxTarget(holder, ctx.base) : null;
    let cand: RawCandidate;
    if (boxed && boxed !== best.url) {
      // A lightbox item: the full-size picture it opens beats the thumbnail on the page.
      cand = {
        url: boxed,
        mediaType: 'image',
        origin: 'link',
        title: title ?? textTitle(holder?.getAttribute('title') ?? holder?.getAttribute('data-caption') ?? holder?.getAttribute('data-sub-html')),
        originalUrl: ctx.page,
        thumbnailUrl: thumb ?? best.url,
        score: 4.5 + placement(el),
        ...sizeFromUrl(boxed),
        ...lightboxDims(holder!),
      };
    } else if (href && isMediaUrl(href) && classifyUrl(href) === 'image') {
      // Thumbnail linking to the full-size file: the classic gallery tile.
      cand = { url: href, mediaType: 'image', origin: 'link', title: title ?? textTitle(anchor?.getAttribute('title')), originalUrl: ctx.page, thumbnailUrl: thumb ?? best.url, score: 4 + placement(el), ...sizeFromUrl(href) };
    } else if (href && isMediaUrl(href) && classifyUrl(href) === 'video') {
      cand = { url: href, mediaType: 'video', origin: 'link', title: title ?? textTitle(anchor?.getAttribute('title')), originalUrl: ctx.page, thumbnailUrl: best.url, score: 4.5 + placement(el) };
    } else {
      const detailPage = href && sameSite(href, ctx.page) && href !== ctx.page ? href : undefined;
      cand = {
        url: best.url,
        mediaType: classifyUrl(best.url) === 'video' ? 'video' : 'image',
        origin: best.origin,
        title,
        originalUrl: detailPage ?? ctx.page,
        thumbnailUrl: thumb,
        ...sized,
        score: 2 + placement(el) + (detailPage && GALLERY_PATH.test(detailPage) ? 1 : 0),
      };
    }
    add(ctx, cand);
    const kept = ctx.out.get(cand.url);
    if (kept) {
      const sig = `${anchor ? 'a' : 'img'}|${dirTemplate(anchor && href ? href : cand.url)}`;
      groups.set(sig, [...(groups.get(sig) ?? []), kept]);
    }
  }
}

/** Host + directory with digit runs wildcarded: siblings in one gallery share it. */
function dirTemplate(url: string): string {
  try {
    const u = new URL(url);
    const dir = u.pathname.replace(/\/[^/]*$/, '/');
    return `${u.hostname}${dir.replace(/\d+/g, '#')}`;
  } catch {
    return url;
  }
}

function links(doc: Document, ctx: Ctx) {
  let sub = 0;
  for (const a of doc.querySelectorAll('a[href]')) {
    const href = normalizeUrl(a.getAttribute('href') ?? '', ctx.base);
    if (!href || href === ctx.page) continue;
    if (a.querySelector('img')) continue; // handled with its image
    const text = (a.textContent ?? '').replace(/\s+/g, ' ').trim();
    const rel = (a.getAttribute('rel') ?? '').toLowerCase();
    const label = `${a.getAttribute('aria-label') ?? ''} ${a.getAttribute('title') ?? ''}`.trim();
    const cls = classOf(a);
    if (isMediaUrl(href)) {
      add(ctx, { url: href, mediaType: classifyUrl(href), origin: 'link', title: textTitle(text) ?? textTitle(label), originalUrl: ctx.page, score: 4 + placement(a), ...sizeFromUrl(href), ...lightboxDims(a) });
      continue;
    }
    const boxed = lightboxTarget(a, ctx.base);
    if (boxed) {
      add(ctx, { url: boxed, mediaType: 'image', origin: 'link', title: textTitle(a.getAttribute('data-caption')) ?? textTitle(label) ?? textTitle(text), originalUrl: ctx.page, score: 4 + placement(a), ...sizeFromUrl(boxed), ...lightboxDims(a) });
      continue;
    }
    if (!sameSite(href, ctx.page)) continue;
    const navRole =
      /\bnext\b/.test(rel) || /^next\b/i.test(label) || NAV_TEXT.test(text) && /^(next|older|›|»|→|>|>>)/i.test(text) || /(^|[\s_-])next([\s_-]|$)/i.test(cls)
        ? 'next'
        : /\bprev\b/.test(rel) || /^prev/i.test(label) || NAV_TEXT.test(text) || /(^|[\s_-])prev(ious)?([\s_-]|$)/i.test(cls)
          ? 'prev'
          : undefined;
    if (navRole) {
      add(ctx, { url: href, mediaType: 'page', origin: 'nav', role: navRole, title: navRole === 'next' ? 'Next page' : 'Previous page', originalUrl: href, score: 0 });
      continue;
    }
    if (GALLERY_PATH.test(href) && sub < 40) {
      sub++;
      add(ctx, { url: href, mediaType: 'page', origin: 'nav', role: 'subpage', title: textTitle(text) ?? textTitle(label), originalUrl: href, score: 0 });
    }
  }
  for (const l of doc.querySelectorAll('link[rel~="next"], link[rel~="prev"]')) {
    const href = normalizeUrl(l.getAttribute('href') ?? '', ctx.base);
    if (!href || href === ctx.page) continue;
    const role = /next/.test(l.getAttribute('rel') ?? '') ? 'next' : 'prev';
    add(ctx, { url: href, mediaType: 'page', origin: 'nav', role, title: role === 'next' ? 'Next page' : 'Previous page', originalUrl: href, score: 0 });
  }
}

function jsonLd(doc: Document, ctx: Ctx) {
  const visit = (node: unknown, depth: number) => {
    if (depth > 8 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((n) => visit(n, depth + 1));
      return;
    }
    const o = node as Record<string, unknown>;
    const types = ([] as unknown[]).concat(o['@type'] ?? []).map(String);
    const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : undefined);
    const dim = (v: unknown) => (typeof v === 'number' ? v : num(typeof v === 'string' ? v : typeof v === 'object' && v ? String((v as { value?: unknown }).value ?? '') : undefined));
    const title = textTitle(str(o.name) ?? str(o.caption) ?? str(o.headline));
    if (types.includes('ImageObject')) {
      const url = normalizeUrl(str(o.contentUrl) ?? str(o.url) ?? '', ctx.base);
      if (url) add(ctx, { url, mediaType: 'image', origin: 'jsonld', title, originalUrl: ctx.page, thumbnailUrl: normalizeUrl(str(o.thumbnailUrl) ?? '', ctx.base) ?? undefined, width: dim(o.width), height: dim(o.height), score: 3.5 });
    }
    if (types.includes('VideoObject')) {
      const url = normalizeUrl(str(o.contentUrl) ?? '', ctx.base);
      const thumb = normalizeUrl(str(o.thumbnailUrl) ?? '', ctx.base) ?? undefined;
      if (url && classifyUrl(url) !== 'image') add(ctx, { url, mediaType: 'video', origin: 'jsonld', title, originalUrl: ctx.page, thumbnailUrl: thumb, score: 4.5 });
    }
    for (const [k, v] of Object.entries(o)) {
      if (k === 'image' || k === 'images' || k === 'associatedMedia' || k === 'hasPart' || k === '@graph' || k === 'video' || k === 'itemListElement' || k === 'item') {
        if (typeof v === 'string' || (Array.isArray(v) && v.every((x) => typeof x === 'string'))) {
          for (const s of ([] as string[]).concat(v as string | string[])) {
            const url = normalizeUrl(s, ctx.base);
            if (url) add(ctx, { url, mediaType: classifyUrl(url) === 'video' ? 'video' : 'image', origin: 'jsonld', title: title ?? undefined, titleWeak: true, originalUrl: ctx.page, score: 3 });
          }
        } else visit(v, depth + 1);
      }
    }
  };
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const text = s.textContent ?? '';
    try {
      visit(JSON.parse(text), 0);
    } catch {
      scanText(text, ctx, 'jsonld', 2.5);
    }
  }
}

/** Unescape JSON-in-JS strings so `https:\/\/cdn/x.jpg` reads as a URL. */
function unescapeScript(text: string): string {
  return text
    .replace(/\\u002[fF]/g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/\\u003[dD]/g, '=')
    .replace(/\\\//g, '/');
}

function scanText(text: string, ctx: Ctx, origin: CandidateOrigin, score: number) {
  const clean = unescapeScript(text);
  for (const m of clean.matchAll(MEDIA_URL_RE)) {
    const url = normalizeUrl(m[0], ctx.base);
    if (url) add(ctx, { url, mediaType: classifyUrl(url), origin, originalUrl: ctx.page, score, ...sizeFromUrl(url) });
  }
  // Root-relative paths inside JSON: "/uploads/2024/05/pier.jpg"
  for (const m of clean.matchAll(/["'](\/[^"'\s<>]+?\.(?:jpe?g|png|webp|gif|avif|mp4|webm|mov|m4v))(?:\?[^"'\s<>]*)?["']/gi)) {
    const url = normalizeUrl(m[1], ctx.base);
    if (url) add(ctx, { url, mediaType: classifyUrl(url), origin, originalUrl: ctx.page, score: score - 0.5, ...sizeFromUrl(url) });
  }
}

/** schema.org microdata: <a itemprop="contentUrl" href>, <meta itemprop="image" content>, <img itemprop="image">. */
function microdata(doc: Document, ctx: Ctx) {
  for (const el of doc.querySelectorAll('[itemprop~="contentUrl"], [itemprop~="contentURL"], [itemprop~="image"], [itemprop~="thumbnailUrl"]')) {
    const raw = el.getAttribute('href') ?? el.getAttribute('content') ?? el.getAttribute('src') ?? el.getAttribute('data-src');
    const url = raw ? normalizeUrl(raw, ctx.base) : null;
    if (!url || (classifyUrl(url) === 'page' && looksLikePageUrl(url))) continue;
    const scope = el.closest('[itemscope]');
    const thumb = /thumbnail/i.test(el.getAttribute('itemprop') ?? '');
    add(ctx, {
      url,
      mediaType: classifyUrl(url) === 'video' || /VideoObject/.test(scope?.getAttribute('itemtype') ?? '') ? 'video' : 'image',
      origin: 'jsonld',
      title: textTitle(scope?.querySelector('[itemprop~="name"], [itemprop~="caption"]')?.textContent ?? scope?.querySelector('[itemprop~="name"]')?.getAttribute('content')),
      originalUrl: ctx.page,
      score: thumb ? 1 : 3.5,
      ...sizeFromUrl(url),
    });
  }
}

const GALLERY_KEY = /^(images?|photos?|pictures?|pics|gallery|galleries|media|slides?|items|assets|files|entries|nodes|edges|thumbs?|album)$/i;
/** Keys that hold a picture's URL, best (full size) first. */
const BEST_URL_KEYS = ['original', 'orig', 'originalurl', 'original_url', 'full', 'fullsize', 'full_size', 'fullurl', 'full_url', 'fullres', 'large', 'largeurl', 'large_url', 'hires', 'hi_res', 'highres', 'high_res', 'zoom', 'big', 'max', 'xxl', 'xl', 'download', 'downloadurl', 'download_url', 'src', 'url', 'image', 'img', 'photo', 'file', 'href', 'contenturl', 'link', 'path', 'source'];
const THUMB_KEY = /thumb|small|preview|^sq$|square|tiny|mini|icon|avatar|poster|blur|placeholder|lqip/i;
const URLISH = /^(?:https?:)?\/\/[^\s"']+$|^\/[^\s"']+\.[a-z0-9]{2,5}(?:\?[^\s"']*)?$/i;

/** Keys that just say "here's the URL"; the meaning is in the key around them ({ large: { src } }). */
const GENERIC_URL_KEYS = new Set(['src', 'url', 'href', 'path', 'source', 'file', 'link']);
const keyFor = (outer: string, inner: string) => (THUMB_KEY.test(outer) ? `thumb_${inner}` : GENERIC_URL_KEYS.has(inner.toLowerCase()) ? outer : inner);

interface Variant {
  url: string;
  rank: number;
  width?: number;
  height?: number;
  thumb: boolean;
}

/** Every URL an item object carries (itself and one level of nested size maps), ranked by key and size. */
function itemVariants(o: Record<string, unknown>, base: string): Variant[] {
  const out: Variant[] = [];
  const consider = (key: string, v: unknown, w?: number, h?: number) => {
    if (typeof v !== 'string' || !URLISH.test(v.trim())) return;
    const url = normalizeUrl(v, base);
    if (!url) return;
    const k = key.toLowerCase().replace(/[^a-z_]/g, '');
    const idx = BEST_URL_KEYS.indexOf(k);
    const thumb = THUMB_KEY.test(key);
    const sz = sizeFromUrl(url);
    out.push({ url, rank: (idx < 0 ? 0 : BEST_URL_KEYS.length - idx) - (thumb ? 50 : 0), width: w ?? sz.width, height: h ?? sz.height, thumb });
  };
  const dim = (x: Record<string, unknown>, ...keys: string[]) => keys.map((k) => x[k]).find((v): v is number => typeof v === 'number' && v > 0);
  const ow = dim(o, 'width', 'w', 'naturalWidth');
  const oh = dim(o, 'height', 'h', 'naturalHeight');
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string') consider(k, v, ow, oh);
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      // { sizes: { thumb: {url,width}, large: {url,width} } } or { large: { src, w } }
      const inner = v as Record<string, unknown>;
      const iw = dim(inner, 'width', 'w');
      const ih = dim(inner, 'height', 'h');
      for (const [k2, v2] of Object.entries(inner)) {
        if (typeof v2 === 'string') consider(keyFor(k, k2), v2, iw, ih);
        else if (v2 && typeof v2 === 'object' && !Array.isArray(v2)) {
          const deep = v2 as Record<string, unknown>;
          const url = ['url', 'src', 'source', 'href'].map((x) => deep[x]).find((x) => typeof x === 'string');
          if (url) consider(THUMB_KEY.test(k) ? `thumb_${k2}` : k2, url, dim(deep, 'width', 'w'), dim(deep, 'height', 'h'));
        }
      }
    }
  }
  return out;
}

const variantArea = (v: Variant) => (v.width ?? 0) * (v.height ?? v.width ?? 0);

/**
 * Walk parsed page data for gallery arrays (`images: [...]`, `photos: [...]`,
 * or any run of 3+ objects carrying picture URLs), one candidate per item,
 * keeping its largest version and its thumbnail. URLs without an extension are
 * accepted here: the key and the gallery context say they're pictures.
 */
function walkGalleryJson(node: unknown, ctx: Ctx, depth = 0, key = '') {
  if (depth > 14 || !node || typeof node !== 'object' || ctx.out.size >= MAX_ITEMS) return;
  if (Array.isArray(node)) {
    const objs = node.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x));
    const withUrls = objs.map((o) => ({ o, vs: itemVariants(o, ctx.base) })).filter((x) => x.vs.length);
    if (withUrls.length && (GALLERY_KEY.test(key) || withUrls.length >= 3)) {
      for (const { o, vs } of withUrls) {
        const full = vs.filter((v) => !v.thumb);
        const pool = full.length ? full : vs;
        const best = pool.reduce((a, b) => (variantArea(b) !== variantArea(a) ? (variantArea(b) > variantArea(a) ? b : a) : b.rank > a.rank ? b : a));
        const thumb = vs.filter((v) => v.url !== best.url).sort((a, b) => Number(b.thumb) - Number(a.thumb) || variantArea(a) - variantArea(b))[0];
        const title = ['title', 'caption', 'alt', 'name', 'description'].map((k) => o[k]).find((x): x is string => typeof x === 'string');
        const type = classifyUrl(best.url);
        if (type === 'page' && looksLikePageUrl(best.url)) continue;
        add(ctx, { url: best.url, mediaType: type === 'video' ? 'video' : 'image', origin: 'json', title: textTitle(title), originalUrl: ctx.page, thumbnailUrl: thumb?.url, width: best.width, height: best.height, score: 3 });
      }
    }
    node.forEach((x) => walkGalleryJson(x, ctx, depth + 1, key));
    return;
  }
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) if (v && typeof v === 'object') walkGalleryJson(v, ctx, depth + 1, k);
}

/** Parse the JSON a script carries: a JSON script, or `window.X = {...};` / `var x = [...]` assignments. */
function scriptJson(text: string, type: string): unknown[] {
  const t = text.trim();
  const tries: string[] = [];
  if (type.includes('json') || /^[[{]/.test(t)) tries.push(t);
  for (const m of t.matchAll(/(?:=|:)\s*(?=[[{])/g)) {
    const start = (m.index ?? 0) + m[0].length;
    const open = t[start];
    const close = open === '{' ? '}' : ']';
    const end = t.lastIndexOf(close);
    if (end > start) tries.push(t.slice(start, end + 1));
    if (tries.length > 4) break;
  }
  const out: unknown[] = [];
  for (const candidate of tries) {
    try {
      out.push(JSON.parse(candidate));
      break;
    } catch {
      /* not JSON on its own; try the next slice */
    }
  }
  return out;
}

function inlineJson(doc: Document, ctx: Ctx) {
  for (const s of doc.querySelectorAll('script:not([src])')) {
    const type = (s.getAttribute('type') ?? '').toLowerCase();
    if (type === 'application/ld+json') continue;
    const text = s.textContent ?? '';
    if (text.length > 3_000_000) continue;
    // __NEXT_DATA__ / window.__INITIAL_STATE__ / gallery configs: mostly exactly the gallery.
    const galleryish = /gallery|photos|images|slides|media|album|__NEXT_DATA__|__NUXT__|INITIAL_STATE/i.test(text.slice(0, 4000)) || type === 'application/json';
    // Structured first (largest version per item, extension-less URLs allowed), then a regex sweep for the rest.
    if (galleryish && text.length < 1_500_000) for (const data of scriptJson(text, type)) walkGalleryJson(data, ctx);
    scanText(text, ctx, 'json', galleryish ? 1.5 : 0.5);
  }
  // Gallery widgets often carry their data on an attribute: data-gallery='[{"src": …}]'
  for (const el of doc.querySelectorAll('[data-gallery], [data-images], [data-photos], [data-items], [data-slides], [data-media], [data-lightbox-gallery], [data-dynamic-el]')) {
    for (const a of ['data-gallery', 'data-images', 'data-photos', 'data-items', 'data-slides', 'data-media', 'data-lightbox-gallery', 'data-dynamic-el']) {
      const v = el.getAttribute(a);
      if (!v) continue;
      try {
        walkGalleryJson(JSON.parse(v), ctx, 0, 'gallery');
      } catch {
        /* not JSON: the sweep below still reads its URLs */
      }
      scanText(v, ctx, 'json', 2 + placement(el));
    }
  }
}

function backgrounds(doc: Document, ctx: Ctx) {
  const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  // `[style]` + a text check rather than `[style*="url("]`: some selector engines trip on the paren.
  for (const el of doc.querySelectorAll('[style], [data-bg], [data-background], [data-background-image], [data-bg-src], [data-bgset]')) {
    if (!/url\(/i.test(el.getAttribute('style') ?? '') && !BG_ATTRS.some((a) => el.hasAttribute(a))) continue;
    const place = placement(el);
    if (place < 1) continue; // only inside likely content containers
    const found: string[] = [];
    for (const m of (el.getAttribute('style') ?? '').matchAll(urlRe)) found.push(m[2]);
    for (const a of BG_ATTRS) {
      const v = el.getAttribute(a);
      if (!v) continue;
      const inner = [...v.matchAll(urlRe)].map((m) => m[2]);
      found.push(...(inner.length ? inner : [v.split(/[\s,]/)[0]]));
    }
    for (const f of found) {
      const url = normalizeUrl(f, ctx.base);
      if (url && classifyUrl(url) !== 'video') {
        add(ctx, { url, mediaType: 'image', origin: 'style', title: textTitle(el.getAttribute('aria-label') ?? el.getAttribute('title')), originalUrl: ctx.page, score: 1 + place, ...sizeFromUrl(url) });
      }
    }
  }
}

export function extractFromDocument(doc: Document, pageUrl: string | undefined): Extraction {
  const page = pageUrl ?? '';
  const baseHref = doc.querySelector('base[href]')?.getAttribute('href');
  const base = (baseHref && normalizeUrl(baseHref, page || undefined)) || page || undefined;
  const ctx: Ctx = { base: base ?? '', page, out: new Map(), dropped: emptyDrops() };
  if (!base) {
    // Without a base, relative URLs can't be resolved; absolute ones still work.
    ctx.base = 'https://invalid.invalid/';
  }
  const pageTitle =
    textTitle(doc.querySelector('meta[property="og:title"]')?.getAttribute('content')) ?? textTitle(doc.querySelector('title')?.textContent) ?? undefined;
  const groups = new Map<string, RawCandidate[]>();
  metaTags(doc, ctx, pageTitle);
  videos(doc, ctx);
  images(doc, ctx, groups);
  links(doc, ctx);
  jsonLd(doc, ctx);
  microdata(doc, ctx);
  inlineJson(doc, ctx);
  backgrounds(doc, ctx);
  // Gallery sets: three or more siblings sharing a directory template.
  for (const [sig, members] of groups) {
    const unique = [...new Set(members.map((m) => m.url))];
    if (unique.length < 3) continue;
    const id = `g${hashString(sig).toString(36)}`;
    for (const u of unique) {
      const c = ctx.out.get(u);
      if (c && !c.groupId) ctx.out.set(u, { ...c, groupId: id, score: c.score + 2 });
    }
  }
  const SENTINEL = 'https://invalid.invalid/';
  // A URL that is some other candidate's thumbnail is that picture again, smaller: not its own item.
  // (Video posters don't count: a poster can be a picture in its own right.)
  const thumbOf = new Map<string, string>();
  for (const c of ctx.out.values()) if (c.thumbnailUrl && c.mediaType === 'image' && c.thumbnailUrl !== c.url) thumbOf.set(c.thumbnailUrl, c.url);
  const candidates: RawCandidate[] = [];
  for (const c of ctx.out.values()) {
    if (thumbOf.has(c.url) && c.origin !== 'link' && c.origin !== 'video') continue;
    if (c.url.startsWith(SENTINEL)) {
      ctx.dropped.invalid++; // relative URL on a page we have no address for
      continue;
    }
    candidates.push({
      ...c,
      thumbnailUrl: c.thumbnailUrl?.startsWith(SENTINEL) ? undefined : c.thumbnailUrl,
      originalUrl: c.originalUrl.startsWith(SENTINEL) ? '' : c.originalUrl,
    });
  }
  return { candidates, dropped: ctx.dropped, pageTitle };
}

export function extractFromHtml(html: string, pageUrl: string): Extraction {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return extractFromDocument(doc, pageUrl);
}

// ---------------------------------------------------------------------------
// Finalize: variants, duplicates, safety, titles, defaults

export interface FinalizeOptions {
  /** Keys (normalised URLs) already in the library. */
  existing?: Set<string>;
  /** Page URLs that were scanned (their own rows become sources, not clips). */
  scanned?: Map<string, { ok: boolean; found: number; error?: Candidate['error'] }>;
  /** Titles of scanned pages, for "Page title – #n" fallbacks. */
  pageTitles?: Map<string, string>;
}

export interface Finalized {
  candidates: Candidate[];
  summary: ImportSummary;
}

function area(c: RawCandidate): number {
  return (c.width ?? 0) * (c.height ?? c.width ?? 0);
}

/** Safety gate over everything a clip carries as text: title, tags, and the URL's words. */
/**
 * Decode percent-escapes one at a time, so a single malformed `%` can't make
 * the whole string fall back to its encoded (and unmatchable) form.
 */
export function lenientDecode(s: string): string {
  const plus = s.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(plus);
  } catch {
    return plus.replace(/(?:%[0-9a-f]{2})+/gi, (run) => {
      try {
        return decodeURIComponent(run);
      } catch {
        return ' ';
      }
    }).replace(/%/g, ' ');
  }
}

/** The words a URL carries: host, path, and query, decoded and split. */
export function urlWords(u: string): string {
  let raw = u;
  try {
    const x = new URL(u);
    raw = `${x.hostname} ${x.pathname} ${x.search}`;
  } catch {
    /* not a URL: use as-is */
  }
  return lenientDecode(raw).replace(/[/_.?=&%#:;,~-]+/g, ' ');
}

/** Safety gate over everything a clip carries as text: title, tags, notes, and every URL's words. */
export function safetyText(c: { url: string; title?: string; tags?: string[]; originalUrl?: string; thumbnailUrl?: string; notes?: string }): string {
  const urls = [...new Set([c.url, c.originalUrl, c.thumbnailUrl].filter((u): u is string => !!u))];
  return [c.title ?? '', ...(c.tags ?? []), c.notes ?? '', ...urls.map(urlWords)].join(' ');
}

/** True when free text (a title, tag, name, or note) passes the same gate as search. */
export function textIsSafe(...parts: (string | string[] | undefined)[]): boolean {
  return checkQuery(parts.flat().filter(Boolean).join(' ')).ok;
}

export function finalize(raws: RawCandidate[], dropped: DropCounts, opts: FinalizeOptions = {}): Finalized {
  const drops = { ...dropped };
  let duplicates = 0;
  // 1. Safety gate.
  const safe = raws.filter((c) => {
    if (checkQuery(safetyText(c)).ok) return true;
    drops.refused++;
    return false;
  });
  // 2. Exact duplicates (direct input first, so a pasted title wins).
  const byUrl = new Map<string, RawCandidate>();
  for (const c of safe) {
    const prev = byUrl.get(c.url);
    if (!prev) {
      byUrl.set(c.url, c);
      continue;
    }
    duplicates++;
    const keep = prev.origin === 'direct' || prev.score >= c.score ? prev : c;
    const other = keep === prev ? c : prev;
    byUrl.set(c.url, {
      ...keep,
      title: keep.title ?? other.title,
      tags: [...new Set([...(keep.tags ?? []), ...(other.tags ?? [])])],
      notes: keep.notes ?? other.notes,
      thumbnailUrl: keep.thumbnailUrl ?? other.thumbnailUrl,
      width: keep.width ?? other.width,
      height: keep.height ?? other.height,
      groupId: keep.groupId ?? other.groupId,
    });
  }
  // 3. Collapse size variants of one image into its largest believable version.
  const byVariant = new Map<string, RawCandidate[]>();
  const order: string[] = [];
  for (const c of byUrl.values()) {
    const k = c.mediaType === 'image' ? `i:${variantKey(c.url)}` : `u:${c.url}`;
    if (!byVariant.has(k)) order.push(k);
    byVariant.set(k, [...(byVariant.get(k) ?? []), c]);
  }
  const merged: RawCandidate[] = [];
  for (const k of order) {
    const group = byVariant.get(k)!;
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }
    duplicates += group.length - 1;
    // A file name without a size token is the original upload; sized copies are derived from it.
    const rankArea = (c: RawCandidate) => (hasSizeToken(c.url) ? area(c) : Number.MAX_SAFE_INTEGER);
    const ranked = [...group].sort(
      (a, b) =>
        Number(b.origin === 'direct') - Number(a.origin === 'direct') ||
        Number(looksLikeThumb(a.url)) - Number(looksLikeThumb(b.url)) ||
        rankArea(b) - rankArea(a) ||
        area(b) - area(a) ||
        b.score - a.score,
    );
    const best = ranked[0];
    const smallest = [...group].filter((g) => g.url !== best.url).sort((a, b) => Number(looksLikeThumb(b.url)) - Number(looksLikeThumb(a.url)) || area(a) - area(b))[0];
    merged.push({
      ...best,
      title: best.title && !best.titleWeak ? best.title : group.find((g) => g.title && !g.titleWeak)?.title ?? best.title,
      titleWeak: !(best.title && !best.titleWeak) && !group.some((g) => g.title && !g.titleWeak),
      thumbnailUrl: best.thumbnailUrl ?? smallest?.url,
      score: Math.max(...group.map((g) => g.score)) + 0.5,
      groupId: best.groupId ?? group.find((g) => g.groupId)?.groupId,
      tags: [...new Set(group.flatMap((g) => g.tags ?? []))],
      originalUrl: best.originalUrl !== best.url ? best.originalUrl : group.find((g) => g.originalUrl !== g.url)?.originalUrl ?? best.originalUrl,
    });
  }
  // 4. Flags, defaults, titles.
  const counters = new Map<string, number>();
  const out: Candidate[] = merged.map((c) => {
    const flags: CandidateFlag[] = [];
    const scan = c.mediaType === 'page' && !c.role ? opts.scanned?.get(c.url) : undefined;
    let include = c.score >= 1;
    let error: Candidate['error'];
    if (opts.existing?.has(c.url)) {
      flags.push('in-library');
      include = false;
    }
    if (c.role === 'next' || c.role === 'prev') {
      flags.push('next-page');
      include = false;
    } else if (c.role === 'subpage') {
      flags.push('linked-page');
      include = false;
    } else if (c.mediaType === 'page') {
      if (!scan) flags.push('unscanned');
      else if (!scan.ok) {
        // Nothing readable: offered as an open-original bookmark, but not ticked, so a
        // failed gallery doesn't quietly become a blank card in the feed.
        flags.push('scan-failed');
        error = scan.error;
        include = false;
      } else if (scan.found > 0) include = false; // its media made it in; the page itself is just the source
    }
    const known = Math.max(c.width ?? 0, c.height ?? 0);
    if (known && known < MIN_SIZE && c.mediaType === 'image') flags.push('small');
    if (c.score < 1 && c.mediaType !== 'page') flags.push('low-confidence');
    if (flags.includes('in-library')) include = false;
    const host = hostOf(c.originalUrl || c.url) || hostOf(c.url);
    const given = c.title && !c.titleWeak ? c.title : undefined;
    let title = given ?? prettyFilename(c.url);
    if (!title) {
      const n = (counters.get(host) ?? 0) + 1;
      counters.set(host, n);
      const pageTitle = c.title ?? opts.pageTitles?.get(c.originalUrl);
      title = `${pageTitle && c.mediaType !== 'page' ? pageTitle : host} – #${n}`;
    }
    return {
      key: c.url,
      url: c.url,
      mediaType: c.mediaType,
      title: title.slice(0, 140),
      originalUrl: c.originalUrl || c.url,
      thumbnailUrl: c.thumbnailUrl && c.thumbnailUrl !== c.url ? c.thumbnailUrl : c.mediaType === 'image' ? undefined : c.thumbnailUrl,
      width: c.width,
      height: c.height,
      tags: c.tags ?? [],
      notes: c.notes,
      origin: c.origin,
      score: Math.round(c.score * 10) / 10,
      include,
      flags,
      groupId: c.groupId,
      role: c.role,
      error,
    };
  });
  return { candidates: out, summary: summarize(out, duplicates, drops) };
}

export function summarize(cands: Candidate[], duplicates: number, dropped: DropCounts): ImportSummary {
  const clips = cands.filter((c) => !c.role);
  return {
    total: clips.length,
    included: clips.filter((c) => c.include).length,
    images: clips.filter((c) => c.mediaType === 'image').length,
    videos: clips.filter((c) => c.mediaType === 'video').length,
    pages: clips.filter((c) => c.mediaType === 'page').length,
    duplicates,
    inLibrary: clips.filter((c) => c.flags.includes('in-library')).length,
    failed: clips.filter((c) => c.flags.includes('scan-failed')).length,
    dropped,
  };
}
