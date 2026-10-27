import { expect, test } from '@playwright/test';
import { freshBook, goTo, startEditing, undoAll } from './helpers';

test.describe('galleries, boards, pins, palettes, decisions, lists', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'laptop', 'Runs at laptop size.');
    await freshBook(page, '#/p/sp-archer-vanities');
  });

  test('favourite two vanities and compare them side by side', async ({ page }) => {
    await startEditing(page);
    const spread = page.locator('[data-spread="sp-archer-vanities"]');
    await spread.locator('[data-item="it-vanity-03"] .heart').click();
    await spread.locator('[data-item="it-vanity-17"] .heart').click();
    await expect(spread.locator('[data-item="it-vanity-03"] .heart')).toHaveAttribute('aria-pressed', 'true');
    await expect(spread.locator('[data-item="it-vanity-03"] .card__loved [data-author="sonny"]')).toHaveCount(1);

    await spread.locator('[data-item="it-vanity-03"] .card__compare').click();
    await spread.locator('[data-item="it-vanity-17"] .card__compare').click();
    const drawer = page.getByRole('complementary', { name: 'Comparing options' });
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('.compare__col')).toHaveCount(2);
    await expect(drawer.getByText('Vanity No. 3')).toBeVisible();
    await expect(drawer.getByText('Sonny ♥').first()).toBeVisible();
    await drawer.getByRole('button', { name: 'Close' }).click();
    await expect(drawer).toHaveCount(0);

    await undoAll(page);
    await expect(spread.locator('[data-item="it-vanity-03"] .heart')).toHaveAttribute('aria-pressed', 'false');
  });

  test('favourites work while reading, asking who once', async ({ page }) => {
    const spread = page.locator('[data-spread="sp-archer-vanities"]');
    await spread.locator('[data-item="it-vanity-05"] .heart').click();
    await page.getByRole('dialog', { name: 'Who is holding the pen?' }).getByRole('button', { name: 'Adi' }).click();
    await expect(spread.locator('[data-item="it-vanity-05"] .card__loved [data-author="adi"]')).toHaveCount(1);
  });

  test('mood board: drag snaps to the grid, Alt frees it, one undo per gesture', async ({ page }) => {
    await goTo(page, 'sp-below-board');
    await startEditing(page);
    const text = page.locator('[data-spread="sp-below-board"] [data-el="el-below-6"]');
    const before = (await text.boundingBox())!;
    await page.mouse.move(before.x + 30, before.y + 20);
    await page.mouse.down();
    await page.mouse.move(before.x + 90, before.y + 60, { steps: 6 });
    await page.mouse.up();
    const after = (await text.boundingBox())!;
    expect(Math.abs(after.x - before.x - 60)).toBeLessThan(25);
    await expect(page.locator('.board-tools').getByRole('button', { name: 'Forward' })).toBeVisible();

    await page.locator('.board-tools').getByRole('button', { name: 'Note' }).click();
    await page.keyboard.type('Gym on the left wall.');
    await page.locator('.edit-bar').click({ position: { x: 300, y: 20 } });
    await expect(page.locator('[data-spread="sp-below-board"] .bel--note', { hasText: 'Gym on the left wall.' })).toBeVisible();

    await undoAll(page);
    const reset = (await text.boundingBox())!;
    expect(Math.abs(reset.x - before.x)).toBeLessThan(2);
    await expect(page.locator('.bel--note', { hasText: 'Gym on the left wall.' })).toHaveCount(0);
  });

  test('plan: add a pin and write its note', async ({ page }) => {
    await goTo(page, 'sp-kitchen-plan');
    await startEditing(page);
    const plate = page.locator('[data-spread="sp-kitchen-plan"] .plan__plate');
    const box = (await plate.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.3);
    await expect(plate.locator('.pin')).toHaveCount(6);
    await page.locator('.pin-edit .pin-card__title').click();
    await page.keyboard.type('Coffee corner');
    await page.keyboard.press('Enter');
    await page.locator('.pin-edit').getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.locator('[data-spread="sp-kitchen-plan"] .plan__legend')).toContainText('Coffee corner');
  });

  test('palette: Clean materials panel starts unchecked and records what is chosen', async ({ page }) => {
    await goTo(page, 'sp-kitchen-palette');
    await expect(page.locator('[data-spread="sp-kitchen-palette"] .clean--empty').first()).toContainText('Not yet checked');
    await startEditing(page);
    const cabinets = page.locator('[data-spread="sp-kitchen-palette"] [data-item="it-cabinets"]');
    await cabinets.locator('.clean__row', { hasText: 'Formaldehyde' }).locator('select').selectOption('tsca6');
    await cabinets.locator('.clean__row', { hasText: 'Core' }).locator('select').selectOption('composite');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(cabinets.locator('.clean')).toContainText('2 of 5 checked');
    await expect(cabinets.locator('.clean')).toContainText('TSCA Title VI');
    await goTo(page, 'sp-palette-library');
    await expect(page.locator('.lib__row', { hasText: 'Cabinets' })).toContainText('Composite · TSCA Title VI');
  });

  test('decisions and the shopping list feed Still to Decide', async ({ page }) => {
    await goTo(page, 'sp-still');
    await expect(page.locator('.still__list li')).toHaveCount(3);
    await expect(page.locator('.still__buy li')).toHaveCount(5);

    await goTo(page, 'sp-vault-decision');
    await startEditing(page);
    await page.locator('[data-spread="sp-vault-decision"] .thumb', { hasText: 'Direct-vent gas' }).getByRole('button', { name: 'Choose' }).click();
    await page.locator('[data-spread="sp-vault-decision"] .status-pick').getByRole('radio', { name: 'Decided' }).click();

    await goTo(page, 'sp-kitchen-shopping');
    const range = page.locator('[data-spread="sp-kitchen-shopping"] tr', { hasText: 'Range' }).first();
    await range.locator('select').selectOption('ordered');
    const fridge = page.locator('[data-spread="sp-kitchen-shopping"] tr', { hasText: 'Refrigerator' });
    await fridge.locator('td.shop__num .inline-edit').click();
    await page.keyboard.type('$2,399');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-spread="sp-kitchen-shopping"] .shop__sum')).toHaveText('$2,399');

    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await goTo(page, 'sp-still');
    await expect(page.locator('.still__list li')).toHaveCount(2);
    await expect(page.locator('.still__buy li')).toHaveCount(4);
    await expect(page.locator('.still__sum')).toHaveText('$2,399');
    await goTo(page, 'sp-vault-decision');
    await expect(page.locator('[data-spread="sp-vault-decision"] .decision__chosen')).toHaveText('Direct-vent gas');
  });
});
