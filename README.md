# Sixteen Bannehr

An interactive coffee-table book about the house at 16 Bannehr Street,
Oakland, New Jersey. It reads like a design monograph and edits like a
well-made tool. Made for Sonny. See `SONNY.md` for the one-page guide.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
```

Build and look at the production build:

```sh
npm run build      # typecheck + vite build → dist/
npm run preview    # http://localhost:4173
```

## Check it

```sh
npm test           # unit tests (zip round trip, pagination, migrations)
npm run e2e        # Playwright: the brief's edit scenarios, phone and laptop
npm run shots      # screenshots at 390×844 and 1440×900 into screenshots/
```

`npm run e2e` starts the preview server itself. The first time, run
`npx playwright install chromium`.

## Put our photos in

1. Make a folder per chapter under `content/photos/` (the slugs are listed in
   `content/photos/README.md`: `front`, `prologue`, `approach`, `vault`,
   `kitchen`, `bath-archer`, `small-bath`, `rest`, `below`, `outside`,
   `palette`, `epilogue`).
2. Drop in JPG, PNG, WebP or HEIC files. Name them in the order the pictures
   should appear: `01-front.jpg`, `02-porch.jpg`, …
3. Run:

```sh
npm run import-photos
```

HEIC is converted, 800 / 1600 / 2800 px WebP variants are written to
`public/photos/<chapter>/` next to an untouched copy of the original, and
`src/content/photos.manifest.json` is updated. When the book opens, each
chapter's empty image slots are filled in filename order, once per photo.
Removing a photo from a page later does not bring it back. Rebuild and
deploy to publish them.

Photos added inside the app (dropped on a page) live in the browser's
IndexedDB. They travel between devices through Export / Import in the ⋯ menu,
packed into one `.zip` with the text.

## Deploy to Netlify (Mac)

The build is a static site. `netlify.toml` sets the publish folder, the SPA
redirect, and cache headers for the service worker.

**Drag and drop.** Run `npm run build`, open https://app.netlify.com/drop, and
drag the `dist` folder onto the page. Netlify gives you a URL on the spot.
Repeat with a fresh `dist` to update; use the site's "Deploys" tab to drop a
new folder onto an existing site so the URL stays the same.

**From the terminal.**

```sh
npm install -g netlify-cli
netlify login
npm run build
netlify deploy --prod --dir=dist     # first time it asks to create a site
```

Open the URL on an iPhone in Safari, tap Share → Add to Home Screen. The
book then opens full screen and works offline.

## Where things are

```
src/book        types, seed content, pagination (folios, figure numbers), migrations
src/templates   one folder per spread template
src/reader      Spread / Page / Plate primitives, the reader, page turns
src/editor      Edit mode: in-place text, photos, strip, panels, notes, sessions
src/features    galleries, compare, mood board editor, item and material sheets
src/state       Zustand store (undo via zundo), UI store, actions, bootstrap/autosave
src/storage     BookStorage interface, Dexie implementation, zip export/import
scripts         import-photos, screenshots, icons, contact sheet
tests           Vitest unit tests, Playwright end-to-end tests
```

The storage layer sits behind `BookStorage` (`src/storage/types.ts`). A sync
backend replaces `DexieStorage` without touching the UI.
