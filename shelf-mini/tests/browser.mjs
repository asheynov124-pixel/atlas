// End-to-end checks in a real browser (Chromium via Playwright).
//
//   npm run test:browser
//
// Needs Playwright, which is NOT a dependency of the app:
//   npm install --no-save playwright && npx playwright install chromium
// Screenshots go to $SHOTS (default: <os tmp>/shelf-mini-shots).

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../tools/serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const SHOTS = process.env.SHOTS || join(tmpdir(), 'shelf-mini-shots');
mkdirSync(SHOTS, { recursive: true });

const IPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const SMALL_PHONE = { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 860 } };

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `  -> ${detail}` : ''}`);
}

const server = await startServer({ port: 0 });
const BASE = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();

/** A fresh browser profile (empty storage) with error collection. */
async function open(options = IPHONE, { init, path = '' } = {}) {
  const context = await browser.newContext(options);
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (error) => page.errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && page.errors.push(message.text()));
  await page.goto(BASE + path);
  await page.waitForFunction(() => document.querySelectorAll('#grid .card').length === 12);
  return { context, page };
}

const visibleIds = (page) => page.$$eval('#grid .card:not([hidden]) .card__link', (links) => links.map((a) => a.dataset.id));
const focusedId = (page) => page.evaluate(() => document.activeElement?.dataset.id || document.activeElement?.id || document.activeElement?.tagName);
const params = (page) => Object.fromEntries(new URL(page.url()).searchParams);
async function shot(page, name, fullPage = false) {
  // Let transitions and the entrance fade finish so the picture shows the settled screen.
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage });
}
const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const storedIds = (page) =>
  page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('shelf-mini:favorites'))?.ids ?? [];
    } catch {
      return 'unreadable';
    }
  });
const settle = (page) => page.waitForTimeout(80);

// ---- 1. The main journey, on an iPhone-sized screen ---------------------------
{
  const { context, page } = await open();
  check('journey: all 12 items show on load', (await visibleIds(page)).length === 12);
  check('journey: no horizontal scroll at 390px', await noHorizontalScroll(page));
  await shot(page, '01-collection');

  await page.locator('#search-input').tap();
  await page.keyboard.type('night');
  check('journey: search "night" finds 3 titles', (await visibleIds(page)).join() === 'night-ferry,nightjar,night-swim');
  check('journey: results line reads "3 of 12 titles"', (await page.textContent('#results-summary')) === '3 of 12 titles');

  await page.locator('.category', { hasText: 'Music' }).tap();
  check('journey: search + Music narrows to Night Swim', (await visibleIds(page)).join() === 'night-swim');
  check('journey: filters are in the URL', params(page).q === 'night' && params(page).category === 'music');
  await shot(page, '02-search-and-category');

  await page.locator('.card__link[data-id="night-swim"]').tap();
  await page.waitForSelector('#detail-view:not([hidden])');
  check('journey: detail opens with the title', (await page.textContent('#detail-title')) === 'Night Swim');
  check('journey: focus moves to the detail title', (await focusedId(page)) === 'detail-title');
  check('journey: page title names the item', (await page.title()) === 'Night Swim · Shelf Mini');
  const button = await page.locator('#favorite-button').boundingBox();
  check('journey: Favorite button is on screen without scrolling', button.y + button.height <= 844, JSON.stringify(button));

  await page.locator('#favorite-button').tap();
  check('journey: Favorite is pressed', (await page.getAttribute('#favorite-button', 'aria-pressed')) === 'true');
  check('journey: status says it was added', (await page.textContent('#favorite-status')) === 'Added to Favorites.');
  check('journey: favorite is in storage', (await storedIds(page)).includes('night-swim'));
  await page.waitForTimeout(400);
  await shot(page, '03-detail-favorited');

  await page.locator('#back-button').tap();
  await page.waitForSelector('#collection-view:not([hidden])');
  await settle(page);
  check('journey: back keeps the search text', (await page.inputValue('#search-input')) === 'night');
  check('journey: back keeps the Music category', await page.isChecked('.category__input[value="music"]'));
  check('journey: back shows the same results', (await visibleIds(page)).join() === 'night-swim');
  check('journey: focus returns to the card that was opened', (await focusedId(page)) === 'night-swim');
  check('journey: card shows the favorite heart', await page.isVisible('.card__link[data-id="night-swim"] .card__favorite'));
  check('journey: URL no longer names the item', !('item' in params(page)));
  await shot(page, '04-back-to-filtered');

  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('#grid .card').length === 12);
  check('journey: after refresh the filters are still there', (await visibleIds(page)).join() === 'night-swim');
  check('journey: after refresh the favorite is still there', await page.isVisible('.card__link[data-id="night-swim"] .card__favorite'));

  await page.locator('#clear-filters').tap();
  await settle(page);
  check('journey: Clear filters shows all 12 again', (await visibleIds(page)).length === 12);
  check('journey: focus goes to the results line after clearing', (await focusedId(page)) === 'results-summary');

  await page.locator('.toggle').tap();
  check('journey: Favorites filter shows only Night Swim', (await visibleIds(page)).join() === 'night-swim');
  check('journey: Favorites shows a count of 1', (await page.textContent('#favorites-count')) === '1');
  await shot(page, '05-favorites-after-refresh');
  check('journey: no script errors', page.errors.length === 0, page.errors.join(' | '));
  await context.close();
}

// ---- 2. Browser back, scroll position and Escape --------------------------------
{
  const { context, page } = await open();
  await page.locator('.card__link[data-id="orchard-nine"]').scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  await page.locator('.card__link[data-id="orchard-nine"]').tap();
  await page.waitForSelector('#detail-view:not([hidden])');
  check('history: detail opens at the top of the page', (await page.evaluate(() => window.scrollY)) === 0);
  await page.goBack();
  await page.waitForSelector('#collection-view:not([hidden])');
  await settle(page);
  const after = await page.evaluate(() => window.scrollY);
  check('history: browser Back restores the scroll position', Math.abs(after - before) < 4, `${before} -> ${after}`);
  check('history: browser Back returns focus to the card', (await focusedId(page)) === 'orchard-nine');
  await page.goForward();
  await page.waitForSelector('#detail-view:not([hidden])');
  check('history: browser Forward reopens the item', (await page.textContent('#detail-title')) === 'Orchard Nine');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#collection-view:not([hidden])');
  check('history: Escape closes the detail view', (await focusedId(page)) === 'orchard-nine');
  check('history: no script errors', page.errors.length === 0, page.errors.join(' | '));
  await context.close();
}

// ---- 3. Deep links ----------------------------------------------------------------
{
  const { context, page } = await open(IPHONE, { path: '?item=nightjar&category=book' });
  check('deep link: opens straight into the item', await page.isVisible('#detail-view'));
  await page.locator('#back-button').tap();
  await page.waitForSelector('#collection-view:not([hidden])');
  check('deep link: Back stays in the app and shows the collection', page.url().startsWith(BASE));
  check('deep link: Back keeps the category from the link', (await visibleIds(page)).join() === 'nightjar,salt-and-iron,the-quiet-engine');
  check('deep link: focus lands on the card', (await focusedId(page)) === 'nightjar');
  await page.goto(`${BASE}?item=not-a-real-thing&category=poetry`);
  await page.waitForFunction(() => document.querySelectorAll('#grid .card').length === 12);
  check('deep link: unknown item and category fall back to the collection', (await visibleIds(page)).length === 12);
  check('deep link: the bad URL is tidied', page.url() === BASE);
  await context.close();
}

// ---- 4. No results and clearing ------------------------------------------------------
{
  const { context, page } = await open();
  await page.fill('#search-input', 'zzz');
  check('empty: no matches shows the empty state', await page.isVisible('#empty-state'));
  check('empty: grid and results line are hidden', !(await page.isVisible('#grid')) && !(await page.isVisible('#summary')));
  check('empty: says what was searched', (await page.textContent('#empty-title')) === 'No titles match “zzz”');
  await shot(page, '06-no-results');
  await page.locator('#empty-clear').tap();
  await settle(page);
  check('empty: Clear search and filters brings back all 12', (await visibleIds(page)).length === 12);
  check('empty: search box is emptied', (await page.inputValue('#search-input')) === '');
  check('empty: focus moves to the results line', (await focusedId(page)) === 'results-summary');

  await page.fill('#search-input', 'night');
  await page.locator('.category', { hasText: 'Games' }).tap();
  check('empty: a narrowed dead end offers a wider search', (await page.textContent('#empty-widen')) === 'Show 3 matches in all titles');
  check('empty: the scope is explained', (await page.textContent('#empty-body')).startsWith("You're searching Games only."));
  await shot(page, '07-no-results-with-suggestion');
  await page.locator('#empty-widen').tap();
  await settle(page);
  check('empty: the suggestion keeps the search and drops the category', (await visibleIds(page)).length === 3 && (await page.isChecked('.category__input[value="all"]')));

  await page.locator('#clear-filters').tap();
  await page.locator('.toggle').tap();
  check('empty: Favorites with none saved explains how to add one', (await page.textContent('#empty-title')) === 'No favorites yet');
  check('empty: and offers a way back', (await page.textContent('#empty-clear')) === 'Browse all titles');
  await shot(page, '08-no-favorites-yet');

  await page.locator('#empty-clear').tap();
  await page.fill('#search-input', 'night');
  await page.keyboard.press('Escape');
  check('empty: Escape in the search box clears it', (await page.inputValue('#search-input')) === '' && (await visibleIds(page)).length === 12);
  await context.close();
}

// ---- 5. Keyboard only, on a desktop-sized window ----------------------------------------
{
  const { context, page } = await open(DESKTOP);
  const outline = () =>
    page.evaluate(() => {
      const el = document.activeElement;
      const face = el.matches('.category__input, .toggle__input') ? el.nextElementSibling : el;
      const style = getComputedStyle(face);
      return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
    });

  await page.keyboard.press('Tab');
  check('keyboard: first Tab reaches the search box', (await focusedId(page)) === 'search-input');
  await page.keyboard.type('the');
  await page.keyboard.press('Tab');
  check('keyboard: Tab reaches the labelled Clear search button', (await page.evaluate(() => document.activeElement.getAttribute('aria-label'))) === 'Clear search');
  await page.keyboard.press('Tab');
  check('keyboard: then the Favorites filter', (await focusedId(page)) === 'favorites-toggle');
  check('keyboard: Favorites filter shows a focus ring', await outline());
  await page.keyboard.press('Tab');
  check('keyboard: then the categories (All selected)', await page.evaluate(() => document.activeElement.value === 'all'));
  check('keyboard: category shows a focus ring', await outline());
  await page.keyboard.press('ArrowRight');
  check('keyboard: arrow keys change category', await page.isChecked('.category__input[value="film"]'));
  check('keyboard: "the" + Film = The Long Exposure', (await visibleIds(page)).join() === 'the-long-exposure');
  await page.keyboard.press('Tab');
  check('keyboard: then Clear filters', (await focusedId(page)) === 'clear-filters');
  await page.keyboard.press('Tab');
  check('keyboard: then the first result', (await focusedId(page)) === 'the-long-exposure');
  check('keyboard: card shows a focus ring', await outline());
  await shot(page, '09-keyboard-focus');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#detail-view:not([hidden])');
  await page.keyboard.press('Tab');
  check('keyboard: in detail, Tab reaches Favorite', (await focusedId(page)) === 'favorite-button');
  check('keyboard: Favorite shows a focus ring', await outline());
  await page.keyboard.press('Space');
  check('keyboard: Space toggles Favorite', (await page.getAttribute('#favorite-button', 'aria-pressed')) === 'true');
  await page.keyboard.press('Shift+Tab');
  check('keyboard: Shift+Tab reaches Back (the title is not a tab stop)', (await focusedId(page)) === 'back-button');
  await shot(page, '10-desktop-detail');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#collection-view:not([hidden])');
  check('keyboard: Back returns focus to the card', (await focusedId(page)) === 'the-long-exposure');
  await shot(page, '11-desktop-collection', true);
  check('keyboard: no script errors', page.errors.length === 0, page.errors.join(' | '));
  await context.close();
}

// ---- 6. Narrow phone ------------------------------------------------------------------------
{
  const { context, page } = await open(SMALL_PHONE);
  check('narrow: no horizontal scroll at 320px', await noHorizontalScroll(page));
  check('narrow: still two columns', await page.evaluate(() => getComputedStyle(document.getElementById('grid')).gridTemplateColumns.split(' ').length === 2));
  await page.locator('.category', { hasText: 'Games' }).tap();
  check('narrow: last category can be reached and chosen', await page.isChecked('.category__input[value="game"]'));
  await shot(page, '12-narrow-collection');
  await page.fill('#search-input', 'averyveryverylongsearchwordwithnospacesatallthatkeepsgoing');
  check('narrow: a long query does not push the page sideways', await noHorizontalScroll(page));
  await page.locator('#empty-clear').tap();
  await page.locator('.card__link[data-id="the-long-exposure"]').tap();
  await page.waitForSelector('#detail-view:not([hidden])');
  check('narrow: no horizontal scroll in detail', await noHorizontalScroll(page));
  await shot(page, '13-narrow-detail');

  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button, a, input, .category__face, .toggle__face')]
      .filter((el) => el.getClientRects().length && !el.closest('[hidden]') && !el.matches('.category__input, .toggle__input'))
      .map((el) => ({ el: el.id || el.className, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width < 44 || box.height < 44)
      .map(({ el, box }) => `${el} ${Math.round(box.width)}x${Math.round(box.height)}`),
  );
  check('narrow: every control in detail is at least 44x44', small.length === 0, small.join(', '));
  await page.locator('#back-button').tap();
  const smallCollection = await page.evaluate(() =>
    [...document.querySelectorAll('#collection-view button, #collection-view .category__face, #collection-view .toggle__face, #search-input')]
      .filter((el) => el.getClientRects().length)
      .map((el) => ({ el: el.id || el.className, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width < 44 || box.height < 44)
      .map(({ el, box }) => `${el} ${Math.round(box.width)}x${Math.round(box.height)}`),
  );
  check('narrow: every control in the collection is at least 44x44', smallCollection.length === 0, smallCollection.join(', '));
  await context.close();
}

// ---- 7. Storage failures --------------------------------------------------------------------
{
  // 7a. Writes always fail (storage full, or a browser that refuses to save).
  const fullStorage = () => {
    Storage.prototype.setItem = function () {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
  };
  const { context, page } = await open(IPHONE, { init: fullStorage });
  check('storage full: app still loads all 12', (await visibleIds(page)).length === 12);
  check('storage full: a plain-language notice explains it', (await page.textContent('#storage-notice-text')).startsWith("Favorites can't be saved in this browser right now."));
  await shot(page, '14-storage-unavailable');
  await page.locator('.card__link[data-id="lanternfall"]').tap();
  check('storage full: detail warns before you tap', await page.isVisible('#favorite-hint'));
  await page.locator('#favorite-button').tap();
  check('storage full: Favorite still works for this visit', (await page.getAttribute('#favorite-button', 'aria-pressed')) === 'true');
  const status = await page.textContent('#favorite-status');
  check('storage full: status does not claim it was saved', status === 'Added for this visit only.' && !/saved/i.test(status), status);
  await shot(page, '15-storage-unavailable-detail');
  await page.locator('#back-button').tap();
  check('storage full: the card shows the visit-only favorite', await page.isVisible('.card__link[data-id="lanternfall"] .card__favorite'));
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('#grid .card').length === 12);
  check('storage full: after refresh it is gone, as the message said', !(await page.isVisible('.card__link[data-id="lanternfall"] .card__favorite')));
  check('storage full: no script errors', page.errors.length === 0, page.errors.join(' | '));
  await context.close();
}
{
  // 7b. The localStorage property itself throws (storage blocked entirely).
  const blocked = () => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
  };
  const { context, page } = await open(IPHONE, { init: blocked });
  check('storage blocked: app loads', (await visibleIds(page)).length === 12);
  check('storage blocked: notice shown', await page.isVisible('#storage-notice'));
  await page.locator('.card__link[data-id="tilewright"]').tap();
  await page.locator('#favorite-button').tap();
  check('storage blocked: favoriting works for this visit', (await page.textContent('#favorite-status')) === 'Added for this visit only.');
  check('storage blocked: no script errors', page.errors.length === 0, page.errors.join(' | '));
  await context.close();
}
{
  // 7c. The saved value is damaged.
  const damaged = () => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('shelf-mini:favorites', '{"format":1,"ids":[oops');
      sessionStorage.setItem('seeded', '1');
    }
  };
  const { context, page } = await open(IPHONE, { init: damaged });
  check('storage damaged: app loads', (await visibleIds(page)).length === 12);
  check('storage damaged: notice says earlier favorites could not be opened', (await page.textContent('#storage-notice-text')).startsWith("Your earlier favorites couldn't be opened"));
  await shot(page, '16-storage-damaged');
  await page.locator('.card__link[data-id="velvet-static"]').tap();
  await page.locator('#favorite-button').tap();
  check('storage damaged: new favorites save normally', (await page.textContent('#favorite-status')) === 'Added to Favorites.');
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('#grid .card').length === 12);
  check('storage damaged: after refresh the new favorite is there and the notice is gone', (await storedIds(page)).join() === 'velvet-static' && !(await page.isVisible('#storage-notice')));
  await context.close();
}
{
  // 7d. Saving fails partway through a visit, then recovers.
  const flaky = () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (window.__failWrites && key === 'shelf-mini:favorites') throw new DOMException('full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  };
  const { context, page } = await open(IPHONE, { init: flaky });
  const favorite = async (id) => {
    await page.goto(`${BASE}?item=${id}`);
    await page.waitForSelector('#detail-view:not([hidden])');
    await page.locator('#favorite-button').tap();
    return page.textContent('#favorite-status');
  };
  await favorite('nightjar');
  await page.evaluate(() => (window.__failWrites = true));
  await page.locator('#back-button').tap();
  await page.locator('.card__link[data-id="night-ferry"]').tap();
  await page.locator('#favorite-button').tap();
  check('storage flaky: a failed save is reported honestly', (await page.textContent('#favorite-status')) === 'Added for this visit only.');
  await page.locator('#back-button').tap();
  check('storage flaky: the notice appears in the collection', await page.isVisible('#storage-notice'));
  await page.evaluate(() => (window.__failWrites = false));
  await page.locator('.card__link[data-id="orchid-house"]').tap();
  await page.locator('#favorite-button').tap();
  check('storage flaky: once saving works again it says so', (await page.textContent('#favorite-status')) === 'Added to Favorites.');
  check('storage flaky: the visit-only favorite is saved too, not lost', (await storedIds(page)).sort().join() === 'night-ferry,nightjar,orchid-house');
  await page.locator('#back-button').tap();
  check('storage flaky: the notice goes away', !(await page.isVisible('#storage-notice')));
  await context.close();
}

// ---- 8. Two tabs ------------------------------------------------------------------------------
{
  const context = await browser.newContext(IPHONE);
  const tabA = await context.newPage();
  const tabB = await context.newPage();
  await tabA.goto(`${BASE}?item=night-swim`);
  await tabB.goto(BASE);
  await tabB.waitForFunction(() => document.querySelectorAll('#grid .card').length === 12);
  await tabA.locator('#favorite-button').tap();
  await tabB.waitForTimeout(150);
  check('two tabs: a favorite added in one tab shows in the other', await tabB.isVisible('.card__link[data-id="night-swim"] .card__favorite'));
  // Tab A still thinks only night-swim is a favorite; tab B adds another.
  await tabB.locator('.card__link[data-id="lanternfall"]').tap();
  await tabB.locator('#favorite-button').tap();
  await tabA.goto(`${BASE}?item=nightjar`);
  await tabA.locator('#favorite-button').tap();
  const ids = await tabA.evaluate(() => JSON.parse(localStorage.getItem('shelf-mini:favorites')).ids.sort().join());
  check('two tabs: saving in one tab never overwrites the other', ids === 'lanternfall,night-swim,nightjar', ids);
  await context.close();
}

// ---- 9. Reduced motion -------------------------------------------------------------------------
{
  const { context, page } = await open({ ...IPHONE, reducedMotion: 'reduce' });
  await page.locator('.card__link[data-id="paper-satellites"]').tap();
  await page.locator('#favorite-button').tap();
  const motion = await page.evaluate(() => ({
    view: getComputedStyle(document.getElementById('detail-view')).animationName,
    heart: getComputedStyle(document.querySelector('#favorite-button .heart')).animationName,
    button: getComputedStyle(document.getElementById('favorite-button')).transitionDuration,
  }));
  check('reduced motion: no view animation, heart pop or transitions', motion.view === 'none' && motion.heart === 'none' && motion.button === '0s', JSON.stringify(motion));
  await context.close();
  const normal = await open();
  await normal.page.locator('.card__link[data-id="paper-satellites"]').tap();
  check('reduced motion: animation is on when motion is allowed', (await normal.page.evaluate(() => getComputedStyle(document.getElementById('detail-view')).animationName)) === 'enter');
  await normal.context.close();
}

// ---- 10. Opened as a file ---------------------------------------------------------------------------
{
  const context = await browser.newContext(IPHONE);
  const page = await context.newPage();
  await page.goto(new URL('../index.html', import.meta.url).href);
  await page.waitForTimeout(300);
  check('file://: explains how to open it instead of a blank page', await page.isVisible('#file-warning'));
  await context.close();
}

await browser.close();
server.close();

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${SHOTS}`);
if (failed.length) process.exitCode = 1;

