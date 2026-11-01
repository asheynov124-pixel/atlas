/**
 * Screenshot the key spreads at phone and laptop sizes.
 *
 *   npm run shots              -> screenshots/<phase>/...
 *   SHOTS_DIR=final npm run shots
 *   SHOTS_URL=http://localhost:5173 npm run shots
 *
 * Captures: cover, contents, a chapter opener, an essay, a gallery.
 * Expects a server (preview or dev) to be running.
 */
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.SHOTS_URL ?? 'http://localhost:4173';
const DIR = join('screenshots', process.env.SHOTS_DIR ?? 'latest');
mkdirSync(DIR, { recursive: true });

// Spread indices in the seed: 0 cover, 1 endpapers, 2 contents, 3–4 prologue,
// 5–10 ch1, 11–17 ch2, 18 kitchen opener, 19 kitchen essay, ... 29 the 32 vanities.
const TARGETS: Array<[string, string]> = [
  ['cover', '#/i/0'],
  ['contents', '#/i/2'],
  ['opener', '#/i/18'],
  ['essay', '#/i/19'],
  ['gallery', '#/i/29'],
  ...(process.env.SHOTS_EXTRA ? [['extra', process.env.SHOTS_EXTRA] as [string, string]] : []),
];

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844, mobile: true },
  { name: 'laptop', width: 1440, height: 900, mobile: false },
];

const browser = await chromium.launch();
const errors: string[] = [];
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    ...(vp.mobile ? devices['iPhone 14'] : {}),
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${vp.name}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${vp.name}] ${e.message}`));
  for (const [name, hash] of TARGETS) {
    await page.goto(`${BASE}/${hash}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const file = join(DIR, `${name}-${vp.name}-${vp.width}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log('wrote', file);
  }
  if (process.env.SHOTS_NIGHT) {
    await page.goto(`${BASE}/#/i/19`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('sb.theme', '"night"'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(DIR, `essay-night-${vp.name}-${vp.width}.png`) });
    await page.evaluate(() => localStorage.removeItem('sb.theme'));
  }
  await context.close();
}
await browser.close();
if (errors.length) {
  console.error('\nConsole errors:\n' + errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('\nNo console errors.');
}
