# Find

Sonny's style app: scroll, fall for something, hunt it, collect it, and discover a style along the way. **Real items only.**

**Current phase: 0 (data spike).** There is no UI yet, by design. Read [PHASE0.md](PHASE0.md) for findings and what's waiting on you, and [DECISIONS.md](DECISIONS.md) for why things are the way they are.

## Setup

```bash
cd find
npm install
npm test          # offline tests (fixture HTML, mocked APIs; no keys or network needed)
npm run typecheck
```

## Where the data comes from

| Layer | Source | Notes |
|---|---|---|
| Product pool (the feed) | **eBay Browse API**, **Etsy Open API v3** | Official, licensed listings. Tagged from the seller's own data, never by AI (both APIs' terms) |
| Live search, Decode a Look, Splurge vs. Save | **Gemini + Google Search grounding**, then a page check | Only for searches she starts herself; shown with Google's Search Suggestions chip |
| Room photos | **Unsplash**, **Pexels** | Hotlinked, with photographer credit |
| Screenshot reading | **Claude Opus 5.5** | |
| Tagging saved retailer pages | **Claude Haiku 5.5** | |

## Environment variables

Set these in **Vercel → project `find` → Settings → Environment Variables** (or a local `.env`; see `.env.example`). Keys are read only by server code in `server/`, `spike/` and `api/`.

| Variable | For | Where to get it |
|---|---|---|
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | Pool | developer.ebay.com → Application Keys (Production). Choose the account-deletion exemption; we store no eBay user data |
| `ETSY_API_KEY`, `ETSY_SHARED_SECRET` | Pool | developers.etsy.com → Create a new app |
| `GEMINI_API_KEY` | Live search | aistudio.google.com, billing enabled |
| `ANTHROPIC_API_KEY` | Screenshots, tagging | console.anthropic.com |
| `UNSPLASH_ACCESS_KEY` / `PEXELS_API_KEY` | Room photos | unsplash.com/developers (apply for production early) / pexels.com/api |
| `APP_PASSCODE` | The app's passcode gate | Your choice |
| `SPIKE_TOKEN` | Phase 0 endpoint only | Random; set at deploy, delete after Phase 0 |
| `CLAUDE_VISION_MODEL`, `CLAUDE_TAG_MODEL`, `GEMINI_MODEL` | Optional overrides | Defaults: `claude-opus-5-5`, `claude-haiku-5-5`, `gemini-3.8-flash` |

## Running Phase 0

**From Vercel's servers (the numbers that count, because the app runs there):**
```
https://<project>.vercel.app/api/spike?token=$SPIKE_TOKEN&step=survey&urls=<url1>,<url2>   # up to 20 product pages
https://<project>.vercel.app/api/spike?token=$SPIKE_TOKEN&step=ltk
https://<project>.vercel.app/api/spike?token=$SPIKE_TOKEN&step=feeds      # or gemini | photos | vision | tagging | all
```
Add `&format=json` for raw output. The survey URLs live in `spike/survey-urls.txt`.

**From a laptop:**
```bash
set -a; source .env; set +a
npm run spike                              # every step that has keys
npm run spike -- --only feeds,gemini
npm run spike -- --screenshot ~/room.jpg   # decode your own screenshot
npm run spike -- --urls spike/survey-urls.txt
```
In a Claude Code cloud session, prefix the command with `NODE_USE_ENV_PROXY=1`, because Node's `fetch` ignores the sandbox proxy otherwise.

## Deploying (free)

Vercel's Hobby plan:
- Deploys are free and don't count against a credit budget.
- Cron jobs run once a day, which suits the nightly refill.
- It's for personal, non-commercial use, which this app is.

`vercel.json` serves `public/` and the functions in `api/`. Phase 1 switches `public/` to the Vite build.

## Layout

```
api/              Vercel functions (spike.ts for now)
server/lib/       verify, product-page, gemini, claude, decode-link, photos, vocab, cost (server-only)
server/lib/feeds/ ebay, etsy, tag-map (rule-based tags), types (PoolCard)
spike/            Phase 0 steps (shared by CLI and endpoint), runner, report, survey URLs
test/             vitest, fixture-based
public/           placeholder until the Phase 1 Vite build
```

## Installing on iPhone

This comes with the PWA phase: open the Vercel URL in Safari, then Share → Add to Home Screen. The Share-sheet Shortcut for "Decode a Look" comes with Phase 5. iOS still has no Web Share Target for web apps, so a Shortcut is the only route.
