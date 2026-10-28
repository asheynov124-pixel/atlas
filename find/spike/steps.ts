// Phase 0 steps, shared by the CLI (spike/run.ts) and the deployed endpoint (api/spike.ts) so the
// same checks can run from a laptop or from the host's own servers. Nothing here invents data:
// a step without its key or network access reports why it was skipped.

import { decodeLookImage, tagAgreement, tagProduct, type ClaudeUsage } from "../server/lib/claude.js";
import { claudeCost, geminiCost } from "../server/lib/cost.js";
import { decodeLinkPage } from "../server/lib/decode-link.js";
import { MissingKeyError } from "../server/lib/env.js";
import { searchEbay } from "../server/lib/feeds/ebay.js";
import { searchEtsy } from "../server/lib/feeds/etsy.js";
import type { FeedSearch, PoolCard } from "../server/lib/feeds/types.js";
import { groundedProductSearch, type GroundedSearch } from "../server/lib/gemini.js";
import { fetchPage } from "../server/lib/http.js";
import { searchPexels, searchUnsplash, type RoomPhoto } from "../server/lib/photos.js";
import { mapLimit, percentile } from "../server/lib/pool-utils.js";
import { canonicalize, verifyProductUrl, type VerifyResult } from "../server/lib/verify.js";

export const SPEC_QUERY = "lookalike travertine table lamps under $150";
export const EXTRA_QUERIES = [
  "checked wool area rug 8x10",
  "scalloped wall mirror",
  "white oak sideboard with fluted doors",
  "boucle accent chair",
  "ceramic bud vase set",
];
export const LTK_URL = "https://www.shopltk.com/explore/tonedelements/posts/c90a61f0-cfb8-11f1-9497-4ae6550aa8e4";
export const PHOTO_QUERY = "warm minimalist living room";
export const FEED_QUERIES = [
  "travertine table lamp",
  "checked wool rug",
  "scalloped mirror",
  "oak sideboard",
  "boucle chair",
  "ceramic bud vase",
  "brass candlesticks",
  "linen throw pillow",
];

export type StepResult = { status: "ran" } & Record<string, unknown>;
export type Skipped = { status: "skipped"; reason: string };
export type Outcome = StepResult | Skipped;

// Verified product pages found by earlier steps, reused by the tagging step.
export interface SpikeContext {
  verified: VerifyResult[];
  photos: RoomPhoto[];
}

export function newContext(): SpikeContext {
  return { verified: [], photos: [] };
}

export async function step(fn: () => Promise<StepResult>): Promise<Outcome> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof MissingKeyError) return { status: "skipped", reason: `${err.key} not set` };
    const msg = err instanceof Error ? `${err.message}${err.cause instanceof Error ? ` (${err.cause.message})` : ""}` : String(err);
    return { status: "skipped", reason: `failed: ${msg}` };
  }
}

// ---------- 1. Gemini grounded search → verified retailer pages (live search, not the pool) ----------

