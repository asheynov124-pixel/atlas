import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';

const KITCHEN_ESSAY = '#/i/19';

async function enterEdit(page: Page, who: 'sonny' | 'adi' = 'sonny') {
  await page.getByTestId('mode-toggle').click();
  const prompt = page.getByTestId('author-prompt');
  if (await prompt.isVisible().catch(() => false)) await page.getByTestId(`author-${who}`).click();
  await expect(page.getByTestId('strip')).toBeVisible();
}

test.describe('Edit mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/${KITCHEN_ESSAY}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => indexedDB.deleteDatabase('sixteen-bannehr'));
    await page.reload({ waitUntil: 'networkidle' });
  });

  test('retitle a chapter, edit text in place, add a note, and keep it all after a reload', async ({ page, isMobile }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    if (isMobile) await page.locator('main').click({ position: { x: 195, y: 500 } });
    await enterEdit(page, 'sonny');

    // retitle the chapter from the Chapters panel
    await page.getByTestId('open-chapters').click();
    const panel = page.getByTestId('chapters-panel');
    const kitchen = panel.locator('[data-chapter-row]').filter({ has: page.locator('input[value="A Cook’s Kitchen"]') });
    await kitchen.getByTestId('chapter-title').fill('The Kitchen, Finally');
    await page.keyboard.press('Escape');
    const spread = page.locator('[data-spread-index="19"]');
    await expect(spread.locator('[data-side="right"]')).toContainText('The Kitchen, Finally');

    // edit the essay title in place
    const title = spread.locator('[data-slot="title"]').first();
    await title.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Cooking faces talking');
    await page.keyboard.press('Enter');
    await expect(title).toHaveText('Cooking faces talking');

    // add a note signed by Sonny
    await page.getByTestId('add-note').click();
    const note = page.locator('[data-note-id]').last();
    await expect(note).toBeVisible();
    await expect(note).toContainText('Sonny');
    await note.locator('[role="textbox"]').click();
    await page.keyboard.type('Range hood over the window?');
    await page.keyboard.press('Escape');

    // reload: everything is still there
    await page.waitForTimeout(700);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(spread.locator('[data-side="right"]')).toContainText('The Kitchen, Finally');
    await expect(spread.locator('h2').filter({ hasText: 'Cooking faces talking' })).toBeAttached();
    await expect(spread.locator('[data-note-id]').last()).toContainText('Range hood over the window?');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('replace an image from a file, set its focal point, then undo', async ({ page, isMobile }) => {
    test.skip(isMobile, 'file chooser flow covered on the desk');
    await enterEdit(page, 'adi');
    const aside = page.locator('[data-slot-path="aside"]');
    await aside.locator('input[type="file"]').setInputFiles(join('tests', 'fixtures', 'render.jpg'));
    const img = aside.locator('img');
    await expect(img).toBeVisible({ timeout: 10_000 });
    await expect(img).toHaveAttribute('srcset', /800w/);

    // focal point: open the crosshair and drag
    await aside.hover();
    await aside.getByRole('button', { name: 'Set focal point' }).click();
    const slider = aside.getByRole('slider');
    const box = (await slider.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7, { steps: 5 });
    await page.mouse.up();
    await aside.getByRole('button', { name: 'Done' }).click();
    await expect(img).toHaveCSS('object-position', /80% 70%/);

    // a small image is shown framed, never upscaled
    await aside.hover();
    await aside.getByRole('button', { name: 'Replace photo' }).click({ force: true });
    await aside.locator('input[type="file"]').setInputFiles(join('tests', 'fixtures', 'small.png'));
    await expect(aside.locator('[data-framed="true"]')).toBeVisible({ timeout: 10_000 });

    // undo twice: the big render comes back, then the placeholder
    await page.getByTestId('undo').click();
    await expect(aside.locator('[data-framed="false"]')).toBeVisible();
    await page.getByTestId('undo').click(); // focal
    await page.getByTestId('undo').click(); // first image
    await expect(aside.locator('[role="img"]')).toBeVisible();
  });

  test('add a spread, change its template, delete it, and undo all of it', async ({ page, isMobile }) => {
    if (isMobile) await page.locator('main').click({ position: { x: 195, y: 500 } });
    await enterEdit(page, 'sonny');
    const countBefore = await page.locator('[data-spread-thumb]').count();

    await page.getByTestId('strip-add').click();
    await page.getByTestId('template-picker').locator('[data-template="gallery"]').click();
    await expect(page.locator('[data-spread-thumb]')).toHaveCount(countBefore + 1);
    await expect(page.locator('[data-template="gallery"][data-spread-index="20"]')).toBeAttached();

    await page.getByTestId('strip-template').click();
    await page.getByTestId('template-picker').locator('[data-template="moodboard"]').click();
    await expect(page.locator('[data-template="moodboard"][data-spread-index="20"]')).toBeAttached();

    await page.getByTestId('strip-delete').click();
    await expect(page.locator('[data-spread-thumb]')).toHaveCount(countBefore);

    await page.getByTestId('undo').click();
    await expect(page.locator('[data-spread-thumb]')).toHaveCount(countBefore + 1);
    await page.getByTestId('undo').click();
    await page.getByTestId('undo').click();
    await expect(page.locator('[data-spread-thumb]')).toHaveCount(countBefore);
  });

  test('save an edition and restore it', async ({ page, isMobile }) => {
    if (isMobile) await page.locator('main').click({ position: { x: 195, y: 500 } });
    await enterEdit(page, 'sonny');
    await page.getByTestId('open-editions').click();
    await page.getByTestId('edition-name').fill('Before the vanity');
    await page.getByTestId('save-edition').click();
    await expect(page.locator('[data-edition]')).toHaveCount(1);
    await page.keyboard.press('Escape');

    const title = page.locator('[data-spread-index="19"] [data-slot="title"]').first();
    await title.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Changed');
    await page.keyboard.press('Enter');
    await expect(title).toHaveText('Changed');

    await page.getByTestId('open-editions').click();
    await page.getByTestId('restore-edition').click();
    await expect(page.locator('[data-spread-index="19"] [data-slot="title"]').first()).toHaveText('Whoever is cooking faces whoever is talking');
  });
});
