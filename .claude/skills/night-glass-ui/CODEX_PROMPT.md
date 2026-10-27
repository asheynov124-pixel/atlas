# Build a new mobile-first app in the "Night Glass" interface

> **Starting from the Night Glass starter?** Use the short prompt in
> `night-glass-starter/README.md` instead. The starter already contains everything
> below, plus screenshot baselines and a design lint. This long prompt is for building
> from an empty repo.

You are building a new mobile-first web app (installable PWA). It must use the
interface described below exactly: a dark, glassy, gesture-first design. Follow the
tokens and specs literally; where something isn't specified, extend it in the same
spirit rather than inventing a new style.

## 0. App brief (fill this in before running)

- **What the app is:** [one or two sentences]
- **What one card in the feed shows:** [e.g. a recipe photo with title, cook time, tags]
- **The four verbs.** Map them to the four action colors; the color keeps its meaning
  everywhere:
  - like (green) → [e.g. "Cook"]
  - pass (rose) → [e.g. "Skip"]
  - save (amber) → [e.g. "Save"]
  - capture (violet, the AI / "more like this" verb) → [e.g. "Remix"]
- **Tabs (exactly four):** Feed · Search · Library · You [rename to fit]
- **Data:** start with a typed mock data layer and seeded fake content behind one
  interface, so a real API can replace it later. No backend.

## 1. Stack and ground rules

- Vite + React + TypeScript (strict), zustand for state (persist to IndexedDB),
  vite-plugin-pwa, Vitest for unit tests, Playwright for e2e at iPhone 14 size
  (390×844).
- Plain CSS with custom properties. No Tailwind, no component library, no CSS-in-JS.
  Use inline stroke SVG icons (24 grid, stroke 1.9, round caps and joins,
  `currentColor`).
- Work in small commits. Run typecheck, unit tests and the build before each commit.

## 2. First task: write AGENTS.md

Create `AGENTS.md` at the repo root containing sections 3–8 of this prompt, under the
heading "Night Glass design rules (non-negotiable)", so every later session keeps the
same interface. Then create `src/styles/tokens.css` from section 4, verbatim.

## 3. Identity: six rules

1. **Content is the stage.** Feed media is full-bleed on `#000`; pages sit on `#07070a`.
   Chrome floats over content as frosted glass and gets out of the way: the overlay can
   hide, and the tab bar becomes a transparent gradient scrim over the feed.
2. **One gradient means "primary action".** Use
   `linear-gradient(135deg, #a78bfa, #f472b6)` with text `#120a1f`, at most once per
   view.
3. **Action colors are a vocabulary:** like `#34d399`, pass `#fb7185`, save `#fbbf24`,
   capture `#a78bfa`. Each verb uses its color on its rail icon, toast border, chip
   tint, drag stamp and action-sheet tile. Never reuse those colors for decoration.
4. **The glass recipe.**
   - Over media: `rgba(10,10,14,.38)` + `backdrop-filter: blur(14px)` + a
     `1px rgba(255,255,255,.1)` border.
   - Floating cards: `rgba(18,18,24,.55)` + `blur(18px)` + a `1px rgba(255,255,255,.14)`
     border.
   - Tab bar: `rgba(10,10,14,.92)` + `blur(20px) saturate(1.4)`.
   - Always add the `-webkit-backdrop-filter` twin.
5. **Every gesture has a button; every judgment has Undo** (in a toast).
6. **Thumb zone:** the rail sits bottom-right, sheets rise from the bottom, the tab bar
   sits in the safe area, reading text sits bottom-left with
   `text-shadow: 0 1px 8px rgba(0,0,0,.6)`. The top bar holds context, not actions.

## 4. Tokens (verbatim → `src/styles/tokens.css`)

