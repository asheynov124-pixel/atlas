# PH Discovery — vertical swipe discovery PWA (mock-data prototype)

A mobile-first PWA (tuned for iPhone/iPad) that turns discovery into a TikTok-style
vertical feed: you teach it your taste with swipes, it builds parallel **Smart Paths**,
and you can circle part of a frame to spin off a new path about *that*.

The whole experience runs on a local mock data layer: a deterministic catalogue of
~900 fictional clips, procedural visuals standing in for video, and a rules-based mock
"AI". The same interfaces are meant to take a live source and real models later.

![Feed, menu, paths, and Aspect Capture](docs/screens-feed.jpg)
![Search, paste-link, boards, history, insights, filters](docs/screens-organize.jpg)

## Run it

```bash
cd discovery
npm install
npm run dev            # http://localhost:5173 (also on your LAN via --host)
npm test               # 137 unit tests (engine, AI, data layer, gestures, store/privacy, regressions, import)
npm run build          # typecheck + production build + service worker
npx vite preview --port 4173 &
npm run e2e            # 43 Playwright checks at iPhone 14 size, real gestures (import runs on offline fixtures)
```

**Shareable demo build:** `npx vite build --config vite.demo.config.ts` writes `dist-demo/`, a
version that loads React from cdnjs and skips the service worker, so it can be hosted inside
a sandboxed page.

**On an iPhone:** run `npm run dev`, open the LAN address in Safari, then Share → *Add to
Home Screen*. As a standalone PWA there is no browser back-swipe fighting the left-edge
gesture. In a plain Safari tab (and on Android with gesture navigation), the OS owns the
outermost edge. Use two fingers for path switching there. If the system back gesture does
fire, the app treats it as in-app back: it closes the top sheet, capture, or tab instead of
leaving.

## Gestures

| Gesture | Discovery scheme (default) | Classic scheme (TikTok-style) | Tap fallback |
|---|---|---|---|
| Swipe right / left | Like / Pass (+ haptic, learning signal) | same | ♥ / ✕ on the rail |
| Swipe up | Save (+ haptic) | Next clip | 🔖 on the rail |
| Swipe down | **Aspect Capture** (pause + annotate) | Previous clip | ⌖ on the rail |
| Edge strip or two fingers ↑↓ | Next / previous clip | same | ▲ ▼ mini buttons, wheel, J/K |
| Edge strip or two fingers ←→ | Switch Smart Path | same | ‹ › in the path bar, `[` `]` |
| Long-press | Full menu | same | ⋯ on the rail |
| Double-tap | Like without moving on | same | — |
| Tap | Play / pause | same | Space |

First run shows a gesture guide, and contextual tips appear later. *You → Playback &
gestures* switches scheme, handedness, "move on after like/save", immersive overlay, and
data saver (preload 1 instead of 2).

Haptics use the Vibration API on Android. iOS has no Vibration API, so on iOS 18+ the app
toggles a hidden `<input type="checkbox" switch>` inside the gesture handler, which
produces the system tick.

## What's in it

