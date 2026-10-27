// Phase 0: prove the data before building the UI.
//
//   npm run spike                       # everything that has keys
//   npm run spike -- --only gemini,ltk  # a subset
//   npm run spike -- --screenshot ./room.jpg
//   npm run spike -- --urls ./urls.txt  # verify a list of product URLs (retailer survey)
//
// Writes spike/results/<timestamp>.json and spike/results/latest.md. Nothing here invents data:
// a step without its key or network access is reported as skipped, with the reason.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeLookImage, tagProduct, type ClaudeUsage } from "../server/lib/claude.ts";
import { claudeCost, geminiCost, PRICES_CHECKED, usd } from "../server/lib/cost.ts";
import { decodeLinkPage } from "../server/lib/decode-link.ts";
import { env, MissingKeyError } from "../server/lib/env.ts";
import { groundedProductSearch, type GroundedSearch } from "../server/lib/gemini.ts";
import { fetchPage } from "../server/lib/http.ts";
import { searchPexels, searchUnsplash, type RoomPhoto } from "../server/lib/photos.ts";
import { mapLimit, percentile } from "../server/lib/pool-utils.ts";
import { canonicalize, verifyProductUrl, type VerifyResult } from "../server/lib/verify.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

const SPEC_QUERY = "lookalike travertine table lamps under $150";
const EXTRA_QUERIES = [
  "checked wool area rug 8x10",
  "scalloped wall mirror",
  "white oak sideboard with fluted doors",
  "boucle accent chair",
  "ceramic bud vase set",
];
const LTK_URL = "https://www.shopltk.com/explore/tonedelements/posts/c90a61f0-cfb8-11f1-9497-4ae6550aa8e4";
const PHOTO_QUERY = "warm minimalist living room";

type StepResult = { status: "ran" } & Record<string, unknown>;
type Skipped = { status: "skipped"; reason: string };

const report: Record<string, StepResult | Skipped> = {};
const ok: VerifyResult[] = [];

async function main() {
  const only = args.only ? new Set(args.only.split(",")) : null;
  const want = (step: string) => !only || only.has(step);

  if (want("gemini")) report.gemini = await step("gemini", runGemini);
  if (want("ltk")) report.ltk = await step("ltk", runLtk);
  let photos: RoomPhoto[] = [];
  if (want("photos")) {
    const r = await step("photos", runPhotos);
    report.photos = r;
    if (r.status === "ran") photos = (r.sample as RoomPhoto[]) ?? [];
  }
  if (want("vision")) report.vision = await step("vision", () => runVision(photos));
  if (want("tagging")) report.tagging = await step("tagging", runTagging);
  if (args.urls) report.survey = await step("survey", () => runSurvey(args.urls as string));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = path.join(here, "results");
  await mkdir(out, { recursive: true });
  const json = { ranAt: new Date().toISOString(), pricesChecked: PRICES_CHECKED, report };
  await writeFile(path.join(out, `${stamp}.json`), JSON.stringify(json, null, 2));
  const md = renderMarkdown(json);
  await writeFile(path.join(out, "latest.md"), md);
  console.log(md);
}

async function step(name: string, fn: () => Promise<StepResult>): Promise<StepResult | Skipped> {
  process.stderr.write(`\n▸ ${name}…\n`);
  try {
    return await fn();
  } catch (err) {
    if (err instanceof MissingKeyError) return { status: "skipped", reason: `${err.key} not set` };
    const msg = err instanceof Error ? `${err.message}${err.cause instanceof Error ? ` (${err.cause.message})` : ""}` : String(err);
    return { status: "skipped", reason: `failed: ${msg}` };
  }
}

// ---------- 1. Gemini grounded search → verified product pages ----------

