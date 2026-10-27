// End-to-end smoke test at iPhone 14 size against a running preview server.
//   npm run build && npx vite preview --port 4173 &
//   node scripts/e2e.mjs [baseUrl] [screenshotDir]
// Drives real pointer/touch gestures and checks the app's state after each step.
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { GALLERY_URL, LOCKED_URL, installImportFixtures } from './fixtures.mjs';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:4173/';
const shots = process.argv[3] ?? 'e2e-shots';
await mkdir(shots, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'] });
const page = await ctx.newPage();
const problems = [];
/** Console errors a step deliberately provokes (a refused page, a missing file). */
const expected = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const where = `${m.text()} ${m.location()?.url ?? ''}`;
  if (!expected.some((re) => re.test(where))) problems.push(`console: ${m.text()}`);
});

let step = 0;
const results = [];
async function check(name, fn) {
  step++;
  try {
    await fn();
    results.push(`✓ ${step}. ${name}`);
  } catch (e) {
    results.push(`✗ ${step}. ${name}: ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: `${shots}/fail-${step}.png` }).catch(() => undefined); // the page may be closed
  }
}
const shot = (name) => page.screenshot({ path: `${shots}/${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const vp = page.viewportSize();
const W = vp.width;
const H = vp.height;
const tab = (name) => page.locator('.tabbar__item', { hasText: name });
const searchInput = () => page.locator('.searchbar input');
const activeId = () => page.locator('.card--active').first().getAttribute('data-video-id');
const pathLabel = () => page.locator('.pathbar__label').textContent();
const state = () =>
  page.evaluate(async () => {
    // Read persisted state straight from IndexedDB (keyval-store / keyval).
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('keyval-store');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const raw = await new Promise((res) => {
      const tx = db.transaction('keyval', 'readonly');
      const q = tx.objectStore('keyval').get('ph-discovery');
      q.onsuccess = () => res(q.result);
    });
    return raw ? JSON.parse(raw).state : null;
  });

async function drag(x0, y0, dx, dy, steps = 12, ms = 220) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x0 + (dx * i) / steps, y0 + (dy * i) / steps);
    await wait(ms / steps);
  }
  await page.mouse.up();
  await wait(450);
}

async function twoFinger(dx, dy) {
  const cdp = await ctx.newCDPSession(page);
  const cx = W / 2;
  const cy = H / 2;
  const pts = (k) => [
    { x: cx - 40 + dx * k, y: cy + dy * k, id: 1 },
    { x: cx + 40 + dx * k, y: cy + dy * k, id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(0) });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(i / 10) });
    await wait(18);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(450);
}

await page.goto(base, { waitUntil: 'networkidle' });

await check('age gate blocks entry until confirmed', async () => {
  await page.getByText('Adults only').waitFor({ timeout: 5000 });
  await shot('01-age-gate');
  await page.getByRole('button', { name: /18 or older/ }).click();
});

await check('first-run gesture guide shows, then the feed', async () => {
  await page.getByText('Swipe to teach it your taste').waitFor();
  await shot('02-gesture-guide');
  await page.getByRole('button', { name: 'Start swiping' }).click();
  await page.locator('.card--active canvas').first().waitFor();
  await wait(1200);
  await shot('03-feed');
});

await check('swipe right = like, advances, records signal', async () => {
  const before = await activeId();
  await drag(W * 0.4, H * 0.45, W * 0.5, 10);
  const after = await activeId();
  assert(after && after !== before, 'did not advance');
  await page.locator('.toast', { hasText: /^Liked/ }).waitFor({ timeout: 2000 });
  await wait(700);
  const s = await state();
  const sig = s.data[s.activeProfileId].signals.find((x) => x.kind === 'like' && x.videoId === before);
  assert(sig, 'like signal not persisted');
});

await check('swipe left = pass', async () => {
  const before = await activeId();
  await drag(W * 0.6, H * 0.45, -W * 0.5, 0);
  assert((await activeId()) !== before, 'did not advance');
});

await check('swipe up = save (with board prompt toast)', async () => {
  const before = await activeId();
  await drag(W * 0.5, H * 0.6, 0, -H * 0.3);
  await page.locator('.toast', { hasText: /^Saved/ }).waitFor({ timeout: 2000 });
  await wait(700);
  const s = await state();
  assert(s.data[s.activeProfileId].saves.some((x) => x.videoId === before), 'save not persisted');
});

await check('edge swipe up/down = next/prev', async () => {
  const a = await activeId();
  await drag(W - 8, H * 0.6, 0, -H * 0.3);
  const b = await activeId();
  assert(b !== a, 'edge up did not go next');
  await drag(W - 8, H * 0.4, 0, H * 0.3);
  assert((await activeId()) === a, 'edge down did not go back');
});

