import { expect, test, type Page } from '@playwright/test';

const VANITIES = '#/i/29';
const REST_BOARD = '#/i/39';
const KITCHEN_PINS = '#/i/22';
const APPLIANCES = '#/i/24';
const VAULT_DECISION = '#/i/17';

async function fresh(page: Page, hash: string) {
  await page.goto(`/${hash}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    indexedDB.deleteDatabase('sixteen-bannehr');
    localStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle' });
}

async function enterEdit(page: Page, isMobile: boolean, who: 'sonny' | 'adi' = 'sonny') {
  if (isMobile) await page.locator('main').click({ position: { x: 195, y: 500 } });
  await page.getByTestId('mode-toggle').click();
  const prompt = page.getByTestId('author-prompt');
  if (await prompt.isVisible().catch(() => false)) await page.getByTestId(`author-${who}`).click();
  await expect(page.getByTestId('strip')).toBeVisible();
}

test.describe('Galleries, boards, pins, lists', () => {
  test('favourite two vanities as Sonny, compare them side by side, and see the hearts after a reload', async ({ page, isMobile }) => {
    await fresh(page, VANITIES);
    const spread = page.locator('[data-spread-index="29"]');
    const tiles = spread.locator('[data-item-id]');
    // first heart asks who is editing
    await tiles.nth(0).getByTestId('heart').click();
    await page.getByTestId('author-sonny').click();
    await tiles.nth(0).getByTestId('heart').click();
    await tiles.nth(3).getByTestId('heart').click();
    await expect(tiles.nth(0).getByTestId('heart')).toHaveAttribute('data-sonny', 'true');
    await expect(tiles.nth(3).getByTestId('heart')).toHaveAttribute('data-sonny', 'true');

    await tiles.nth(0).getByTestId('compare-toggle').click();
    await tiles.nth(3).getByTestId('compare-toggle').click();
    const drawer = page.getByTestId('compare-drawer');
    await expect(drawer).toBeVisible();
    if (isMobile) await drawer.getByTestId('compare-open').click();
    await expect(drawer.locator('[data-compare-item]')).toHaveCount(2);
    await expect(drawer).toContainText('Vanity 01');
    await expect(drawer).toContainText('Vanity 04');

    await page.waitForTimeout(600);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('[data-spread-index="29"] [data-item-id]').nth(0).getByTestId('heart')).toHaveAttribute('data-sonny', 'true');
  });

  test('mood board: add a swatch, drag it with snapping, delete it, undo', async ({ page, isMobile }) => {
    test.skip(isMobile, 'pointer drags are checked on the desk');
    await fresh(page, REST_BOARD);
    await enterEdit(page, isMobile);
    const board = page.getByTestId('moodboard');
    const before = await board.locator('[data-el-id]').count();
    await page.getByTestId('board-add-swatch').click();
    await expect(board.locator('[data-el-id]')).toHaveCount(before + 1);
    const el = board.locator('[data-el-id][data-selected="true"]');
    await expect(el).toBeVisible();
    const b = (await el.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 120, b.y + b.height / 2 + 80, { steps: 8 });
    await page.mouse.up();
    const after = (await el.boundingBox())!;
    expect(after.x).toBeGreaterThan(b.x + 60);
    // snapped: left is on the 5% grid of the board
    const boardBox = (await board.boundingBox())!;
    const pct = ((after.x - boardBox.x) / boardBox.width) * 100;
    expect(Math.abs(pct / 5 - Math.round(pct / 5))).toBeLessThan(0.15);
    await page.getByTestId('board-delete').click();
    await expect(board.locator('[data-el-id]')).toHaveCount(before);
    await page.getByTestId('undo').click();
    await expect(board.locator('[data-el-id]')).toHaveCount(before + 1);
  });

  test('plan: tap to add a pin, name it, and it appears in the key', async ({ page, isMobile }) => {
    await fresh(page, KITCHEN_PINS);
    await enterEdit(page, isMobile);
    const spread = page.locator('[data-spread-index="22"]');
    const figure = spread.getByTestId('pins-figure');
    const before = await figure.locator('[data-pin-id]').count();
    const fb = (await figure.boundingBox())!;
    await page.mouse.click(fb.x + fb.width * 0.5, fb.y + fb.height * 0.5);
    await expect(figure.locator('[data-pin-id]')).toHaveCount(before + 1);
    const row = spread.locator('[data-pin-row]').last();
    await row.locator('[data-slot^="pin:"][data-slot$=":title"]').click();
    await page.keyboard.type('Pot filler');
    await page.keyboard.press('Enter');
    await expect(row).toContainText('Pot filler');
  });

  test('shopping list: add a row with a price and the total follows', async ({ page, isMobile }) => {
    await fresh(page, APPLIANCES);
    await enterEdit(page, isMobile);
    const spread = page.locator('[data-spread-index="24"]');
    await spread.getByTestId('row-add').click();
    const row = spread.locator('[data-row-id]').last();
    await row.locator('[data-slot$=":name"]').click();
    await page.keyboard.type('Pot filler');
    await page.keyboard.press('Enter');
    await row.getByTestId('row-price').fill('349');
    await row.getByTestId('row-status').selectOption('ordered');
    await expect(spread.getByTestId('shopping-total')).toHaveText('$349');
  });

  test('decision: choose an option and the status becomes Decided', async ({ page, isMobile }) => {
    await fresh(page, VAULT_DECISION);
    await enterEdit(page, isMobile);
    const spread = page.locator('[data-spread-index="17"]');
    await spread.locator('[data-option-id]').nth(2).getByTestId('choose-option').click();
    await expect(spread.locator('[data-option-id]').nth(2)).toHaveAttribute('data-chosen', 'true');
    await expect(spread.getByTestId('decision-status')).toHaveValue('decided');
    await expect(spread).toContainText('Direct-vent gas');
  });
});
