import { parse } from "node-html-parser";
import { findJsonLdProduct } from "./product-page.js";

// "Decode a Look" for a pasted link (LTK post, blog, Pinterest pin, a product page).
// We don't depend on any one site's page schema. We read the public page once, take its
// caption and cover image from Open Graph, and harvest the outbound shopping links it
// contains. Those links then go through the same verifier as every other product, so
// names, images, and prices come from the retailer's own page, not from the post.

export interface LinkCandidate {
  url: string;
  label: string | null;
  via: "embedded-json" | "anchor" | "raw-url";
}

export interface DecodedLink {
  pageUrl: string;
  title: string | null;
  caption: string | null;
  coverImage: string | null;
  author: string | null;
  isItselfAProduct: boolean;
  links: LinkCandidate[];
}

// Redirectors used by creator platforms and affiliate networks. A hop through one of these is
// how almost every LTK / blog shopping link is built; resolving it reveals the retailer URL.
const AFFILIATE_HOSTS = [
  "liketk.it", "rstyle.me", "shopstyle.it", "shopstyle.com", "go.shopmy.us", "shopmy.us", "amzn.to",
  "howl.me", "howl.link", "click.linksynergy.com", "prf.hn", "anrdoezrs.net", "jdoqocy.com", "tkqlhce.com",
  "dpbolvw.net", "kqzyfj.com", "sjv.io", "pxf.io", "go.skimresources.com", "awin1.com", "shareasale.com",
  "narrativ.com", "bit.ly", "linksta.cc", "magiclinks.com", "joinmavely.com", "mavely.app.link",
];

// Hosts that are never the product itself.
const IGNORE_HOSTS = [
  "shopltk.com", "ltk.app", "rewardstyle.com", "liketoknow.it", "ltkcdn.net", "cloudfront.net",
  "googletagmanager.com", "google-analytics.com", "google.com", "gstatic.com", "googleapis.com",
  "facebook.com", "fbcdn.net", "instagram.com", "cdninstagram.com", "pinterest.com", "pinimg.com",
  "tiktok.com", "twitter.com", "x.com", "youtube.com", "apple.com", "itunes.apple.com", "play.google.com",
  "w3.org", "schema.org", "sentry.io", "segment.io", "segment.com", "braze.com", "branch.io", "app.link",
  "onetrust.com", "cookielaw.org", "doubleclick.net", "adobedtm.com", "nr-data.net", "hotjar.com",
  "fonts.net", "typekit.net", "jsdelivr.net", "unpkg.com",
];

const PRODUCT_PATH = /\/(p|pd|dp|ip|product|products|item|items|listing|pdp|shop\/[^/]+\/[^/]+)\/|\/[a-z0-9-]+-\d{5,}|[?&](pid|sku|productid|itemid)=/i;

