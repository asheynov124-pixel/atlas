# PLAN — Sixteen Bannehr

An interactive coffee-table book about 16 Bannehr Street, built for one reader.
This file is the working plan: stack, architecture, templates, phases, and the
calls I made where the brief left room. It is updated as phases land.

## 0. Housekeeping

- The repo was not empty: it held a five-file Expo stub (`src/hop/*`, `HOP.md`)
  for an unrelated "Atlas" project. I moved it untouched to `legacy/atlas-hop/`
  rather than deleting it. The book owns `src/` from here on.
- Work is committed on the branch `sixteen-bannehr`, one commit per phase.
- No `frontend-design` skill is installed in this session, so none was loaded.
  The design direction below is written out instead, so it can be checked.

## 1. Stack (as briefed, with two pins)

| Concern | Choice | Note |
|---|---|---|
| Build | Vite 7 + React 19 + TypeScript 5.9 | Vite 8 / TS 7 are days old; pinned one major back for boring builds. |
| State | Zustand 5 + Immer + `zundo` | Temporal store, 200-step limit, partialized to the document only. |
| Persistence | Dexie 4 (IndexedDB) | Assets as Blobs. Behind a `BookStorage` interface. |
| Reorder | `@dnd-kit/core` + `sortable` | Thumbnail strip, chapters. |
| Canvas | `react-moveable` | Mood board drag/resize/rotate with snapping. |
| Motion | `motion/react` | Page turns, Ken Burns. Transform/opacity only. |
| Rich text | TipTap 3, minimal schema | Bold, italic, link, pull-quote. Paste strips. |
| Export | JSZip | `book.json` + `assets/*` |
| Offline | `vite-plugin-pwa` | autoUpdate, precache app shell + fonts. |
| Checks | Playwright + Vitest | Screenshots, a11y smoke, zip round-trip. |
| Fonts | `@fontsource` packages | Instrument Serif, Newsreader (variable), Inter (variable), Caveat. Self-hosted via npm, no runtime Google request. |
| Styling | Plain CSS + custom properties, CSS Modules per component | No UI kit. |
| Photos | `sharp` + `heic-convert` in `scripts/import-photos.ts` | Node script, `npm run import-photos`. |

## 2. Design direction (the part a skill would have covered)

**The feel.** A design monograph, not an app. Warm paper, ink, hairlines, big
numerals, generous outer margins, images that sit on the page like plates. The
chrome (mode toggle, strip, panels) is set in small-caps Inter on the same paper
and disappears in Read mode. Nothing has a drop shadow except the book itself.

**Type scale** (desktop / phone):
- Display: Instrument Serif, 96–160 px chapter numerals, 56–72 px titles / 40–48.
- Text: Newsreader, 18 px / 16.5 px, leading 1.5, measure 60–68 characters.
- Labels: Inter 11–12 px, uppercase, tracking 0.06em, muted ink.
- Marginalia: Caveat 20 px.
- Real quotes “ ”, en dashes in ranges, hanging punctuation on pull quotes.

**Colour** from the house, as CSS custom properties fed from `book.theme`:
paper `#F5F1EA`, ink `#1F1D1A`, muted `#6F6A63`, sage `#8A9A7B`, olive `#5E6B4A`,
oak `#B08B5E`, clay `#B0452A`, hairline `#D9D2C7`. Night theme swaps paper/ink/
hairline. Every chapter gets an accent drawn from this set for its placeholders
and numerals.

**Paper.** An SVG feTurbulence noise layer at 2.5% opacity on every page, a
hairline rule under running heads, folios at outer bottom corners, a gutter
shadow between pages, a soft page-edge shadow around the spread, sage endpapers.

**Placeholders.** A duotone panel (chapter accent over paper, with noise and a
diagonal hairline grid) carrying a small-caps label naming the photo that
belongs there, e.g. `KITCHEN — RENDER, PENINSULA VIEW`. Never a stock photo.

**Motion.** Desktop page turn: outgoing spread slides and darkens under a soft
shadow with a slight skew at the leading edge (the "hint of curl"); incoming
slides in. 520 ms, ease `[0.2, 0.7, 0.2, 1]`. Openers get a 20 s Ken Burns
(scale 1.0→1.06). `prefers-reduced-motion` drops both to a crossfade.

## 3. Architecture

