# Phase 0 report: prove the data before building the UI

**Status: gate not yet passed; nothing has been measured live.** The harness is built, tested, and ready to deploy to Vercel. Two things still stand between it and live numbers:

1. **One click from you on Vercel** to let this session deploy to your account. I send the link last, because it expires 10 minutes after it's created.
2. **API keys.** They go into Vercel's dashboard, where the deployed checks read them. Nobody has to paste them into a chat. The survey of retailer pages and the LTK test need no keys at all, so those run as soon as the deploy is live.

No screens have been built; that still waits on this gate.

---

## Your decisions, and what they changed

| You decided | What I did |
|---|---|
| **Pool = official feeds only** | Added eBay Browse API and Etsy Open API clients (`server/lib/feeds/`). Gemini is now used only for searches she starts herself (Search, Decode, Splurge vs. Save), shown with Google's Search Suggestions chip. |
| **Tagging on the most efficient, effective model** | Two parts, because of a terms finding (below). Pool cards are tagged **without any AI**, from the seller's own listing data, at $0 per card. Retailer pages she saves are tagged by **Haiku 5.5**. The spike tags the same cards with Haiku and Opus and reports how often they agree. If agreement is ≥75%, Haiku stays; if not, the numbers will show it. |
| **Free hosting** | **Vercel's free (Hobby) plan.** Deploys are free and unlimited, versus 15 credits each on Netlify. Your Vercel account is already connected here, so I can deploy and run the checks myself. Netlify code removed. |
| **Own repo if possible** | GitHub refused: this session's GitHub access can't create repositories. Until that's fixed, the code lives in `atlas/find`. Steps at the end. |

---

## New needles

### 1. eBay and Etsy restrict running their listings through AI
- **eBay's 2025 API License update** reportedly bars developers from feeding eBay data into generative AI tools ([EcommerceBytes](https://www.ecommercebytes.com/2025/07/18/ebay-restricts-developers-from-using-its-data-to-train-ai/), a trade report). The reported wording may cover only eBay's "Restricted APIs", but I couldn't read the license itself.
- **Etsy's API terms** bar using the API to collect Etsy content "for analytics, machine learning, licensing, or content removal unless expressly authorized" ([Etsy API terms, archived](https://www.etsy.com/legal/api-archived/)). The current page may differ.

Sending listing photos to Claude for tagging would arguably cross both lines. **What I did instead:** `tag-map.ts` matches our vocabulary against the seller's own words. That means eBay's item details (Material, Color, Style), Etsy's tags, materials and style fields, the title, and the search that found the card. It costs nothing and is instant. It is also more honest, because the tags are the seller's own descriptions. Tests confirm it handles the traps: "mid century modern" isn't also tagged "modern", "white oak" isn't tagged as a white piece, and a "floral print throw pillow" is a pillow, not a print.

### 2. Etsy's API access is tiered
Third-party guides describe Etsy app tiers: a personal app, plus a manual commercial review for wider access. Public listing search *should* work with a personal app key, but I couldn't confirm it from the official docs. Apply early. Etsy also now expects the key and shared secret together in its auth header; the client sends both when `ETSY_SHARED_SECRET` is set.

### 3. Feed prices go stale, so cards refresh before they're shown
Each card carries a `refreshAfter` time, a conservative 6 hours until I can read eBay's and Etsy's storage terms. The feed will re-fetch a card from the source before showing it past that point. That way the price on screen is never days old. It also keeps us inside whatever storage window the licenses set, without a cron job running every few hours.