await check('two-finger vertical swipe = next', async () => {
  const a = await activeId();
  await twoFinger(0, -H * 0.25);
  assert((await activeId()) !== a, 'two-finger swipe did not advance');
});

await check('double-tap likes in place', async () => {
  const a = await activeId();
  await page.mouse.dblclick(W * 0.45, H * 0.4);
  await wait(500);
  assert((await activeId()) === a, 'double-tap should not advance');
  await page.locator('.tap-flash--heart').waitFor({ state: 'attached', timeout: 1500 }).catch(() => undefined);
});

await check('long-press opens the full menu', async () => {
  await page.mouse.move(W * 0.45, H * 0.42);
  await page.mouse.down();
  await wait(700);
  await page.mouse.up();
  await page.getByText('More like this…').waitFor({ timeout: 2000 });
  await shot('04-long-press-menu');
});

await check('More like this → visually similar (face) starts a parallel path on the same clip', async () => {
  const a = await activeId();
  await page.getByText('More like this…').click();
  await page.getByText('Visually similar').waitFor();
  await shot('05-more-like-this');
  await page.locator('.morelike__group').getByText('Face', { exact: true }).click();
  await wait(700);
  const label = await pathLabel();
  assert(/Face like/.test(label), `unexpected path label: ${label}`);
  assert((await activeId()) === a, 'new path should start on the current clip');
  await drag(W - 8, H * 0.6, 0, -H * 0.3);
  await wait(600);
  await shot('06-visual-path');
});

await check('edge swipe sideways switches paths', async () => {
  const before = await pathLabel();
  await drag(W - 6, H * 0.5, -W * 0.6, 0, 14, 260);
  await wait(500);
  const after = await pathLabel();
  assert(after !== before, `path did not switch (${before})`);
});

await check('swipe down → Aspect Capture → circle + words → aspect path', async () => {
  await drag(W * 0.5, H * 0.35, 0, H * 0.3);
  await page.getByText('Aspect Capture').first().waitFor({ timeout: 2000 });
  // Draw a loop around the middle of the frame.
  const cx = W * 0.5;
  const cy = H * 0.45;
  await page.mouse.move(cx + 70, cy);
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) {
    const t = (i / 24) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(t) * 70, cy + Math.sin(t) * 110);
  }
  await page.mouse.up();
  await page.getByPlaceholder(/Describe it/).fill('warm lighting');
  await wait(200);
  await shot('07-aspect-capture');
  await page.getByRole('button', { name: /Find more like this/ }).click();
  await page.getByRole('button', { name: /Start “.+” path/ }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.btn--capture.btn--block')?.hasAttribute('disabled'), null, { timeout: 5000 });
  await shot('08-aspect-reasoning');
  await page.getByRole('button', { name: /Start “.+” path/ }).click();
  await wait(700);
  assert(/like this/.test(await pathLabel()), 'aspect path not active');
});

await check('path switcher lists every path', async () => {
  await page.locator('.pathbar__chip').click();
  await page.getByText('Smart Paths').waitFor();
  const n = await page.locator('.pathlist__item').count();
  assert(n >= 3, `expected ≥3 paths, saw ${n}`);
  await shot('09-path-switcher');
  await page.keyboard.press('Escape');
});

await check('natural-language search shows editable interpretation chips', async () => {
  await tab('Search').click();
  await searchInput().fill('blonde petite romantic under 10 min no outdoor');
  await page.locator('.interp .chip').first().waitFor({ timeout: 4000 });
  const chips = await page.locator('.interp .chip').allTextContents();
  assert(chips.some((c) => /Blonde/.test(c)) && chips.some((c) => /No Outdoor/.test(c)), `chips: ${chips.join(' | ')}`);
  await page.locator('.tile').first().waitFor();
  await shot('10-search-nl');
});

await check('safety gate refuses minor-implying searches', async () => {
  await searchInput().fill('teen');
  await page.getByText(/That search isn’t available/).waitFor({ timeout: 3000 });
});

await check('paste a link → resolves → open in feed', async () => {
  await searchInput().fill('https://www.example.com/view_video.php?viewkey=ph5f3a2b1c9d');
  await page.getByText('Open in feed').waitFor({ timeout: 3000 });
  await shot('11-paste-link');
  await page.getByText('Open in feed').click();
  await wait(600);
  assert(/From link/.test(await pathLabel()), 'link path not started');
});

await check('library: saved, history timeline', async () => {
  await tab('Library').click();
  await page.locator('.tile').first().waitFor();
  await shot('12-library-saved');
  await page.getByRole('tab', { name: 'History' }).click();
  await page.locator('.timeline__item').first().waitFor();
  await shot('13-history');
});

