# Phase 0 report: prove the data before building the UI

**Status: gate not yet passed. Nothing has been measured live.** The harness is built and tested, but no hit rate exists yet. Two things stopped the live run, and neither one is a code problem:

1. **No API keys** were present in the session.
2. **The cloud sandbox's network policy blocks retailers, LTK, Unsplash and Pexels.** Only Google's API host and npm were reachable. That is the right outcome anyway: the hit rate that matters is measured from where the app will actually run (see "How to run" below).

Following the spec's own rule, I have **not built any screens**. I also found something that, in my reading, may require a sourcing redesign *regardless* of the hit rate. That is Decision 1 below. Read it first.

---

## What was built (`find/`)

The spike code is the production server code. Nothing in it is throwaway.

| Module | Job |
|---|---|
| `server/lib/verify.ts` | The gate every card passes. It fetches the page and classifies it as `ok` / `not_product` / `blocked` / `dead` / `error`. It detects bot walls (PerimeterX, DataDome, Cloudflare, Akamai, Kasada, Imperva), soft 404s, and redirects to the homepage. It also canonicalizes URLs so duplicate cards are caught. |
| `server/lib/product-page.ts` | Reads title, image, price, currency, availability and brand from the page's own **JSON-LD `Product` / `ProductGroup` / `AggregateOffer`**, then Open Graph, then microdata. **A price that isn't in structured data is `null`, so the card shows "price unavailable".** The code has no path that reads a price out of prose. |
| `server/lib/gemini.ts` | Grounded search. It returns *candidates only*. The model's URLs and prices are never shown. Each URL is fetched and verified, and the card's image and price come from the retailer's page. It also records Google's Search Suggestions HTML, which the terms require (see Decision 1). |
| `server/lib/decode-link.ts` | Decode a pasted link. It doesn't depend on any one site's page format. It reads the caption and cover image from Open Graph, then harvests shopping links from embedded app state (Next.js, Nuxt/devalue), anchor tags and escaped affiliate URLs (liketk.it, rstyle.me, ShopMy, Amazon and others). Every harvested link then goes through the verifier. |
| `server/lib/claude.ts` | Two jobs. **Screenshot decode:** items, controlled-vocabulary tags, shopping search queries, and any literally visible brand or price text. **Product tagging.** Both use schema-enforced structured output and the server-side refusal fallback (`fallbacks: "default"`). |
| `server/lib/photos.ts` | Unsplash and Pexels search, with the required credit and UTM links and Unsplash's download-tracking hook. |
| `server/lib/vocab.ts` | The controlled tag vocabulary (§4): 48 categories, 50 materials, 35 colors, 46 style cues, 15 moods and so on. |
| `server/lib/cost.ts` | Spend accounting. A model missing from the price table shows as **"unknown"**, never $0. |
| `spike/run.ts` | The Phase 0 runner. It covers all four spec tests, plus product tagging (for cost per card) and an optional retailer survey. It writes `spike/results/latest.md` with the hit rate, a pass/fail verdict on the 70% gate, latency, and cost per 100 cards. |
| `netlify/functions/spike-verify.mts` | A passcode-protected endpoint that verifies URLs **from Netlify's servers**. Retailers often block cloud server addresses that they let through from a home connection, so this is where the real hit rate is measured. |

**Tests:** 36 unit tests over fixture HTML cover Shopify pages, JSON-LD `@graph`, variant groups, microdata, malformed JSON-LD, five kinds of bot wall, soft 404s, URL canonicalizing, Nuxt devalue state, escaped affiliate links, and Gemini output that isn't clean JSON. All pass, and type-checking is clean. The tests caught one real bug: trailing-slash URLs slipped past de-duplication.

**Sandbox run, so you can see failures are honest rather than faked:**
```
## gemini: skipped — GEMINI_API_KEY not set
## ltk: skipped — failed: LTK page HTTP 0 fetch failed: getaddrinfo ENOTFOUND www.shopltk.com
## photos: skipped — failed: no photo source returned results (… UNSPLASH_ACCESS_KEY not set … PEXELS_API_KEY not set)
## vision: skipped — failed: no --screenshot given and no photo from the photos step to use
## tagging: skipped — failed: no verified cards to tag (run with gemini or ltk first)
```

---

## The needles

Each source is marked by how I read it:

- **[read]** — I read the primary source myself.
- **[summary]** — it came through a search summary, because the sandbox blocked the page. Re-read these before relying on them.

### 1. Google's grounding terms vs. the Product Pool *(architecture-level)*

