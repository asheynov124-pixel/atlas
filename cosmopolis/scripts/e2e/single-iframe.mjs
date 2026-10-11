#!/usr/bin/env node
/**
 * Boots the single-file build (dist-single/index.html) served by a tiny static server — as a plain page AND inside
 * sandboxed iframes (sandbox="allow-scripts" → opaque origin, so localStorage / IndexedDB / service workers all
 * throw; and sandbox="allow-scripts allow-same-origin") — then plays a short sandbox session through the real UI in
 * each: main menu → Sandbox → Instant City → More › Saved Cities › create a save (memory fallback when storage is
 * blocked) → export it → photo mode → take a photo → Save.
 * The "opaque" mode also stands in for the claude.ai artifact viewer: a fake `window.claude` runtime (use() →
 * downloads.save) is installed in the frame, so file offers must arrive there (.json city envelope, .png photo) while
 * the tap's user activation is still live — and the exported envelope is imported back. In "plain" mode the same
 * offers must produce browser downloads (.cosmo, .png).
 * Fails on any console error, page error, failed local request (404 …), a network request that leaves the local
 * server, or a service worker registration.
 *
 *   npm run build:single && node scripts/e2e/single-iframe.mjs [--out dir] [--modes plain,opaque,same-origin]
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const modes = opt('modes', 'plain,opaque,same-origin').split(',').filter(Boolean);
const outDir = path.resolve(opt('out', path.join(root, '.shots/single')));
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(root, 'dist-single/index.html');
if (!fs.existsSync(file)) {
  console.error('dist-single/index.html missing — run `npm run build:single` first');
  process.exit(2);
}

const SANDBOX = { opaque: 'allow-scripts allow-pointer-lock allow-popups', 'same-origin': 'allow-scripts allow-same-origin allow-pointer-lock allow-popups' };
const host = (sandbox) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="icon" href="data:,">
<style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%;display:block}</style></head>
<body><iframe id="app" sandbox="${sandbox}" allow="autoplay; fullscreen" src="/index.html"></iframe></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const m = /^\/host-(opaque|same-origin)\.html$/.exec(url.pathname);
  if (m) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(host(SANDBOX[m[1]]));
  }
  if (url.pathname === '/index.html' || url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return fs.createReadStream(file).pipe(res);
  }
  res.writeHead(404);
  res.end('not found');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'] });

/** Fake claude.ai artifact runtime (downloads capability) for the iframe. */
const FAKE_RUNTIME = () => {
  if (window === window.top) return;
  const ok = ['gif', 'png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'txt', 'json', 'md', 'docx', 'pptx', 'epub', 'csv', 'ttf', 'html', 'svg', 'pdf', 'xlsx', 'zip'];
  window.__saved = [];
  const downloads = {
    async save(req) {
      const active = navigator.userActivation ? navigator.userActivation.isActive : null;
      const { filename, data } = req ?? {};
      if (typeof filename !== 'string' || !(data instanceof Blob)) throw { code: 'bad_request' };
      const ext = filename.split('.').pop().toLowerCase();
      if (!ok.includes(ext)) throw { code: 'rejected_extension' };
      const text = ext === 'json' ? await data.text() : null;
      window.__saved.push({ filename, size: data.size, type: data.type, active, text });
      return { status: 'saved' };
    },
  };
  window.claude = { use: (name) => Promise.resolve(name === 'downloads' ? downloads : null) };
};

async function run(mode) {
  // The opaque-origin frame runs out of process; Chromium's mobile emulation (DPR 2 + touch) is not applied to it
  // consistently, so taps land at mis-scaled points there. That mode uses a phone-sized DPR-1 mouse context instead
  // (layout is width-driven, so the UI is the same); plain / same-origin keep full iPhone touch emulation.
  const touch = mode !== 'opaque';
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: touch ? 2 : 1,
    isMobile: touch,
    hasTouch: touch,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  const artifact = mode === 'opaque';
  if (artifact) await context.addInitScript(FAKE_RUNTIME);
  const page = await context.newPage();
  const errors = [];
  const external = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[console.error] ${m.text()}${m.location()?.url ? ` (${m.location().url.slice(0, 120)})` : ''}`);
    else if (m.type() === 'warning') console.log(`  [warn] ${m.text().slice(0, 160)}`);
  });
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('about:')) external.push(u);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  /**
   * Tap once the element is at rest AND is what a finger would hit at its centre (the dock and toasts slide in
   * while SwiftShader is still busy; a tap during the entrance lands on the canvas). Reports the covering element.
   */
  const tapWhenHittable = async (frame, loc, what, timeout = 45000) => {
    await loc.waitFor({ state: 'visible', timeout });
    const t0 = Date.now();
    let prev = null;
    let last = '';
    while (Date.now() - t0 < timeout) {
      const r = await loc.evaluate((el) => {
        const b = el.getBoundingClientRect();
        const x = b.left + b.width / 2, y = b.top + b.height / 2;
        const top = document.elementFromPoint(x, y);
        const cls = top ? (typeof top.className === 'string' ? top.className : top.className?.baseVal ?? '') : '';
        return { ok: !!top && (top === el || el.contains(top)), x, y, top: top ? `${top.tagName.toLowerCase()}.${cls.split(' ').join('.')}` : 'nothing' };
      });
      if (r.ok && prev && Math.abs(prev.x - r.x) < 0.5 && Math.abs(prev.y - r.y) < 0.5) {
        if (touch) await loc.tap({ timeout });
        else await loc.click({ timeout });
        return;
      }
      if (!r.ok) last = r.top;
      prev = r;
      await page.waitForTimeout(250);
    }
    throw new Error(`${what} never became tappable (covered by ${last || 'moving'})`);
  };
  let n = 0;
  const shot = async (name) => {
    const f = path.join(outDir, `single-${mode}-${String(n++).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: f });
    console.log('  screenshot:', f);
  };
  console.log(`\n── ${mode}`);
  try {
    const t0 = Date.now();
    await page.goto(mode === 'plain' ? base + '/index.html' : `${base}/host-${mode}.html`, { waitUntil: 'load', timeout: 120000 });
    const frame = mode === 'plain' ? page.mainFrame() : await (await page.waitForSelector('#app')).contentFrame();
    await frame.waitForFunction(() => window.__cosmo && window.__cosmo.ready === true, null, { timeout: 180000, polling: 250 });
    console.log(`  booted in ${Date.now() - t0} ms`);
    const env = await frame.evaluate(async () => {
      const probe = async (f) => {
        try {
          const v = await f();
          return v === undefined ? 'ok' : v;
        } catch (e) {
          return 'throws ' + (e && e.name);
        }
      };
      return {
        origin: location.origin,
        localStorage: await probe(() => localStorage.getItem('x') ?? 'ok'),
        indexedDB: await probe(() => (indexedDB.open('probe'), 'ok')),
        serviceWorkers: await probe(async () => ('serviceWorker' in navigator ? `${(await navigator.serviceWorker.getRegistrations()).length} registered` : 'n/a')),
      };
    });
    console.log('  environment:', JSON.stringify(env));
    if (/^[1-9]/.test(String(env.serviceWorkers))) throw new Error('a service worker was registered in single-file mode');
    const press = (loc) => (touch ? loc.tap({ timeout: 45000 }) : loc.click({ timeout: 45000 }));
    await press(frame.locator('.mm-mode', { hasText: 'Sandbox' }).first());
    await frame.waitForSelector('.ng-modal', { timeout: 30000 });
    await press(frame.getByRole('radio', { name: 'Instant City' }).first());
    await press(frame.getByRole('button', { name: 'Launch' }).first());
    await frame.waitForFunction(() => window.__cosmo.debugInfo().screen === 'game' && (window.__cosmo.game.planet?.buildings.size ?? 0) > 20, null, { timeout: 240000, polling: 500 });
    await page.waitForTimeout(4000);
    await shot('instant-city');
    // save through More › Saved Cities: must succeed (session-memory fallback when storage is blocked)
    await tapWhenHittable(frame, frame.getByRole('button', { name: 'More', exact: true }).first(), 'More');
    await frame.waitForSelector('.mo-sheet .mo-tile', { timeout: 20000 });
    await tapWhenHittable(frame, frame.locator('.mo-tile', { hasText: 'Saved Cities' }).first(), 'Saved Cities');
    await frame.waitForSelector('.up-saves', { timeout: 20000 });
    await page.waitForTimeout(800);
    await frame.locator('.up-save-new input').fill('Single E2E');
    await tapWhenHittable(frame, frame.getByRole('button', { name: 'Create save' }).first(), 'Create save');
    await frame.waitForFunction(() => [...document.querySelectorAll('.up-save-main')].some((b) => (b.getAttribute('aria-label') ?? '').includes('Single E2E')), null, { timeout: 30000, polling: 250 });
    await page.waitForTimeout(1200);
    await shot('saved');
    // export the save: artifact → downloads capability (.json envelope); plain → a browser download (.cosmo)
    if (artifact || mode === 'plain') {
      const exportBtn = frame.locator('button[aria-label="Export Single E2E"]').first();
      if (artifact) {
        await tapWhenHittable(frame, exportBtn, 'Export');
        try {
          await frame.waitForFunction(() => window.__saved.some((x) => x.filename.endsWith('.json')), null, { timeout: 60000, polling: 250 });
        } catch (e) {
          const why = await frame.evaluate(() => ({
            runtime: typeof window.claude,
            saved: (window.__saved ?? []).map((x) => x.filename),
            panel: !!document.querySelector('.up-saves'),
            toasts: [...document.querySelectorAll('.cz-toast')].map((t) => t.textContent.trim().slice(0, 80)),
          }));
          throw new Error('export never reached the downloads capability: ' + JSON.stringify(why));
        }
        const got = await frame.evaluate(() => window.__saved.find((x) => x.filename.endsWith('.json')));
        const fmt = JSON.parse(got.text).format;
        console.log(`  exported ${got.filename} (${got.size} B, ${fmt}, user activation ${got.active})`);
        if (fmt !== 'cosmopolis-save') throw new Error('export is not a cosmopolis-save envelope');
        if (got.active === false) throw new Error('downloads.save was called after the tap’s user activation expired');
        // and back in through Import
        await frame.locator('.up-saves input[type="file"]').setInputFiles({ name: got.filename, mimeType: 'application/json', buffer: Buffer.from(got.text) });
        await frame.waitForFunction(() => [...document.querySelectorAll('.up-save-main')].filter((b) => (b.getAttribute('aria-label') ?? '').includes('Single E2E')).length >= 2, null, { timeout: 30000, polling: 250 });
        console.log('  imported the .json envelope back');
      } else {
        const dl = page.waitForEvent('download', { timeout: 60000 });
        await tapWhenHittable(frame, exportBtn, 'Export');
        const d = await dl;
        console.log(`  downloaded ${d.suggestedFilename()}`);
        if (!d.suggestedFilename().endsWith('.cosmo')) throw new Error('export download is not a .cosmo file');
      }
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await tapWhenHittable(frame, frame.locator('.rl-btn[aria-label="Photo mode"]').first(), 'Photo mode');
    await frame.waitForSelector('.ph-root', { timeout: 20000 });
    await page.waitForTimeout(1500);
    await shot('photo');
    if (artifact || mode === 'plain') {
      await tapWhenHittable(frame, frame.locator('.ph-shutter').first(), 'Shutter');
      await frame.waitForSelector('.ph-postcard', { timeout: 120000 });
      const saveBtn = frame.locator('.ph-pc-btn', { hasText: 'Save' }).first();
      if (artifact) {
        await tapWhenHittable(frame, saveBtn, 'Save photo');
        await frame.waitForFunction(() => window.__saved.some((x) => x.filename.endsWith('.png')), null, { timeout: 60000, polling: 250 });
        const got = await frame.evaluate(() => window.__saved.find((x) => x.filename.endsWith('.png')));
        console.log(`  photo ${got.filename} (${got.size} B, ${got.type}, user activation ${got.active})`);
        if (!(got.size > 1000) || got.active === false) throw new Error('photo save did not reach the downloads capability correctly');
      } else {
        const dl = page.waitForEvent('download', { timeout: 60000 });
        await tapWhenHittable(frame, saveBtn, 'Save photo');
        console.log(`  downloaded ${(await dl).suggestedFilename()}`);
      }
    }
    const info = await frame.evaluate(() => window.__cosmo.debugInfo());
    console.log('  debugInfo:', JSON.stringify(info));
  } catch (e) {
    errors.push('runner: ' + (e.stack || e.message));
    await shot('failure').catch(() => {});
  } finally {
    if (external.length) errors.push('external requests: ' + [...new Set(external)].join(', '));
    await context.close().catch(() => {});
  }
  if (errors.length) {
    console.log(`  ${errors.length} error(s):`);
    for (const e of errors.slice(0, 30)) console.log('   • ' + e.slice(0, 1200));
  } else console.log('  ok: no console errors, no failed or external requests');
  return errors.length;
}

let failed = 0;
try {
  for (const m of modes) failed += (await run(m)) ? 1 : 0;
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? `\n${failed} mode(s) failed` : '\nall modes passed');
process.exit(failed ? 1 : 0);