await check('profile: seed a demo taste → insights, clusters, AI path ideas', async () => {
  await tab('You').click();
  await page.getByRole('button', { name: /Seed a demo taste/ }).click();
  await wait(600);
  await page.getByText('What this profile has learned').scrollIntoViewIfNeeded();
  await page.locator('.weight-row').first().waitFor();
  await shot('14-insights');
  await page.locator('.clusters li').first().waitFor({ timeout: 3000 });
});

await check('library: AI-suggested boards appear from saves', async () => {
  await tab('Library').click();
  await page.getByRole('tab', { name: 'Boards' }).click();
  await page.getByText('Suggested boards').waitFor({ timeout: 3000 });
  await shot('15-board-suggestions');
  await page.getByRole('button', { name: 'Create' }).first().click();
  await page.locator('.board-card').first().waitFor();
});

await check('deep filters sheet applies to a path', async () => {
  await tab('Feed').click();
  await page.getByRole('button', { name: 'Filters' }).click();
  await page.getByText('Deep filters').waitFor();
  await page.locator('.tagcat').first().locator('.chip').first().click();
  await shot('16-filters');
  await page.getByRole('button', { name: /^Apply/ }).click();
  await wait(400);
  assert((await page.locator('.pathbar .badge').count()) === 1, 'filter badge missing');
});

await check('state persists across reload (IndexedDB)', async () => {
  const label = await pathLabel();
  const id = await activeId();
  await wait(900);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.card--active canvas').first().waitFor();
  assert((await pathLabel()) === label, 'path not restored');
  assert((await activeId()) === id, 'position not restored');
});

await check('paths dock shows an AI path idea after enough signals', async () => {
  await page.locator('.pathbar__chip').click();
  await page.getByText('AI path ideas').waitFor({ timeout: 3000 });
  await shot('17-ai-path-ideas');
  await page.keyboard.press('Escape');
});

async function setRange(label, value) {
  const input = page.locator('label.frow--slider', { hasText: label }).locator('input[type=range]');
  await input.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

await check('error states: search fails gracefully, then recovers on retry', async () => {
  await tab('You').click();
  await page.getByText('Mock data layer').scrollIntoViewIfNeeded();
  await setRange('Error rate', 100);
  await tab('Search').click();
  await searchInput().fill('neon dance');
  await page.getByText('Something didn’t load').waitFor({ timeout: 4000 });
  await shot('18-error-state');
  await tab('You').click();
  await page.getByText('Mock data layer').scrollIntoViewIfNeeded();
  await setRange('Error rate', 0);
  await tab('Search').click();
  // Returning to Search re-runs the query; Retry is only needed if it hasn't yet.
  const retry = page.getByRole('button', { name: 'Try again' });
  if (await retry.isVisible().catch(() => false)) await retry.click();
  await page.locator('.tile').first().waitFor({ timeout: 4000 });
});

await check('error states: a failing path shows Retry in the feed instead of hanging', async () => {
  await tab('You').click();
  await page.getByText('Mock data layer').scrollIntoViewIfNeeded();
  await setRange('Error rate', 100);
  await tab('Search').click();
  await searchInput().fill('');
  await page.locator('.chip', { hasText: '#Sauna' }).first().click();
  await page.getByText(/Couldn’t load (more|this clip)/).first().waitFor({ timeout: 5000 });
  await shot('19-feed-error');
  await tab('You').click();
  await page.getByText('Mock data layer').scrollIntoViewIfNeeded();
  await setRange('Error rate', 0);
  await tab('Feed').click();
  await page.getByRole('button', { name: 'Retry' }).first().click();
  await page.locator('.card--active canvas').first().waitFor({ timeout: 5000 });
});

await check('iPad landscape keeps the overlay in a readable column', async () => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await wait(500);
  const box = await page.locator('.card--active .card__overlay').boundingBox();
  assert(box && box.width <= 562, `overlay too wide: ${box?.width}`);
  await shot('20-ipad-landscape');
  await page.setViewportSize({ width: W, height: H });
});

await check('long-press menu from the Library acts on that clip, not the hidden feed', async () => {
  await tab('Feed').click();
  await wait(400);
  const before = await activeId();
  await tab('Library').click();
  await page.getByRole('tab', { name: 'Saved' }).click();
  const tile = page.locator('.tile').first();
  await tile.waitFor();
  await tile.click({ button: 'right' }); // contextmenu = long-press on desktop
  await page.getByText('Note & custom tags').waitFor().catch(() => undefined);
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Boards' }).click();
  await page.locator('.board-card').first().click();
  await page.locator('.sheet .tile').first().click({ button: 'right' });
  await page.locator('.menu__quick .quick--like').click();
  await wait(500);
  await tab('Feed').click();
  await wait(400);
  assert((await activeId()) === before, 'feed moved after a like from the Library');
});

