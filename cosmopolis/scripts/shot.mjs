#!/usr/bin/env node
/**
 * Headless screenshot / scenario runner for Cosmopolis.
 *
 *   node scripts/shot.mjs [options]
 *
 * Options
 *   --query "<qs>"     Query string appended to the app URL (default "autostart=sandbox&demo=city")
 *   --device <name>    iphone | iphone-land | ipad | desktop     (default iphone)
 *   --out <dir>        Output directory for PNGs + log            (default ./.shots)
 *   --name <prefix>    File name prefix                            (default "shot")
 *   --wait <ms>        Extra settle time after ready              (default 1500)
 *   --script <file>    ES module whose default export is async (ctx) => {}, ctx = { page, shot, wait, evalGame }
 *   --eval "<js>"      JS evaluated in the page after ready (has access to window.__cosmo)
 *   --timeout <ms>     Max time to wait for window.__cosmo.ready  (default 60000)
 *   --url <url>        Use an already running server instead of starting Vite (e.g. vite preview / dist)
 *
 * Starts its own Vite dev server on a free port (unless --url), launches the pre-installed Chromium with
 * SwiftShader WebGL, waits for `window.__cosmo.ready === true`, runs the scenario, saves screenshots and
 * prints console errors. Exit code 1 if the page logged errors (pageerror / console.error).
 */
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };

const devices = {
  iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'iphone-land': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ipad: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};
const deviceName = opt('device', 'iphone');
const device = devices[deviceName] ?? devices.iphone;
const outDir = path.resolve(opt('out', path.join(root, '.shots')));
const prefix = opt('name', 'shot');
const query = opt('query', 'autostart=sandbox&demo=city');
const settle = Number(opt('wait', '1500'));
const timeout = Number(opt('timeout', '60000'));
fs.mkdirSync(outDir, { recursive: true });

const exe = process.env.CHROMIUM_PATH
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));

let server = null;
let base = opt('url', null);
if (!base) {
  server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1', hmr: false } });
  await server.listen();
  base = server.resolvedUrls.local[0];
}
const url = base + (base.includes('?') ? '&' : '?') + query;

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'],
});
const context = await browser.newContext({ ...device, userAgent: device.isMobile
  ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  : undefined });
const page = await context.newPage();
const errors = [];
const logs = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
page.on('console', (m) => {
  const line = `[${m.type()}] ${m.text()}`;
  logs.push(line);
  if (m.type() === 'error') errors.push(line);
});

let n = 0;
const shot = async (name) => {
  const file = path.join(outDir, `${prefix}-${String(n++).padStart(2, '0')}-${name || 'view'}.png`);
  await page.screenshot({ path: file });
  console.log('screenshot:', file);
  return file;
};
const wait = (ms) => page.waitForTimeout(ms);
const evalGame = (fn, arg) => page.evaluate(fn, arg);

let exit = 0;
try {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout });
  await page.waitForFunction(() => window.__cosmo && window.__cosmo.ready === true, null, { timeout, polling: 250 });
  console.log(`ready in ${Date.now() - t0} ms  (${url}, ${deviceName})`);
  await wait(settle);
  const evalSrc = opt('eval', null);
  if (evalSrc) console.log('eval result:', JSON.stringify(await page.evaluate(evalSrc)));
  const script = opt('script', null);
  if (script) {
    const mod = await import(pathToFileURL(path.resolve(script)).href);
    await mod.default({ page, shot, wait, evalGame, url, base });
  } else {
    await shot('main');
  }
  const info = await page.evaluate(() => window.__cosmo && window.__cosmo.debugInfo ? window.__cosmo.debugInfo() : null).catch(() => null);
  if (info) console.log('debugInfo:', JSON.stringify(info));
} catch (e) {
  errors.push('runner: ' + (e.stack || e.message));
  try { await shot('failure'); } catch {}
} finally {
  fs.writeFileSync(path.join(outDir, `${prefix}-console.log`), logs.join('\n'));
  if (errors.length) {
    console.log(`\n${errors.length} error(s):`);
    for (const e of errors.slice(0, 30)) console.log(' • ' + e.slice(0, 1200));
    exit = 1;
  } else console.log('no console errors');
  await browser.close();
  if (server) await server.close();
  process.exit(exit);
}
