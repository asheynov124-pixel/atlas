# Sixteen Bannehr

An interactive coffee-table book about 16 Bannehr Street, made for Sonny. It reads like a
design monograph and edits like a design tool. It works on her phone and offline.

- **For Sonny:** [`SONNY.md`](SONNY.md), one page on reading, editing and sharing.
- **How it was planned:** [`PLAN.md`](PLAN.md), with the decisions and their reasons.
- **What it looks like:** [`screenshots/`](screenshots).

Everything below is for the Mac.

---

## Run it

You need Node 22 (`brew install node@22`, or from nodejs.org).

```sh
cd sixteen-bannehr
npm install
npm run dev          # http://localhost:5173
```

Open `http://localhost:5173/#/specimen` for the type specimen (every face, size and colour).

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload. |
| `npm run build` | Type-checks and builds the site into `dist/` (with the offline service worker). |
| `npm run preview` | Serves `dist/` at http://localhost:4173, exactly as it will be deployed. |
| `npm test` | Unit tests: numbering, typesetting, templates, Still to Decide, zip round-trip. |
| `npm run e2e` | Browser tests (Playwright) of every acceptance test in the brief, on the built site. |
| `npm run shots` | Screenshots of the key pages at 390 px and 1440 px into `screenshots/`. |
| `npm run import-photos` | Turns your photos into web copies and places them in the book (below). |
| `npm run icons` | Redraws the home-screen icons from the book's own type. |
| `npm run build:artifact` | Builds the version that opens as a claude.ai artifact, into `dist-artifact/` (below). |

The first `npm run e2e` needs Playwright's browser once: `npx playwright install chromium`.

## Put our photos in

1. Drop photos into `content/photos/<chapter>/`. The folders already exist: `cover`,
   `prologue`, `approach`, `vault`, `kitchen`, `archer-bath`, `small-bath`, `rest`, `below`,
   `outside`, `palette`, `epilogue`. Details are in [`content/photos/README.md`](content/photos/README.md).
2. Photos **directly in a chapter folder** fill that chapter's empty pictures in filename
   order: opener first, then before/after, full-bleed, plan, mood board, then any leftover
   options. Name them `01-…`, `02-…` to control the order.
3. Photos in the chapter's **`items/`** folder go only to options and materials. For
   example, put the 32 vanity renders in `content/photos/archer-bath/items/`.
4. Run:

   ```sh
   npm run import-photos
   ```

   HEIC from the iPhone is converted, sideways photos are turned upright, and each photo
   gets 800 / 1600 / 2800 px WebP copies in `public/photos/`. Copies are never larger than
   the original, which stays untouched in `content/photos/`. Run it again any time:
   unchanged photos are skipped, removed photos are cleaned up.
5. Deploy (below). The next time the book opens, on any device, the photos are in place.
   A photo is placed only into an *empty* picture, and only once. If Sonny removes one, it
   stays removed.

Photos added from the phone in Edit mode live on that phone (and travel in the .zip).
Photos from `import-photos` ship with the site and reach every device.

## Deploy, so Sonny has a URL

> **Privacy.** The site is public to anyone who has the address, and every photo you
> import ships with it. Search engines are asked not to index it (a `noindex` header and
> `robots.txt`). Use an unguessable site name. For a password, use Netlify's site
> protection (Site configuration → Access & security), which may require a paid plan.
> Edits made in the app stay on the device until exported.

### Option A: drag and drop (simplest)

```sh
npm run build
open dist   # opens the folder in Finder
```

Go to <https://app.netlify.com/drop> and drag the **`dist`** folder onto the page. Netlify
prints a URL. Rename the site to something unguessable in Site configuration → Change site
name. To update the site later, open the site in Netlify, go to **Deploys**, and drag a
fresh `dist` folder onto the drop area there.

### Option B: the Netlify CLI