await check('system back closes the open sheet instead of leaving the app', async () => {
  await page.locator('.pathbar__chip').click();
  await page.getByText('Smart Paths').waitFor();
  await page.goBack();
  await wait(400);
  assert((await page.getByText('Smart Paths').count()) === 0, 'sheet still open');
  assert(page.url().startsWith(base.replace(/\/$/, '')), `left the app: ${page.url()}`);
  assert((await page.locator('.tabbar').count()) === 1, 'app not visible');
});

await check('an unhurried double-tap (130ms presses, 150ms gap) likes without pausing', async () => {
  // Release-to-release is ~280ms: the old 260ms window missed this; the gap that matters is 150ms.
  const id = await activeId();
  const x = W * 0.45;
  const y = H * 0.4;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await wait(130);
  await page.mouse.up();
  await wait(150);
  await page.mouse.down();
  await wait(130);
  await page.mouse.up();
  await wait(700);
  assert((await page.locator('.paused-badge').count()) === 0, 'double-tap paused the clip');
  const s = await state();
  assert(s.data[s.activeProfileId].signals.some((x) => x.kind === 'like' && x.videoId === id), 'no like recorded');
});

await check('release-year box accepts typing digit by digit', async () => {
  await page.getByRole('button', { name: 'Filters' }).click();
  const yearMin = page.getByLabel('Release year minimum');
  await yearMin.scrollIntoViewIfNeeded();
  await yearMin.click();
  await page.keyboard.type('2019');
  assert((await yearMin.inputValue()) === '2019', `typed value became ${await yearMin.inputValue()}`);
  await page.keyboard.press('Tab');
  assert((await yearMin.inputValue()) === '2019', 'value changed on blur');
  await page.keyboard.press('Escape');
});

// ---------------------------------------------------------------------------
// Personal Import

const fixtures = await installImportFixtures(page);
expected.push(/locked\.test/, /img\.example\.test\/clip\.mp4/);
const importSheet = () => page.locator('.import-sheet');
const rowByTitle = (t) => page.locator('.ipreview__row', { has: page.locator('.ipreview__title', { hasText: t }) });
// No file extension, no page-like path: worth trying as a picture before calling it a page.
const BEACH_03 = 'https://img.example.test/i/beach-03';
const rowByThumb = (src) => page.locator('.ipreview__row', { has: page.locator(`.ipreview__thumb img[src="${src}"]`) });
const IMPORT_TEXT = [
  GALLERY_URL,
  LOCKED_URL,
  'Beach day | https://img.example.test/beach-01.png',
  'https://img.example.test/beach-02.png?utm_source=newsletter',
  'https://img.example.test/beach-02.png',
  'https://img.example.test/clip.mp4',
  BEACH_03,
].join('\n');
let exported = null;

await check('import: paste gallery + direct links → live preview with type badges and dedupe', async () => {
  await page.keyboard.press('Escape');
  await tab('Library').click();
  await page.getByRole('button', { name: 'Import media' }).click();
  await importSheet().waitFor();
  await page.getByLabel('Links to import').fill(IMPORT_TEXT);
  await rowByTitle('Beach day').waitFor({ timeout: 3000 });
  // A direct image previews as the picture itself.
  const beach = rowByTitle('Beach day').locator('.ipreview__thumb img');
  await beach.waitFor();
  assert((await beach.getAttribute('src')) === 'https://img.example.test/beach-01.png', 'direct image not previewed with <img>');
  // The extension-less link loads as a picture, so it's relabelled Image — no page read involved.
  await rowByThumb(BEACH_03).locator('.ibadge--image', { hasText: 'Image' }).waitFor({ timeout: 4000 });
  const summary = await page.locator('.ipreview__summary').textContent();
  assert(/1 duplicate merged/.test(summary), `summary: ${summary}`);
  const pages = page.locator('.ipreview__row .ibadge--page');
  assert((await pages.count()) === 2, `expected 2 page rows, got ${await pages.count()}`);
  assert((await pages.allTextContents()).every((t) => t === 'Gallery page'), 'pages not labelled “Gallery page”');
  assert((await page.locator('.ipreview__row .ibadge--video').count()) === 1, 'expected 1 video row');
  assert(/Find media in 2 pages/.test(await page.locator('.import-foot .btn--primary').textContent()), 'primary should offer to scan');
  // Mixed paste: the direct links can go without reading the pages at all.
  await page.getByRole('button', { name: /Skip the pages · import the 4 direct links only/ }).waitFor();
  assert((await page.locator('.direct-tip summary').textContent()) === 'I have direct links', 'direct-links tip missing');
  await shot('40-import-preview');
});

