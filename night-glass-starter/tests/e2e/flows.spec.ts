/** The app's behaviour with real pointer gestures, at phone size. */
import { expect, test } from '../support/app';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'phone', 'flows run at phone size'));

const title = (app: import('../support/app').App) => app.card.locator('.card__title').textContent();

test('first run: the welcome teaches the swipes, then gets out of the way', async ({ app }) => {
  await app.open({ onboarded: false });
  const welcome = app.page.getByRole('dialog', { name: 'Night Glass Starter' });
  await expect(welcome.getByText('Swipe right · Like')).toBeVisible();
  await welcome.getByRole('button', { name: 'Get started' }).click();
  await expect(welcome).toBeHidden();
  await expect(app.feedPosition).toHaveText('1/40');
});

test('swipe right likes and moves on; Undo brings the card back', async ({ app }) => {
  await app.open();
  const first = await title(app);
  await app.drag(200, 10);
  await expect(app.page.locator('.toast', { hasText: 'Liked' })).toBeVisible();
  await expect(app.feedPosition).toHaveText('2/40');
  expect(await title(app)).not.toBe(first);
  await app.page.getByRole('button', { name: 'Undo' }).click();
  await expect(app.feedPosition).toHaveText('1/40');
  expect(await title(app)).toBe(first);
  await expect(app.card.getByRole('button', { name: 'Like' })).toHaveAttribute('aria-pressed', 'false');
});

test('a short drag springs back without acting', async ({ app }) => {
  await app.open();
  await app.drag(40, 0, { steps: 20 });
  await expect(app.feedPosition).toHaveText('1/40');
  await expect(app.page.locator('.toast')).toHaveCount(0);
});

test('left passes, up saves, and saved cards land in the Library', async ({ app }) => {
  await app.open();
  await app.drag(-200, 0);
  await expect(app.page.locator('.toast', { hasText: 'Passed' })).toBeVisible();
  const saved = await title(app);
  await app.drag(0, -320);
  await expect(app.page.locator('.toast', { hasText: 'Saved' })).toBeVisible();
  await app.tab('Library');
  await expect(app.page.locator('.tile')).toHaveCount(1);
  await expect(app.page.locator('.tile__title')).toHaveText(saved!);
  await app.page.getByRole('button', { name: 'Play as feed' }).click();
  await expect(app.page.locator('.pathbar__label')).toHaveText('Saved');
});

test('down explores: a new feed from the card’s tag, and Undo goes back', async ({ app }) => {
  await app.open();
  const tag = (await app.card.locator('.tag-chip').first().textContent())!;
  await app.drag(0, 320);
  await expect(app.page.locator('.pathbar__label')).toHaveText(tag);
  await app.page.getByRole('button', { name: 'Undo' }).click();
  await expect(app.page.locator('.pathbar__label')).toHaveText('For You');
});

test('from the edge, a swipe moves between cards instead of judging; so do the mini buttons', async ({ app }) => {
  await app.open();
  await app.drag(0, -320, { from: { x: 8, y: 420 } });
  await expect(app.feedPosition).toHaveText('2/40');
  await expect(app.page.locator('.toast')).toHaveCount(0);
  await app.page.getByRole('button', { name: 'Previous card' }).click();
  await expect(app.feedPosition).toHaveText('1/40');
});

test('long-press opens the action sheet; dragging its handle down closes it', async ({ app }) => {
  await app.open();
  await app.longPress();
  const sheet = app.page.getByRole('dialog');
  await expect(sheet.getByRole('button', { name: 'Explore' })).toBeVisible();
  const grab = await app.page.locator('.sheet__grab').boundingBox();
  await app.page.mouse.move(grab!.x + grab!.width / 2, grab!.y + 6);
  await app.page.mouse.down();
  await app.page.mouse.move(grab!.x + grab!.width / 2, grab!.y + 160, { steps: 8 });
  await app.page.mouse.up();
  await expect(sheet).toBeHidden();
});

test('double-tap likes in place', async ({ app }) => {
  await app.open();
  await app.doubleTap();
  await expect(app.page.locator('.toast', { hasText: 'Liked' })).toBeVisible();
  await expect(app.feedPosition).toHaveText('1/40');
  await expect(app.card.getByRole('button', { name: 'Like' })).toHaveAttribute('aria-pressed', 'true');
});

test('a tap hides the overlay and another brings it back', async ({ app }) => {
  await app.open();
  await app.page.mouse.click(150, 400);
  await expect(app.page.locator('.pathbar--hidden')).toBeAttached();
  await app.page.waitForTimeout(350);
  await app.page.mouse.click(150, 400);
  await expect(app.page.locator('.pathbar--hidden')).toHaveCount(0);
});

test('keyboard: → likes, S saves, ↓ moves on', async ({ app }) => {
  await app.open();
  await app.page.keyboard.press('ArrowRight');
  await expect(app.feedPosition).toHaveText('2/40');
  await app.page.keyboard.press('s');
  await expect(app.feedPosition).toHaveText('3/40');
  await app.page.keyboard.press('ArrowDown');
  await expect(app.feedPosition).toHaveText('4/40');
});

test('likes and saves survive a reload', async ({ app }) => {
  await app.open();
  await app.page.keyboard.press('ArrowRight');
  await expect(app.feedPosition).toHaveText('2/40'); // input waits while a card is flying off
  await app.page.keyboard.press('s');
  await expect(app.feedPosition).toHaveText('3/40');
  await app.page.reload();
  await app.tab('You');
  await expect(app.page.locator('.stat--like b')).toHaveText('1');
  await expect(app.page.locator('.stat--save b')).toHaveText('1');
});

test('classic swipes: up moves to the next card instead of saving', async ({ app }) => {
  await app.open({ settings: { classic: true } });
  await app.drag(0, -320);
  await expect(app.feedPosition).toHaveText('2/40');
  await expect(app.page.locator('.toast')).toHaveCount(0);
});

test('reset asks twice before clearing everything', async ({ app }) => {
  await app.open({ judgments: { c1: 'like' } });
  await app.tab('You');
  await app.page.getByRole('button', { name: 'Reset everything' }).click();
  await expect(app.page.locator('.stat--like b')).toHaveText('1');
  await app.page.getByRole('button', { name: 'Tap again to reset everything' }).click();
  await expect(app.page.locator('.stat--like b')).toHaveText('0');
});
