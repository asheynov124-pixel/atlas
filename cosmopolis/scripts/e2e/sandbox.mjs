/**
 * E2E playtest — sandbox, driven through the real interface with touch taps (run with --device iphone):
 *   main menu → Sandbox → Instant City → god powers (tornado drawn with a finger, meteor, tsunami, black hole +
 *   Rewind) → Architect Studio (template → save → "Place it" → tap the city) → Star map: system + galaxy views,
 *   travel to another planet and back → save (More › Save game) → reload the page → Continue → photo mode.
 *
 *   node scripts/shot.mjs --script scripts/e2e/sandbox.mjs --query "" --device iphone --timeout 120000 --out .shots/e2e --name sandbox
 *
 * Sections can be skipped for quick iteration: E2E_SKIP=god,studio,cosmos,save,photo
 */
import { escape, expect, info, installHelpers, landNearCamera, layoutAudit, sleep, step, tap, tapButton, tapTile, tileScreen, touchDrag, until } from './lib.mjs';

const skip = new Set((process.env.E2E_SKIP ?? '').split(',').filter(Boolean));

async function audit(page, where) {
  const issues = await layoutAudit(page);
  if (issues.length) console.log(`  ! layout (${where}):\n    ` + issues.join('\n    '));
  return issues;
}

const buildings = (page) => page.evaluate(() => window.__cosmo.game.planet?.buildings.size ?? 0);

async function waitSettled(page) {
  await until(
    page,
    () => {
      const c = window.__cosmo.game.camera;
      const last = window.__e2eLastD ?? -1;
      window.__e2eLastD = c.distance;
      return Math.abs(c.distance - last) < 0.05;
    },
    { timeout: 90000, poll: 500, what: 'camera to settle' },
  );
}

/** Open the god panel from the right rail, pick the category tab and arm a power by name. */
async function armPower(page, name, category) {
  await tap(page, '.rl-btn[aria-label="God powers"]');
  await until(page, () => !!document.querySelector('.gd-card'), { what: 'god panel' });
  await sleep(page, 500);
  const tab = page.getByRole('tab', { name: category, exact: true }).first();
  if ((await tab.getAttribute('aria-selected')) !== 'true') {
    await tab.scrollIntoViewIfNeeded();
    await tab.tap();
    await sleep(page, 600);
  }
  const card = page.locator(`.gd-card[aria-label^="${name}."]`).first();
  await card.scrollIntoViewIfNeeded();
  await card.tap();
  await sleep(page, 600);
}

/** Tap the Star map rail button; report (and retry once) if the view does not change. */
async function openStarMap(page) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await tap(page, '.rl-btn[aria-label="Star map"]');
    try {
      await until(page, () => window.__cosmo.debugInfo().view === 'system', { timeout: 30000, what: 'system view' });
      return;
    } catch (e) {
      const st = await page.evaluate(() => ({ view: window.__cosmo.debugInfo().view, cx: window.__cosmos?.state?.(), top: document.elementFromPoint(715, 185)?.outerHTML.slice(0, 120) }));
      console.log(`   ! Star map tap #${attempt + 1} did not open the system view: ${JSON.stringify(st)}`);
      if (attempt === 1) throw e;
    }
  }
}