### 4. What Vercel's free plan gives us
- **Scheduled jobs (cron) run only once a day**, and can start any time within the scheduled hour ([Vercel cron docs](https://docs.vercel.com/docs/cron-jobs/usage-and-pricing)). That suits the nightly refill exactly.
- **2 cron jobs** per account and **4 CPU-hours a month** of active compute ([limits](https://vercel.com/docs/limits)). Waiting on network calls isn't billed as active CPU on Fluid compute, which is mostly what this app does.
- **Personal, non-commercial use only.** That's fine as long as the app doesn't earn affiliate income, which matters for the next point.

### 5. Affiliate feeds are probably out regardless
Affiliate networks approve publishers that have real public audiences, which a private passcode app doesn't have. Most programs also forbid earning commission on your own purchases. And affiliate income would make the app "commercial" for Vercel's free plan. So the pool is eBay and Etsy for now, plus mainstream retailers through her own live searches.

### Earlier needles (unchanged, details in DECISIONS.md)
- Gemini grounding links are Google redirects, so they're followed before checking the page.
- `gemini-2.5-flash` is closed to new users, so the default is `gemini-3.8-flash`. Its grounding is billed per search query, after 5,000 free a month.
- `@imgly/background-removal` is AGPL, 40–80 MB, and has crashed iPhone tabs. Use CSS multiply first, and run the real cutout only on tap.
- LTK's terms forbid scraping, so: one fetch only when she pastes a link, and a screenshot as the alternative.
- No Web Share Target on iOS, so the iOS Shortcut plan stands. Web Push works for home-screen apps.

---

## Measured from Vercel's servers (iad1, 2026-10-28)

The deployed self-test passes 12 of 12 checks, so the numbers below come from the code in this repo, not from a bad upload.

**Retailer product pages (33 URLs: 20 real products, 13 traps).**
- **Real products:** 14 of 26 verified (about 54%). Today's recheck after the fixes matched: 3 of the 6 real products in batch B verified.
  - Verify cleanly: Anthropologie, Lulu & Georgia, Target, Walmart, Article. West Elm verifies some of the time.
  - Block servers: Pottery Barn, CB2, Crate & Barrel, RH, Home Depot, Lowe's and Etsy's website. The walls are PerimeterX, DataDome or Akamai. We report these as "blocked" and never try to get past them.
  - Unreadable: Zara Home is a JavaScript app with no product data in the page. Amazon serves cloud servers a stripped page.
- **Traps:** all 13 search, category and collection pages are now rejected. Earlier, IKEA and Lowe's category pages slipped through as products.
- **Prices:** the page states a price on about 57% of verified products. Target, Pottery Barn and West Elm draw the price in the browser, so those cards say "price unavailable" rather than showing a guess.

**LTK post (one real post, 25 tagged items).**
- **Link discovery:** every item link was found. LTK's own flag splits them into 10 exact matches and 9 similar ones, so a card can say which kind it is.
- **Click-through:** only 3 of 12 checked items verified (Walmart ×2, Target), and one was dead (404).
  - Most LTK links go through rstyle.me, which still lands on a redirect page rather than the retailer. The page carries the product name, so that hop is fixable.
  - Amazon item pages arrive stripped.
- **Caption:** the post caption isn't in the server-rendered page. We get LTK's generic line instead.

**What this means for the gate.**
- **Pool:** retailer pages can't carry the browsing pool on their own; about 54% is well below the 70% gate. That confirms the decision to fill the pool from the official eBay and Etsy feeds, which need no page fetching.
- **Pasted links:** these should still verify the retailer page. When a retailer blocks us, the app says "can't confirm from here" with the link, and never shows a made-up card.
- **Still unmeasured:** feed hit rate and Gemini live-search hit rate both need API keys (see below).

## What the deployed checks will measure

| Check | Needs keys? | Gate |
|---|---|---|
| **Retailer survey:** 20 real product pages across 14 retailers (Target, West Elm, CB2, Crate & Barrel, Pottery Barn, Walmart, Amazon, Article, Anthropologie, Lulu & Georgia, RH, Zara Home…) plus 13 edge cases and category pages that must be rejected. List in `spike/survey-urls.txt`. | No | Which retailers a server can verify, versus which put up a bot wall |
| **LTK decode** of your example post | No | Caption and links found; links resolve to real retailer pages |
| **Feeds:** eBay + Etsy across 8 decor searches | eBay / Etsy | ≥70% of requested cards complete (link + image + price); tag coverage |
| **Gemini live search:** the travertine-lamp test + 5 more | Gemini | ≥70% of requested cards verified |
| **Screenshot decode** (Claude) | Anthropic + Unsplash/Pexels | Items + search queries come back |
| **Photos:** 30 per source | Unsplash / Pexels | 30 real photos with credits |
| **Tagging:** Haiku vs. Opus on the same cards | Anthropic | Agreement ≥75% keeps Haiku |

## Cost, modeled (to be replaced by measured numbers)

| Per 100 cards | Cost |
|---|---|
| Pool card from eBay/Etsy (API calls free, tags rule-based) | **$0** |
| Live-search card: Gemini 3.8 Flash grounding + tokens | ≈ $1.65 (≈ $0 while inside 5,000 free searches/month) |
| Tagging a saved retailer page with Haiku 5.5 | ≈ $0.05 |
| Hosting on Vercel's free plan | $0 |

---

## What I need from you

1. **Approve Vercel access.** Tap the link in my message and approve. That lets this session create the project and deploy.
2. **Get the keys** and add them in Vercel → the `find` project → Settings → Environment Variables (I'll create the project first):
   - `ETSY_API_KEY` and `ETSY_SHARED_SECRET`: developers.etsy.com → Create a new app.
   - `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET`: developer.ebay.com → Application Keys, **Production** keyset. eBay asks production apps about marketplace account-deletion notices; we store no eBay user data, so choose the exemption.
   - `GEMINI_API_KEY`: aistudio.google.com, with billing enabled. Grounding on Gemini 3 has no free tier without it.
   - `ANTHROPIC_API_KEY`: console.anthropic.com.
   - `UNSPLASH_ACCESS_KEY`: unsplash.com/developers; apply for production early. `PEXELS_API_KEY`: pexels.com/api.
   - `APP_PASSCODE`: Sonny's passcode for the app, whatever you like.
3. **Own repo (optional):** create an empty private repo named `find` on GitHub, then make sure the Claude GitHub app has access to it at https://claude.ai/connect-github. I'll move the code over with its history.
