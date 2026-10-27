---
name: night-glass-ui
description: Night Glass, the dark, glassy, gesture-first mobile interface from PH Discovery. A full-bleed swipe feed with a right-hand action rail, frosted top bar and tab bar, one violet-to-pink gradient for the primary action, four action colors with fixed meanings, and drag-to-dismiss bottom sheets. Use when building or restyling a mobile-first web app or PWA that should look and feel like it (card or media feeds, swipe-to-decide queues, review and triage apps, libraries of saved items), or whenever someone asks for "the same interface", "that look", or "Night Glass". Gives exact tokens, component specs, layout, motion, gestures, copy voice, and a build checklist, with verbatim CSS and React references.
---

# Night Glass UI

**The look in one sentence:** a black stage; frosted glass floating over the content;
one violet-to-pink gradient for the one thing you should press; four action colors
that mean the same thing everywhere.

Screens to match are in `assets/`. They are 480 px wide, captured at iPhone 14 size
(390 × 844): `feed.jpg`, `action-sheet.jpg`, `path-switcher.jpg`, `library.jpg`,
`filters-sheet.jpg`, `list-review.jpg` and `gate.jpg`. Look at them before building.

## Use it for / don't use it for

- **Use for:** mobile-first web apps and PWAs where content is the point and people
  decide quickly. Swipe feeds, review queues, media libraries, "saved" collections, and
  settings and profile pages around them.
- **Adapt with care:** dense desktop dashboards. Keep the tokens, sheets and chips, but
  the full-bleed stage and the rail don't belong there.
- **Don't use for:** light-mode-first brands, or anything that needs a document reading
  experience.

## Six rules that make it Night Glass

1. **Content is the stage.** Media is full-bleed on pure black (`#000` behind media,
   `--bg #07070a` on pages). Chrome floats over it as glass and gets out of the way:
   the overlay can hide, and the tab bar turns into a transparent scrim over the feed.
2. **One gradient means "the primary action".** Use
   `linear-gradient(135deg, #a78bfa, #f472b6)` with near-black text `#120a1f`. Use at
   most one per view: "Play as feed", "Import 4", "I'm 18 or older — enter".
3. **Action colors are a vocabulary.** Map the app's three or four core verbs to:
   - **like** `#34d399` (green): positive, keep, approve
   - **pass** `#fb7185` (rose): negative, skip, destructive
   - **save** `#fbbf24` (amber): keep for later
   - **capture** `#a78bfa` (violet): AI, explore, "more like this"

   Each verb uses its color everywhere: rail icon, toast border, chip tint, drag stamp,
   action-sheet tile. Never reuse a verb's color for decoration.
4. **The glass recipe.** Over media: `rgba(10,10,14,.38)` + `blur(14px)` + a
   `1px rgba(255,255,255,.1)` border. Floating cards: `--glass rgba(18,18,24,.55)` +
   `blur(18px)` + a `--line-2` border. Tab bar: `rgba(10,10,14,.92)` +
   `blur(20px) saturate(1.4)`. Always include the `-webkit-` prefix.
5. **Every gesture has a button, and every judgment can be undone.** Swipes mirror the
   rail. Like, pass and save confirm with a toast that has **Undo**.
6. **The thumb zone carries the weight.** The rail sits bottom-right; sheets rise from
   the bottom; the tab bar sits in the safe area. Reading text sits bottom-left with a
   soft text-shadow. The top bar holds context (profile, current feed), not actions.

## Tokens

Copy `references/tokens.css` as-is. These are the essentials:

| Token | Value | Use |
|---|---|---|
| `--bg` | `#07070a` | app background |
| `--surface` / `-2` / `-3` | `#111117` / `#1a1a22` / `#262631` | sheets and sections / inputs and chips / buttons and "on" states |
| `--line` / `--line-2` | `rgba(255,255,255,.08)` / `.14` | hairlines / glass borders, active chips |
| `--text` / `--muted` / `--faint` | `#f4f3f8` / `#9b99aa` / `#6c6a7a` | body / secondary / tertiary and subheads |
| `--accent` / `--accent-2` | `#a78bfa` / `#f472b6` | gradient ends; links, focus, icons |
| `--like` `--dislike` `--save` `--capture` | `#34d399` `#fb7185` `#fbbf24` `#a78bfa` | the verb vocabulary |
| `--glass` | `rgba(18,18,24,.55)` | floating cards |
| `--radius` / `--radius-lg` | `14px` / `22px` | cards and notices / sheets, sections and gates |
| `--ease` | `cubic-bezier(.2,.8,.2,1)` | every transition |
| `--safe-top` `--safe-bottom` | `env(safe-area-inset-*)` | notch and home bar |
| `--tabbar-h` | `calc(56px + var(--safe-bottom))` | everything bottom-anchored offsets by this |