export async function runGemini(ctx: SpikeContext, queries = [SPEC_QUERY, ...EXTRA_QUERIES]): Promise<StepResult> {
  const searches: GroundedSearch[] = [];
  for (const q of queries) searches.push(await groundedProductSearch(q, { count: 5 }));

  type Check = { query: string; path: "stated" | "grounding"; result: VerifyResult };
  const jobs: { query: string; path: Check["path"]; url: string }[] = [];
  for (const s of searches) {
    for (const c of s.candidates) if (c.statedUrl) jobs.push({ query: s.query, path: "stated", url: c.statedUrl });
    for (const src of s.sources) jobs.push({ query: s.query, path: "grounding", url: src.uri });
  }
  const checks: Check[] = await mapLimit(jobs, 4, async (j) => ({ ...j, result: await verifyProductUrl(j.url) }));

  const candidates = searches.reduce((n, s) => n + s.candidates.length, 0);
  const stated = checks.filter((c) => c.path === "stated");
  const grounding = checks.filter((c) => c.path === "grounding");
  const uniqueOk = new Map<string, VerifyResult>();
  for (const c of checks) if (c.result.status === "ok") uniqueOk.set(c.result.canonicalUrl, c.result);
  ctx.verified.push(...uniqueOk.values());

  // Hit rate = verified cards per card requested (5 per query), counting both the model's stated
  // URLs and the grounding sources, capped at 5 per query so it can't exceed 100%.
  const requested = searches.length * 5;
  const yielded = searches.reduce((sum, s) => {
    const mine = new Set(checks.filter((c) => c.query === s.query && c.result.status === "ok").map((c) => c.result.canonicalUrl));
    return sum + Math.min(5, mine.size);
  }, 0);
  const searchCost = searches.reduce((sum, s) => sum + geminiCost(s.model, s.usage, s.searchQueries.length), 0);
  const okCards = [...uniqueOk.values()];
  const lampQuery = searches[0]?.query;
  const lampOk = okCards.filter((r) => checks.some((c) => c.query === lampQuery && c.result.canonicalUrl === r.canonicalUrl));

  return {
    status: "ran",
    model: searches[0]?.model,
    queries: queries.length,
    candidatesReturned: candidates,
    cardsRequested: requested,
    hitRate: yielded / requested,
    statedUrlHitRate: stated.length ? stated.filter((c) => c.result.status === "ok").length / stated.length : 0,
    groundingHitRate: grounding.length ? grounding.filter((c) => c.result.status === "ok").length / grounding.length : 0,
    statedUrlOutcomes: tally(stated.map((c) => c.result.status)),
    groundingSourceOutcomes: tally(grounding.map((c) => c.result.status)),
    verifiedCards: okCards.length,
    withStructuredPrice: okCards.filter((r) => r.product?.price != null).length,
    lampsVerified: lampOk.length,
    lampsUnder150: lampOk.filter((r) => (r.product?.price ?? Infinity) < 150).length,
    blockedByRetailer: tally(checks.filter((c) => c.result.status === "blocked").map((c) => `${c.result.retailer}: ${c.result.reason}`)),
    retailersOk: tally(okCards.map((r) => r.retailer)),
    latency: {
      searchMsP50: percentile(searches.map((s) => s.ms), 50),
      searchMsMax: Math.max(...searches.map((s) => s.ms)),
      verifyMsP50: percentile(checks.map((c) => c.result.ms), 50),
      verifyMsP95: percentile(checks.map((c) => c.result.ms), 95),
    },
    cost: {
      geminiTotal: searchCost,
      perSearch: searchCost / searches.length,
      perVerifiedCard: okCards.length ? searchCost / okCards.length : Number.NaN,
      note: "Worst case: assumes the free grounding allowance is already used up.",
    },
    searchEntryPointPresent: searches.every((s) => s.searchEntryPointHtml),
    sampleCards: okCards.slice(0, 8).map(cardSummary),
    failures: checks
      .filter((c) => c.result.status !== "ok")
      .slice(0, 25)
      .map((c) => ({ path: c.path, status: c.result.status, reason: c.result.reason, url: c.result.finalUrl })),
  };
}

// ---------- 2. Official feeds → pool cards ----------

export async function runFeeds(queries = FEED_QUERIES): Promise<StepResult> {
  const out: StepResult = { status: "ran" };
  for (const [name, search] of [
    ["ebay", (q: string) => searchEbay(q, { limit: 25 })],
    ["etsy", (q: string) => searchEtsy(q, { limit: 25 })],
  ] as const) {
    try {
      const results: FeedSearch[] = [];
      for (const q of queries) results.push(await search(q));
      const cards = results.flatMap((r) => r.cards);
      const requested = queries.length * 25;
      out[name] = {
        cardsRequested: requested,
        cardsReturned: cards.length,
        // Feed "hit rate": cards with a listing URL, an image and a price, per card requested.
        hitRate: cards.filter((c) => c.url && c.image && c.price != null).length / requested,
        withPrice: cards.filter((c) => c.price != null).length,
        vintage: cards.filter((c) => c.vintage).length,
        tagCoverage: {
          category: share(cards, (c) => c.tags.category !== null),
          material: share(cards, (c) => c.tags.materials.length > 0),
          color: share(cards, (c) => c.tags.colors.length > 0),
          style: share(cards, (c) => c.tags.style_cues.length > 0),
        },
        latencyMsP50: percentile(results.map((r) => r.ms), 50),
        sample: cards.slice(0, 6).map((c) => ({ title: c.title, price: c.price, url: c.url, image: c.image, tags: c.tags })),
      };
    } catch (err) {
      out[name] = { skipped: err instanceof MissingKeyError ? `${err.key} not set` : String(err) };
    }
  }
  if (Object.values(out).every((v) => typeof v === "object" && v !== null && "skipped" in v))
    throw new Error(`no feed ran (${JSON.stringify(out)})`);
  return out;
}

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
      status: v.status,
      retailer: v.retailer,
      title: v.product?.title,
      price: v.product?.price,
      landedOn: v.canonicalUrl,
      reason: v.status === "ok" ? undefined : v.reason,
    })),
  };
}