```css
:root {
  --bg: #07070a;
  --surface: #111117;
  --surface-2: #1a1a22;
  --surface-3: #262631;
  --line: rgba(255, 255, 255, 0.08);
  --line-2: rgba(255, 255, 255, 0.14);
  --text: #f4f3f8;
  --muted: #9b99aa;
  --faint: #6c6a7a;
  --accent: #a78bfa;
  --accent-2: #f472b6;
  --like: #34d399;
  --dislike: #fb7185;
  --save: #fbbf24;
  --capture: #a78bfa;
  --glass: rgba(18, 18, 24, 0.55);
  --radius: 14px;
  --radius-lg: 22px;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --tabbar-h: calc(56px + var(--safe-bottom));
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  color-scheme: dark;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Inter, system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.4;
  color: var(--text);
  background: var(--bg);
  -webkit-text-size-adjust: 100%;
}
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; overflow: hidden; overscroll-behavior: none; background: var(--bg); }
body { -webkit-tap-highlight-color: transparent; -webkit-font-smoothing: antialiased; touch-action: manipulation; }
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; background: none; border: 0; padding: 0; }
button:disabled { opacity: 0.4; cursor: default; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
h1, h2, h3 { margin: 0; font-weight: 650; letter-spacing: -0.01em; }
@keyframes fade { from { opacity: 0; } }
@keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } }
@keyframes sheetUp { from { transform: translateY(100%); } }
@keyframes shimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }
@keyframes pop { 0% { opacity: 0; scale: .5 } 25% { opacity: 1; scale: 1.12 } 70% { opacity: 1; scale: 1 } 100% { opacity: 0; scale: 1.05 } }
@keyframes shake { 20%, 60% { transform: translateX(-8px); } 40%, 80% { transform: translateX(8px); } }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

**Verb tints** (chips, notices, highlights) use background alpha .14, border alpha .4
and a pale text tint. Example: `rgba(52,211,153,.14)` / `rgba(52,211,153,.4)` /
`#b8f5dd`.

## 5. Type and layout

- **Type**
  - Weights: 560 for buttons and labels, 600–650 for titles, 700–800 only for gate marks
    and stamps.
  - Sizes: page H1 1.9rem; sheet title 1.12rem; section title 1.02rem; card title
    1.04rem/650; meta 0.8rem at 60% white; subheads 0.82rem uppercase with
    letter-spacing .06em in `--faint`; tab labels 10.5px/600.
  - Inputs 16px (no iOS zoom). Use `tabular-nums` for counts and times.
- **The feed screen:**

```
┌──────────────────────────────────────┐ ← safe-top + 8px
│ (◐ Profile) ‹ ✦ For You 1/∞ ›   ⌕  ⚙ │ top bar over a scrim rgba(0,0,0,.6)→transparent
│                                      │
│           full-bleed media           │
│                                 (♥)  │ action rail: 50px glass circles, 62px column,
│                                 (✕)  │ 8px gap, right 8px, label 10.5px/650 under each,
│                                 (⌑)  │ bottom = tabbar-h + 26px
│ (● Creator)                     (◎)  │
│ Title ˄                         (…)  │ info block: left 14px, right 84px, gap 7px,
│ #tag  #tag   meta · meta             │ bottom = tabbar-h + 30px
│ ━━━━──────────────────────── 0:02    │ progress: 3px track (6px while pressed)
├──────────────────────────────────────┤
│  ▶ Feed   ⌕ Search  ▦ Library  ◯ You │ tab bar 56px + safe-bottom; transparent over feed
└──────────────────────────────────────┘
```

- **Pages** (Search, Library, You):
  - `max-width: 760px`, centered, padding `calc(var(--safe-top) + 14px) 16px 0`, a flex
    column with gap 14px.
  - Bottom padding on each scroll view: `calc(var(--tabbar-h) + 24px)`.
  - Big H1 top-left, a secondary button top-right. Under it: a segmented control, then
    filter chips, then one gradient button, then content.
- **Grid:** two columns of 9:16 thumbnails with radius 12. A dark badge
  (`rgba(0,0,0,.6)`, radius 6, .72rem/650) sits bottom-right on the image. The title is
  .9rem/600 clamped to two lines; meta .78rem muted. From 700px wide use
  `repeat(auto-fill, minmax(170px, 1fr))`.
- **Small phones** (`max-height: 720px`): rail circles 42px with gap 4.
- **Wide screens** (`min-width: 700px`): the feed overlay becomes a centered column up
  to 560px wide.

## 6. Components (exact specs)