await check('import: “Find media” scans the CORS-enabled gallery; the refusing page fails honestly', async () => {
  await page.keyboard.press('Control+Enter');
  await rowByTitle('Golden hour').waitFor({ timeout: 6000 });
  await rowByTitle('Boardwalk lights').waitFor();
  await rowByTitle('Lamp posts').waitFor();
  const locked = rowByTitle('locked.test');
  assert(/Couldn’t read/.test(await locked.textContent()), 'locked page not flagged');
  assert((await locked.locator('.ibadge--page').textContent()) === 'Gallery page', 'locked row not labelled');
  const msg = await locked.locator('.ipage--failed .ipage__msg').textContent();
  assert(
    msg === 'Could not read images from this page (site blocked access). Open the page, copy direct image links, and paste those instead.',
    `failure message: ${msg}`,
  );
  const open = locked.getByRole('link', { name: 'Open page locked.test' });
  assert((await open.getAttribute('href')) === LOCKED_URL && (await open.getAttribute('target')) === '_blank', 'Open page link wrong');
  assert(!(await locked.locator('input[type=checkbox]').isChecked()), 'a page that gave nothing should start unticked');
  assert(await page.locator('.scanfail').isVisible(), 'no CORS explanation');
  assert((await page.locator('.direct-tip').getAttribute('open')) !== null, 'tip should open when a page fails');
  // The gallery row says what it found.
  assert(/\d+ items found — listed below/.test(await page.locator('.ipage__msg').first().textContent()), 'gallery row has no result line');
  // Keep it anyway, as an open-original bookmark.
  await locked.locator('input[type=checkbox]').check();
  const summary = await page.locator('.ipreview__summary').textContent();
  assert(/icons\/ads skipped/.test(summary), `junk not skipped: ${summary}`);
  assert((await page.locator('.ipreview__title', { hasText: /logo|pixel/i }).count()) === 0, 'logo or pixel leaked in');
  await shot('41-import-scanned');
});

await check('import: select + Delete excludes rows; a checkbox excludes one', async () => {
  const before = Number((await page.locator('.ipreview__all span').textContent()).match(/^(\d+)/)[1]);
  await rowByTitle('Gulls over the water').click();
  await rowByTitle('Lamp posts').click({ modifiers: ['Control'] });
  await page.keyboard.press('Delete');
  await rowByTitle('Clip').locator('input[type=checkbox]').uncheck();
  const after = Number((await page.locator('.ipreview__all span').textContent()).match(/^(\d+)/)[1]);
  assert(after === before - 3, `included ${before} → ${after}`);
  assert(await rowByTitle('Gulls over the water').evaluate((el) => el.classList.contains('ipreview__row--out')), 'row not marked excluded');
});

await check('import: ⌘E bulk editor before import — prefix, undo/redo, ⌘S saves', async () => {
  await page.keyboard.press('Control+e');
  const first = page.getByLabel('Title 1', { exact: true });
  await first.waitFor();
  const original = await first.inputValue();
  await page.getByLabel('Prefix text').fill('Pier · ');
  await page.getByRole('button', { name: /^Apply/ }).click();
  assert((await first.inputValue()) === `Pier · ${original}`, 'prefix not applied');
  await page.keyboard.press('Control+z');
  assert((await first.inputValue()) === original, 'undo failed');
  await page.keyboard.press('Control+Shift+z');
  assert((await first.inputValue()) === `Pier · ${original}`, 'redo failed');
  await shot('42-bulk-editor');
  await page.keyboard.press('Control+s');
  await page.locator('.toast', { hasText: /Saved \d+ titles/ }).waitFor({ timeout: 2000 });
  await rowByTitle('Pier · Golden hour').waitFor();
});

await check('import: tags + name → Import creates the batch, its board, and the Imported path', async () => {
  await page.getByLabel('Tags for this import').fill('pier, golden hour');
  await page.getByLabel('Import name').fill('Pier at sunset');
  await page.keyboard.press('Control+Enter');
  await page.locator('.sheet__head h2', { hasText: /Imported \d+ clips/ }).waitFor({ timeout: 3000 });
  await shot('43-imported');
  await wait(700);
  const s = await state();
  const d = s.data[s.activeProfileId];
  const batch = d.imports.batches[0];
  assert(batch && batch.name === 'Pier at sunset', 'batch missing');
  const items = batch.itemIds.map((id) => d.imports.items[id]);
  assert(items.length === 8, `expected 8 items, got ${items.length}`);
  assert(items.every((i) => i.tags.includes('pier') && i.tags.includes('golden hour')), 'batch tags not applied');
  assert(items.some((i) => i.title === 'Pier · Golden hour'), 'edited title lost');
  assert(items.some((i) => i.mediaType === 'page' && i.url === LOCKED_URL), 'ticked failed page not imported as open-original');
  assert(items.some((i) => i.mediaType === 'image' && i.url === BEACH_03), 'probed link not imported as an image');
  const board = d.boards.find((b) => b.id === batch.boardId);
  assert(board && board.name === 'Pier at sunset' && board.videoIds.length === 8, 'board missing');
  assert(d.paths.some((p) => p.id === 'imported' && p.pinned), 'Imported path missing');
});