// ---------- 4. Interior photos ----------

export async function runPhotos(ctx: SpikeContext, q = PHOTO_QUERY): Promise<StepResult> {
  const out: StepResult = { status: "ran", query: q };
  for (const [name, fn] of [["unsplash", searchUnsplash], ["pexels", searchPexels]] as const) {
    try {
      const { photos, ms } = await fn(q, 30);
      out[name] = { count: photos.length, ms, first: photos.slice(0, 3).map((p) => ({ page: p.pageUrl, by: p.photographer })) };
      ctx.photos.push(...photos);
    } catch (err) {
      out[name] = { skipped: err instanceof MissingKeyError ? `${err.key} not set` : String(err) };
    }
  }
  if (ctx.photos.length === 0) throw new Error(`no photo source returned results (${JSON.stringify(out)})`);
  return { ...out, total: ctx.photos.length };
}

// ---------- 5. Screenshot / room photo → items + search queries ----------

export async function runVision(
  ctx: SpikeContext,
  image?: { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp"; source: string },
): Promise<StepResult> {
  let input = image;
  if (!input) {
    const photo = ctx.photos[0];
    if (!photo) throw new Error("no screenshot given and no photo from the photos step to use");
    const res = await fetch(photo.imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`photo download HTTP ${res.status}`);
    input = {
      base64: Buffer.from(await res.arrayBuffer()).toString("base64"),
      mediaType: "image/jpeg",
      source: `${photo.pageUrl} (photo by ${photo.photographer})`,
    };
  }
  const { look, usage, stopReason } = await decodeLookImage(input.base64, input.mediaType);
  return { status: "ran", source: input.source, stopReason, itemCount: look?.items.length ?? 0, look, usage, cost: claudeCost(usage.model, usage) };
}

// ---------- 6. Tag verified retailer pages: Haiku 5.5 vs Opus 5.5 ----------

export async function runTagging(ctx: SpikeContext, sample = 5): Promise<StepResult> {
  const cards = ctx.verified.filter((r) => r.product?.image).slice(0, sample);
  if (cards.length === 0) throw new Error("no verified retailer pages to tag (run gemini or ltk first)");
  const input = (r: VerifyResult) => ({ title: r.product?.title ?? "", retailer: r.retailer, imageUrl: r.product!.image!, description: r.product?.description });
  const haiku = await mapLimit(cards, 2, (r) => tagProduct({ ...input(r), model: "claude-haiku-5-5" }));
  const opus = await mapLimit(cards, 2, (r) => tagProduct({ ...input(r), model: "claude-opus-5-5" }));
  const agreements = haiku.flatMap((h, i) => (h.tags && opus[i]?.tags ? [tagAgreement(h.tags, opus[i]!.tags!)] : []));
  const costOf = (us: ClaudeUsage[]) => us.reduce((s, u) => s + claudeCost(u.model, u), 0) / us.length;
  return {
    status: "ran",
    cards: cards.length,
    haiku: { tagged: haiku.filter((r) => r.tags).length, perCardCost: costOf(haiku.map((r) => r.usage)), msP50: percentile(haiku.map((r) => r.usage.ms), 50) },
    opus: { tagged: opus.filter((r) => r.tags).length, perCardCost: costOf(opus.map((r) => r.usage)), msP50: percentile(opus.map((r) => r.usage.ms), 50) },
    // ≥0.75 mean agreement → keep Haiku as the tagger; below that, Opus is worth its price here.
    meanAgreement: agreements.length ? agreements.reduce((s, x) => s + x, 0) / agreements.length : Number.NaN,
    sample: cards.slice(0, 3).map((r, i) => ({ title: r.product?.title, haiku: haiku[i]?.tags, opus: opus[i]?.tags })),
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

// ---------- helpers ----------

function cardSummary(r: VerifyResult) {
  return {
    title: r.product?.title,
    retailer: r.retailer,
    price: r.product?.price,
    currency: r.product?.currency,
    priceSource: r.product?.priceSource,
    availability: r.product?.availability,
    url: r.canonicalUrl,
    image: r.product?.image,
  };
}

export function tally(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

function share(cards: PoolCard[], pred: (c: PoolCard) => boolean): number {
  return cards.length ? cards.filter(pred).length / cards.length : 0;
}
