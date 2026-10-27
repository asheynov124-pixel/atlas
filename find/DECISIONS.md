# Decisions

One line each: the choice, then why. Newest at the bottom of each section.

## Project
- **Lives in `find/` inside the `atlas` repo.** It's the only repo this session can reach. It's self-contained, so it can move to its own repo unchanged.
- **The Phase 0 code is production code (`server/lib`), not a throwaway script.** The verifier, parsers and API clients are exactly what the pool, search and decode functions will call.
- **TypeScript everywhere; server modules are never imported by client code.** This keeps keys out of the bundle by construction, not just by grep.

## Data integrity ("real items only")
- **A card exists only after its page is fetched and classified `ok`.** The model's say-so is never enough.
- **Image, title and price come from the retailer page's structured data (JSON-LD → Open Graph → microdata), never from model text.** Model prices are hallucination-prone, and the page is the ground truth.
- **No structured price → `price: null` → "price unavailable".** Reading a price out of page prose risks grabbing a "you might also like" price.
- **Bot walls are recorded as `blocked`, never bypassed.** We respect retailers' choices, and the report shows which ones are unreachable.
- **Canonical URL (tracking stripped, sorted query, no trailing slash) is the dedupe key.** The same lamp found twice should be one card.
- **Unknown model prices show as "unknown", not $0.** A stale price table should be visible, not silently cheap.

## Gemini
- **Default model `gemini-3.8-flash`, overridable via `GEMINI_MODEL`.** 2.5 models are closed to new users, and 3.8 Flash is what Google's grounding cookbook uses.
- **`generateContent`, not the newer Interactions API.** Google's cookbook says grounding source display isn't available in Interactions yet.
- **Ask for JSON in plain text and parse it defensively, rather than enforcing a response schema.** Schema plus grounding is a Gemini 3 preview with reports of empty grounding metadata.
- **Measure model-stated URLs and grounding-source URLs separately.** This tells us which path to trust before building on it.
- **Keep `searchEntryPoint.renderedContent`.** Google requires the Search Suggestions chip wherever grounded results are shown.
- **Pending (Decision 1 in PHASE0.md): Gemini for user-initiated live search only; pool from licensed feeds.** Google's grounding terms appear to bar caching, interspersing, and showing results to anyone but the prompter.

## Claude
- **Every call defaults to `claude-opus-5-5`; tagging and vision models are env-overridable.** Model downgrades for cost are the owner's call. Haiku 5.5 is recommended for bulk tagging in PHASE0.md.
- **Structured output via `betaZodOutputFormat` with enums from `vocab.ts`.** Tags can't drift outside the taste-profile vocabulary.
- **Server-side refusal fallback (`fallbacks: "default"`) on every call.** A rare safety decline re-runs on Anthropic's recommended fallback model instead of failing the request.
- **Effort: `medium` for screenshot decode, `low` for tagging.** Decoding a room needs care; tagging is a simple classification.
- **Claude reports literally visible brand/price text but never guesses brands.** That keeps the "never fabricate" rule intact on the vision side.

## Decode a Look
- **Site-agnostic link harvesting (embedded JSON, devalue-flattened Nuxt state, anchors, escaped affiliate URLs) instead of a per-site LTK parser.** It survives LTK redesigns and works on blogs too.
- **Buy links on creator-sourced items keep the creator's original (affiliate) link.** The person who inspired the purchase should get credit; the canonical URL is only for dedupe.
- **One fetch per pasted link, only on her action; no crawling.** This fits LTK's anti-scraping terms. Pasting product links or a screenshot avoids LTK's pages entirely.

## Netlify
- **Nightly refill = scheduled function (30 s cap) that triggers a background function (15 min).** A grounded search plus verification can exceed 30 s.
- **Spike verifier keeps per-page timeouts at 6 s, 4 at a time, max 12 URLs.** It stays under the 30 s synchronous limit in the 6.0.3 package (docs say 60 s; we size to the stricter one).
- **Env read via `Netlify.env` with `process.env` fallback.** The same code runs in functions and local scripts.

## Boards (decided early because it shapes the image pipeline)
- **Default "cutout" is CSS `mix-blend-mode: multiply` on the neutral canvas; ML background removal only on tap.** Most product shots are on white. `@imgly/background-removal` is AGPL, 40–80 MB, CORS-dependent, and reported to crash iPhone tabs.
- **An image proxy function is required.** Canvas export and ML cutouts both need CORS-clean pixels, and retailer CDNs rarely send CORS headers.