await check('import: bulk edit titles after import (Title Case on a selection) updates the library', async () => {
  await page.getByRole('button', { name: /Edit titles/ }).click();
  await page.getByLabel('Title 1', { exact: true }).waitFor();
  // Select “Golden hour” and the row after it, wherever they landed.
  const fields = await page
    .locator('input[aria-label^="Title "]')
    .evaluateAll((els) => els.map((e) => [e.getAttribute('aria-label'), e.value]).filter(([l]) => /^Title \d+$/.test(l)));
  const at = fields.findIndex(([, v]) => v === 'Pier · Golden hour');
  assert(at >= 0 && at + 1 < fields.length, `Golden hour row not found: ${fields.map(([, v]) => v).join(' | ')}`);
  await page.getByLabel(fields[at][0], { exact: true }).focus();
  await page.keyboard.press('Shift+ArrowDown');
  await page.getByText('Title Case', { exact: true }).click();
  await page.getByRole('button', { name: 'Save titles' }).click();
  await wait(600);
  const s = await state();
  const d = s.data[s.activeProfileId];
  const titles = d.imports.batches[0].itemIds.map((id) => d.imports.items[id].title);
  // Two rows were selected: only they change.
  assert(titles.includes('Pier · Golden Hour') && titles.includes('Pier · Pier at Sunset – #1'), `selection not title-cased: ${titles.join(' | ')}`);
  assert(titles.includes('Pier · Beach day') && titles.includes('Pier · Pier at sunset – #2'), `rows outside the selection changed: ${titles.join(' | ')}`);
});

await check('import: ⌘⇧E exports the batch as re-importable JSON, plus a URL list', async () => {
  const dl = page.waitForEvent('download');
  await page.keyboard.press('Control+Shift+E');
  const file = await dl;
  assert(/^import-pier-at-sunset-\d{4}-\d{2}-\d{2}\.json$/.test(file.suggestedFilename()), `filename ${file.suggestedFilename()}`);
  const path = `${shots}/export.json`;
  await file.saveAs(path);
  exported = path;
  const json = JSON.parse(await readFile(path, 'utf8'));
  assert(json.app === 'ph-discovery-import' && json.version === 1, 'wrong export header');
  assert(json.items.length === 8 && json.items.every((i) => i.url && i.title && i.mediaType && i.originalUrl && i.added && Array.isArray(i.tags)), 'export items incomplete');
  const dl2 = page.waitForEvent('download');
  await page.getByRole('button', { name: 'URL list' }).click();
  const list = await readFile(await (await dl2).path(), 'utf8');
  assert(list.trim().split('\n').length === 8, 'URL list wrong length');
});

await check('import: Swipe imported now → stills full-screen; like and save work on them', async () => {
  await page.getByRole('button', { name: /Swipe imported now/ }).click();
  await page.locator('.card--active').waitFor();
  assert(/Pier at sunset/.test(await pathLabel()), `path label ${await pathLabel()}`);
  // First item: the page that couldn't be read — a "Gallery page" card with the way out, still swipeable.
  const card = page.locator('.card--active .player-fallback__card', { hasText: 'Gallery page' });
  await card.waitFor({ timeout: 3000 });
  assert(/Could not read images from locked\.test/.test(await card.textContent()), 'page card has no explanation');
  assert((await card.getByRole('link', { name: /Open page/ }).getAttribute('href')) === LOCKED_URL, 'page card has no Open page link');
  await card.getByRole('button', { name: 'Paste links' }).waitFor();
  await shot('44-gallery-page-card');
  await wait(400); // let input acks catch up after the screenshot (see below)
  await drag(W * 0.3, H * 0.25, W * 0.5, 8); // start above the card: it's a no-gesture zone
  await page.locator('.card--active .player-image img').waitFor({ timeout: 3000 });
  await wait(900);
  await shot('44b-import-still');
  // Playwright sends each mouse move only after the page acks the last; a screenshot stalls
  // those acks, so a swipe sent straight after one can outlast the long-press timer.
  await wait(400);
  const stillId = await activeId();
  assert(stillId.startsWith('imp-'), 'not an imported clip');
  await drag(W * 0.5, H * 0.55, 0, -H * 0.3);
  await page.locator('.toast', { hasText: /^Saved/ }).waitFor({ timeout: 2000 });
  await wait(700);
  const s = await state();
  const d = s.data[s.activeProfileId];
  assert(d.signals.some((x) => x.kind === 'like' && x.videoId.startsWith('imp-')), 'no like on an import');
  assert(d.saves.some((x) => x.videoId === stillId), 'save on the still not recorded');
});

