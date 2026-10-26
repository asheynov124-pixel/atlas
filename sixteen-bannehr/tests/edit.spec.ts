import { expect, test } from '@playwright/test';
import { freshBook, goTo, renderJpeg, startEditing, undoAll } from './helpers';

// Acceptance test 3: in Edit mode Sonny can, without instructions, retitle a chapter,
// replace an image and set its focal point, add a note, add a spread, change its
// template, and undo all of it.

test.describe('editing in place', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'laptop', 'The full editing walk runs at laptop size.');
    await freshBook(page, '#/p/sp-contents');
    await startEditing(page);
  });

  test('retitle, replace, focus, note, add, change, undo', async ({ page }) => {
    // Retitle a chapter, from the Contents spread.
    const vault = page.locator('.toc__entry[data-chapter="ch-vault"] .toc__title');
    await vault.click();
    const field = page.locator('.toc__entry[data-chapter="ch-vault"] .ProseMirror');
    await expect(field).toBeFocused();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('The Vault Room');
    await page.keyboard.press('Enter');
    await expect(page.locator('.toc__entry[data-chapter="ch-vault"] .toc__title')).toHaveText('The Vault Room');

    // Replace an image and set its focal point.
    await goTo(page, 'sp-kitchen-opener');
    const opener = page.locator('[data-spread="sp-kitchen-opener"]').first();
    await opener.locator('.image-tools input[type="file"]').first().setInputFiles({
      name: 'kitchen-render.jpg',
      mimeType: 'image/jpeg',
      buffer: await renderJpeg(),
    });
    const img = opener.locator('img.pic__img').first();
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute('srcset', /800w/, { timeout: 20_000 });
    await opener.getByRole('button', { name: 'Focal point' }).click();
    const focal = opener.locator('.focal');
    const box = (await focal.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.3);
    await opener.getByRole('button', { name: 'Set focus' }).click();
    await expect(opener.locator('.pic').first()).toHaveAttribute('style', /--fx: 2\d%/);

    // Add a note in the margin.
    await goTo(page, 'sp-kitchen-essay');
    await page.getByRole('button', { name: '+ Note' }).click();
    const verso = page.locator('[data-spread="sp-kitchen-essay"] .page--verso').first();
    const vb = (await verso.boundingBox())!;
    await page.mouse.click(vb.x + vb.width * 0.7, vb.y + vb.height * 0.55);
    await page.keyboard.type('Counter height or bar height?');
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await expect(page.locator('.note', { hasText: 'Counter height or bar height?' })).toBeVisible();

    // Add a spread after this one, then change its template.
    const before = await page.locator('.cs__thumb').count();
    await page.getByRole('button', { name: '+ Add spread' }).click();
    await page.getByRole('dialog', { name: 'Add a spread after this one' }).getByRole('button', { name: /^Essay/ }).click();
    await expect(page.locator('.cs__thumb')).toHaveCount(before + 1);
    await page.getByRole('button', { name: 'Template', exact: true }).click();
    await page.getByRole('dialog', { name: /Change this spread/ }).getByRole('button', { name: /^Full bleed/ }).click();
    await expect(page.locator('.cs__here .sc')).toHaveText('Full bleed');

    // Undo all of it.
    await undoAll(page);
    await expect(page.locator('.cs__thumb')).toHaveCount(before);
    await expect(page.locator('.note', { hasText: 'Counter height' })).toHaveCount(0);
    await goTo(page, 'sp-kitchen-opener');
    await expect(page.locator('[data-spread="sp-kitchen-opener"] img.pic__img')).toHaveCount(0);
    await goTo(page, 'sp-contents');
    await expect(page.locator('.toc__entry[data-chapter="ch-vault"] .toc__title')).toHaveText('The Vault');
  });

  test('keeps everything after the tab is closed', async ({ page }) => {
    const vault = page.locator('.toc__entry[data-chapter="ch-vault"] .toc__title');
    await vault.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Under the Gable');
    await page.keyboard.press('Enter');
    await expect(page.locator('.edit-bar__status')).toHaveText('Saved');
    await page.reload();
    await page.waitForSelector('.spread');
    await expect(page.locator('.toc__entry[data-chapter="ch-vault"] .toc__title')).toHaveText('Under the Gable');
  });

  test('smart quotes and plain paste in the essay', async ({ page }) => {
    await goTo(page, 'sp-small-essay');
    const body = page.locator('[data-spread="sp-small-essay"] .essay__body').first();
    await body.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(`It's a 58" room -- "used well".`);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await expect(page.locator('[data-spread="sp-small-essay"] .essay__body').first()).toContainText('It’s a 58″ room – “used well”.');
  });

  test('saves an edition and restores it', async ({ page }) => {
    await page.getByRole('button', { name: 'Editions' }).click();
    const sheet = page.getByRole('dialog', { name: 'Editions' });
    await sheet.getByLabel('Name this edition').fill('Before the gable');
    await sheet.getByRole('button', { name: 'Save an edition' }).click();
    await expect(sheet.getByText('Before the gable', { exact: true })).toBeVisible();
    await sheet.getByRole('button', { name: 'Close' }).click();

    const vault = page.locator('.toc__entry[data-chapter="ch-vault"] .toc__title');
    await vault.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Changed my mind');
    await page.keyboard.press('Enter');
    await expect(vault).toHaveText('Changed my mind');

    await page.getByRole('button', { name: 'Editions' }).click();
    await page.getByRole('dialog', { name: 'Editions' }).getByRole('button', { name: 'Restore' }).click();
    await page.getByRole('dialog', { name: 'Editions' }).getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('.toc__entry[data-chapter="ch-vault"] .toc__title')).toHaveText('The Vault');
  });
});

test.describe('editing on the phone', () => {
  test('adds a photo from the library and a note', async ({ page }, info) => {
    test.skip(info.project.name !== 'iphone', 'Phone-sized check.');
    await freshBook(page, '#/p/sp-kitchen-opener');
    await startEditing(page);
    const opener = page.locator('[data-spread="sp-kitchen-opener"]');
    await opener.locator('.image-tools input[type="file"]').first().setInputFiles({
      name: 'IMG_0412.jpg',
      mimeType: 'image/jpeg',
      buffer: await renderJpeg(3024, 4032, 40),
    });
    await expect(opener.locator('img.pic__img')).toBeVisible();
    await page.getByRole('button', { name: '+ Note' }).click();
    await page.locator('[data-spread="sp-kitchen-essay"] .page--verso').scrollIntoViewIfNeeded();
    await page.locator('[data-spread="sp-kitchen-essay"] .page--verso').click({ position: { x: 200, y: 520 } });
    await page.keyboard.type('Love this.');
    await page.locator('[data-spread="sp-kitchen-essay"] .essay__title').first().click({ force: true });
    await expect(page.locator('.note', { hasText: 'Love this.' })).toBeVisible();
  });
});
