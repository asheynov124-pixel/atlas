import { fetchPage, type FetchedPage } from "./http.ts";
import { parseProductPage, type ProductPage } from "./product-page.ts";

// The gate every product card passes before Sonny ever sees it.
//   ok          live product page with a real image (price may still be unknown)
//   not_product page loads but isn't a single product (category, search, blog, homepage)
//   blocked     the retailer served a bot wall; the product may be real but we can't confirm it
//   dead        404/410, soft-404, or the link went nowhere
//   error       network failure / timeout
export type VerifyStatus = "ok" | "not_product" | "blocked" | "dead" | "error";

export interface VerifyResult {
  url: string;
  finalUrl: string;
  canonicalUrl: string;
  retailer: string;
  status: VerifyStatus;
  httpStatus: number;
  reason: string;
  ms: number;
  product: ProductPage | null;
}

export async function verifyProductUrl(url: string, opts: { timeoutMs?: number } = {}): Promise<VerifyResult> {
  const page = await fetchPage(url, { timeoutMs: opts.timeoutMs ?? 10_000 });
  return classify(page);
}

export function classify(page: FetchedPage): VerifyResult {
  const base = {
    url: page.requestedUrl,
    finalUrl: page.finalUrl,
    canonicalUrl: canonicalize(page.finalUrl),
    retailer: retailerOf(page.finalUrl),
    httpStatus: page.status,
    ms: page.ms,
  };

  if (page.status === 0) return { ...base, status: "error", reason: page.error ?? "fetch failed", product: null };

  const wall = detectBotWall(page);
  if (wall) return { ...base, status: "blocked", reason: wall, product: null };

  if (page.status === 404 || page.status === 410) return { ...base, status: "dead", reason: `HTTP ${page.status}`, product: null };
  if (!page.ok) return { ...base, status: "error", reason: `HTTP ${page.status}`, product: null };
  if (!/html/i.test(page.contentType) && !page.html.trimStart().startsWith("<")) {
    return { ...base, status: "not_product", reason: `content-type ${page.contentType}`, product: null };
  }

  const product = parseProductPage(page.html, page.finalUrl);
  const canonicalUrl = canonicalize(product.canonicalUrl ?? page.finalUrl);

  if (looksLikeSoft404(page, product)) {
    return { ...base, canonicalUrl, status: "dead", reason: "soft 404 (redirected away or 'not found' page)", product };
  }
  if (!product.isProduct) {
    return { ...base, canonicalUrl, status: "not_product", reason: "no Product schema / og:type product / price meta", product };
  }
  if (!product.image) {
    return { ...base, canonicalUrl, status: "not_product", reason: "product page without an image", product };
  }
  return { ...base, canonicalUrl, status: "ok", reason: product.signals.join(", "), product };
}

// Signatures of the common bot-management vendors. We never try to get past these;
// we record them so the report can say which retailers can't be verified from a server.
const WALLS: [RegExp, string][] = [
  [/px-captcha|perimeterx|_pxhd|human challenge/i, "PerimeterX/HUMAN bot wall"],
  [/captcha-delivery\.com|datadome/i, "DataDome bot wall"],
  [/cf-chl-|challenge-platform|just a moment\.\.\./i, "Cloudflare challenge"],
  [/<title>\s*access denied\s*<\/title>|errors\.edgesuite\.net|reference #\d+\.[0-9a-f]+/i, "Akamai access denied"],
  [/robot or human\?|are you a robot|verify you are a human|unusual traffic/i, "generic robot check"],
  [/kpsdk|kasada/i, "Kasada bot wall"],
  [/incapsula|_incap_|imperva/i, "Imperva bot wall"],
];

export function detectBotWall(page: FetchedPage): string | null {
  // Walls arrive as 403/429/503 (sometimes 200 with a tiny challenge page).
  const suspicious = page.status === 403 || page.status === 429 || page.status === 503 || page.html.length < 20_000;
  if (!suspicious) return null;
  const head = page.html.slice(0, 60_000);
  for (const [re, label] of WALLS) if (re.test(head)) return `${label} (HTTP ${page.status})`;
  if (page.status === 403 || page.status === 429) return `HTTP ${page.status} (likely bot management)`;
  return null;
}

function looksLikeSoft404(page: FetchedPage, product: ProductPage): boolean {
  const title = (product.title ?? "").toLowerCase();
  if (/page not found|404|no longer available|can't find that page|cannot be found/.test(title)) return true;
  // A product link that redirected to the site root or a search page is gone.
  try {
    const req = new URL(page.requestedUrl);
    const fin = new URL(page.finalUrl);
    if (page.redirects.length > 0 && req.pathname.length > 1 && (fin.pathname === "/" || /\/search/.test(fin.pathname)))
      return true;
  } catch {
    // ignore unparseable URLs
  }
  return false;
}

// Strip tracking so the same product found twice dedupes to one card.
const TRACKING = /^(utm_|gclid|fbclid|msclkid|irclickid|irgwc|ranmid|ranEAID|ranSiteID|cjevent|affid|ref_|_pos|_sid|_ss|_psq|srsltid|clickid|mc_|igshid|epik)/i;

export function canonicalize(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^m\./, "www.");
    for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    let s = url.toString();
    if (s.endsWith("?")) s = s.slice(0, -1);
    return s.replace(/\/$/, "");
  } catch {
    return u;
  }
}

export function retailerOf(u: string): string {
  try {
    const host = new URL(u).hostname.toLowerCase().replace(/^(www|m|shop|store)\./, "");
    return host;
  } catch {
    return "unknown";
  }
}
