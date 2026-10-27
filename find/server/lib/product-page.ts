import { parse, type HTMLElement } from "node-html-parser";

// What a page says about itself. Every field comes from the page's own markup
// (JSON-LD, Open Graph, microdata). Nothing here is inferred or generated: a price we
// can't read from structured data is null and the card shows "price unavailable".
export interface ProductPage {
  isProduct: boolean;
  title: string | null;
  image: string | null;
  price: number | null;
  currency: string | null;
  priceSource: "json-ld" | "meta" | "microdata" | null;
  availability: "in_stock" | "out_of_stock" | "preorder" | "unknown";
  brand: string | null;
  canonicalUrl: string | null;
  siteName: string | null;
  description: string | null;
  signals: string[];
}

export function parseProductPage(html: string, pageUrl: string): ProductPage {
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: false } });
  const signals: string[] = [];

  const meta = readMeta(root);
  const ld = findJsonLdProduct(root);
  if (ld) signals.push("json-ld:Product");

  const ogType = meta.get("og:type")?.toLowerCase() ?? "";
  if (ogType.includes("product")) signals.push(`og:type=${ogType}`);

  const metaPrice = firstNumber(
    meta.get("product:price:amount"),
    meta.get("og:price:amount"),
    meta.get("product:sale_price:amount"),
  );
  if (metaPrice !== null) signals.push("meta:price");

  const microPrice = readMicrodataPrice(root);
  if (microPrice) signals.push("microdata:price");

  let price: number | null = null;
  let currency: string | null = null;
  let priceSource: ProductPage["priceSource"] = null;
  if (ld?.price != null) {
    price = ld.price;
    currency = ld.currency;
    priceSource = "json-ld";
  } else if (metaPrice !== null) {
    price = metaPrice;
    currency = meta.get("product:price:currency") ?? meta.get("og:price:currency") ?? null;
    priceSource = "meta";
  } else if (microPrice) {
    price = microPrice.price;
    currency = microPrice.currency;
    priceSource = "microdata";
  }

  const image = absolutize(
    ld?.image ?? meta.get("og:image:secure_url") ?? meta.get("og:image") ?? meta.get("twitter:image") ?? null,
    pageUrl,
  );
  const title =
    clean(ld?.name) ?? clean(meta.get("og:title")) ?? clean(root.querySelector("title")?.text) ?? null;
  const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? meta.get("og:url") ?? null;

  const availability = ld?.availability ?? normalizeAvailability(meta.get("product:availability") ?? meta.get("og:availability"));

  return {
    isProduct: signals.length > 0,
    title,
    image,
    price,
    currency: currency?.toUpperCase() ?? null,
    priceSource,
    availability,
    brand: clean(ld?.brand) ?? clean(meta.get("product:brand")) ?? null,
    canonicalUrl: absolutize(canonical, pageUrl),
    siteName: clean(meta.get("og:site_name")) ?? null,
    description: clean(ld?.description) ?? clean(meta.get("og:description")) ?? null,
    signals,
  };
}

// ---------- Open Graph / meta ----------

function readMeta(root: HTMLElement): Map<string, string> {
  const out = new Map<string, string>();
  for (const el of root.querySelectorAll("meta")) {
    const key = (el.getAttribute("property") ?? el.getAttribute("name") ?? el.getAttribute("itemprop") ?? "").toLowerCase();
    const content = el.getAttribute("content");
    if (key && content != null && !out.has(key)) out.set(key, content.trim());
  }
  return out;
}

// ---------- JSON-LD ----------

interface LdProduct {
  name: string | null;
  image: string | null;
  price: number | null;
  currency: string | null;
  availability: ProductPage["availability"];
  brand: string | null;
  description: string | null;
}

export function findJsonLdProduct(root: HTMLElement): LdProduct | null {
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    const data = safeJson(script.textContent);
    if (data === undefined) continue;
    const product = findNode(data, (n) => hasType(n, "Product") || hasType(n, "ProductGroup"));
    if (product) return toLdProduct(product);
  }
  return null;
}

