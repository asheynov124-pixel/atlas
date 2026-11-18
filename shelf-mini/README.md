# Shelf Mini

A small, phone-first media shelf: twelve films, books, records and games. You can search them, filter
by category, open any title, and keep favorites that survive a refresh. It's plain HTML, CSS and
JavaScript with no dependencies, no build step and no network requests.

This folder is unrelated to the Atlas app and to `jelly-loop/` elsewhere in this repository.

## Run it

Shelf Mini uses JavaScript modules, which browsers won't run from a `file://` page, so serve the
folder. (If you open `index.html` directly, the page says so instead of going blank.)

```sh
cd shelf-mini
npm start                      # Node 18 or later: http://localhost:8000
```

There are no packages to install. `npm start` runs `tools/serve.mjs`, a 50-line static server.
Any static server works too, for example `python3 -m http.server 8000`.

**On an iPhone:** run `HOST=0.0.0.0 npm start`, then on the phone (same Wi-Fi) open
`http://<your computer's local IP>:8000`.

## The journey and its states

**Main journey.** Land on the shelf, type part of a title, narrow it with a category, open a result,
tap **Favorite**, then go back (button, swipe or Esc). You return to the same filtered grid at the same
scroll position, with focus on the card you opened. Refresh, turn on **Favorites**, and it's there.

| State | What you see |
|---|---|
| Full collection | 12 covers, "12 titles" |
| Filtered | "3 of 12 titles" and a **Clear filters** link. Search, category and Favorites always combine |
| No matches | What was searched and where, **Clear search and filters**, and when one exists, a wider search that keeps your words ("Show 3 matches in all titles") |
| No favorites yet | How to add one, and a way back to everything |
| Detail | Large cover, title, credit, **Favorite** toggle, description |
| Favorite saved | "Added to Favorites." Shown only after the save has been read back from storage |
| Favorite not saved | "Added for this visit only." A hint under the button says so before you tap |
| Storage unusable | A plain-language notice on the shelf. Everything else keeps working |
| Saved data damaged | "Your earlier favorites couldn't be opened, so this list is starting fresh." |
| Opened as a file | A one-line message pointing to this README |

## Where things live

| Concern | File | Notes |
|---|---|---|
| Sample data | [`js/data.js`](js/data.js) | 12 items and 4 categories. Each item's `art` names a motif and palette |
| Artwork | [`js/artwork.js`](js/artwork.js) | One small SVG composition per motif. No ids or `<defs>`, so a cover can appear twice on a page safely |
| Filtering | [`js/filter.js`](js/filter.js) | Pure functions: `normalize`, `filterItems`, `suggestWiderSearch` |
| State | [`js/state.js`](js/state.js) | A tiny store, plus the URL mapping (`?q=&category=&favorites=1&item=`) |
| Persistence | [`js/storage.js`](js/storage.js) | localStorage behind a wrapper that reports what actually happened |
| Rendering | [`js/render.js`](js/render.js) | State to DOM. Cards are built once; filtering only shows and hides them |
| Events and navigation | [`js/app.js`](js/app.js) | User actions, history, focus, cross-tab updates |
| Markup | [`index.html`](index.html) | Both views, plus `<template>`s for cards and category options |
| Styles | [`styles.css`](styles.css) | Tokens at the top (colour, type scale, spacing), then components in page order |

Data flows one way: **events** (`app.js`) change **state** (`state.js`), which **render.js** draws.
`storage.js` and `filter.js` never touch the DOM.

## Tests

```sh
npm test               # 16 unit tests: filtering, URL state, storage failures. No installs.
npm run test:browser   # 100 checks in a real browser (needs Playwright; see below)
```

The browser test is the only thing that needs a package, and the app itself never loads it:
`npm install --no-save playwright && npx playwright install chromium`.

### Test report

Run in headless Chromium 1243 (Playwright 1.63) on Linux, with an iPhone-sized viewport (390×844,
touch, 2× pixels) unless noted. **All 16 unit tests and all 100 browser checks pass.**

