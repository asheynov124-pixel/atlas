// Phase 0 checks that need no API keys: can a server verify retailer pages, and can it decode a
// pasted LTK post? Kept separate so they deploy and run before any key exists.

import { decodeLinkPage } from "../server/lib/decode-link.js";
import { fetchPage } from "../server/lib/http.js";
import { mapLimit } from "../server/lib/pool-utils.js";
import { canonicalize, verifyProductUrl } from "../server/lib/verify.js";
import { tally, type SpikeContext, type StepResult } from "./core.js";

export const LTK_URL = "https://www.shopltk.com/explore/tonedelements/posts/c90a61f0-cfb8-11f1-9497-4ae6550aa8e4";

// ---------- 3. Decode an LTK post (one public page, as if she pasted it) ----------

export async function runLtk(ctx: SpikeContext, url = LTK_URL, verifyLinks = 12): Promise<StepResult> {
  const page = await fetchPage(url, { timeoutMs: 12_000 });
  if (!page.ok) throw new Error(`LTK page HTTP ${page.status} ${page.error ?? ""}`.trim());
  const decoded = decodeLinkPage(page.html, page.finalUrl);
  const verified = await mapLimit(decoded.links.slice(0, verifyLinks), 3, (l) => verifyProductUrl(l.url, { timeoutMs: 8_000 }));
  for (const v of verified) if (v.status === "ok") ctx.verified.push(v);
  return {
    status: "ran",
    url,
    httpStatus: page.status,
    htmlBytes: page.html.length,
    fetchMs: page.ms,
    title: decoded.title,
    caption: decoded.caption,
    coverImage: decoded.coverImage,
    linksFound: decoded.links.length,
    linksBySource: tally(decoded.links.map((l) => l.via)),
    verifiedOutcomes: tally(verified.map((v) => v.status)),
    products: verified.map((v, i) => ({
      label: decoded.links[i]?.label,
      link: decoded.links[i]?.url,
      match: decoded.links[i]?.match,
      status: v.status,
      retailer: v.retailer,
      title: v.product?.title,
      price: v.product?.price,
      landedOn: v.canonicalUrl,
      reason: v.status === "ok" ? undefined : v.reason,
    })),
  };
}

// ---------- 7. Retailer survey: can a server verify these pages? ----------

export async function runSurvey(urls: string[]): Promise<StepResult> {
  const results = await mapLimit(urls, 4, (u) => verifyProductUrl(u, { timeoutMs: 8_000 }));
  return {
    status: "ran",
    urls: urls.length,
    outcomes: tally(results.map((r) => r.status)),
    okRate: results.filter((r) => r.status === "ok").length / Math.max(1, results.length),
    withPrice: results.filter((r) => r.product?.price != null).length,
    byRetailer: Object.fromEntries(
      [...new Set(results.map((r) => r.retailer))].map((ret) => [ret, tally(results.filter((r) => r.retailer === ret).map((r) => r.status))]),
    ),
    rows: results.map((r) => ({
      retailer: r.retailer,
      status: r.status,
      http: r.httpStatus,
      ms: r.ms,
      reason: r.reason,
      title: r.product?.title ?? null,
      price: r.product?.price ?? null,
      priceSource: r.product?.priceSource ?? null,
      image: !!r.product?.image,
      url: canonicalize(r.finalUrl),
    })),
  };
}