The spec's engine is this: a **nightly scheduled job** runs Gemini grounded searches, **stores** the results for **14 days**, and **mixes** them into a masonry feed of products and photos. As summarized from the Gemini API Additional Terms, "Grounding with Google Search" section [summary], [ai.google.dev/gemini-api/terms](https://ai.google.dev/gemini-api/terms):

- Grounded Results are displayed "with the associated Search Suggestion(s) **to the end user who submitted the prompt**." A cron job has no end user submitting a prompt.
- "**caching**, framing, syndicating, reselling, analysing" Grounded Results are prohibited. A 14-day pool is a cache with a different name.
- You "will not modify, or **intersperse any other content with**," Grounded Results or Search Suggestions. A mixed feed intersperses them.
- An older (Dec 2024) version allowed storing result text "**(excluding Links)**" for up to 30 days. That suggests Google treats the *links* as the protected part, and the links are exactly what we keep.

**The other side of the argument:** our cards aren't Gemini's output. They are the *retailer's own page data*, fetched and parsed by us. Gemini only pointed at the URL. Whether a URL learned from a grounded result is itself a "Grounded Result" is a question about how the defined term should be read. You are better placed than I am to answer that, and it turns on the current exact text, which I couldn't read directly from the sandbox.

**My recommendation:** don't build the business model on the generous reading.
- Use Gemini where the terms clearly fit: **live searches she starts herself** (Search, Decode a Look, Splurge vs. Save), shown to her with the Search Suggestions chip.
- Source the **pool** from data that is licensed for display. See Decision 1.

