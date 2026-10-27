# AGENTS.md: Night Glass rules for this repo

This app uses the **Night Glass** interface: a dark, glassy, gesture-first mobile UI.
Every change keeps it. These rules are for any coding agent (Codex, Claude, others)
and for people.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run check` | **Run before every commit.** Typecheck, unit tests, build, then every Playwright test (behaviour, screenshots, design lint) |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Behaviour tests with real pointer gestures |
| `npm run visual` | Screenshot baselines and the design lint |
| `npm run visual:update` | Rewrite screenshot baselines, **only** after reviewing why they changed (see below) |
| `npm run visual:sheet` | Build `test-results/contact-sheet.html`: reference screens next to the current ones, and any drift |

## The six rules

1. **Content is the stage.** Media is full-bleed on black. Chrome floats over it as glass
   and gets out of the way (the overlay hides on tap; the tab bar is a scrim over the feed).
2. **One gradient means the primary action.** `.btn--primary`, at most one per view.
3. **Action colors are a vocabulary.** like = green, pass = rose, save = amber,
   capture = violet. The app's own words for them live in `src/app/verbs.ts`. A verb
   color marks only that verb: the rail, stamps, toasts, chips, action-sheet tiles.
   Rose also marks destructive actions, inside `data-tone="danger"`.
4. **The glass recipe.** Over media: `rgba(10,10,14,.38)` + `blur(14px)` + a
   `1px rgba(255,255,255,.1)` border. Floating cards: `--glass` + `blur(18px)` +
   `--line-2`. Always add `-webkit-backdrop-filter` too.
5. **Every gesture has a button, and every judgment has Undo** (in a toast).
6. **The thumb zone carries the weight.** Actions sit at the bottom and right; the top
   bar shows context only.

## Where things live

- `src/styles/tokens.css`: **the only place colors are defined.** The design lint reads
  it. A new color is a design decision: add it as a named token, with a comment saying
  why.
- `src/styles/app.css`: the components (buttons, chips, segmented, toggles, sections,
  empty states, tab bar, top bar, feed card, rail, stamps, sheets, menu rows, tiles,
  toasts, gate). Reuse these classes before writing new ones.
- `src/app/config.ts`: the app's name and labels. `src/app/verbs.ts`: the verb mapping.
- `src/data/`: `types.ts`, `mock.ts` (seeded, deterministic) and `source.ts` (the one
  interface the screens use). Replace the mock behind `source`.
- `src/feed/`: the gesture classifier `classify.ts` (pure; keep it unit-tested), the
  pointer engine, the feed view, and `actions.ts` (what each verb does; every input path
  goes through it).
- `src/ui/`: Sheet + MenuItem, Toasts, TabBar, Welcome, Art (stand-in media), Tile,
  and the small shared pieces.

## Type, spacing, motion

- **Type:** the system font stack. Base 15px. Weights 400, 560 (buttons and labels),
  600–650 (titles), 700–800 (marks and stamps only). Inputs are 16px.
- **Radii:** 3, 6, 9, 10, 12, 14, 18, 22, 999px or 50%. **Touch targets:** at least
  32px, 40px for primary controls.
- **Pages:** `max-width 760px`, padding `safe-top+14px 16px`, gap 14px, a big H1. The
  page order is a segmented control, then chips, then one gradient button, then
  content.
- **Motion:** one easing (`--ease`); presses .12s, overlays .35s, sheets .32s, toasts
  .25s. Honor `prefers-reduced-motion`.
- **Copy:** plain, verb-first, sentence case. Toasts are past tense with Undo. Errors
  say what happened and how to fix it. Use `·` as the separator and curly quotes.

## Adding a screen or state

1. Build it from the existing classes.
2. Add it to `tests/support/screens.ts` with a `setup` that reaches it (seed state with
   `app.open({...})`). That gives it a screenshot baseline and a design-lint pass.
3. Run `npm run visual`. The first run writes the new baseline. Open it, and
   `npm run visual:sheet`, to check it against the reference screens.
4. Commit the new baseline with the code.

Media (images, video) goes inside an element with `data-media`. The lint treats it as
content and skips it.

## The review gate (don't skip it)

- **A failing screenshot is a question, not an obstacle.** Look at the diff in the
  Playwright report or the contact sheet. If the change is intended, run
  `npm run visual:update` and name the screens that changed, and why, in the commit
  message. If it isn't intended, fix the code.
- **Never change `tests/support/lint.ts` rules to make a screen pass.** Fix the screen.
  If the design itself must change (a new radius, a new token), change the rule or
  token in the same commit and say why.
- **Never delete or skip a test** to get green.
- **Keep the design deterministic in tests:** seeded mock data, no `Math.random()` or
  `Date.now()` in rendering without the test clock, and no emoji or text glyphs in the
  chrome (use the SVG icons).

## Done means

- `npm run check` passes.
- New screens are in `tests/support/screens.ts`, with baselines committed.
- Each verb keeps its color everywhere, and at most one gradient appears per view.
- Every icon-only button has an `aria-label`; sheets and gates are dialogs.