- **Search:** keyword (titles, performers, tags, studios, series), natural language
  ("blonde petite romantic under 10 min, no outdoor", "looks like Mira Vale", "warm dark
  grainy"), paste-a-link, and visual search seeded from any clip you've seen. The AI's
  interpretation shows as **removable chips**. Results open as a feed or seed a path.
  Recent searches and profile-based suggested queries appear when the box is empty.
- **Smart Paths:** For You (multi-interest AI blend), Related, Same performer, Visually
  similar (face / body / pose / composition / overall), Matching acts, Tag overlap, Same
  studio, Series (in order), Contrast (deliberately outside your taste), Aspect (from a
  capture), AI cluster, Search, and Collection (any board, smart collection, or history
  slice). Paths are infinite, buffered queues, re-ranked in near real time after each
  explicit signal.
- **Learning:** explicit signals (like, pass, save, capture, more/less) plus implicit ones
  (watch-through, replays, quick skips). Each taste profile is a full silo: signals,
  paths, library, history, filters, and blocks. The model is a **pure fold over the signal
  log** with a 45-day half-life, so deleting a signal or resetting a profile removes its
  effect exactly. You can inspect and edit every learned weight, hard-block anything
  (separate from Pass), and get proactive AI path ideas once there's enough signal.
- **Organization:** saves carry auto-metadata (source path, clip position, time) plus your
  note and custom tags. There are boards, AI-suggested boards (clusters of your saves),
  and smart collections by performer, act, studio, custom tag, liked, replayed,
  watched-through, and saved this week. Every collection replays as a feed. History is a
  session timeline with **jump** (back to that spot in its path) and **branch** (start a
  new path from that clip).
- **Video & overlay:** full-screen vertical players, muted autoplay, preload next 2,
  fallback chain **embed → direct source → open original**, a minimal overlay with an
  expandable details sheet (including "why you're seeing this"), and open-original on
  every clip.
- **Deep filters:** performer include/exclude and attributes, tag logic (must have / any of
  / exclude), soft tag weights, studios, style, quality, length, year, a
  familiar↔discovery slider, and saved presets. Filters apply per path or profile-wide.
- **Privacy:** everything stays in IndexedDB on the device. **Incognito** pauses all disk
  writes (signals, history, searches, *and* path progress), and turning it off rewinds to
  the pre-incognito state. Also included: pause learning, discreet (blurred) thumbnails, PIN
  app lock (armed before first paint), export/import JSON, per-profile reset, and erase
  everything. There's an 18+ gate on first run and a query safety gate (below).

## Personal Import

*Library → Import* (or the **+ Import** button) turns links into native clips. Images,
videos, and gallery pages become things you can swipe, like, save, filter, and put on
boards. They're stored only on this device.

- **In:** paste (or **Paste from clipboard**), drop files or links, or upload `.txt`,
  `.csv` (header columns like `url,title,tags,type` are recognised), `.json` (any shape,
  including a previous export), or a **saved `.html` page**.
- **Direct files** (`jpg jpeg png webp gif avif bmp svg`, `mp4 webm mov m4v ogv mkv`, or
  CDN `?format=` hints) import instantly. **Page links** are read only when you press
  *Find media*: once per page, from the device, with no cookies or referrer, and only if
  the site allows cross-origin reads (CORS). There's no proxy and no background
  crawling. Previews and playback load the files you pasted the way any web page loads
  an image (no referrer). Data saver holds previews until you ask.
- **Gallery pages** (no media extension, or a path like `/galleries/`, `/album/`,
  `/photoset/`, `/post/`, `.php`/`.html`) are labelled **Gallery page**. A page that
  gives up no media says why, on its own row: *"Could not read images from this page
  (site blocked access). Open the page, copy direct image links, and paste those
  instead."* (or the real reason: an HTTP status, a timeout, a script-built page). The
  row has **Open page** and **Read again**, and starts **unticked**. Tick it to keep the
  page as an open-original bookmark; in the feed that's a *Gallery page* card with
  **Open page** and **Paste links**. A page read once is **cached for the session**, so
  re-pasting it, or pressing *Find media* again, is instant and sends no request.
  *Read again* really re-reads it. The cache lives in memory only and is cleared on a
  profile switch, at the end of incognito, and on wipe.
- **Direct links win.** A link that is plainly an image always previews and plays as an
  `<img>`. A link with no extension and no page-like path (`cdn.site/i/abc123`) is
  *tried* as a picture first, in the preview and in the feed. If it loads, it becomes an
  Image. Only a real load error falls back to the open-original card. Paste pages and
  direct links together, and each is handled on its own. **Skip the pages** imports
  just the direct ones. The **I have direct links** tip shows what they look like and
  how to copy one (right-click → *Copy Image Address*; on iPhone, touch and hold →
  *Open in New Tab*, then copy the address). The honest workaround for a page that
  won't open up is still to save it and upload the `.html`.
- **Extraction reads** og/twitter meta (including `twitter:player:stream`), `<video>`
  and `<source>` (with posters), `<img>` `src`, `srcset` (widest), and every common lazy
  attribute (`data-src`, `data-lazy-src`, `data-original`, `data-srcset`, `data-lazy`,
  WordPress `data-orig-file`, zoom/full variants). It also reads `<a href>` to media and
  thumbnail tiles linked to full-size files. **Lightboxes** are covered too: Fancybox,
  PhotoSwipe (`data-pswp-src` and its published width and height), lightGallery,
  GLightbox, Magnific and `rel="lightbox"` links, even when the full-size link has no
  extension, and full-size URLs parked on a wrapper instead of a link. Beyond that, it
  reads microdata (`itemprop="contentUrl"`), JSON-LD `ImageObject`/`VideoObject`
  (including `@graph`), and inline gallery JSON. Gallery JSON is walked item by item,
  taking each photo's largest variant (`original`/`full`/`large`… and nested size maps,
  by published dimensions) and keeping the small one as its preview; escaped `\/` and
  `\u002F` URLs are handled. It also reads `data-gallery`-style attributes and background
  images inside content areas. Three or more sibling
  tiles become a **gallery set**, and next-page and gallery sub-page links can be
  scanned on request.
