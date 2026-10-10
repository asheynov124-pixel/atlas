#!/usr/bin/env node
/**
 * Boots the single-file build (dist-single/index.html) served by a tiny static server — as a plain page AND inside
 * sandboxed iframes (sandbox="allow-scripts" → opaque origin, so localStorage / IndexedDB / service workers all
 * throw; and sandbox="allow-scripts allow-same-origin") — then plays a short sandbox session through the real UI in
 * each: main menu → Sandbox → Instant City → More › Saved Cities › create a save (memory fallback when storage is
 * blocked) → photo mode.
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

async function run(mode) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  const errors = [];
  const external = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`);
    else if (m.type() === 'warning') console.log(`  [warn] ${m.text().slice(0, 160)}`);
  });
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('about:')) external.push(u);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
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
    await frame.locator('.mm-mode', { hasText: 'Sandbox' }).first().tap();
    await frame.waitForSelector('.ng-modal', { timeout: 30000 });
    await frame.getByRole('radio', { name: 'Instant City' }).first().tap();
    await frame.getByRole('button', { name: 'Launch' }).first().tap();
    await frame.waitForFunction(() => window.__cosmo.debugInfo().screen === 'game' && (window.__cosmo.game.planet?.buildings.size ?? 0) > 20, null, { timeout: 240000, polling: 500 });
    await page.waitForTimeout(4000);
    await shot('instant-city');
    // save through More › Saved Cities: must succeed (session-memory fallback when storage is blocked)
    await frame.getByRole('button', { name: 'More', exact: true }).first().tap();
    await frame.waitForSelector('.mo-sheet .mo-tile', { timeout: 20000 });
    await page.waitForTimeout(800);
    await frame.locator('.mo-tile', { hasText: 'Saved Cities' }).first().tap();
    await frame.waitForSelector('.up-saves', { timeout: 20000 });
    await page.waitForTimeout(800);
    await frame.locator('.up-save-new input').fill('Single E2E');
    await frame.getByRole('button', { name: 'Create save' }).first().tap();
    await frame.waitForFunction(() => [...document.querySelectorAll('.up-save-main')].some((b) => (b.getAttribute('aria-label') ?? '').includes('Single E2E')), null, { timeout: 30000, polling: 250 });
    await page.waitForTimeout(1200);
    await shot('saved');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await frame.locator('.rl-btn[aria-label="Photo mode"]').first().tap();
    await frame.waitForSelector('.ph-root', { timeout: 20000 });
    await page.waitForTimeout(1500);
    await shot('photo');
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