```
src/
  app/            App shell, router (hash), mode + theme + author providers
  book/           Domain: types, seed, templates registry, pagination, folios
  templates/      One folder per template: Component + schema + defaults
  reader/         Spread/Page primitives, PageTurn, PhoneScroller, RunningHead, Folio, Contents
  editor/         Edit chrome: Toolbar, ThumbStrip, ChaptersPanel, SlotEditors (Text, Image, Focal), Notes, Editions, ThemePanel
  features/       gallery (favourites, compare), moodboard, pins, palette, decision, shopping, stillToDecide
  state/          Zustand store (book doc + temporal), ui store, autosave
  storage/        BookStorage interface, DexieStorage, zip export/import, assets + variants
  styles/         tokens.css, fonts.css, paper.css, print.css, type-specimen
  content/        photos.manifest.json (written by import-photos)
scripts/          import-photos.ts, shots.ts (Playwright screenshots), icons.ts
tests/            Playwright e2e + Vitest unit
```

**Spread/Page model.** Every template renders `<Spread>` with one or two
`<Page side>` children (or `<Spread bleed>` for openers and full-bleeds). On
desktop a spread is a 3:2 landscape with two pages. On phone the same DOM
reflows: pages become 100dvh vertical scroll-snap panels. Templates never know
which viewport they are on beyond CSS; "reflowed, not shrunk".

**Reader.** Desktop: one spread mounted at a time inside `AnimatePresence`;
arrows, click on page edge, horizontal swipe, keyboard. Phone: one vertical
scroll-snap container with every page; an IntersectionObserver tracks the
current page for the hash, running head and strip. Images are lazy.

**Edit mode.** The same page components, with `editable` from context. Text
slots mount TipTap on click. Image slots accept drops/taps and open the focal
crosshair. A bottom strip (thumbnails) and a right-hand "margin" of tools only
in Edit. Nothing is a side form; every edit happens on the page.

**State.** One Zustand store: `{ book, ... }` under Immer, wrapped in zundo's
`temporal` (limit 200, partialize to `book`). Actions are small and named
(`setSlotText`, `setImageAsset`, `moveSpread`, …). Autosave subscribes to the
store, debounces 400 ms, writes through `storage.saveBook`. A separate
non-undoable UI store holds mode, current spread, theme, author, drawers.

**Storage seam.** `BookStorage { loadBook, saveBook, listEditions, saveEdition,
restoreEdition, putAsset, getAssetBlob, deleteAsset, exportZip, importZip }`.
`DexieStorage` is the only implementation; the UI imports the interface. A
future sync backend replaces one module.

**Assets.** Two sources behind one `Asset` record: `idb` (user-dropped, blob in
Dexie; the app also makes 800/1600 WebP variants in-browser with
`createImageBitmap` + canvas) and `static` (from `import-photos`, served from
`/photos/<chapter>/<name>-{800,1600,2800}.webp` with the original kept). Both
produce `srcset`. A slot never upscales: if the asset is narrower than the
slot's rendered width × DPR, the image is shown framed on paper with a quiet
note in Edit mode.

**Photo import.** `npm run import-photos` reads
`content/photos/<chapter-slug>/*.{jpg,jpeg,png,heic}`, converts HEIC, writes
variants and originals to `public/photos/`, and writes
`src/content/photos.manifest.json`. At runtime the app fills a chapter's empty
image slots in filename order from the manifest once (recorded in
`book.appliedPhotos`), so a photo Sonny removes stays removed.

## 4. Data model (refined from the brief)

```ts
Book     { id, schemaVersion, title, subtitle, address, dedication, theme, chapters[],
           items: Record<ItemId, Item>, editions: EditionMeta[], appliedPhotos: string[], updatedAt }
Chapter  { id, slug, number, title, kicker, epigraph, accent, spreads[] }
Spread   { id, template, slots: Record<string, Slot>, notes: Note[], meta?: { title?, status? } }
Slot     = Text { kind:'text', html }
         | Image { kind:'image', assetId|null, focal:{x,y}, caption, alt, credit, placeholder }
         | Items { kind:'items', itemIds[] }
         | Board { kind:'board', elements: BoardEl[] }
         | Pins  { kind:'pins', image: Image, pins: Pin[] }
         | Pair  { kind:'pair', before: Image, after: Image }
         | Decision { kind:'decision', optionIds[], chosenId, why, cost, status, date }
         | Shopping { kind:'shopping', rows: ShoppingRow[] }
         | Materials { kind:'materials', cards: MaterialCard[] }
Asset    { id, source:'idb'|'static', width, height, mime, createdAt, variants?: {w,url}[], original?: url }
Item     { id, name, brand, price, currency, url, assetId, tags[], status,
           favorites:{adi,sonny}, clean: CleanFields, notes }
Note     { id, author:'adi'|'sonny', text, x, y, resolved, createdAt }
Edition  { id, name, createdAt, book: Book }  // stored in its own Dexie table
```