- **Buttons**
  - `.btn`: min-height 40, padding 0 14, radius 12, `--surface-3` background, 1px
    `--line` border, weight 560; `transform: scale(.97)` on press (.12s `--ease`).
  - Variants: `--primary` (gradient, `#120a1f` text, no border), `--ghost`
    (transparent), `--small` (32px, radius 10, .88rem), `--danger` (rose text on a
    rose .14 tint), `--block` (full width).
  - Icon buttons: 40×40 radius 12; small 32×32 radius 10 in muted. The glass variant
    uses `--glass` + `blur(16px)`.
- **Chips:** radius 999, `--surface-2`, 1px `--line`, .86rem, padding 6px 11px, with an
  optional `×`. The active chip uses `--surface-3` and `--line-2`. Verb chips use the
  tints above.
- **Segmented control:** a track with 3px padding, `--surface-2`, radius 12, `--line`.
  Items are 32px tall, radius 9, muted 560 .88rem. The "on" item uses `--surface-3`,
  `--text` and `box-shadow: 0 1px 0 rgba(255,255,255,.05) inset`. It scrolls sideways
  with no scrollbar.
- **Toggle:** a 46×28 track with radius 14 and a 22px white knob. It is `--like` green
  when on, and the knob slides 18px.
- **Inputs:** min-height 42, padding 9/12, radius 12, `--surface-2`, `--line`; on focus
  the border is `rgba(167,139,250,.6)`.
- **Containers**
  - Section: padding 14, radius 22, `--surface`, 1px `--line`. A head row has a title
    left and an action right.
  - Notice: padding 12/14, radius 14, `--surface-2`.
  - Empty state: centered; a 56px icon tile (radius 18, `--surface-2`, accent icon); a
    1.1rem title; one muted sentence at most 34ch wide; one or two buttons.
  - Every list has empty, loading (shimmer skeleton) and error states.
- **Top bar**
  - Left: a 36px profile pill with an avatar in a 28px circle.
  - Center: a glass pill for the current feed (`rgba(0,0,0,.35)` + `blur(12px)` +
    `--line-2`, height 36, padding 0 12) holding an accent icon, a 650/.9rem label and
    a muted tabular position. ‹ › arrows switch feeds.
  - Right: search and filter icon buttons. The whole bar fades and lifts away when the
    overlay hides.
- **Action rail**
  - Like, Pass, Save, the 4th verb, then More (…). Each is a 50px glass circle with its
    icon in the verb color and a label below. The circle shrinks to `.88` on press; the
    "on" state gets an amber .22 tint.
  - Under the rail, a 2×2 grid of 30px mini buttons (mute, open, previous, next).
- **Drag stamps**
  - While a card is dragged, a stamp word fades and scales with progress `p` (0→1):
    2rem/800, letter-spacing .08em, a 3px border with radius 12, and
    `text-shadow: 0 0 18px currentColor`.
  - Placement: the like word top-left rotated -14°, the pass word top-right +14°; save
    centered low, the 4th verb centered high.
- **Bottom sheet** (used for menus, filters, details and forms)
  - Panel: `--surface`, top radius 22, `max-width: 600px`, `max-height: 88dvh`, shadow
    `0 -20px 60px rgba(0,0,0,.5)`.
  - Grab handle: 38×5, radius 3, `--surface-3`.
  - Head: padding 4/18/10, title 1.12rem, muted .88rem subtitle.
  - Body: padding 0/16/16, gap 10, scrolls with `overscroll-behavior: contain`. An
    optional footer has a hairline top border.
  - Motion: the backdrop `rgba(0,0,0,.5)` fades in over .25s; the sheet enters with
    `sheetUp .32s var(--ease)`.
  - Behavior: dragging the handle more than 90px closes it, and Escape closes only the
    topmost sheet. It takes `role="dialog"` and `aria-modal`, and gets focus.
- **Long-press action sheet**
  - Title, then a row of 4 verb tiles: a column with icon and label, padding 12/4,
    radius 14, `--surface-2`, .82rem/650, in the verb color.
  - Then menu rows: 48px tall, a 34px icon tile (radius 10, `--surface-2`, accent icon),
    a label, and a one-line muted hint. Destructive rows are rose.
  - Footer: Previous / Next / Switch feed.