export default async ({ page, shot }) => {
  page.on('dialog', (d) => d.accept().catch(() => {}));

  // ── main menu → sandbox with an Instant City
  step('main menu → Sandbox → Instant City');
  await tap(page, 'button.mm-mode:has-text("Sandbox")');
  await until(page, () => !!document.querySelector('.ng-modal'), { what: 'new game modal' });
  await tapButton(page, 'Instant City', { role: 'radio' });
  await shot('new-sandbox');
  await audit(page, 'new sandbox');
  await tapButton(page, 'Launch');
  await until(page, () => window.__cosmo.debugInfo().screen === 'game' && (window.__cosmo.game.planet?.buildings.size ?? 0) > 20, { timeout: 120000, what: 'instant city' });
  expect((await page.evaluate(() => window.__cosmo.game.empire.s.mode)) === 'sandbox', 'sandbox mode');
  await waitSettled(page);
  await sleep(page, 1500);
  await shot('instant-city');
  await audit(page, 'instant city');
  const homeId = await page.evaluate(() => window.__cosmo.game.planet.spec.id);
  const b0 = await buildings(page);
  step(`instant city: ${b0} buildings on ${homeId}`);

  // ── god powers
  if (!skip.has('god')) {
    step('god: Tornado — draw its path with a finger');
    await armPower(page, 'Tornado', 'Weather');
    await installHelpers(page);
    const land = await landNearCamera(page, 6);
    expect(land.tiles.length > 10, 'land on screen for the tornado');
    const p0 = await tileScreen(page, land.tiles[Math.min(land.tiles.length - 1, 12)]);
    const p1 = await tileScreen(page, land.tiles[0]);
    await touchDrag(page, p0, p1, 10);
    await until(page, () => window.__cosmo.game.god.active > 0, { timeout: 20000, what: 'tornado to start' });
    await sleep(page, 2500);
    await shot('tornado');
    await escape(page);

    step('god: Meteor — tap the city');
    await armPower(page, 'Meteor', 'Sky');
    const land2 = await landNearCamera(page, 5);
    await tapTile(page, land2.tiles[3] ?? land2.tiles[0]);
    await sleep(page, 3500);
    await shot('meteor');
    await escape(page);

    step('god: Tsunami — tap the coast');
    await armPower(page, 'Tsunami', 'Earth');
    const coast = await page.evaluate(() => {
      const g = window.__cosmo.game, p = g.planet, grid = p.grid;
      const c = g.camera.targetTile();
      for (let r = 0; r < 14; r++) for (const t of grid.ring(c, r)) if (!p.isWater(t) && grid.neighbors(t).some((n) => p.isWater(n)) && window.__e2e.tappable(t)) return t;
      return -1;
    });
    if (coast >= 0) await tapTile(page, coast);
    else await tapTile(page, land2.tiles[1] ?? land2.tiles[0]);
    await sleep(page, 4000);
    await shot('tsunami');
    await escape(page);

    step('god: Black Hole — confirm, then Rewind');
    const before = await buildings(page);
    await armPower(page, 'Black Hole', 'Apocalypse');
    // planet-ending powers ask first
    await until(page, () => !!document.querySelector('.cz-modal-root.is-shown [role="dialog"], .cz-confirm, [role="alertdialog"]'), { timeout: 15000, what: 'confirmation dialog' });
    await shot('blackhole-confirm');
    await tapButton(page, 'End this world');
    await sleep(page, 6000);
    await shot('blackhole');
    await until(page, () => !!document.querySelector('.gd-rewind'), { timeout: 180000, poll: 1000, what: 'the rewind offer' });
    await shot('rewind-offer');
    await audit(page, 'rewind offer');
    await tapButton(page, 'Rewind time');
    await until(page, (n) => !document.querySelector('.gd-rewinding') && (window.__cosmo.game.planet?.buildings.size ?? 0) >= n * 0.8, { arg: before, timeout: 120000, poll: 1000, what: 'the world to be restored' });
    await sleep(page, 2000);
    await shot('rewound');
    step(`after rewind: ${await buildings(page)} buildings (before black hole ${before})`);
  }

  // ── Architect Studio: template → save → place
  if (!skip.has('studio')) {
    step('studio: open, pick a template, save, place it');
    await tap(page, '.rl-btn[aria-label="Architect Studio"]');
    await until(page, () => !!document.querySelector('.st-top'), { timeout: 30000, what: 'studio' });
    await sleep(page, 1500);
    await shot('studio');
    await audit(page, 'studio');
    // Templates tab → first template card
    await tapButton(page, 'Templates', { role: 'tab' }).catch(async () => tap(page, 'button:has-text("Templates")'));
    await sleep(page, 800);
    const tpl = page.locator('.st-tpl, .st-template, .st-tpl-card').first();
    if (await tpl.isVisible().catch(() => false)) await tpl.tap();
    await sleep(page, 1200);
    await page.locator('.st-name-input').fill('E2E Tower');
    await tap(page, '.st-savebtn');
    await until(page, () => !!document.querySelector('.st-saved'), { timeout: 20000, what: 'saved banner' });
    await shot('studio-saved');
    await tapButton(page, 'Place it');
    await until(page, () => window.__cosmo.game.tools.current?.id === 'plop' && !document.querySelector('.st-top'), { timeout: 20000, what: 'plop tool with the design' });
    await sleep(page, 1500);
    const defId = await page.evaluate(() => window.__cosmo.game.tools.current?.itemId);
    expect(String(defId).length > 0, 'design armed for placement');
    const spots = await landNearCamera(page, 8);
    let placed = false;
    for (const t of spots.tiles.slice().reverse()) {
      const n0 = await buildings(page);
      await tapTile(page, t).catch(() => {});
      await sleep(page, 900);
      if ((await buildings(page)) > n0) {
        placed = await page.evaluate((id) => [...window.__cosmo.game.planet.buildings.values()].some((b) => b.defId === id), defId);
        if (placed) break;
      }
    }
    expect(placed, 'custom design placed in the city');
    await sleep(page, 1000);
    await shot('studio-placed');
    await escape(page, 2);
  }

  // ── cosmos: system + galaxy views, travel and back
  if (!skip.has('cosmos')) {
    step('cosmos: Star map → system view');
    await openStarMap(page);
    await sleep(page, 2500);
    await shot('system');
    await audit(page, 'system view');
    step('cosmos: galaxy view via the breadcrumb');
    const crumbs = page.locator('.cx-trail-item:not([disabled])');
    if ((await crumbs.count()) > 0) {
      await crumbs.last().tap();
      await until(page, () => window.__cosmo.debugInfo().view === 'galaxy', { timeout: 60000, what: 'galaxy view' }).catch(() => {});
      await sleep(page, 2500);
      await shot('galaxy');
      // back into our system
      await page.evaluate(() => window.__cosmos?.openView('system'));
      await until(page, () => window.__cosmo.debugInfo().view === 'system', { timeout: 60000, what: 'system view again' });
      await sleep(page, 2000);
    }
    step('cosmos: select another planet and land on it');
    // a planet label that is visible and not under the HUD (its centre hit-tests to itself)
    const idx = await until(
      page,
      () => {
        const els = [...document.querySelectorAll('.cx-label.kind-planet')];
        const i = els.findIndex((el) => {
          if (el.classList.contains('is-current') || el.classList.contains('is-locked')) return false;
          if (el.style.visibility === 'hidden' || Number(el.style.opacity) < 0.3) return false;
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!top && el.contains(top);
        });
        return i >= 0 ? i + 1 : 0;
      },
      { timeout: 30000, what: 'an uncovered planet label' },
    );
    await page.locator('.cx-label.kind-planet').nth(idx - 1).tap();
    await sleep(page, 1200);
    await shot('planet-card');
    await audit(page, 'planet card');
    const land = page.locator('.cx-card button:has-text("Land on"), .cx-card button:has-text("Travel to")').first();
    await land.tap();
    await until(page, (home) => window.__cosmo.debugInfo().view === 'planet' && window.__cosmo.game.planet && window.__cosmo.game.planet.spec.id !== home, { arg: homeId, timeout: 180000, poll: 1000, what: 'arrival on the new planet' });
    await sleep(page, 4000);
    await shot('new-planet');
    step('cosmos: travel back home');
    await openStarMap(page);
    await sleep(page, 2000);
    // the Colonies list (side button) is the dependable way home, wherever the home world sits on screen
    await tap(page, '.cx-side-btn[aria-label="Colonies"]');
    const homeCity = await page.evaluate((id) => window.__cosmo.game.empire.s.planets[id]?.city?.name ?? '', homeId);
    await until(page, () => !!document.querySelector('.ph-colonies, .ph-panel'), { what: 'colonies panel' });
    await sleep(page, 800);
    await shot('colonies');
    await audit(page, 'colonies');
    await tap(page, `button[aria-label="Travel to ${homeCity}"]`);
    await until(page, (home) => window.__cosmo.debugInfo().view === 'planet' && window.__cosmo.game.planet?.spec.id === home, { arg: homeId, timeout: 180000, poll: 1000, what: 'return home' });
    await sleep(page, 3000);
    const bHome = await buildings(page);
    expect(bHome >= b0 * 0.6, `home city intact after the round trip (${bHome} buildings)`);
    await shot('home-again');
  }

  // ── save, reload, load
  if (!skip.has('save')) {
    step('save: More → Save game');
    await tapButton(page, 'More', { exact: true });
    await until(page, () => !!document.querySelector('.mo-sheet .mo-row'), { what: 'more sheet' });
    await tap(page, '.mo-row:has-text("Save game")');
    await until(page, () => !!document.querySelector('.cz-toast'), { timeout: 20000, what: 'saved toast' }).catch(() => {});
    await sleep(page, 1500);
    const city = await page.evaluate(() => window.__cosmo.game.planet.city.name);
    const nB = await buildings(page);
    step(`saved "${city}" with ${nB} buildings — reloading the page`);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__cosmo && window.__cosmo.ready === true, null, { timeout: 120000 });
    await until(page, () => !!document.querySelector('.mm-continue'), { timeout: 30000, what: 'Continue card' });
    await shot('menu-continue');
    await tap(page, '.mm-continue');
    await until(page, () => window.__cosmo.debugInfo().screen === 'game' && !!window.__cosmo.game.planet, { timeout: 120000, what: 'loaded game' });
    await sleep(page, 3000);
    const nB2 = await buildings(page);
    const city2 = await page.evaluate(() => window.__cosmo.game.planet.city.name);
    expect(city2 === city, `same city after load (${city2})`);
    expect(Math.abs(nB2 - nB) <= Math.max(3, nB * 0.05), `buildings survive the save (${nB} → ${nB2})`);
    await shot('loaded');
  }

  // ── photo mode
  if (!skip.has('photo')) {
    step('photo mode');
    await tap(page, '.rl-btn[aria-label="Photo mode"]');
    await until(page, () => !!document.querySelector('.ph-root'), { timeout: 20000, what: 'photo mode' });
    await sleep(page, 1500);
    await shot('photo');
    await audit(page, 'photo mode');
    await escape(page);
    await sleep(page, 800);
  }
  const end = await info(page);
  step(`end: ${end.buildings} buildings, view ${end.view}, ${JSON.stringify(end.render)}`);
};
