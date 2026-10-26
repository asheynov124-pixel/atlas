# Sixteen Bannehr — build plan

A coffee-table book about one house, for one reader. This plan is the contract I am
building against; where I changed the brief, the reason is written next to the change.

---

## 0. Where it lives

The repository (`atlas`) already holds an unrelated Expo project. The brief assumes an
empty folder, so the book is a self-contained app in **`sixteen-bannehr/`**. Nothing
outside that folder is touched. `netlify.toml` sits in this folder; when deploying from
Git, set Netlify's *base directory* to `sixteen-bannehr` (README explains).

## 1. Stack

| Concern | Choice | Note |
|---|---|---|
| Build | Vite 7 + React 18.3 + TypeScript 5.9 | React 18 rather than 19: `react-moveable` has no declared React 19 support, and nothing here needs 19. Vite 7 / TS 5.9 instead of the brand-new Vite 8 / TS 7 for the same reason: a long track record. |
| State | Zustand 5 + Immer + `zundo` | One store for the book; `zundo` keeps 200 undo steps of the `book` subtree only. |
| Storage | Dexie 4 (IndexedDB), behind a `BookRepository` interface | Swappable for a sync backend later; the UI never imports Dexie. |
| Reorder | `@dnd-kit/core` + `@dnd-kit/sortable` | Thumbnail strip and chapter list. |
| Mood board | `react-moveable` | Drag, resize, rotate, snap to an invisible grid; Alt/Option frees it. |
| Motion | `motion/react` | Page turns animate `transform` and `opacity` only. |
| Rich text | TipTap 3 with a hand-picked schema | Bold, italic, link, pull quote. Mounted **only** on the text being edited (lazy chunk), so reading costs nothing. |
| Zip | JSZip (lazy chunk) | Export / import. |
| Offline | `vite-plugin-pwa` (Workbox `generateSW`) | Precaches the shell and the Latin font subsets. |
| Fonts | `@fontsource` packages (self-hosted woff2, bundled by Vite) | Instrument Serif, Newsreader (variable, with optical size), Inter (variable), Caveat. |
| Photos script | `sharp` + `heic-convert` | Sharp's prebuilt binaries cannot decode HEIC, so HEIC goes through `heic-convert` first. |
| Checks | Playwright (screenshots + acceptance flows), `@axe-core/playwright`, Vitest for pure logic | Vitest is an addition: page-numbering, template switching, "Still to Decide" and zip round-trips deserve fast unit tests. |
| Styling | Plain CSS with custom properties; one stylesheet per area | No UI kit. Container queries do the reflow. |

No `frontend-design` skill is available in this environment, so the design system below is
written from first principles and checked by screenshot after each phase.

## 2. Architecture

```
src/
  model/        types.ts · seed.ts · templates.ts (slot registry) · pages.ts (numbering)
                still-to-decide.ts · typeset.ts (smart quotes, en dashes, primes) · sanitize.ts
  store/        book.ts (zustand + immer + zundo) · prefs.ts (device: who/theme/notes)
                assets.ts (object-URL cache, variant queue) · persistence.ts (autosave)
  storage/      repository.ts (interface) · dexie.ts (implementation) · zip.ts (export/import)
                bundled.ts (photos baked in by `npm run import-photos`)
  reader/       Book.tsx · SpreadStage.tsx (desktop + page turn) · PhoneScroll.tsx
                Spread.tsx · Page.tsx (running heads, folios) · ReaderBar.tsx · Contents
  templates/    one file per template + shared primitives (Picture, Placeholder, Text)
  edit/         EditBar · ThumbStrip · TextEditor (TipTap) · ImageSlotTools · FocalPoint
                Marginalia · TemplatePicker · Editions · ThemePanel
  features/     MoodBoard · Gallery + CompareDrawer · PlanPins · Palette · Decision
                Shopping · StillToDecide
  styles/       tokens.css · base.css · book.css · edit.css · print.css
```

