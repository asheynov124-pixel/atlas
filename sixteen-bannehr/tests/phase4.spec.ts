import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { freshBook, goTo, renderJpeg, startEditing } from './helpers';

async function storedBook(page: Page): Promise<unknown> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('sixteen-bannehr');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('books', 'readonly');
          const get = tx.objectStore('books').get('current');
          get.onsuccess = () => resolve(get.result?.book ?? null);
          get.onerror = () => reject(get.error);
        };
      }),
  );
}

test.describe('acceptance 4–7', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'laptop', 'Runs once, at laptop size.');
  });

  test('4: export a .zip, import it into a fresh browser, identical book', async ({ page, browser }) => {
    await freshBook(page, '#/p/sp-contents');
    await startEditing(page);
    await page.locator('.toc__entry[data-chapter="ch-rest"] .toc__title').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Rest, and Rest Again');
    await page.keyboard.press('Enter');
    await goTo(page, 'sp-rest-full');
    await page.locator('[data-spread="sp-rest-full"] .image-tools input[type="file"]').first().setInputFiles({
      name: 'hall.jpg',
      mimeType: 'image/jpeg',
      buffer: await renderJpeg(3600, 2400, 80),
    });
    await expect(page.locator('[data-spread="sp-rest-full"] img.pic__img')).toHaveAttribute('srcset', /2800w/, { timeout: 30_000 });
    await expect(page.locator('.edit-bar__status')).toHaveText('Saved');

    await page.getByRole('button', { name: 'Share' }).click();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save as .zip' }).click();
    const download = await downloading;
    const zipPath = await download.path();
    expect(download.suggestedFilename()).toMatch(/^sixteen-bannehr-\d{4}-\d{2}-\d{2}\.zip$/);
    const original = await storedBook(page);

    // A fresh browser: new context, empty storage.
    const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p2 = await other.newPage();
    await p2.goto('/');
    await p2.waitForSelector('.spread');
    await startEditing(p2, 'Adi');
    await p2.getByRole('button', { name: 'Share' }).click();
    await p2.locator('.share input[type="file"]').setInputFiles({ name: 'book.zip', mimeType: 'application/zip', buffer: await readFile(zipPath) });
    await p2.getByRole('button', { name: 'Replace it' }).click();
    await expect(p2.getByText(/Opened “Sixteen Bannehr”: 1 photo/)).toBeVisible();
    await p2.getByRole('button', { name: 'Close' }).click();

    expect(await storedBook(p2)).toEqual(original);
    await goTo(p2, 'sp-rest-full');
    await expect(p2.locator('[data-spread="sp-rest-full"] img.pic__img')).toBeVisible();
    await goTo(p2, 'sp-contents');
    await expect(p2.locator('.toc__entry[data-chapter="ch-rest"] .toc__title')).toHaveText('Rest, and Rest Again');
    await other.close();
  });

  test('5: installable, and opens offline', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForSelector('.spread');
    const manifest = await page.evaluate(async () => {
      const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href');
      return href ? (await fetch(href)).json() : null;
    });
    expect(manifest?.display).toBe('standalone');
    expect(manifest?.icons?.length).toBeGreaterThanOrEqual(3);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.spread').first()).toBeVisible();
    await goTo(page, 'sp-kitchen-essay');
    await expect(page.locator('[data-spread="sp-kitchen-essay"] .essay__body').first()).toContainText('whoever is cooking');
    await context.setOffline(false);
  });

  test('6: print makes one spread per landscape page, nothing clipped', async ({ page }) => {
    await page.goto('/#/p/sp-contents');
    await page.waitForSelector('.spread');
    await page.evaluate(() => {
      window.print = () => {};
    });
    await startEditing(page);
    await page.getByRole('button', { name: 'Share' }).click();
    await page.getByRole('button', { name: /Print or save as PDF/ }).click();
    await page.waitForSelector('.print-book .print-page', { state: 'attached' });
    await page.emulateMedia({ media: 'print' });

    const report = await page.evaluate(() => {
      const pages = Array.from(document.querySelectorAll<HTMLElement>('.print-page'));
      const clipped: string[] = [];
      for (const pg of pages) {
        // Containers that clip their content: a page, and the few that scroll on screen.
        for (const body of Array.from(pg.querySelectorAll<HTMLElement>('.page, .lib__page, .shop__recto, .gallery__page, .essay-flow__cols'))) {
          if (body.scrollHeight > body.clientHeight + 2 || body.scrollWidth > body.clientWidth + 2) {
            clipped.push(`${pg.querySelector('.spread')?.getAttribute('data-template')}: ${body.scrollHeight}>${body.clientHeight}`);
          }
        }
        const r = pg.getBoundingClientRect();
        if (Math.abs(r.width - 1056) > 2 || Math.abs(r.height - 816) > 2) clipped.push(`page size ${r.width}×${r.height}`);
      }
      return { count: pages.length, clipped };
    });
    expect(report.clipped).toEqual([]);

    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pageCount).toBe(report.count);
    expect(report.count).toBeGreaterThan(40);
  });

  test('7: no console errors and no serious accessibility problems', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await freshBook(page, '#/p/sp-cover');
    const pages = ['sp-cover', 'sp-contents', 'sp-kitchen-opener', 'sp-kitchen-essay', 'sp-archer-vanities', 'sp-kitchen-plan', 'sp-kitchen-shopping', 'sp-still'];
    const problems: string[] = [];
    for (const id of pages) {
      await goTo(page, id);
      await page.waitForTimeout(400);
      const result = await new AxeBuilder({ page }).include('.book').analyze();
      for (const v of result.violations)
        if (v.impact === 'serious' || v.impact === 'critical') problems.push(`${id}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`);
    }
    await startEditing(page);
    await goTo(page, 'sp-contents');
    const edit = await new AxeBuilder({ page }).analyze();
    for (const v of edit.violations) if (v.impact === 'serious' || v.impact === 'critical') problems.push(`edit: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`);
    expect(problems).toEqual([]);
    expect(errors).toEqual([]);
  });
});