async function runGemini(): Promise<StepResult> {
  const queries = args.queries ? args.queries.split("|") : [SPEC_QUERY, ...EXTRA_QUERIES];
  const searches: GroundedSearch[] = [];
  for (const q of queries) {
    process.stderr.write(`  search: ${q}\n`);
    searches.push(await groundedProductSearch(q, { count: 5 }));
  }

  // Verify every URL the model stated, and every grounding source (redirects resolve on fetch).
  type Check = { query: string; path: "stated" | "grounding"; name: string | null; result: VerifyResult };
  const jobs: { query: string; path: Check["path"]; name: string | null; url: string }[] = [];
  for (const s of searches) {
    for (const c of s.candidates) if (c.statedUrl) jobs.push({ query: s.query, path: "stated", name: c.name, url: c.statedUrl });
    for (const src of s.sources) jobs.push({ query: s.query, path: "grounding", name: src.title, url: src.uri });
  }
  const checks: Check[] = await mapLimit(jobs, 4, async (j) => ({ ...j, result: await verifyProductUrl(j.url) }));

  const candidates = searches.reduce((n, s) => n + s.candidates.length, 0);
  const stated = checks.filter((c) => c.path === "stated");
  const grounding = checks.filter((c) => c.path === "grounding");
  const uniqueOk = new Map<string, VerifyResult>();
  for (const c of checks) if (c.result.status === "ok") uniqueOk.set(c.result.canonicalUrl, c.result);
  ok.push(...uniqueOk.values());

  // Hit rate = verified cards per card requested (5 per query), counting both the model's stated URLs
  // and the grounding sources, capped at 5 per query so it can't exceed 100%. This is the yield the
  // pool refill actually gets, and the number the ~70% gate is about.
  const requested = searches.length * 5;
  const yielded = searches.reduce((sum, s) => {
    const mine = new Set(checks.filter((c) => c.query === s.query && c.result.status === "ok").map((c) => c.result.canonicalUrl));
    return sum + Math.min(5, mine.size);
  }, 0);

  const searchCost = searches.reduce((sum, s) => sum + geminiCost(s.model, s.usage, s.searchQueries.length), 0);
  const okCards = [...uniqueOk.values()];
  const lampQuery = searches[0];
  const lampOk = okCards.filter((r) => checks.some((c) => c.query === lampQuery?.query && c.result.canonicalUrl === r.canonicalUrl));

  return {
    status: "ran",
    model: searches[0]?.model,
    queries: queries.length,
    candidatesReturned: candidates,
    candidatesWithStatedUrl: stated.length,
    statedUrlOutcomes: tally(stated.map((c) => c.result.status)),
    groundingSourceOutcomes: tally(grounding.map((c) => c.result.status)),
    cardsRequested: requested,
    hitRate: yielded / requested,
    statedUrlHitRate: stated.length ? stated.filter((c) => c.result.status === "ok").length / stated.length : 0,
    groundingHitRate: grounding.length ? grounding.filter((c) => c.result.status === "ok").length / grounding.length : 0,
    verifiedCards: okCards.length,
    withStructuredPrice: okCards.filter((r) => r.product?.price != null).length,
    lampsUnder150: lampOk.filter((r) => (r.product?.price ?? Infinity) < 150).length,
    lampsVerified: lampOk.length,
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
      note: "Worst case: assumes the grounding free allowance is already used up.",
    },
    searchEntryPointPresent: searches.every((s) => s.searchEntryPointHtml),
    sampleCards: okCards.slice(0, 8).map((r) => ({
      title: r.product?.title,
      retailer: r.retailer,
      price: r.product?.price,
      currency: r.product?.currency,
      priceSource: r.product?.priceSource,
      availability: r.product?.availability,
      url: r.canonicalUrl,
      image: r.product?.image,
    })),
    failures: checks
      .filter((c) => c.result.status !== "ok")
      .slice(0, 25)
      .map((c) => ({ path: c.path, status: c.result.status, reason: c.result.reason, url: c.result.finalUrl })),
  };
}

// ---------- 2. Decode an LTK post ----------