### 2. Grounding links are Google redirects, not store URLs [read]
They look like `vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQ…`, and their lifetime isn't documented. The real domain appears only in the chunk's `title` ([cookbook issue #1389](https://github.com/google-gemini/cookbook/issues/1389) [summary]). The harness already handles this: it follows each redirect to the landing page and verifies the destination. It also reports the hit rate for **model-stated URLs** and **grounding sources** separately, so we'll see whether the model's own URLs can be trusted at all.

### 3. The model named in the spec era is closed to new users [summary]
`gemini-2.5-flash` is now restricted to existing users. The default is `gemini-3.8-flash`, the model Google's own grounding cookbook uses [read]. You can change it with `GEMINI_MODEL`. On Gemini 3 and newer, grounding is **billed per search query the model runs**, not per prompt: 5,000 free per month, then $14 per 1,000. One prompt usually runs several queries. Google also reportedly gives Gemini 3 grounding **no free tier without billing**, so the key needs billing enabled.

### 4. Netlify scheduled functions die at 30 seconds [summary]
One grounded Gemini call, plus verifying its pages, can take longer than that. **Fix:** the nightly scheduled function only *kicks off* a **background function** (15-minute limit), which does the refill in batches. Synchronous functions get 60 s per the docs [summary], but the 6.0.3 package constant says 30 s [read], so I size everything to 30 s.

### 5. Netlify's free plan is 300 credits a month with a hard stop [summary]
Each production deploy costs 15 credits, and when credits run out "projects pause until the next billing cycle". Function compute and bandwidth also draw from the 300. That works out to roughly 15–18 deploys a month after a modest nightly refill. Busy build weeks could pause her app. Decision 4 covers this.

### 6. The background-removal library has three problems [read, from the npm tarball]
`@imgly/background-removal`:
- **is AGPL-3.0.** That's fine for a private one-user app, but worth knowing.
- **downloads 40–80 MB of model files.** There are open reports of iPhone tabs crashing.
- **needs CORS on every image.** Its speed mode also wants COOP/COEP headers that would *block* hotlinked Unsplash and retailer images.

**The cheaper trick:** most retailer product shots are on white or near-white studio backgrounds. On a neutral flat-lay canvas, CSS `mix-blend-mode: multiply` makes that white effectively disappear: no ML, no download, instant. Run real background removal only when she taps "cut out" on a lifestyle photo, using the small quantized model, downscaled, through our own image proxy. That same proxy is needed anyway for "export board as image", because canvas export breaks on images without CORS.

### 7. LTK's terms prohibit scraping [summary]
They bar robots, "screen scraping" and systematic retrieval ([LTK Terms](https://company.shopltk.com/ltk-terms-of-service)). The spec already limits us to one fetch of a public page when she pastes a link. That is the most defensible version, but it is still an automated fetch of their page. Two alternatives keep us off LTK's pages entirely:
- **She pastes the individual product links** (the liketk.it / rstyle.me shop links). We only resolve the redirect and land on the *retailer's* page.
- **She screenshots the post.** Claude reads it, and Gemini finds the items.

There is also a courtesy point. When an item comes from a creator's post, the **Buy button should use the creator's original link**, so the person who inspired the purchase gets the commission. I designed it that way and logged it in DECISIONS.md.

### 8. iOS: confirmed constraints [read]
- **No Web Share Target on iOS 27.** WebKit's manifest parser has no `share_target`. So the spec's iOS Shortcut plan is right.
- **Web Push works for home-screen apps** (iOS 16.4+). Permission must be requested from a tap. Every push must show a visible notification, or Safari revokes the permission. ([Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers))
- Home-screen apps are exempt from Safari's 7-day storage wipe [summary].

### 9. Smaller items
- **Unsplash** production apps get 1,000 requests/hour (demo apps 50). Moving to production needs an application with screenshots, so apply early. Call `download_location` when she *uses* a photo (save or decode), not on display. **Pexels** allows 200/hour and 20,000/month. Both are ample for one person.
- **Combining Gemini's structured output with grounding** is a Gemini 3 preview feature, with forum reports of grounding metadata coming back empty when a schema is enforced. So the harness asks for JSON in plain text and parses it defensively.
- **Google keeps Gemini prompts and outputs for 30 days**, with no zero-data-retention option ([ZDR doc](https://ai.google.dev/gemini-api/docs/zdr) [summary]). That's harmless here (decor searches), but don't send it anything personal.

---

## Cost: modeled, not measured

These are **assumption-based estimates** until the harness runs. Assumptions per grounded prompt: about 3 search queries, about 8k tool-context tokens, about 2k output and thinking tokens, and 5 candidates yielding 3.5 verified cards (the 70% gate).

| Per 100 verified cards | Gemini 3.8 Flash grounding + tokens | Claude tagging | Total |
|---|---|---|---|
| Tagging on Opus 5.5 (current default) | ≈ $1.65 | ≈ $2.00 | **≈ $3.65** |
| Tagging on Haiku 5.5 (your call; see Decision 3) | ≈ $1.65 | ≈ $0.05 | **≈ $1.70** |

A nightly refill of about 150 cards runs about 130 search queries, or about 3,900 a month. That is **inside the 5,000/month free grounding allowance**, so in steady state Gemini grounding could cost close to $0. That only matters if Decision 1 lets Gemini feed the pool at all.

---

## Decisions I need from you

1. **Pool sourcing, given Google's grounding terms.** Options, best first:
   - **(a) Official feeds for the pool; Gemini for live searches only. (Recommended.)** Pool candidates:
     - the **Etsy Open API** (free key; a huge handmade and vintage decor catalog);
     - the **eBay Browse API** (already on your list; it moves the v2 "Vintage Hunt" data source into v1);
     - **affiliate-network product feeds** (CJ / Rakuten / Impact / Awin, all free to join). These are product catalogs that West Elm-, Target- and Wayfair-tier retailers *license for display*, with real images and prices. A side effect: purchases through them can earn commission.

     Each of these is a new service, so I'm asking rather than adding it.
   - (b) Public `/products.json` catalogs of a curated list of ~50 Shopify-based decor brands. Real data, and a 100% hit rate by construction. But it is automated access to each store, so it's a gray zone under each store's terms.
   - (c) Keep Gemini in the pool on the reading that our cards are retailer data, not Grounded Results. This is your legal read to make, not mine.
2. **Where Phase 0 runs.** Fastest: run `npm run spike` on your laptop, which has unrestricted network. Most accurate: also deploy the spike function to Netlify and verify the same URLs from there. To run it in *this* cloud environment instead, give the environment broader network access and add the keys as environment variables (details in README.md).
3. **Tagging model.** I defaulted every Claude call to Opus 5.5. For bulk pool tagging, Haiku 5.5 is about 40× cheaper per card and the task is simple, so I'd recommend it there. It's a one-line env change (`CLAUDE_TAG_MODEL=claude-haiku-5-5`), but model choice is your call.
4. **Netlify plan.** The free 300 credits pauses the site when exhausted. Either we deploy sparingly (I can batch changes into fewer deploys) or you move to a paid plan. It's a paid service, so it's your call.
5. **Repo.** I built this in `find/` inside `atlas`, the one repo this session can reach, and touched nothing else. If you'd like it in its own repo, it lifts out cleanly; set Netlify's base directory to `find` either way.
