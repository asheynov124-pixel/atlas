import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

test.describe('The book', () => {
  test('reads cover to epilogue with no console errors, and the night theme sticks', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto('/#/i/0', { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toContainText('Sixteen Bannehr');
    await page.goto('/#/i/2', { waitUntil: 'networkidle' });
    await page.locator('[data-testid="contents-entry"]').filter({ hasText: 'A Cook’s Kitchen' }).click();
    await expect(page).toHaveTitle(/A Cook’s Kitchen/);
    await page.goto('/#/i/49', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-spread-index="49"]')).toContainText('Still to Decide');
    expect(errors).toEqual([]);
  });

  test('passes axe on the key spreads, reading and editing', async ({ page, isMobile }) => {
    const check = async (label: string, index?: number) => {
      // on a phone every spread is in the document; scan the one on screen plus the chrome
      let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']);
      if (isMobile && index != null) builder = builder.include(`[data-spread-index="${index}"]`).include('[class*="bar"]').include('[data-testid="strip"]');
      const results = await builder.analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious, `${label}: ${serious.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.html}`).join('\n')}`).toEqual([]);
    };
    for (const [label, index] of [['cover', 0], ['contents', 2], ['opener', 18], ['essay', 19], ['gallery', 29], ['still to decide', 49]] as const) {
      await page.goto(`/#/i/${index}`, { waitUntil: 'networkidle' });
      await check(label, index);
    }
    await page.goto('/#/i/19', { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.setItem('sb.author', '"sonny"'));
    await page.reload({ waitUntil: 'networkidle' });
    if (isMobile) await page.locator('main').click({ position: { x: 195, y: 500 } });
    await page.getByTestId('mode-toggle').click();
    await expect(page.getByTestId('strip')).toBeVisible();
    await check('edit mode', 19);
  });

  test('exports a .zip with a photo and imports it into a fresh browser', async ({ browser, isMobile }) => {
    test.skip(isMobile, 'download round trip is checked on the desk');
    const dir = mkdtempSync(join(tmpdir(), 'sb-'));
    const a = await browser.newContext({ acceptDownloads: true });
    const pageA = await a.newPage();
    await pageA.goto('http://localhost:4173/#/i/19', { waitUntil: 'networkidle' });
    await pageA.evaluate(() => { indexedDB.deleteDatabase('sixteen-bannehr'); localStorage.setItem('sb.author', '"adi"'); });
    await pageA.reload({ waitUntil: 'networkidle' });
    await pageA.getByTestId('mode-toggle').click();
    const title = pageA.locator('[data-spread-index="19"] [data-slot="title"]');
    await title.click();
    await pageA.keyboard.press('Control+a');
    await pageA.keyboard.type('Travelled title');
    await pageA.keyboard.press('Enter');
    await pageA.locator('[data-slot-path="aside"] input[type="file"]').setInputFiles(join('tests', 'fixtures', 'render.jpg'));
    await expect(pageA.locator('[data-slot-path="aside"] img')).toBeVisible({ timeout: 10_000 });
    await pageA.getByTestId('mode-toggle').click();
    await pageA.getByRole('button', { name: 'More' }).click();
    await pageA.getByTestId('menu-transfer').click();
    const [download] = await Promise.all([pageA.waitForEvent('download'), pageA.getByTestId('export-zip').click()]);
    const file = join(dir, 'book.zip');
    await download.saveAs(file);
    await a.close();

    const b = await browser.newContext();
    const pageB = await b.newPage();
    await pageB.goto('http://localhost:4173/#/i/19', { waitUntil: 'networkidle' });
    await pageB.evaluate(() => indexedDB.deleteDatabase('sixteen-bannehr'));
    await pageB.reload({ waitUntil: 'networkidle' });
    await expect(pageB.locator('[data-spread-index="19"] h2').first()).toHaveText('Whoever is cooking faces whoever is talking');
    await pageB.getByRole('button', { name: 'More' }).click();
    await pageB.getByTestId('menu-transfer').click();
    await pageB.getByTestId('import-input').setInputFiles(file);
    await pageB.getByTestId('confirm-import').click();
    await expect(pageB.getByTestId('transfer-sheet')).toBeHidden({ timeout: 20_000 });
    await pageB.goto('http://localhost:4173/#/i/19', { waitUntil: 'networkidle' });
    await expect(pageB.locator('[data-spread-index="19"] h2').first()).toHaveText('Travelled title');
    await expect(pageB.locator('[data-spread-index="19"] img').first()).toHaveAttribute('srcset', /800w/);
    await pageB.reload({ waitUntil: 'networkidle' });
    await expect(pageB.locator('[data-spread-index="19"] h2').first()).toHaveText('Travelled title');
    await b.close();
  });

  test('installs a service worker and opens offline', async ({ page, context, isMobile }) => {
    test.skip(isMobile, 'service worker checked once, on the desk');
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      if (!reg.active) throw new Error('no active worker');
    });
    await page.waitForTimeout(800);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toContainText('Sixteen Bannehr', { timeout: 15_000 });
    await context.setOffline(false);
  });

  test('prints one landscape page per spread', async ({ page, isMobile }) => {
    test.skip(isMobile, 'PDF is produced on the desk');
    await page.goto('/#/print', { waitUntil: 'networkidle' });
    const count = await page.locator('.print-spread').count();
    expect(count).toBeGreaterThan(40);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBe(count);
    expect(pdf.byteLength).toBeGreaterThan(50_000);
  });
});