- **Heuristics:** size variants (`-150x150`, `/thumbs/`, `?w=`, pixel-size folders like
  `/460/…` vs `/1280/…`) collapse into the largest version, with the small one kept as the
  preview and never listed as its own item. Logos, icons, spacers, 1×1 pixels,
  tiny SVGs, and known ad/tracker hosts (including the adult ad exchanges) are dropped
  and counted. Header, footer, and ad-slot images rank below gallery content. URLs are
  normalised (tracking params stripped) and deduped against the batch and the library.
  The same **safety gate** as search applies to every URL's words and to everything you
  type: titles, tags, notes, and batch names, before and after import, and on restored
  backups. Imports are capped at 2,000 items per batch.
- **Review:** type, origin, and flag badges; include/exclude; multi-select; per-item
  and batch tags with suggestions drawn from hostnames and path words; an auto-created
  board (named after the dominant host or `Import YYYY-MM-DD`); scan progress; and a
  partial-success summary.
- **Bulk titles:** prefix, suffix, find/replace (plain or regex, case toggle),
  capitalize, Title Case, use file name, `Hostname – #`, on a selection or everything,
  with undo/redo. Available before and after import.
- **Keyboard:** ⌘/Ctrl V paste · ⌘↵ start (scan, then import) · ⌘A select all · ⌫/Del
  exclude · ⌘E title editor · ⌘S save titles · ⌘⇧E export. In the editor: ↑↓ rows,
  ⇧↑↓ extend selection, Tab between fields, ⌘Z / ⌘⇧Z. Press **?** for the cheat sheet.
- **Batches:** *Library → Imports* lists every batch (date, count, re-open, swipe,
  export, delete). **Export** downloads JSON (`url, title, tags, mediaType, originalUrl,
  thumbnailUrl, notes, added`) or a plain URL list, and either one re-imports. Deleting
  a batch removes its clips from saves, boards, signals, history, and queues.
- **As clips:** stills play full-screen (tap to switch fit and fill), and dwell counts as
  watch time. Videos use the normal player fallback. Pages show a *Gallery page* card.
  Imports join search, For You, "more from this set/site", the persistent **Imported**
  Smart Path, the **Imports** smart collection, and a **Source** filter (catalogue / my
  imports). A site can be hard-blocked like a studio. Data saver holds remote
  thumbnails. Incognito imports work, but vanish when incognito ends.