**Data flow.** The store owns `book` (pure JSON). Every mutation is a named action
(`retitleChapter`, `setSlotImage`, `moveSpread`…) so undo steps read like a history.
Text commits on blur and mood-board moves commit on drop, so one gesture is one
undo step, never a keystroke or a pixel. Autosave writes the whole book to IndexedDB
400 ms after the last change.

**Assets.** Blobs never enter the store. `Asset` metadata (size, mime) and the original
blob live in Dexie; WebP variants (800 / 1600 / 2800 px, never larger than the original)
are generated in the browser after a drop and stored beside it. `<Picture>` builds a
`srcset` from whatever variants exist, sets `object-position` from the focal point, and
measures its slot: if covering the slot would upscale the image by more than 10 %, it
shows the photo **framed** (a tipped-in plate on paper) instead, with a quiet note in Edit
mode.

**Photos from `npm run import-photos`.** The script writes variants to
`public/photos/<chapter>/` and a manifest, `src/storage/bundled-photos.json`. On load
the app fills each chapter's empty image slots (spreads first, then gallery items) in
filename order, and remembers which bundled photos it has placed so a photo Sonny
removes does not come back. Bundled photos ship with the deploy, so they reach her phone
without an export.

## 3. Data model (refinements to the brief's §6)

- `Chapter` gains `slug` (folder name for photos), `kind`
  (`front | prologue | chapter | epilogue`) and `tone` (the placeholder colour).
  **`number` is derived from order**, not stored, so reordering cannot leave a stale number.
- Items live once in `book.items` (a dictionary); slots reference them by id, so the same
  vanity can sit in a gallery, a decision and the shopping list.
- Two slot kinds are added: `MetaSlot { values }` (decision status/date/cost/chosen) and
  `SwatchesSlot { swatches }` (named colour chips).
- `Asset.source` is `blob` (IndexedDB) or `bundled` (shipped with the site).
- **Editions live in their own table, not inside `Book`.** A snapshot that contains
  snapshots grows without limit, and saving an edition should not be undoable.
- `Note` gains `page: 'verso' | 'recto'`; `x, y` are percentages of that page, so a note
  stays put on any screen size.

## 4. Templates

| # | Id | Slots (shared keys carry over on template change) |
|---|---|---|
| 1 | `cover` | `title` `subtitle` `address` `image` |
| 2 | `dedication` | `body` (sage endpaper on the verso) |
| 3 | `contents` | — generated |
| 4 | `opener` | `image` + the chapter's own title / epigraph |
| 5 | `essay` | `kicker` `title` `body` `pull` `image` `caption` |
| 6 | `fullbleed` | `image` `caption` |
| 7 | `beforeAfter` | `image` (before) `image2` (after) `caption` |
| 8 | `gallery` | `title` `body` `items` |
| 9 | `moodboard` | `title` `board` |
| 10 | `plan` | `title` `plan` (image + pins) `body` |
| 11 | `palette` | `title` `swatches` `items` (materials with the Clean panel) |
| 12 | `decision` | `title` `items` (options) `body` (why) `meta` (chosen, status, cost, date) |
| 13 | `shopping` | `title` `items` |
| + | `library` | auto-built: every material in the book (Chapter 9) |
| + | `stillToDecide` | auto-built epilogue |
| + | `title` | a quiet title spread ("The First Dinner") |

Every template renders as a **verso + recto** pair, plus an optional span layer for
full-bleed images. On desktop the pair is a 3:2 spread; on phone each page is its own
full-height, snap-scrolled screen and the span becomes a page of its own. Templates are
reflowed with container queries, not scaled down.

## 5. Reading

- **Desktop / iPad landscape:** one spread at a time, centred, with the spine shadow and
  page-block edges of a real book. The cover is a closed book (one page); turning it opens
  onto sage endpapers.
- **Phone / iPad portrait:** one page per screen, vertical swipe with snap.
- **Page turn:** a *leaf slide*. The right-hand page lifts and slides across the spine to
  become the new left-hand page, cross-fading from front to back as it travels. A shadow
  falls on the page beneath it, and a soft sheen on the leading edge gives the hint of a
  curl. 650 ms, eased out, no bounce. Only `transform` and `opacity` move. Reduced motion
  gets a 150 ms cross-fade.
