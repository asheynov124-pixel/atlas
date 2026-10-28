// Known-answer checks run on the deployed code itself, so a broken build or a corrupted upload
// shows up as a failed check instead of as believable-looking but wrong survey numbers.

import { claudeCost } from "../server/lib/cost.js";
import { decodeLinkPage } from "../server/lib/decode-link.js";
import { extractClientRedirect, type FetchedPage } from "../server/lib/http.js";
import { parseProductPage, toNumber } from "../server/lib/product-page.js";
import { canonicalize, classify } from "../server/lib/verify.js";
import type { StepResult } from "./core.js";

const page = (over: Partial<FetchedPage>): FetchedPage => ({
  requestedUrl: "https://shop.example/products/lamp",
  finalUrl: "https://shop.example/products/lamp",
  status: 200,
  ok: true,
  html: "",
  contentType: "text/html",
  redirects: [],
  ms: 1,
  ...over,
});

const CHECKS: [string, () => boolean][] = [
  ["canonicalize strips tracking, slash, fragment", () =>
    canonicalize("https://WWW.Shop.example/products/lamp/?utm_source=ig&variant=2&gclid=x#r") === "https://www.shop.example/products/lamp?variant=2"],
  ["toNumber reads $1,299.99", () => toNumber("$1,299.99") === 1299.99],
  ["JSON-LD price picks the lowest offer", () =>
    parseProductPage(
      `<script type="application/ld+json">{"@type":"Product","name":"L","image":"https://i/x.jpg","offers":[{"price":"149.00"},{"price":"139.00","priceCurrency":"USD"}]}</script>`,
      "https://s/p",
    ).price === 139],
  ["PerimeterX wall → blocked", () =>
    classify(page({ status: 403, ok: false, html: `<div id="px-captcha"></div>` })).status === "blocked"],
  ["Cloudflare challenge → blocked", () =>
    classify(page({ status: 503, ok: false, html: `<title>Just a moment...</title>` })).status === "blocked"],
  ["category page → not_product", () =>
    classify(page({ html: `<meta property="og:type" content="website"><title>Lamps</title>${"x".repeat(25_000)}` })).status === "not_product"],
  ["escaped affiliate URL is found", () =>
    decodeLinkPage(`<script>var s={"l":"https:\\u002F\\u002Fliketk.it\\u002F4abc"}</script>`, "https://b/p").links.some((l) => l.url === "https://liketk.it/4abc")],
  ["product anchor kept, collection anchor dropped", () => {
    const urls = decodeLinkPage(
      `<a href="https://st.example/products/throw-12345">a</a><a href="https://st.example/collections/throws">b</a>`,
      "https://b/p",
    ).links.map((l) => l.url);
    return urls.includes("https://st.example/products/throw-12345") && !urls.includes("https://st.example/collections/throws");
  }],
  ["ItemList category page → not_product", () =>
    classify(page({ finalUrl: "https://shop.example/lighting/pendants", html: `<script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"item":{"@type":"Product","name":"A"}},{"item":{"@type":"Product","name":"B"}}]}</script>${"x".repeat(25_000)}` })).status === "not_product"],
  ["meta-refresh interstitial is followed", () =>
    extractClientRedirect(`<meta http-equiv="refresh" content="0; url=https://www.wayfair.com/p/1">`, "https://rstyle.me/+a") === "https://www.wayfair.com/p/1"],
  ["LTK exact/similar flag is read", () =>
    decodeLinkPage(`<script>x="https://rstyle.me/+abc?lpm=SIMILAR"</script>`, "https://b/p").links[0]?.match === "similar"],
  ["dated model IDs price like their alias", () => claudeCost("claude-opus-5-5-20260101", { inputTokens: 1_000_000, outputTokens: 0 }) === 4],
];

export async function runSelftest(): Promise<StepResult> {
  const results = CHECKS.map(([name, fn]) => {
    try {
      return { name, pass: fn() };
    } catch (err) {
      return { name, pass: false, error: String(err) };
    }
  });
  const failed = results.filter((r) => !r.pass);
  if (failed.length > 0) throw new Error(`selftest failed: ${failed.map((f) => f.name).join("; ")}`);
  return { status: "ran", passed: results.length, results };
}
