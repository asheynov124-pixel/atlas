#!/usr/bin/env node
/**
 * Boots the single-file build (dist-single/index.html) inside a SANDBOXED iframe (allow-scripts only → opaque
 * origin, so localStorage / IndexedDB / service workers all throw) served by a tiny static server, then plays a
 * short sandbox session through the real UI: main menu → Sandbox → Instant City → save (memory fallback) → photo.
 * Fails on any console error, page error or a network request that leaves the local server.
 *
 *   npm run build:single && node scripts/e2e/single-iframe.mjs [--out dir] [--device iphone] [--plain]
 *
 * --plain loads index.html directly (no iframe) for comparison.
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
const plain = args.includes('--plain');
const outDir = path.resolve(opt('out', path.join(root, '.shots/single')));
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(root, 'dist-single/index.html');
if (!fs.existsSync(file)) {
  console.error('dist-single/index.html missing — run `npm run build:single` first');
  process.exit(2);
}

const HOST = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%;display:block}</style></head>
<body><iframe id="app" sandbox="allow-scripts allow-pointer-lock allow-popups" allow="autoplay; fullscreen" src="/index.html"></iframe></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/' || url.pathname === '/host.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(HOST);
  }
  if (url.pathname === '/index.html') {
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
let n = 0;
const shot = async (name) => {
  const f = path.join(outDir, `single-${String(n++).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: f });
  console.log('screenshot:', f);
};

let exit = 0;
try {
  const t0 = Date.now();
  await page.goto(plain ? base + '/index.html' : base + '/host.html', { waitUntil: 'load', timeout: 120000 });
  const frame = plain ? page.mainFrame() : await (await page.waitForSelector('#app')).contentFrame();
  await frame.waitForFunction(() => window.__cosmo && window.__cosmo.ready === true, null, { timeout: 120000, polling: 250 });
  console.log(`booted in ${Date.now() - t0} ms (${plain ? 'plain page' : 'sandboxed iframe'})`);
  const env = await frame.evaluate(() => {
    const probe = (f) => {
      try {
        f();
        return 'ok';
      } catch (e) {
        return 'throws ' + (e && e.name);
      }
    };
    return { origin: location.origin, localStorage: probe(() => localStorage.getItem('x')), indexedDB: probe(() => indexedDB.open('x')), serviceWorker: probe(() => navigator.serviceWorker.getRegistrations()) };
  });
  console.log('environment:', JSON.stringify(env));
  await frame.locator('.mm-mode', { hasText: 'Sandbox' }).first().tap();
  await frame.waitForSelector('.ng-modal', { timeout: 30000 });
  await frame.getByRole('radio', { name: 'Instant City' }).first().tap();
  await frame.getByRole('button', { name: 'Launch' }).first().tap();
  await frame.waitForFunction(() => window.__cosmo.debugInfo().screen === 'game' && (window.__cosmo.game.planet?.buildings.size ?? 0) > 20, null, { timeout: 180000, polling: 500 });
  await page.waitForTimeout(4000);
  await shot('instant-city');
  // save through the More menu: must succeed (memory fallback) without errors
  await frame.getByRole('button', { name: 'More', exact: true }).first().tap();
  await frame.waitForSelector('.mo-sheet .mo-row', { timeout: 20000 });
  await frame.locator('.mo-row', { hasText: 'Save game' }).first().tap();
  await page.waitForTimeout(2500);
  const saved = await frame.evaluate(async () => {
    const ok = await window.__cosmo.game.save('e2e');
    const back = ok ? await window.__cosmo.game.load('e2e') : false;
    return { ok, back };
  });
  console.log('save / load round trip →', JSON.stringify(saved));
  if (!saved.ok || !saved.back) throw new Error('save/load failed in the sandboxed frame');
  await page.waitForTimeout(3000);
  await shot('saved');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await frame.locator('.rl-btn[aria-label="Photo mode"]').first().tap();
  await frame.waitForSelector('.ph-root', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await shot('photo');
  const info = await frame.evaluate(() => window.__cosmo.debugInfo());
  console.log('debugInfo:', JSON.stringify(info));
} catch (e) {
  errors.push('runner: ' + (e.stack || e.message));
  await shot('failure').catch(() => {});
} finally {
  if (external.length) errors.push('external requests: ' + [...new Set(external)].join(', '));
  if (errors.length) {
    console.log(`\n${errors.length} error(s):`);
    for (const e of errors.slice(0, 30)) console.log(' • ' + e.slice(0, 1200));
    exit = 1;
  } else console.log('no console errors, no external requests');
  await browser.close();
  server.close();
  process.exit(exit);
}
