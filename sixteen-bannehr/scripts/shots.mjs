#!/usr/bin/env node
// Screenshots of the pages that matter, at iPhone and laptop sizes.
//   node scripts/shots.mjs [baseUrl] [outDir] [--edit] [--night]
// Defaults: http://127.0.0.1:5173 and screenshots/.

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const base = args[0] ?? 'http://127.0.0.1:5173';
const out = args[1] ?? 'screenshots';

const TARGETS = [
  ['cover', 'sp-cover'],
  ['contents', 'sp-contents'],
  ['opener', 'sp-kitchen-opener'],
  ['essay', 'sp-kitchen-essay'],
  ['gallery', 'sp-archer-vanities'],
  ...(flags.has('--all')
    ? [
        ['dedication', 'sp-dedication'],
        ['prologue-essay', 'sp-prologue-essay'],
        ['before-after', 'sp-kitchen-ba'],
        ['plan', 'sp-kitchen-plan'],
        ['palette', 'sp-kitchen-palette'],
        ['shopping', 'sp-kitchen-shopping'],
        ['decision', 'sp-vault-decision'],
        ['moodboard', 'sp-below-board'],
        ['fullbleed', 'sp-prologue-rafters'],
        ['library', 'sp-palette-library'],
        ['still', 'sp-still'],
        ['first-dinner', 'sp-first-dinner'],
        ['fireplace', 'sp-vault-fireplace'],
      ]
    : []),
];

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900, scale: 1 },
  { name: '390', width: 390, height: 844, scale: 2 },
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale,
    reducedMotion: 'reduce',
    colorScheme: flags.has('--night') ? 'dark' : 'light',
    isMobile: vp.width < 600,
    hasTouch: vp.width < 600,
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${vp.name}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${vp.name}] ${e.message}`));

  for (const [name, id] of TARGETS) {
    await page.goto(`${base}/#/p/${id}`);
    await page.waitForSelector(`[data-spread="${id}"]`);
    await page.evaluate(() => document.fonts.ready);
    if (flags.has('--edit')) {
      const edit = page.getByRole('button', { name: 'Edit' });
      if (await edit.count()) await edit.first().click();
    }
    await page.waitForTimeout(500);
    const suffix = flags.has('--night') ? '-night' : flags.has('--edit') ? '-edit' : '';
    if (vp.width >= 600) {
      await page.screenshot({ path: join(out, `${vp.name}-${name}${suffix}.png`) });
    } else {
      // On the phone, every page of the spread is its own screen.
      const pages = page.locator(`[data-spread="${id}"] > .spread__span, [data-spread="${id}"] > .page:not(.page--empty)`);
      const n = await pages.count();
      for (let i = 0; i < n; i++) {
        await pages.nth(i).evaluate((el) => el.scrollIntoView({ block: 'start' }));
        await page.waitForTimeout(250);
        await page.screenshot({ path: join(out, `${vp.name}-${name}${n > 1 ? `-${i + 1}` : ''}${suffix}.png`) });
      }
    }
  }
  await ctx.close();
}

await browser.close();
if (errors.length) {
  console.log('Console errors:\n' + errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Screenshots written to ${out}/ — no console errors.`);
}