- **Never by face or body:** imported media gets a synthetic embedding built from its
  page, site, and tags, not from pixels. Imports are compared on pose and composition
  only, so face- or body-similar paths and lookalike searches never surface them, and
  capture doesn't read faces or bodies on imports (see the biometrics note below).

## Architecture

```
src/
  data/           ← the contract
    types.ts        DataSource interface + every shared type
    api.ts          active source + summary/detail caches (swap the source here)
    links.ts        paste-link parsing (viewkey / /video/<id> / fallback)
    safety.ts       query gate: minors & non-consent terms are refused outright
    mock/           deterministic catalogue + MockDataSource (latency/error/embed-fail knobs)
  ai/             ← AI hooks (mock provider today)
    index.ts        AIProvider interface: interpretQuery, interpretAspect, embedFrame
    interpret.ts    NL → tags/performers/attributes/durations/visual target + chips
    aspect.ts       drawn region + words → facet weights + focused vector
    cluster.ts      k-means++ (cosine)
    suggest.ts      path ideas, board ideas, suggested queries, cluster naming
  engine/         ← pure, unit-tested
    learning.ts     signal values, implicit-signal rules, fold → TasteModel
    ranking.ts      relevance × taste × filters, blocks, MMR diversity, reasons
    paths.ts        path kinds → candidate queries → ranked, buffered queues
    filters.ts      deep filters: hard constraints + soft weights, merge rules
  state/          ← zustand stores
    store.ts        persisted (IndexedDB) app state, per-profile silos
    feed.ts         feed controller: buffering, nav, view tracking, judge/save/block
  gestures/       ← classify.ts (pure) + useStageGestures.ts (pointer engine) + haptics
  player/         ← renderer.ts (procedural clips) + ClipPlayer.tsx (fallback chain, stills)
  import/         ← Personal Import
    extract.ts      text/CSV/JSON/HTML → candidates; gallery extraction; finalize (dedupe, safety, titles)
    scan.ts         the only network step: explicit, CORS-respecting page fetch
    titles.ts       bulk title patterns + coalescing undo/redo
    exportBatch.ts  JSON / URL-list export (re-importable)
    model.ts        ImportItem → VideoSummary/VideoDetail, synthetic embedding, tag matching
    localSource.ts  WithImports: layers imports over any DataSource
    draft.ts        the in-progress import (session-only)
  views/, components/
```

### The data-layer contract

`src/data/types.ts` defines `DataSource`:

```ts
search(query, filters?, page?)  → SearchResults   // keyword + structured + visual target
getVideo(id)                    → VideoDetail     // metadata + performers + playback chain
getVideos(ids)                  → VideoSummary[]
getSimilar(seed, page?)         → SearchResults   // seed: video+facets | embedding(+mask) | tags
explore(page?)                  → SearchResults   // broad candidate pool for blends
resolveUrl(url)                 → ResolvedLink | null
taxonomy()                      → tags, performers, studios, series
```

The source returns *candidates with relevance*; the client re-ranks with the local taste
profile. That split keeps learning on the device.

**Wiring a live source later:** implement `DataSource`, call `setDataSource()` in
`src/data/api.ts`, and make sure every `VideoSummary` carries an `embedding` (32 dims =
face·body·pose·composition × 8, or change `FACET_DIM`) and an `originalUrl`. For real
media, return `{kind:'embed'|'source', url}` playback options; `ClipPlayer` already
handles iframe embeds and `<video>` sources and falls through to "open original".

**Wiring real AI:** implement `AIProvider` (`src/ai/index.ts`). `interpretQuery` →
LLM-structured output in the `Interpretation` shape; `embedFrame` → a CLIP-style image
encoder over a captured frame or region; keep `interpretAspect`'s `steps` so the UI can
show its reasoning.

### Why the mock "AI" gives believable results