Items live at book level so a vanity can appear in a gallery, a decision and
the shopping list without copies. "Still to Decide" is a virtual spread
computed from Decision slots and Shopping rows at render time.

## 5. Templates

| id | Pages | Slots |
|---|---|---|
| `cover` | bleed | hero, title, subtitle, address |
| `endpapers` | 2 | dedication |
| `contents` | 2 | (generated) |
| `opener` | bleed | hero, (chapter number/title/epigraph from chapter) |
| `essay` | 2 | title, body, quote?, margin image? |
| `fullbleed` | bleed | image, caption |
| `beforeafter` | 2 | pair, caption |
| `gallery` | 2 | title, items |
| `moodboard` | 2 | title, board |
| `pins` | 2 | title, pins |
| `palette` | 2 | title, materials |
| `decision` | 2 | title, decision |
| `shopping` | 2 | title, shopping |
| `stilltodecide` | 2 | (virtual, computed) |

Changing template keeps slots whose key and kind match.

## 6. Phases

- **Phase 0** — tokens, fonts, paper, type specimen (`#/specimen`), Spread/Page
  primitives, placeholders, three templates (cover, opener, essay) with seed
  content. Screenshots + critique. Commit.
- **Phase 1** — every template in read-only form, seed book complete, Contents
  with tap-to-jump, desktop page turns, phone scroller, running heads and
  folios, night theme, keyboard. Screenshots + critique. Commit.
- **Phase 2** — Edit mode: TipTap text, image drop/pick + focal point + alt/
  credit, swap slots, thumbnail strip (add/duplicate/delete/reorder/change
  template), chapters, marginalia with author, undo/redo, autosave, editions.
  Commit.
- **Phase 3** — mood board, gallery favourites + compare drawer, pins, palette
  with Clean materials, decision, shopping list with totals, Still to Decide.
  Commit.
- **Phase 4** — zip export/import, print stylesheet, PWA, a11y pass (Lighthouse
  ≥ 95 via Playwright + axe), `import-photos`, Netlify + README + SONNY.md,
  final screenshots. Commit.

After each phase: `npm run shots` captures 390×844 and 1440×900 of cover,
contents, an opener, an essay and a gallery into `screenshots/`, and I look at
them against section 8 of the brief before moving on.

## 7. The three design decisions I am least sure about

1. **Phone = one long vertical scroll-snap of all pages, desktop = one spread
   mounted at a time.** Two reader implementations share templates but not
   navigation code. The alternative (one implementation, horizontal on both)
   fights iOS Safari's gesture model. I chose native scroll for the phone
   because the brief's first principle is that it must feel right on hers.

2. **Static photos are not packed into the export zip.** Both phones open the
   same deployed URL, so photos imported with `import-photos` are already on
   both devices; only user-dropped images (IndexedDB blobs) travel in the zip.
   This keeps exports small, but a zip imported into a build that lacks those
   photos would show placeholders. An "include site photos" switch is the
   obvious follow-up.

3. **Items as a book-level library referenced by id.** It lets a vanity be a
   gallery tile, a decision option and a shopping row at once, and keeps
   favourites consistent. The cost: deleting a gallery must not delete items
   other spreads use, so items are only ever archived, not removed, in the MVP.

## 8. Calls made without asking

- Page numbering: cover and endpapers carry no folio; counting starts at the
  Contents spread (pages 1–2), right-hand pages even/odd as in a book.
- "Who is editing" is asked the first time Edit is switched on, per device,
  stored in `localStorage`, changeable from the toolbar.
- Night theme is a toggle persisted per device; it does not follow the OS.
- Prices are USD; the shopping total ignores rows with no price.
- The Clean materials panel is data entry only, with "Unknown" as a valid
  value for every field; nothing is prefilled.