export function decodeLinkPage(html: string, pageUrl: string, maxLinks = 25): DecodedLink {
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: false } });
  const meta = new Map<string, string>();
  for (const el of root.querySelectorAll("meta")) {
    const key = (el.getAttribute("property") ?? el.getAttribute("name") ?? "").toLowerCase();
    const content = el.getAttribute("content");
    if (key && content && !meta.has(key)) meta.set(key, content.trim());
  }

  const found = new Map<string, LinkCandidate>();
  const add = (raw: string, label: string | null, via: LinkCandidate["via"]) => {
    const url = normalizeUrl(raw, pageUrl);
    if (!url || !isShoppingLink(url)) return;
    const prev = found.get(url);
    if (!prev || (!prev.label && label)) found.set(url, { url, label: label ?? prev?.label ?? null, via: prev?.via ?? via });
  };

  // 1) Embedded JSON state (Next/Nuxt/etc.): walk for objects that pair a link with a name.
  for (const script of root.querySelectorAll("script")) {
    const type = script.getAttribute("type") ?? "";
    const text = script.textContent;
    if (!text || text.length < 20) continue;
    if (type.includes("json") || script.getAttribute("id") === "__NEXT_DATA__") {
      const data = tryJson(text);
      if (data !== undefined) walkForLinks(maybeUnflatten(data), add);
    }
  }

  // 2) Plain anchors.
  for (const a of root.querySelectorAll("a[href]")) {
    add(a.getAttribute("href") ?? "", clean(a.getAttribute("aria-label") ?? a.text), "anchor");
  }

  // 3) Any affiliate URL anywhere in the page, including inside non-JSON inline script.
  const unescaped = html.replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
  for (const m of unescaped.matchAll(/https?:\/\/[^\s"'<>\\)]+/g)) {
    const u = m[0];
    if (AFFILIATE_HOSTS.some((h) => hostOf(u).endsWith(h))) add(u, null, "raw-url");
  }

  return {
    pageUrl,
    title: clean(meta.get("og:title") ?? root.querySelector("title")?.text ?? null),
    caption: clean(meta.get("og:description") ?? meta.get("description") ?? null),
    coverImage: meta.get("og:image") ?? meta.get("twitter:image") ?? null,
    author: clean(meta.get("author") ?? meta.get("article:author") ?? meta.get("twitter:creator") ?? null),
    isItselfAProduct: findJsonLdProduct(root) !== null || (meta.get("og:type") ?? "").includes("product"),
    links: [...found.values()].slice(0, maxLinks),
  };
}

const LINK_KEYS = ["hyperlink", "product_url", "productUrl", "affiliate_url", "affiliateUrl", "link", "url", "href", "shop_url", "buy_url"];
const NAME_KEYS = ["name", "title", "product_name", "productName", "display_name", "retailer_display_name"];

function walkForLinks(node: unknown, add: (u: string, label: string | null, via: LinkCandidate["via"]) => void, depth = 0): void {
  if (depth > 40 || node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) walkForLinks(item, add, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const link = LINK_KEYS.map((k) => obj[k]).find((v): v is string => typeof v === "string" && /^https?:\/\//.test(v));
  if (link) {
    const name = NAME_KEYS.map((k) => obj[k]).find((v): v is string => typeof v === "string" && v.length > 1) ?? null;
    add(link, name, "embedded-json");
  }
  for (const value of Object.values(obj)) if (typeof value === "object") walkForLinks(value, add, depth + 1);
}

// Nuxt 3 / SvelteKit serialize state with `devalue`: a flat array whose objects point at other
// entries by index. Rebuild it into a normal tree so the walker can read it.
export function maybeUnflatten(data: unknown): unknown {
  if (!Array.isArray(data) || data.length < 2) return data;
  const looksFlat = data.some((v) => typeof v === "object" && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "number"));
  if (!looksFlat) return data;
  const memo = new Map<number, unknown>();
  const hydrate = (i: unknown, depth: number): unknown => {
    if (typeof i !== "number" || i < 0 || i >= data.length || depth > 60) return undefined;
    if (memo.has(i)) return memo.get(i);
    const v = data[i];
    if (Array.isArray(v)) {
      if (typeof v[0] === "string" && ["Reactive", "ShallowReactive", "Ref", "ShallowRef", "NuxtError"].includes(v[0]))
        return hydrate(v[1], depth + 1);
      if (typeof v[0] === "string" && ["Set", "Map", "Date", "RegExp", "BigInt"].includes(v[0])) return undefined;
      const arr: unknown[] = [];
      memo.set(i, arr);
      for (const j of v) arr.push(hydrate(j, depth + 1));
      return arr;
    }
    if (typeof v === "object" && v !== null) {
      const obj: Record<string, unknown> = {};
      memo.set(i, obj);
      for (const [k, j] of Object.entries(v)) obj[k] = hydrate(j, depth + 1);
      return obj;
    }
    memo.set(i, v);
    return v;
  };
  return hydrate(0, 0);
}

function isShoppingLink(u: string): boolean {
  const host = hostOf(u);
  if (!host) return false;
  if (AFFILIATE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return true;
  if (IGNORE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return false;
  if (/\.(png|jpe?g|webp|gif|svg|css|js|woff2?|ico|json)(\?|$)/i.test(u)) return false;
  return PRODUCT_PATH.test(new URL(u).pathname + new URL(u).search);
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeUrl(raw: string, base: string): string | null {
  if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("javascript:")) return null;
  try {
    const u = new URL(raw.trim(), base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function clean(s: string | null): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t || null;
}
