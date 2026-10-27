// End-to-end smoke test at iPhone 14 size against a running preview server.
//   npm run build && npx vite preview --port 4173 &
//   node scripts/e2e.mjs [baseUrl] [screenshotDir]
// Drives real pointer/touch gestures and checks the app's state after each step.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:4173/';
const shots = process.argv[3] ?? 'e2e-shots';
await mkdir(shots, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'] });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));

let step = 0;
const results = [];
async function check(name, fn) {
  step++;
  try {
    await fn();
    results.push(`✓ ${step}. ${name}`);
  } catch (e) {
    results.push(`✗ ${step}. ${name}: ${e.message.split('\n')[0]}`);
    await page.screenshot({ path: `${shots}/fail-${step}.png` });
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

console.log(results.join('\n'));
if (problems.length) console.log('\nBrowser problems:\n' + [...new Set(problems)].join('\n'));
await browser.close();
process.exit(results.some((r) => r.startsWith('✗')) || problems.length ? 1 : 0);