Tints of a verb color use about 0.14 alpha for the background, 0.4 for the border and
a pale tint of the hue for text, e.g. `.chip--like`: `rgba(52,211,153,.14)` /
`rgba(52,211,153,.4)` / `#b8f5dd`.

## Type

- **Font:** the system stack (`-apple-system, BlinkMacSystemFont, 'SF Pro Text',
  'Segoe UI', Roboto, Inter, system-ui, sans-serif`). Base 15 px, line height 1.4,
  `-webkit-font-smoothing: antialiased`.
- **Weights:** 560 for buttons and labels, 600–650 for titles, 700–800 only for gate
  marks and stamps. Headings use `letter-spacing: -0.01em`.
- **Sizes:**
  - page H1 1.9rem
  - sheet title 1.12rem
  - section title 1.02rem
  - feed card title 1.04rem/650
  - meta 0.8rem at 60% white
  - subheads 0.82rem uppercase, `letter-spacing .06em`, `--faint`
  - tab labels 10.5px/600
- **Details:** inputs are 16 px, which stops iOS zooming on focus. Use
  `font-variant-numeric: tabular-nums` for counters and times ("1/∞", "0:02").

## Layout

The feed screen:

```
┌──────────────────────────────────────┐ ← safe-top + 8px
│ (◐ Main)   ‹ ✦ For You 1/∞ ›   ⌕  ⚙  │ top bar: scrim rgba(0,0,0,.6)→0; 36px glass pills
│                                      │
│            full-bleed media          │
│                                 (♥)  │ rail: 50px glass circles in a 62px column,
│                                 (✕)  │ 8px gap, right 8px, labels 10.5px/650,
│                                 (⌑)  │ bottom = tabbar-h + 26px
│ (● Name)                        (◎)  │
│ Title ˄                         (…)  │ info: left 14px, right 84px, gap 7px,
│ #tag  #tag   HD · 43:22              │ bottom = tabbar-h + 30px, text-shadow
│ ━━━━──────────────────────── 0:02    │ scrub: 3px track, 6px while pressed
├──────────────────────────────────────┤
│  ▶ Feed   ⌕ Search  ▦ Library  ◯ You │ tab bar: 56px + safe-bottom; transparent over feed
└──────────────────────────────────────┘
```

- **Pages** (Library, Search, You):
  - `max-width 760px`, centered, padding `safe-top+14px 16px 0`, flex column, gap 14px.
  - Big H1 top-left, a secondary `.btn` top-right ("+ Import").
  - A segmented control under the title, then filter chips, then a primary gradient
    button, then content.
- **Grids:** two columns of 9:16 tiles with radius 12px. A dark duration badge
  (`rgba(0,0,0,.6)`, radius 6px) sits bottom-right on the image; the title is
  0.9rem/600 clamped to two lines, with meta at 0.78rem muted below.
  `repeat(auto-fill, minmax(170px, 1fr))` from 700 px up.
- **Small phones** (`max-height: 720px`): rail icons shrink to 42px, gaps to 4px.
- **iPad and desktop** (`min-width: 700px`): the feed overlay becomes a centered column
  up to 560 px, so text and rail stay near each other.

## Components (exact specs)

- **Buttons**
  - `.btn`: min-height 40, padding 0 14, radius 12, `--surface-3` background, 1px
    `--line` border, weight 560; on press `scale(.97)` over .12s.
  - Variants: `--primary` (the gradient, `#120a1f` text), `--ghost` (transparent),
    `--small` (32px, radius 10, .88rem), `--danger` (rose text on a rose .14 tint),
    `--block` (full width).
- **Icon buttons:** 40×40 radius 12 (small 32×32 radius 10, muted). The `--glass`
  variant puts `--glass` and `blur(16px)` behind it. A notification `badge` is 17px,
  radius 9, `--accent-2` background, 10px/700.
- **Chips:** radius 999, `--surface-2`, 1px `--line`, .86rem, padding 6/11, with a
  removable `×`. `--active` uses `--surface-3` and `--line-2`; verb tints as above.