Embeddings aren't random. A clip's face/body facets come from its performers, pose from
its acts, and composition from studio, setting, and style tags. The procedural renderer
draws *those numbers*: glow hue from the face vector, figure shape from the body vector,
arrangement from pose, light and grain from composition. So "visually similar: face"
really does return clips that look alike. Circling the head in Aspect Capture weights the
face facet, and circling the background weights composition, because the hit test
reads the renderer's own geometry.

## Mock data layer console

*You → Mock data layer* sets latency, jitter, error rate (up to 100%), and the embed
failure rate, so you can watch skeletons, retry states, and the playback fallback chain.
**Seed a demo taste** fast-forwards ~20 likes, 5 passes, and 8 saves so clusters, AI
path ideas, and board suggestions appear immediately.

## Known limits / next steps

- Visuals are procedural stand-ins, and the mock clips are silent. Real playback paths
  exist but are untested against a live host.
- The mock AI is rules plus synthetic embeddings. Swap in real models via `AIProvider`.
- Visual search is deliberately seeded only from catalogue clips/frames, **never from an
  uploaded photo of a person**. See the legal notes for why that line matters.
- No sync. Everything is local by design (see privacy note below before adding any).

## Before connecting live data — legal flags (verify before relying)

These are notes for counsel, not legal conclusions:

1. **Age verification.** *Free Speech Coalition v. Paxton* (U.S. June 27, 2025) upheld
   Texas's HB 1181 under intermediate scrutiny, and roughly two dozen states now have
   similar laws. A click-through 18+ gate like this prototype's is not verification.
   Whether an embed/aggregator app is itself the "commercial entity" that "publishes or
   distributes" the material is the threshold question, and it will turn on how the live
   integration is built.
2. **Viewing history is sensitive data.** NJ's Data Privacy Act (effective Jan. 15, 2025)
   treats data revealing "sex life or sexual orientation" as *sensitive*, which means
   opt-in consent once a controller meets the applicability thresholds. Adult-content
   preferences plausibly qualify. Local-first storage sidesteps this only while nothing
   leaves the device. Any analytics pixel or SDK also invites **VPPA** (18 U.S.C. § 2710)
   claims, the current class-action favourite for video sites.
3. **Biometrics.** Face-similarity embeddings of real performers may be "biometric
   identifiers" under Illinois BIPA (private right of action, statutory damages), Texas
   CUBI, and Washington's law. Keeping visual search catalogue-seeded limits the
   "find this person" misuse path, but computing face embeddings at all is the exposure.
   Personal Import is built so that it never computes one. An imported photo is
   described by its page, site, and tags, and its "more like this" follows the set, not
   the person. Wiring `AIProvider.embedFrame` to imports would reopen the question.
4. **NCII.** N.J.S.A. 2C:14-9 and the federal TAKE IT DOWN Act (2025; 48-hour removal for
   covered platforms) matter if the app ever hosts or lets users upload anything. The
   built-in query gate already refuses non-consent and covert-capture searches, and
   Personal Import runs the same gate over every imported title, tag, and URL. Imports
   stay on the device and are never uploaded or shared. That line matters: once
   imports sync or share, the app starts to look like a "covered platform."
5. **Source terms & marks.** Use the source's official embed or partner API rather than
   scraping. "PH" plus any orange-on-black trade dress could draw a Lanham Act letter.
   The prototype deliberately uses neutral violet branding.
6. **Fetching third-party pages.** Page scans are user-initiated, one request per page,
   with no cookies, and they honour CORS. That's the defensible posture. On the CFAA, see
   *Van Buren v. United States* (2021) and *hiQ Labs v. LinkedIn* (9th Cir. 2022) on
   publicly available pages. On trespass to chattels, *Intel v. Hamidi* (Cal. 2003)
   requires actual harm to the system. Contract is the live risk: a site's terms can
   still bind a user who accepted them (in late 2022 the district court found hiQ had
   breached LinkedIn’s user agreement, and the case then settled). A proxy that bypasses
   CORS, or any background crawling, should stay out of scope.