await check('import: tap on a still toggles fit/fill without pausing', async () => {
  const before = await page.locator('.card--active .player-image').getAttribute('class');
  await page.mouse.click(W * 0.4, H * 0.3);
  await wait(450);
  const after = await page.locator('.card--active .player-image').getAttribute('class');
  assert(before !== after && /player-image--(contain|cover)/.test(after), `fit did not toggle (${before} → ${after})`);
  assert((await page.locator('.paused-badge').count()) === 0, 'tap paused a still');
});

await check('import: a gallery read earlier this session comes back instantly, with no new request', async () => {
  const before = fixtures.hits.gallery;
  assert(before === 1, `gallery fetched ${before} times`);
  await tab('Library').click();
  await page.getByRole('button', { name: 'Import media' }).click();
  await page.getByLabel('Links to import').fill(GALLERY_URL);
  await page.locator('.ipage__msg', { hasText: /items found · read earlier this session/ }).waitFor({ timeout: 2000 });
  await rowByTitle('Golden hour').waitFor();
  assert((await page.locator('.ipreview__row .ibadge--in-library').count()) > 0, 'cached rows not matched to the library');
  assert(fixtures.hits.gallery === before, 'cache hit still fetched the page');
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.keyboard.press('Escape');
});

await check('import: board, history, and imports persist across reload', async () => {
  await page.reload({ waitUntil: 'networkidle' });
  await tab('Library').click();
  await page.getByRole('tab', { name: 'Imports' }).click();
  await page.locator('.batch-list__name', { hasText: 'Pier at sunset' }).waitFor({ timeout: 4000 });
  await shot('45-import-history');
  await page.getByRole('tab', { name: 'Boards' }).click();
  await page.locator('.board-card', { hasText: 'Pier at sunset' }).waitFor();
  await page.getByRole('tab', { name: 'Smart' }).click();
  await page.getByText('⇪ Imports').waitFor();
});

await check('import: re-importing the exported file is recognised as already in the library', async () => {
  await page.getByRole('tab', { name: 'Imports' }).click();
  await page.getByRole('button', { name: 'New import' }).click();
  await page.locator('.import-sheet input[type=file]').setInputFiles(exported);
  await page.locator('.ipreview__row').first().waitFor({ timeout: 3000 });
  const n = await page.locator('.ipreview__row').count();
  const dupes = await page.locator('.ipreview__row .ibadge--in-library').count();
  assert(n === 8 && dupes === 8, `rows ${n}, already-imported ${dupes}`);
  assert(await page.locator('.import-foot .btn--primary').isDisabled(), 'import should be disabled');
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.keyboard.press('Escape');
});

await check('import: edit details from the library (title, personal tags, notes)', async () => {
  const tile = page.locator('.library .tile').first();
  await tile.click({ button: 'right' });
  await page.getByLabel('Title', { exact: true }).fill('Renamed from the library');
  await page.getByLabel('Add tags').fill('keeper');
  await page.getByLabel('Add tags').press('Enter');
  await page.getByPlaceholder('Anything you want to remember').fill('the good light');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await wait(600);
  const s = await state();
  const items = Object.values(s.data[s.activeProfileId].imports.items);
  const it = items.find((i) => i.title === 'Renamed from the library');
  assert(it && it.tags.includes('keeper') && it.notes === 'the good light', 'metadata not saved');
});

await check('import: incognito warns that an import won’t persist', async () => {
  await tab('You').click();
  await page.getByText('Incognito session').click();
  await tab('Library').click();
  await page.getByRole('button', { name: 'Import media' }).click();
  await page.locator('.notice--warn', { hasText: /Incognito is on/ }).waitFor({ timeout: 2000 });
  await page.keyboard.press('Escape');
  await tab('You').click();
  await page.getByText('Incognito session').click();
});

// ---------------------------------------------------------------------------
// Bookmarklet: galleries the app isn't allowed to read

let bookmarklet = '';
let gallery = null;
let panel = null;
let appTab = null;
const watch = (p) => p.on('pageerror', (e) => problems.push(`pageerror (${p.url()}): ${e.message}`));
const runBookmarklet = (p) => p.evaluate((href) => (0, eval)(decodeURIComponent(href.slice('javascript:'.length))), bookmarklet);

await check('bookmarklet: Import offers it, built to open this app', async () => {
  await tab('Library').click();
  await page.getByRole('button', { name: 'Import media' }).click();
  const tip = page.locator('.bookmarklet-tip');
  await tip.locator('summary', { hasText: 'Page blocked? Use the bookmarklet' }).click();
  const link = tip.locator('a.bookmarklet-link');
  await link.waitFor();
  bookmarklet = (await link.getAttribute('href')) ?? '';
  assert(bookmarklet.startsWith('javascript:'), 'not a javascript: link');
  assert(decodeURIComponent(bookmarklet).includes(JSON.stringify(base)), 'bookmarklet does not open this app');
  await link.scrollIntoViewIfNeeded();
  await wait(300);
  await shot('46-bookmarklet-tip');
  await page.keyboard.press('Escape');
});