- **Segmented control:** a 3px-padded track (`--surface-2`, radius 12, `--line`).
  Items are 32px tall, radius 9, muted 560/.88rem. The "on" item gets `--surface-3`,
  `--text`, and `box-shadow: 0 1px 0 rgba(255,255,255,.05) inset`. It scrolls
  sideways with the scrollbar hidden.
- **Toggle:** 46×28 track radius 14, 22px white knob, green (`--like`) when on, knob
  slides 18px with `--ease`.
- **Inputs:** min-height 42, padding 9/12, radius 12, `--surface-2`, `--line` border;
  on focus the border turns `rgba(167,139,250,.6)`. There is no outline glow.
- **Containers**
  - `.section`: padding 14, radius 22, `--surface`, `--line`. It has a head row: title
    1.02rem on the left, a link or button on the right.
  - `.notice`: padding 12/14, radius 14, `--surface-2`. Warn and safety variants tint
    with rose or amber.
  - **Empty state:** centered; a 56px rounded-square icon tile (radius 18,
    `--surface-2`, accent icon); a 1.1rem title; one muted sentence at most 34ch wide;
    one or two buttons.
- **Top bar (`.pathbar`):**
  - Left: a profile pill (36px, avatar emoji in a 28px circle, its border colored by the
    profile).
  - Center: the current feed as a glass pill (`rgba(0,0,0,.35)` + `blur(12px)` +
    `--line-2`), an accent icon, a 650/.9rem label, a muted tabular position "1/∞",
    and ‹ › arrows to switch feeds.
  - Right: search and filter icon buttons.
- **Action rail:**
  - 50px circles of glass, each icon in its verb color, with a 10.5px label under it.
    The circle shrinks to `.88` on press; an "on" state gets an amber .22 tint.
  - Order: Like, Pass, Save, Capture/AI, More (…).
  - Under the rail, a 2×2 grid of 30px mini buttons (mute, open, prev, next).
- **Drag stamps:**
  - While dragging, a word stamp fades and scales in with progress `--p` (0→1):
    2rem/800, letter-spacing .08em, 3px border radius 12, `text-shadow: 0 0 18px
    currentColor`.
  - LIKE sits top-left at -14°, PASS top-right at +14°; SAVE is centered low, CAPTURE
    centered high.
- **Bottom sheet:**
  - `--surface`, top radius 22, `max-width 600px`, `max-height 88dvh`, shadow
    `0 -20px 60px rgba(0,0,0,.5)`.
  - Grab handle 38×5, radius 3, `--surface-3`. Head padding 4/18/10, title 1.12rem,
    subtitle muted .88rem. Body padding 0/16/16 with gap 10, scrolling with
    `overscroll-behavior: contain`. An optional footer has a hairline on top.
  - Backdrop `rgba(0,0,0,.5)` fading in over .25s. Enters with `sheetUp` .32s
    `--ease`.
  - Dragging the handle more than 90px dismisses it. Escape closes only the topmost
    sheet. It has `role="dialog"` and `aria-modal`, and takes focus.
- **Action sheet (long-press):**
  - Title, then a 4-up grid of verb tiles: `.quick` is a column with icon and label,
    padding 12/4, radius 14, `--surface-2`, .82rem/650, in the verb color.
  - Then menu items: 48px rows, a 34px icon tile (radius 10, `--surface-2`, accent
    icon), the label, and a one-line muted hint. Danger items are all rose.
  - A footer row: Previous / Next / Paths.
- **Toasts:**
  - Glass `rgba(24,24,32,.92)` + `blur(18px)`, radius 14, padding 9/10/9/14,
    .88rem/560, `--line-2` border recolored by tone (like, dislike, save, capture,
    error), shadow `0 10px 30px rgba(0,0,0,.35)`, entering with `fadeUp` .25s.
  - An optional action button (**Undo**): `--surface-3`, accent text, 650.
  - Placement: under the top bar on the feed, above the tab bar elsewhere, at the top of
    the screen while a sheet is open. At most 3 at once; each lasts 2.2s, or 4.2s with
    an action.
- **Gate or full-screen message** (age gate, "open in another tab", errors):
  - Fixed and centered, on `radial-gradient(circle at 50% 30%, #1a1226, var(--bg) 70%)`.
  - A gradient-text mark (2.4–3rem/800, `background-clip: text`), an H1, a muted
    paragraph, and a full-width primary button, all in a card up to 400px wide.
- **Icons:** inline stroke SVGs on a 24 grid, stroke 1.9, round caps and joins,
  `currentColor`, 22px by default (tab bar 23px). Heart and bookmark have filled
  variants for the "on" state. See `references/react/Icons.tsx`.