- **Openers:** a 24-second Ken Burns drift (1.00 → 1.06 scale, towards the focal point).
  Switched off under reduced motion.
- **Folios and running heads:** pages are numbered as a printed book is: the cover is
  page 1 (a recto), so versos are even and rectos odd. Folios sit at the outer bottom
  corners; running heads give the book title on versos and the chapter title on rectos.
  Both are suppressed on openers, full-bleeds and front matter.
- **URLs:** `#/p/<spreadId>` so reloading keeps the place and Contents links are real links.

## 6. Editing

Read ⇄ Edit is one toggle. In Edit mode:

- Text is edited in place (click → TipTap mounts in that block with identical typography;
  blur commits). Paste is plain text. Quotes, dashes and inch marks are typeset on commit
  (`"` → “ ”, `--` → –, `60"` → 60″).
- Image slots take dropped files, tap-to-choose (iPhone photo library), a draggable
  focal crosshair, alt text, credit, remove, and drag-one-slot-onto-another to swap.
- A **contact sheet** along the bottom: add / duplicate / delete / reorder / change template.
- Chapters: add, rename and reorder on the Contents spread itself.
- Marginalia in Caveat, coloured by author (Adi: olive ink, Sonny: clay). "Who is
  editing" is asked once per device.
- Undo / redo: ⌘Z / ⇧⌘Z and buttons. Autosave status is shown. Editions: name, save,
  restore (restoring is itself undoable).

## 7. Phases

| Phase | Scope | Exit check |
|---|---|---|
| 0 | Tokens, fonts, `#/specimen`, cover / opener / essay with seed content | Screenshots at 390 and 1440; critique against §8 |
| 1 | Every template's read view, contents, page turns, heads and folios, phone layout, night theme | Same, plus the gallery |
| 2 | Edit mode: text, images, focal point, contact sheet, chapters, marginalia, undo, autosave, editions | Playwright walk-through of acceptance test 3 |
| 3 | Mood board, gallery favourites + compare, plan pins, palette + Clean panel, decision, shopping, Still to Decide | Screenshots + flows |
| 4 | Zip export/import, print, PWA, accessibility, deploy docs, `SONNY.md` | Acceptance tests 4–7 automated where a browser can check them |

Each phase is committed (and pushed) on its own.

## 8. Calls I made without asking

1. **"Still to Decide" collects decisions whose status is *Thinking*.** Read literally,
   "status is not Decided" would also list things that are Ordered or Installed, which
   are past deciding.
2. **Seed galleries hold numbered, unnamed items** ("Vanity No. 7"). Brands, prices and
   compliance fields stay blank rather than invented. The Clean materials panel shows
   *Not yet checked* until a person fills it in.
3. **Pull quotes in the seed are lifted verbatim from the essays**, as a magazine would.
   No new copy is invented, except the placeholder essays the brief asks for, which
   read as prompts for Sonny ("This page is waiting for…").
4. **Prices are in USD**, typed by hand; the running total counts only priced items
   and says how many are unpriced.

## 9. The three decisions I am least sure about

1. **Essay layout for short essays.** The seed essays run 45–110 words. Set as two
   literal columns they would leave a spread mostly empty and look unfinished. So the
   essay template adapts to length. Under ~180 words it sets the standfirst and pull
   quote on the verso and the essay on the recto in a lead size (two columns' worth of
   measure). Over that, it flows into two true columns across the spread. That is
   faithful in spirit, but it is a deviation.
2. **Bundling imported photos into the deploy** rather than into IndexedDB. It is
   the only way a Node script can put photos on Sonny's phone without a manual import.
   The cost is that the site grows with the photo set. 800/1600/2800 px WebP variants
   keep each page light, and originals are kept on disk but not shipped (the 2800 px
   variant is the largest file the browser ever loads).
3. **The leaf-slide page turn.** It is the calmest gesture that still reads as a page. It
   is not a slideshow and not a 3D flip, and it may still feel too plain or too clever.
   It is isolated in one component (`SpreadStage`) so it can be retuned without touching
   the templates.