- **Toasts**
  - Glass `rgba(24,24,32,.92)` + `blur(18px)`, radius 14, padding 9/10/9/14, .88rem/560,
    `--line-2` border recolored by tone, shadow `0 10px 30px rgba(0,0,0,.35)`, entering
    with `fadeUp .25s`.
  - An optional action button ("Undo"): `--surface-3`, accent text, weight 650.
  - Placement: under the top bar on the feed, above the tab bar elsewhere, at the top
    while a sheet is open. At most 3 at once; each lasts 2.2s, or 4.2s with an action.
- **Full-screen gate or message** (onboarding, errors, "open elsewhere"): fixed and
  centered on `radial-gradient(circle at 50% 30%, #1a1226, var(--bg) 70%)`. A
  gradient-text mark (2.4–3rem/800), an H1, one muted paragraph and a full-width
  gradient button, in a card up to 400px wide.
- **Tab bar:** four equal columns with 23px icons and 10.5px/600 labels at 55% white;
  the current tab is pure white. Over the feed: `linear-gradient(to bottom, transparent,
  rgba(0,0,0,.72))`, no blur, no border.

## 7. Motion, gestures and haptics

- **Motion:** one easing, `--ease`. Presses .12–.15s, overlays .3–.35s, sheets .32s,
  toasts .25s. Respect `prefers-reduced-motion`.
- **Feed gestures.** Put them in a pure classifier module with unit tests, and set
  `touch-action: none` on the stage.
  - One finger in the middle of the card: → like, ← pass, ↑ save, ↓ the 4th verb.
  - A 26px edge strip, or two fingers: ↑/↓ next or previous card, ←/→ switch feed.
  - The axis locks after 10px. A gesture commits at 30% of the width (horizontal) or 18%
    of the height (vertical), or on a flick faster than 0.55px/ms after 32px.
  - Double-tap likes in place, with a `pop` heart. Long-press opens the action sheet.
    Tap pauses or toggles.
  - Mark all chrome with `data-no-gesture` so it never starts a swipe.
  - First run shows coach marks once; a settings toggle offers "classic" mode (↑/↓ =
    next/previous).
- **Haptics:** `navigator.vibrate` where available, behind a setting; a light tap on
  commit.

## 8. Copy voice

- Plain, short and verb-first, in sentence case. Buttons say exactly what happens
  ("Play as feed", "Use it here").
- Toasts confirm in the past tense: "Saved", "Liked · Undo".
- Menu rows are a label plus a one-line hint ("Less like this — Soft signal, keeps it
  possible").
- Errors say what happened and how to fix it, without apologizing.
- Use `·` as the separator, curly quotes, and `…` on items that open more.

## 9. Build order and acceptance

1. `AGENTS.md` and the tokens, then the base, shell and tab bar.
2. Sheet + MenuItem; toasts with Undo; empty, loading and error states.
3. The feed: stage, card, overlay (top bar, info, rail, progress), the gesture
   classifier with unit tests, stamps, the long-press action sheet, double-tap.
4. Search, Library (segmented: e.g. Saved / Boards / History) and You (settings with
   toggles), all using the page pattern.
5. Persistence (IndexedDB), PWA manifest (`theme_color` and `background_color`
   `#07070a`, `display: standalone`), and offline caching of the app shell.

Done means:

- [ ] Typecheck, unit tests and build pass; a Playwright e2e at 390×844 swipes all four
      verbs, opens and drag-dismisses a sheet, uses Undo, and survives a reload.
- [ ] Safe areas are respected (`viewport-fit=cover`, `height:100%` not `100vh`, `dvh`
      for sheets); also checked at 375×667 and 1180×820.
- [ ] Every icon-only button has an `aria-label`; sheets and gates are dialogs; the focus
      ring is visible; touch targets are at least 40px.
- [ ] No color other than the tokens; the gradient appears at most once per view; each
      verb keeps its color everywhere.
- [ ] The README lists the verb-to-color mapping and how to swap the mock data for a real
      API.