```sh
npm install -g netlify-cli
netlify login                 # opens the browser once
npm run build
netlify deploy --dir=dist     # a preview URL, to check
netlify deploy --dir=dist --prod
```

The first `netlify deploy` asks whether to create a new site or link an existing one.
`netlify.toml` in this folder sets the build command, the output folder and the cache
headers.

### Option C: deploy from GitHub

Create a Netlify site from this repository and set **Base directory** to
`sixteen-bannehr`. Netlify reads `netlify.toml` for the rest. Commit `public/photos/` and
`src/storage/bundled-photos.json` after importing photos, so the build has them.

### On her phone

Open the URL in Safari, tap **Share → Add to Home Screen**. It opens full screen, like an
app, and works offline after the first visit.

### Or open it as a claude.ai artifact

`npm run build:artifact` builds a copy for claude.ai's artifact viewer:
`dist-artifact/sixteen-bannehr.html` plus the `assets/` folder beside it, published
together. The viewer frames the page and refuses some things, so this copy differs from
the deployed site:

- No offline mode and no Add to Home Screen; no Print and no Send (the viewer blocks both).
- **Save as .zip** goes through the viewer's own "save this file?" prompt.
- The book is kept in that browser's storage, per person and per device, exactly as on
  the site. It opens where you left off.

## Sharing between the two phones

There is no server in this version. Each phone keeps its own copy in the browser's
storage (IndexedDB). To move the book from one phone to the other:

1. On the phone with the changes: **Edit → Share → Send the book…** (AirDrop, Messages)
   or **Save as .zip**.
2. On the other phone: **Edit → Share → Open a .zip…**.

The zip holds every word, every photo (originals and web copies) and every edition. Opening
it *replaces* the book on that phone, so send in one direction at a time. Live sync is the
next step; the seam for it is `src/storage/repository.ts`.

## Print

**Edit → Share → Print or save as PDF…** lays out every spread on its own landscape page,
11 × 8.5 in. In the print dialog, choose **Save as PDF**, paper size **Letter**,
orientation **Landscape**, and turn on **Background graphics**. ⌘P also works, but
the button waits for every photo to load first.

## How it is built

- Vite + React 18 + TypeScript. State in Zustand with Immer; `zundo` keeps 200 steps of undo.
- Storage behind `BookRepository` (`src/storage/repository.ts`), implemented with Dexie
  (`src/storage/dexie.ts`). Swap that one file for a sync backend.
- One component per template in `src/templates/`. Each renders a verso and a recto. The
  phone layout reflows the same components with container queries.
- The page turn is `src/reader/SpreadStage.tsx`: a leaf slide, transform and opacity only.
- Text edits in place with TipTap (`src/edit/EditableField.tsx`). It loads only when the
  first field is tapped in Edit mode.
- The mood board uses `react-moveable` (`src/features/BoardEditor.tsx`).
- Export and import with JSZip (`src/storage/zip.ts`). Offline via `vite-plugin-pwa`.

```
src/model      the book as data: types, seed text, templates, numbering, typesetting
src/store      book store + undo, preferences, assets, autosave
src/storage    IndexedDB, zip, bundled photos
src/reader     the book: stage, page turns, phone scroll, print, theme
src/templates  the spreads
src/edit       Edit mode: in-place text, images, contact sheet, panels, notes
src/features   galleries & compare, mood board, pins, palettes, decisions, lists
src/styles     tokens, book, templates, pages, edit, features, print
scripts        import-photos, icons, screenshots
tests          Playwright acceptance tests
```

## Troubleshooting

- **The phone shows an old version.** The app checks for an update every time it opens and
  installs it in the background. Close it and open it again.
- **A HEIC photo won't add in Chrome on the Mac.** Chrome cannot read HEIC. Use Safari, or
  put the photo through `npm run import-photos`. The iPhone converts HEIC automatically
  when choosing from Photos.
- **`npm install` complains about peer dependencies.** `.npmrc` sets
  `legacy-peer-deps=true`; keep that file.
