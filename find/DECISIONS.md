# Decisions

One line each: the choice, then why. Newest at the bottom of each section.

## Project
- **Lives in `find/` inside the `atlas` repo for now.** The session's GitHub access can't create repositories; it moves to its own repo (with history) once one exists.
- **Hosting: Vercel's free (Hobby) plan, not Netlify.** Netlify's free 300 credits pause the site and charge 15 per deploy; Vercel deploys are free, and its once-a-day cron fits the nightly refill.
- **The Phase 0 code is production code (`server/lib`), not a throwaway script.** The verifier, parsers and API clients are exactly what the pool, search and decode functions will call.
- **TypeScript everywhere; server modules are never imported by client code.** This keeps keys out of the bundle by construction, not just by grep.

## Data integrity ("real items only")
- **A card exists only after its page is fetched and classified `ok`.** The model's say-so is never enough.
- **Image, title and price come from the retailer page's structured data (JSON-LD → Open Graph → microdata), never from model text.** Model prices are hallucination-prone, and the page is the ground truth.
- **No structured price → `price: null` → "price unavailable".** Reading a price out of page prose risks grabbing a "you might also like" price.
- **Bot walls are recorded as `blocked`, never bypassed.** We respect retailers' choices, and the report shows which ones are unreachable.
- **Canonical URL (tracking stripped, sorted query, no trailing slash) is the dedupe key.** The same lamp found twice should be one card.
- **Unknown model prices show as "unknown", not $0.** A stale price table should be visible, not silently cheap.

## Pool sourcing (decided by the owner: official feeds only)
- **Pool cards come only from eBay Browse API and Etsy Open API v3.** Licensed for display, with real listing images, prices and links. Gemini results never enter the pool.
- **Pool cards are tagged from the seller's own listing data, never by an AI model.** eBay's 2025 license reportedly bars feeding its data to generative AI, and Etsy's terms bar using its content for machine learning. It's also free and instant.
- **Tag matcher: longest phrase first, matched text blanked out, category = last head noun before "with/for".** So "mid century modern" isn't also "modern", and a "floral print pillow" is a pillow.
- **Each card has `refreshAfter` (6 h, conservative) and is re-fetched before being shown past it.** Prices on screen stay fresh, inside any storage window the licenses set, without frequent crons.
- **eBay: fixed-price items in Home & Garden, with item aspects fetched for the top results.** Aspects (Material/Color/Style) are the best tag source but cost one call each.
- **Etsy: send `keystring:shared_secret` when a secret is set; always show Etsy's trademark notice.** Etsy's current auth format, and its required attribution.
- **Affiliate feeds not pursued.** Approval needs a public audience, self-purchase commissions are typically barred, and income would make the app commercial on Vercel Hobby.

## Gemini
- **Default model `gemini-3.8-flash`, overridable via `GEMINI_MODEL`.** 2.5 models are closed to new users, and 3.8 Flash is what Google's grounding cookbook uses.
- **`generateContent`, not the newer Interactions API.** Google's cookbook says grounding source display isn't available in Interactions yet.
- **Ask for JSON in plain text and parse it defensively, rather than enforcing a response schema.** Schema plus grounding is a Gemini 3 preview with reports of empty grounding metadata.
- **Measure model-stated URLs and grounding-source URLs separately.** This tells us which path to trust before building on it.
- **Keep `searchEntryPoint.renderedContent`.** Google requires the Search Suggestions chip wherever grounded results are shown.
- **Gemini only for searches she starts herself, shown with the Search Suggestions chip.** Google's grounding terms appear to bar caching, interspersing, and showing results to anyone but the prompter.

## Claude
- **Screenshot decode on `claude-opus-5-5`; tagging saved retailer pages on `claude-haiku-5-5`; both env-overridable.** The owner asked for the most efficient effective model. Tagging is short classification at about 1/40th the price on Haiku; decoding her screenshots is low volume and quality-critical.
- **The spike tags the same cards with Haiku and Opus and reports agreement (≥75% keeps Haiku).** The model choice gets evidence, not just an assumption.
- **Structured output via `betaZodOutputFormat` with enums from `vocab.ts`.** Tags can't drift outside the taste-profile vocabulary.
- **Server-side refusal fallback (`fallbacks: "default"`) on models that support it; none on Haiku 5.5.** Haiku 5.5 has no server-side fallback, so a declined tag request just leaves a card untagged.
- **Effort: `medium` for screenshot decode, `low` for tagging.** Decoding a room needs care; tagging is a simple classification.
- **Claude reports literally visible brand/price text but never guesses brands.** That keeps the "never fabricate" rule intact on the vision side.

## Decode a Look
- **Site-agnostic link harvesting (embedded JSON, devalue-flattened Nuxt state, anchors, escaped affiliate URLs) instead of a per-site LTK parser.** It survives LTK redesigns and works on blogs too.
- **Buy links on creator-sourced items keep the creator's original (affiliate) link.** The person who inspired the purchase should get credit; the canonical URL is only for dedupe.
- **One fetch per pasted link, only on her action; no crawling.** This fits LTK's anti-scraping terms. Pasting product links or a screenshot avoids LTK's pages entirely.

## Vercel
- **Functions are web-standard `GET(req: Request)` handlers in `api/`; shared code in `server/lib` and `spike/`.** No platform lock-in, and the same code runs in the CLI.
- **Phase 0 runs from Vercel's servers via `api/spike.ts`, guarded by a throwaway `SPIKE_TOKEN`.** Retailers treat cloud IPs differently from home connections, and this is where the app runs.
- **Relative imports use `.js` specifiers.** That's the portable Node ESM convention, which tsx, vitest and Vercel's builder all resolve to `.ts`.
- **Nightly refill = the free plan's one daily cron.** Vercel runs it once a day, anywhere within the scheduled hour, which is fine for a refill.

## Boards (decided early because it shapes the image pipeline)
- **Default "cutout" is CSS `mix-blend-mode: multiply` on the neutral canvas; ML background removal only on tap.** Most product shots are on white. `@imgly/background-removal` is AGPL, 40–80 MB, CORS-dependent, and reported to crash iPhone tabs.
- **An image proxy function is required.** Canvas export and ML cutouts both need CORS-clean pixels, and retailer CDNs rarely send CORS headers.