| Area | Verified |
|---|---|
| Journey | Search "night" gives 3 titles; adding Music gives Night Swim; open it; Favorite; Back keeps the text, category, results and focus; refresh keeps filters and the favorite; Favorites shows it |
| History | Browser Back and Forward, scroll position restored, Esc closes the detail view, deep links, and Back after a deep link stays in the app. Unknown URL values fall back and the URL is tidied |
| No results | Empty state wording, Clear search and filters (focus moves to the results line), the "wider search" suggestion, "No favorites yet", and Esc clearing the search box |
| Keyboard | Logical tab order; arrow keys move between categories; Enter opens; Space favorites; a visible 2px focus ring on every control checked |
| Narrow phone | 320×568: no sideways scroll (including a long unbroken search), two columns, last category reachable, every control at least 44×44 px |
| Storage failure | Simulated four ways: writes throw, `localStorage` itself throws, saved value corrupt, and saving failing mid-visit then recovering. The app stays usable, never says "saved" when it wasn't, and a visit-only favorite is saved once storage recovers |
| Two tabs | A favorite in one tab appears in the other, and neither tab overwrites the other's changes |
| Reduced motion | No view fade, heart pop or transitions when the system asks for reduced motion |
| Accessibility audit | axe-core 4.10 (WCAG 2.2 AA plus best practice) on the shelf, no results, detail and storage notice: **0 violations**. Three contrast items were "needs review" only because the invisible native radio sits over each pill; the real pairs measure 7.7:1 and 16.8:1 |

**Not verified.** Please treat these as open, not passed:

- **Real iPhone Safari (WebKit).** Only Chromium was available, so iPhone was emulated by viewport
  and touch. Specifically unconfirmed: the `ui-serif` (New York) typeface, `svh` sizing of the detail
  cover, the blurred sticky bar, and the search key dismissing the keyboard.
- **Safari Private Browsing.** Private tabs accept storage but clear it when the tab closes. The app
  can't detect that, so in a private tab "Added to Favorites" is true until the tab is closed.
- **Screen readers by ear.** Semantics, names and live regions were checked in code and by axe, but
  not listened to in VoiceOver or NVDA.
- **Firefox**, and real (not emulated) touch hardware.

## Design notes

- **Palette:** near-black `#0e0d0c`, off-white `#f3eee6`, muted `#a9a297`, and one accent, vermilion
  `#f2734b`. The accent is used only for favorites and focus. Contrast on the background: 16.8:1,
  7.7:1 and 6.8:1.
- **Type:** the system serif (New York on Apple devices) for titles, the system sans for controls, on a
  1.25 scale around a 17px body. The search box is 17px so iOS doesn't zoom when you tap it.
- **Space:** 4px steps (4, 8, 12, 16, 24, 32, 48, 64). Touch targets are 44px or more.
- **Filters combine.** Favorites is a toggle beside the search box rather than a sixth category, so
  "my favorite films with 'night' in the title" is one tap away. Every active filter narrows the list.

### Two tradeoffs

1. **The heart on a card shows state; it isn't a button.** Each card does one thing, open, so there
   are no nested controls and no stray hearts tapped on a small grid. Cost: favoriting takes two taps
   (open, then Favorite) instead of one.
2. **When saving fails, favorites still work for the visit, labelled as such.** The alternative was
   to disable the button. That's simpler to build, but it punishes the person for their browser's
   settings. Cost: two kinds of favorite (saved and visit-only), and code to keep them straight:
   the app tracks unsaved changes so they're written once storage recovers, and so another tab's
   changes don't overwrite them.

### One improvement deliberately left out

**Make it installable and offline** (web app manifest and service worker), so it opens from the home
screen like an app and works on a plane. It was left out because it adds a caching layer to an
exercise about the core loop. Watch for one trap when you add it: on iOS, a home-screen web app gets
its own storage, separate from Safari's, so favorites saved in Safari won't appear in the installed
app. The installed version would need a clear first-run note, or an export/import of favorites.