async function runLtk(): Promise<StepResult> {
  const url = args.ltk ?? LTK_URL;
  const page = await fetchPage(url, { timeoutMs: 12_000 });
  if (!page.ok) throw new Error(`LTK page HTTP ${page.status} ${page.error ?? ""}`.trim());
  const decoded = decodeLinkPage(page.html, page.finalUrl);
  const verified = await mapLimit(decoded.links.slice(0, 12), 3, (l) => verifyProductUrl(l.url));
  for (const v of verified) if (v.status === "ok") ok.push(v);
  return {
    status: "ran",
    url,
    httpStatus: page.status,
    htmlBytes: page.html.length,
    fetchMs: page.ms,
    caption: decoded.caption,
    title: decoded.title,
    coverImage: decoded.coverImage,
    linksFound: decoded.links.length,
    linksBySource: tally(decoded.links.map((l) => l.via)),
    verifiedOutcomes: tally(verified.map((v) => v.status)),
    products: verified.map((v, i) => ({
      label: decoded.links[i]?.label,
      status: v.status,
      retailer: v.retailer,
      title: v.product?.title,
      price: v.product?.price,
      url: v.canonicalUrl,
      reason: v.status === "ok" ? undefined : v.reason,
    })),
  };
}

// ---------- 3. Screenshot / room photo → items + search queries ----------

async function runVision(photos: RoomPhoto[]): Promise<StepResult> {
  let image: Buffer;
  let mediaType: "image/jpeg" | "image/png" | "image/webp";
  let source: string;
  if (args.screenshot) {
    image = await readFile(args.screenshot);
    mediaType = args.screenshot.endsWith(".png") ? "image/png" : args.screenshot.endsWith(".webp") ? "image/webp" : "image/jpeg";
    source = args.screenshot;
  } else {
    const photo = photos[0];
    if (!photo) throw new Error("no --screenshot given and no photo from the photos step to use");
    const res = await fetch(photo.imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`photo download HTTP ${res.status}`);
    image = Buffer.from(await res.arrayBuffer());
    mediaType = "image/jpeg";
    source = `${photo.pageUrl} (photo by ${photo.photographer})`;
  }
  const { look, usage, stopReason } = await decodeLookImage(image.toString("base64"), mediaType);
  return {
    status: "ran",
    source,
    stopReason,
    itemCount: look?.items.length ?? 0,
    look,
    usage,
    cost: claudeCost(usage.model, usage),
  };
}

// ---------- 4. Interior photos ----------

async function runPhotos(): Promise<StepResult> {
  const q = args.photoQuery ?? PHOTO_QUERY;
  const out: StepResult = { status: "ran", query: q };
  const sample: RoomPhoto[] = [];
  for (const [name, fn] of [["unsplash", searchUnsplash], ["pexels", searchPexels]] as const) {
    try {
      const { photos, ms } = await fn(q, 30);
      out[name] = { count: photos.length, ms, first: photos.slice(0, 3).map((p) => ({ page: p.pageUrl, by: p.photographer })) };
      sample.push(...photos);
    } catch (err) {
      out[name] = { skipped: err instanceof MissingKeyError ? `${err.key} not set` : String(err) };
    }
  }
  if (sample.length === 0) throw new Error(`no photo source returned results (${JSON.stringify(out)})`);
  return { ...out, total: sample.length, sample: sample.slice(0, 5) };
}

// ---------- 5. Tag verified cards (cost per card) ----------

async function runTagging(): Promise<StepResult> {
  const cards = ok.filter((r) => r.product?.image).slice(0, Number(args.tagSample ?? 5));
  if (cards.length === 0) throw new Error("no verified cards to tag (run with gemini or ltk first)");
  const results = await mapLimit(cards, 2, (r) =>
    tagProduct({ title: r.product?.title ?? "", retailer: r.retailer, imageUrl: r.product!.image!, description: r.product?.description }),
  );
  const usages: ClaudeUsage[] = results.map((r) => r.usage);
  const cost = usages.reduce((s, u) => s + claudeCost(u.model, u), 0);
  return {
    status: "ran",
    model: usages[0]?.model,
    tagged: results.filter((r) => r.tags).length,
    perCardCost: cost / usages.length,
    perCardMsP50: percentile(usages.map((u) => u.ms), 50),
    sample: results.slice(0, 3).map((r, i) => ({ title: cards[i]?.product?.title, tags: r.tags })),
  };
}