## Motion

- **Easing:** `--ease` for everything.
- **Durations:** presses .12–.15s; overlay and top bar .3–.35s; sheet .32s; toast .25s.
- **Keyframes** (in `tokens.css`): `fade`, `fadeUp`, `slideDown`, `sheetUp`, `pop`
  (the double-tap heart), `pulse`, `shake` (wrong PIN), `spin`, `shimmer`
  (skeletons: a 100° gradient of `--surface-2`/`--surface-3`, 300% wide, 1.4s).
- **Reduced motion:** with `prefers-reduced-motion`, every animation and transition
  drops to 0.01ms.
- **Haptics** are best-effort: `navigator.vibrate` where it exists, behind a user
  setting. See `references/react/haptics.ts`.

## Gestures (feed)

| Where | Gesture | Meaning |
|---|---|---|
| Middle of card, one finger | → / ← | like / pass |
| | ↑ / ↓ | save / capture (the 4th verb) |
| Edge strip (26px), or two fingers | ↑ / ↓ | next / previous card |
| | ← / → | switch feed |
| Anywhere | double-tap · long-press · tap | like in place · action sheet · pause or toggle |

- **Axis:** locks after 10px of movement.
- **Commit:** at 30% of the width (horizontal) or 18% of the height (vertical), or on a
  flick faster than 0.55 px/ms after 32px. Stamps track the progress.
- **Setup:** set `touch-action: none` on the stage and add `data-no-gesture` to every
  piece of chrome. Show first-run coach marks that teach the gestures once.
- **References:** the pure classifier is `references/react/classify.ts` (unit-test it);
  the pointer engine is `useStageGestures.ts`.
- **Classic mode:** a "classic" setting maps ↑/↓ to next and previous, TikTok-style.

## Copy voice

- **Plain and verb-first.** A button says exactly what happens ("Play as feed",
  "Use it here", "Copy for PH Discovery"). Use sentence case.
- **Toasts confirm in the past tense:** "Saved", "Liked · Undo",
  "Read 4 links from site".
- **Menu items pair a label with a one-line hint:** "Less like this — Soft signal,
  keeps it possible".
- **Errors** say what happened and how to fix it, without apologizing.
- **Typography:** use `·` as the separator, curly quotes and apostrophes, and `…` for
  "opens more".

## Accessibility and polish checklist

- [ ] `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }`
- [ ] Touch targets are at least 40px (rail 50, menu rows 48, tabs full height).
- [ ] `viewport-fit=cover`; `height:100%` (not `100vh`); `dvh` for sheets; safe-area
      padding top and bottom.
- [ ] `color-scheme: dark`; `<meta name="theme-color" content="#07070a">`.
- [ ] `-webkit-tap-highlight-color: transparent`; `overscroll-behavior: none` on the
      body and `contain` in scroll views.
- [ ] Sheets and gates use `role="dialog"`; icon-only buttons have an `aria-label`;
      live messages use `role="status"`.
- [ ] Reduced motion is honored; nothing important relies on color alone (labels sit
      under the rail icons).
- [ ] Check at 390×844, 375×667 (SE) and 1180×820 (iPad landscape) against `assets/`.

## Applying it to a new app

1. Paste `references/tokens.css`, then the parts of `references/components.css` you
   need. Keep the class names, or rename blocks consistently.
2. Decide the verb mapping first and write it down: which actions are like, pass, save
   and capture. Every later screen follows it.
3. Build the shell: `.app`, `.view` (bottom padding `tabbar-h + 24px`) and the tab bar,
   which goes transparent on the feed.
4. Build `Sheet` and `MenuItem` from `references/react/Sheet.tsx`, then toasts with
   Undo.
5. Build the feed: stage → card → overlay (top bar, info, rail, scrub) → gestures and
   stamps. `references/react/FeedCard.tsx` shows the composition.
6. Build pages with the page pattern, then empty, loading (skeleton) and error states
   for each.
7. Compare screenshots side by side with `assets/`.

## Files

- `references/tokens.css`: tokens and keyframes, verbatim.
- `references/components.css`: all component CSS, verbatim (about 1,850 lines; read
  only the blocks you need).
- `references/react/`: Sheet, TabBar, Toasts, Icons, FeedCard, PathBar, the gesture
  classifier and engine, and haptics. Their imports point at the original app; rewire
  them.
- `assets/*.jpg`: the reference screens.
- `CODEX_PROMPT.md`: the same design as a self-contained prompt for Codex or any other
  agent that can't read skills.
