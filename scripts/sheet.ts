/**
 * Contact sheet: screenshot every spread at laptop size (and optionally phone)
 * into screenshots/sheet/, for a quick visual review of the whole book.
 *   npx tsx scripts/sheet.ts [phone]
 */
import { chromium, devices } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.SHOTS_URL ?? 'http://localhost:4173';
const phone = process.argv.includes('phone');
const DIR = join('screenshots', phone ? 'sheet-phone' : 'sheet');
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  ...(phone ? devices['iPhone 14'] : {}),
  viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
});
const page = await context.newPage();
const errors: string[] = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${BASE}/#/i/0`, { waitUntil: 'networkidle' });
const count = await page.evaluate(() => (window as unknown as { __sb?: { spreadCount: number } }).__sb?.spreadCount ?? 0);
const n = count || Number(process.env.SHEET_COUNT ?? 44);
for (let i = 0; i < n; i++) {
  await page.goto(`${BASE}/#/i/${i}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(DIR, `${String(i).padStart(2, '0')}.png`) });
}
await browser.close();
console.log(`wrote ${n} spreads to ${DIR}`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