await check('bookmarklet: on a page the app can’t read, it sends the gallery as rendered to the open app tab', async () => {
  gallery = await ctx.newPage();
  watch(gallery);
  await installImportFixtures(gallery);
  await gallery.goto(LOCKED_URL);
  await gallery.locator('main img').nth(3).waitFor();
  await runBookmarklet(gallery);
  panel = gallery.getByRole('dialog', { name: 'Send to PH Discovery' });
  await panel.waitFor();
  assert(/About 4 pictures on locked\.test\./.test(await panel.textContent()), `panel: ${await panel.textContent()}`);
  await gallery.screenshot({ path: `${shots}/47-bookmarklet-panel.png` });
  const opened = ctx.waitForEvent('page', { timeout: 8000 });
  opened.catch(() => undefined); // awaited below; don't let a failed click leave it unhandled
  await panel.getByRole('button', { name: 'Open in PH Discovery' }).click();
  appTab = await opened;
  watch(appTab);
  // The app is already open in the first tab, so the new tab passes the page there and says so.
  await appTab.getByRole('heading', { name: 'Sent to your other PH Discovery tab' }).waitFor({ timeout: 8000 });
  await panel.getByText('Sent. Review it in PH Discovery before you import.').waitFor({ timeout: 4000 });
  await page.locator('.import-sheet .chips', { hasText: 'Page · locked.test' }).waitFor({ timeout: 4000 });
  for (const n of [1, 2, 3, 4]) await rowByTitle(`Dune ${n}`).waitFor();
  assert((await page.locator('.ipreview__row').count()) === 4, `rows: ${await page.locator('.ipreview__row').count()}`);
  const thumb = await rowByTitle('Dune 1').locator('.ipreview__thumb img').getAttribute('src');
  assert(thumb === 'https://cdn.locked.test/thumb/1.png', `preview ${thumb}`);
  assert(/Import 4/.test(await page.locator('.import-foot .btn--primary').textContent()), 'nothing should import until you press Import');
  await shot('48-bookmarklet-import');
  await appTab.screenshot({ path: `${shots}/49-sent-to-other-tab.png` });
});

await check('one live tab: “Use it here” moves the app over, and back, without losing anything', async () => {
  const before = await state();
  await appTab.getByRole('button', { name: 'Use it here instead' }).click();
  await page.getByRole('heading', { name: 'PH Discovery moved to another tab' }).waitFor({ timeout: 4000 });
  await appTab.locator('.tabbar').waitFor({ timeout: 6000 });
  await appTab.close();
  await page.getByRole('button', { name: 'Use it here' }).click();
  await page.locator('.tabbar').waitFor({ timeout: 6000 });
  const after = await state();
  assert(after.activeProfileId === before.activeProfileId, 'profile changed');
  const items = (s) => Object.keys(s.data[s.activeProfileId].imports.items).length;
  assert(items(after) === items(before) && items(after) > 0, `imports ${items(before)} → ${items(after)}`);
});

await check('bookmarklet: Copy, then Paste from clipboard, reads the same page', async () => {
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  if (await page.locator('.import-sheet').isVisible()) await page.getByRole('button', { name: 'Clear' }).click();
  else {
    await tab('Library').click();
    await page.getByRole('button', { name: 'Import media' }).click();
  }
  await panel.getByRole('button', { name: 'Copy for PH Discovery' }).click();
  await panel.getByText(/^Copied\./).waitFor({ timeout: 3000 });
  await page.getByRole('button', { name: 'Paste from clipboard' }).click();
  await page.locator('.import-sheet .chips', { hasText: 'Page · locked.test' }).waitFor({ timeout: 4000 });
  await rowByTitle('Dune 4').waitFor();
  assert((await page.getByLabel('Links to import').inputValue()) === '', 'the page landed in the text box instead of as a page');
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.keyboard.press('Escape');
});

await check('bookmarklet: with no app tab open, the new tab opens Import on the page itself', async () => {
  await page.close();
  const opened = ctx.waitForEvent('page', { timeout: 8000 });
  opened.catch(() => undefined);
  await panel.getByRole('button', { name: 'Open in PH Discovery' }).click();
  const fresh = await opened;
  watch(fresh);
  await fresh.locator('.import-sheet .chips', { hasText: 'Page · locked.test' }).waitFor({ timeout: 8000 });
  await fresh.locator('.ipreview__title', { hasText: 'Dune 3' }).waitFor();
  assert(!/phd-handoff/.test(fresh.url()), `handoff marker left in the address: ${fresh.url()}`);
});

console.log(results.join('\n'));
if (problems.length) console.log('\nBrowser problems:\n' + [...new Set(problems)].join('\n'));
await browser.close();
process.exit(results.some((r) => r.startsWith('✗')) || problems.length ? 1 : 0);