function toLdProduct(node: Record<string, unknown>): LdProduct {
  // ProductGroup pages (Shopify variants, many furniture sites) carry offers on the variants.
  const variants = asArray(node.hasVariant).filter(isObject);
  const offerSources = [node.offers, ...variants.map((v) => v.offers)];
  const offers = offerSources.flatMap((o) => asArray(o)).filter(isObject);

  let price: number | null = null;
  let currency: string | null = null;
  let availability: ProductPage["availability"] = "unknown";
  for (const offer of offers) {
    const p =
      toNumber(offer.price) ??
      toNumber(offer.lowPrice) ??
      toNumber(isObject(offer.priceSpecification) ? offer.priceSpecification.price : undefined);
    if (p !== null && (price === null || p < price)) {
      price = p;
      currency =
        str(offer.priceCurrency) ??
        (isObject(offer.priceSpecification) ? str(offer.priceSpecification.priceCurrency) : null) ??
        currency;
    }
    const a = normalizeAvailability(str(offer.availability));
    if (a === "in_stock" || availability === "unknown") availability = a;
  }

  return {
    name: str(node.name),
    image: firstImage(node.image) ?? variants.map((v) => firstImage(v.image)).find(Boolean) ?? null,
    price,
    currency,
    availability,
    brand: isObject(node.brand) ? str(node.brand.name) : str(node.brand),
    description: str(node.description),
  };
}

function findNode(
  data: unknown,
  match: (n: Record<string, unknown>) => boolean,
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 6) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const hit = findNode(item, match, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (!isObject(data)) return null;
  if (match(data)) return data;
  for (const key of ["@graph", "mainEntity", "itemListElement", "item"]) {
    if (key in data) {
      const hit = findNode(data[key], match, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

function hasType(node: Record<string, unknown>, type: string): boolean {
  const t = node["@type"];
  return asArray(t).some((x) => typeof x === "string" && x.replace(/^.*[/#]/, "") === type);
}

function firstImage(image: unknown): string | null {
  for (const item of asArray(image)) {
    if (typeof item === "string" && item) return item;
    if (isObject(item)) {
      const url = str(item.url) ?? str(item.contentUrl);
      if (url) return url;
    }
  }
  return null;
}

// ---------- microdata ----------

function readMicrodataPrice(root: HTMLElement): { price: number; currency: string | null } | null {
  const el = root.querySelector('[itemprop="price"]');
  if (!el) return null;
  const price = toNumber(el.getAttribute("content") ?? el.text);
  if (price === null) return null;
  const cur = root.querySelector('[itemprop="priceCurrency"]');
  return { price, currency: cur?.getAttribute("content") ?? cur?.text.trim() ?? null };
}

// ---------- small helpers ----------

export function normalizeAvailability(v: string | null | undefined): ProductPage["availability"] {
  if (!v) return "unknown";
  const s = v.toLowerCase();
  if (s.includes("outofstock") || s.includes("out of stock") || s.includes("soldout") || s.includes("discontinued"))
    return "out_of_stock";
  if (s.includes("preorder") || s.includes("backorder")) return "preorder";
  if (s.includes("instock") || s.includes("in stock") || s.includes("limitedavailability") || s.includes("onlineonly"))
    return "in_stock";
  return "unknown";
}

function safeJson(text: string): unknown {
  const trimmed = text.trim().replace(/^<!--/, "").replace(/-->$/, "").trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Some sites leave raw control characters inside strings; strip and retry once.
    try {
      return JSON.parse(trimmed.replace(/[\u0000-\u001f]+/g, " "));
    } catch {
      return undefined;
    }
  }
}

export function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const m = v.replace(/,/g, "").match(/\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function firstNumber(...values: (string | undefined)[]): number | null {
  for (const v of values) {
    const n = toNumber(v);
    if (n !== null) return n;
  }
  return null;
}

function asArray(v: unknown): unknown[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function clean(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = decodeEntities(v).replace(/\s+/g, " ").trim();
  return s || null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function absolutize(u: string | null, base: string): string | null {
  if (!u) return null;
  try {
    return new URL(u, base).toString();
  } catch {
    return null;
  }
}