// ---------- 6. Retailer survey (optional) ----------

async function runSurvey(file: string): Promise<StepResult> {
  const urls = (await readFile(file, "utf8")).split(/\r?\n/).map((l) => l.trim()).filter((l) => /^https?:\/\//.test(l));
  const results = await mapLimit(urls, 4, (u) => verifyProductUrl(u));
  return {
    status: "ran",
    urls: urls.length,
    outcomes: tally(results.map((r) => r.status)),
    byRetailer: Object.fromEntries(
      [...new Set(results.map((r) => r.retailer))].map((ret) => [ret, tally(results.filter((r) => r.retailer === ret).map((r) => r.status))]),
    ),
    rows: results.map((r) => ({ retailer: r.retailer, status: r.status, http: r.httpStatus, reason: r.reason, price: r.product?.price ?? null, url: canonicalize(r.finalUrl) })),
  };
}

// ---------- report ----------

function renderMarkdown(json: { ranAt: string; pricesChecked: string; report: typeof report }): string {
  const lines = [`# Phase 0 results — ${json.ranAt}`, "", `Prices checked ${json.pricesChecked}. Keys present: ${keyStatus()}.`, ""];
  const g = json.report.gemini;
  if (g?.status === "ran") {
    const hit = Number(g.hitRate);
    const verdict = hit >= 0.7 ? "PASS (≥70%)" : "BELOW GATE (<70%) — stop and redesign sourcing";
    const cost = g.cost as { perVerifiedCard: number };
    const tagging = json.report.tagging;
    const tagPerCard = tagging?.status === "ran" ? Number(tagging.perCardCost) : Number.NaN;
    lines.push(
      "## Gemini grounded search → verified product pages",
      `- Real-product hit rate: **${(hit * 100).toFixed(0)}%** of ${g.cardsRequested} requested cards became verified cards (${g.candidatesReturned} candidates returned) — ${verdict}`,
      `- Stated-URL hit rate ${(Number(g.statedUrlHitRate) * 100).toFixed(0)}% · grounding-source hit rate ${(Number(g.groundingHitRate) * 100).toFixed(0)}%`,
      `- Structured price found on ${g.withStructuredPrice}/${g.verifiedCards} verified cards`,
      `- Travertine lamps verified: ${g.lampsVerified}, of which under $150 by the retailer's own price: ${g.lampsUnder150}`,
      `- Latency: ${JSON.stringify(g.latency)}`,
      `- Cost per verified card (Gemini only): ${usd(cost.perVerifiedCard)}; with Claude tagging: ${usd(cost.perVerifiedCard + tagPerCard)}; **per 100 cards: ${usd(100 * (cost.perVerifiedCard + tagPerCard))}**`,
      `- Blocked: ${JSON.stringify(g.blockedByRetailer)}`,
      "",
    );
  }
  for (const [name, r] of Object.entries(json.report)) {
    if (r.status === "skipped") lines.push(`## ${name}: skipped — ${r.reason}`, "");
    else if (name !== "gemini") lines.push(`## ${name}`, "```json", JSON.stringify(r, null, 2).slice(0, 4000), "```", "");
  }
  return lines.join("\n");
}

function keyStatus(): string {
  return ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "UNSPLASH_ACCESS_KEY", "PEXELS_API_KEY"]
    .map((k) => `${k}=${env(k) ? "yes" : "no"}`)
    .join(", ");
}

function tally(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

function parseArgs(argv: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (!a.startsWith("--")) continue;
    const key = a.slice(2).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    const next = argv[i + 1];
    out[key] = next && !next.startsWith("--") ? (i++, next) : "true";
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
