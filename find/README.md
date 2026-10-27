# Find

Sonny's style app: scroll, fall for something, hunt it, collect it, and discover a style along the way. **Real items only.**

**Current phase: 0 (data spike).** There is no UI yet, by design. Read [PHASE0.md](PHASE0.md) for findings and the decisions waiting on you, and [DECISIONS.md](DECISIONS.md) for why things are the way they are.

## Setup

```bash
cd find
npm install
npm test          # 36 offline tests (fixture HTML, no keys or network needed)
npm run typecheck
```

## Environment variables

| Variable | Needed for | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Screenshot decode, tagging | |
| `GEMINI_API_KEY` | Grounded product search | Billing must be enabled: Gemini 3 grounding has no free tier without it |
| `UNSPLASH_ACCESS_KEY` | Room photos | Apply for production (1,000 req/h) early; demo apps get 50 req/h |
| `PEXELS_API_KEY` | Room photos | 200 req/h, 20k/month |
| `APP_PASSCODE` | The passcode gate (and the spike endpoint) | |
| `CLAUDE_VISION_MODEL`, `CLAUDE_TAG_MODEL` | Optional | Default `claude-opus-5-5` |
| `GEMINI_MODEL` | Optional | Default `gemini-3.8-flash` |
| `XAI_API_KEY`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `DAILY_SPEND_CAP_USD` | Later phases | |

See `.env.example`. On Netlify, set these under **Site configuration → Environment variables** with the Functions scope included. Keys are read only by server code in `server/` and `netlify/functions/`.

## Running Phase 0

**1. On your laptop (fastest; unrestricted network):**
```bash
cp .env.example .env   # fill in keys
set -a; source .env; set +a
npm run spike                              # all steps
npm run spike -- --only gemini             # one step
npm run spike -- --screenshot ~/room.jpg   # decode your own screenshot
npm run spike -- --urls urls.txt           # verify a list of product URLs
```
Results are written to `spike/results/latest.md` (gitignored). It includes the hit rate and the pass/fail verdict on the 70% gate.

**2. From Netlify's servers (the hit rate that counts):** Retailers treat cloud server addresses more harshly than a home connection, and the nightly refill will run on Netlify. Deploy with base directory `find`, then:
```bash
curl -X POST https://<site>.netlify.app/api/spike/verify \
  -H "x-passcode: $APP_PASSCODE" -H "content-type: application/json" \
  -d '{"urls":["https://…","https://…"]}'
```
Feed it the URLs from a laptop run and compare the outcomes.

**3. In a Claude Code cloud session:** add the keys as environment variables in the cloud environment's settings and give it broad network access. The verifier has to reach arbitrary retailer domains, so a short allowlist won't do. Then run with `NODE_USE_ENV_PROXY=1 npm run spike`, because Node's `fetch` ignores the sandbox proxy otherwise. Settings: https://code.claude.com/docs/en/cloud-environments#network-access

## Costs

Modeled estimates are in PHASE0.md: about $1.70–$3.65 per 100 verified cards, depending on the tagging model. A Phase 0 run replaces them with measured numbers. Netlify's free plan is 300 credits a month and **pauses the site when they run out**; each production deploy costs 15.

## Layout

```
server/lib/   verify, product-page, gemini, claude, decode-link, photos, vocab, cost  (server-only)
spike/        Phase 0 runner
netlify/      functions (spike-verify for now)
test/         vitest, fixture-based
public/       placeholder until the Phase 1 Vite build
```

## Installing on iPhone

Comes with the PWA phase: Safari → Share → Add to Home Screen. The Share-sheet Shortcut for "Decode a Look" comes with Phase 5. iOS still has no Web Share Target for web apps, so a Shortcut is the only route.
