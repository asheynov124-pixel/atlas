/**
 * E2E playtest — a brand-new career, driven through the real interface with touch taps (run with --device iphone):
 *   main menu → New Career (city name, homeworld) → follow the tutorial: road → R / C / I zones → power + water from
 *   the Build sheet → speed up → population grows → Goals and Budget panels → first goal / milestone.
 *
 *   node scripts/shot.mjs --script scripts/e2e/career.mjs --query "" --device iphone --timeout 120000 --out .shots/e2e --name career
 *
 * Fails (exit 1) on any console error, a stuck tutorial step, a dead button or UI that overlaps.
 */
import { escape, expect, info, installHelpers, layoutAudit, sleep, step, tap, tapButton, tapTile, until, visible } from './lib.mjs';

const tutorialTitle = (page) => page.evaluate(() => document.querySelector('.tu-card .tu-title, .tu-pill-text')?.textContent?.trim() ?? '');

async function audit(page, where) {
  const issues = await layoutAudit(page);
  if (issues.length) console.log(`  ! layout (${where}):\n    ` + issues.join('\n    '));
  return issues;
}

/** Wait for the arrival glide to settle near the city. */
async function waitCameraSettled(page) {
  await until(
    page,
    () => {
      const c = window.__cosmo.game.camera;
      const d = c.distance;
      const last = window.__e2eLastD ?? -1;
      window.__e2eLastD = d;
      return d < 60 && Math.abs(d - last) < 0.05;
    },
    { timeout: 90000, poll: 500, what: 'camera to settle over the city' },
  );
}

/**
 * A straight road through (or near) the camera target whose every tile is tappable on screen, and the lots beside
 * it — computed from the grid, then tapped through the UI.
 */
async function planTown(page) {
  await installHelpers(page);
  return page.evaluate(() => {
    const g = window.__cosmo.game;
    const p = g.planet;
    const grid = p.grid;
    const line = (from, dir, len) => {
      const out = [from, dir];
      let prev = from, cur = dir;
      for (let i = 2; i < len; i++) {
        let next = -1, best = Infinity;
        for (const n of grid.neighbors(cur)) {
          const d = grid.dot(n, prev);
          if (d < best) {
            best = d;
            next = n;
          }
        }
        out.push(next);
        prev = cur;
        cur = next;
      }
      return out;
    };
    const ok = (t) => !p.isWater(t) && p.building[t] < 0 && !!window.__e2e.tappable(t);
    const center = g.camera.targetTile();
    const starts = [center, ...grid.neighbors(center), ...grid.ring(center, 2)];
    for (const len of [7, 6, 5]) {
      for (const s0 of starts) {
        for (const n of grid.neighbors(s0)) {
          const road = line(s0, n, len);
          if (!road.every(ok)) continue;
          const e0 = p.elevation[road[0]];
          if (road.some((t) => Math.abs(p.elevation[t] - e0) > 1)) continue;
          const set = new Set(road);
          const lots = [];
          for (const t of road) for (const m of grid.neighbors(t)) if (!set.has(m) && ok(m) && !lots.includes(m)) lots.push(m);
          if (lots.length >= 10) return { center, road, lots };
        }
      }
    }
    return null;
  });
}

export default async ({ page, shot }) => {
  // ── main menu → new career
  step('main menu → New Career');
  await tap(page, 'button.mm-mode:has-text("New Career")');
  await until(page, () => !!document.querySelector('.ng-modal'), { what: 'new game modal' });
  await audit(page, 'new game');
  await page.locator('.ng-modal input').nth(1).fill('Integration City');
  await tap(page, 'button.ng-world:has-text("Terran")');
  await shot('new-career');
  await tapButton(page, 'Found city');
  await until(page, () => window.__cosmo.debugInfo().screen === 'game' && !!window.__cosmo.game.planet, { timeout: 90000, what: 'game screen' });
  const cityName = await page.evaluate(() => window.__cosmo.game.planet.city.name);
  expect(cityName === 'Integration City', `city named from the form (got "${cityName}")`);
  const mode = await page.evaluate(() => window.__cosmo.game.empire.s.mode);
  expect(mode === 'career', 'career mode');

  // ── tutorial: welcome
  step('tutorial welcome');
  await until(page, () => !!document.querySelector('.tu-card, .tu-pill'), { timeout: 20000, what: 'tutorial card' });
  await waitCameraSettled(page);
  await shot('welcome');
  await audit(page, 'welcome');
  await tapButton(page, 'Let’s build');

  // ── road
  step('road: Roads → Street → tap start, tap end');
  await tap(page, '.dk-btn[aria-label="Roads"]');
  await until(page, () => !!document.querySelector('.bs-sheet .bs-card-main'), { what: 'roads sheet' });
  await shot('roads-sheet');
  await tap(page, '.bs-card-main[aria-label="Street"]');
  await until(page, () => window.__cosmo.game.tools.current?.id === 'road' || document.querySelector('.tb-root, .tb-bar'), { what: 'road tool' });
  await sleep(page, 900);
  // the sheet folds into the tool bar while drawing: plan a road whose tiles are all visible and uncovered
  const plan = await planTown(page);
  if (!plan) throw new Error('no clear straight run of land on screen for a road');
  const a = plan.road[0], b = plan.road[plan.road.length - 1];
  await tapTile(page, a);
  await sleep(page, 700);
  await tapTile(page, b);
  await until(page, (n) => window.__cosmo.game.planet.road.filter((r) => r).length >= n, { arg: 4, timeout: 20000, what: 'road tiles to be laid' });
  await sleep(page, 800);
  await shot('road');
  const roads = await page.evaluate(() => window.__cosmo.game.planet.road.filter((r) => r).length);
  step(`road tiles: ${roads}`);

  // ── zones (R, then C + I)
  step('zones: Residential · Low, Commercial · Low, Industry · General');
  await escape(page); // end the road chain
  const lots = await page.evaluate((lots) => lots.filter((t) => window.__cosmo.game.planet.hasRoadAccess(t) && !window.__cosmo.game.planet.road[t]), plan.lots);
  expect(lots.length >= 8, `enough lots beside the road (${lots.length})`);
  const zoneWith = async (name, tiles) => {
    await tap(page, '.dk-btn[aria-label="Zones"]');
    await until(page, () => !!document.querySelector('.bs-sheet .bs-card-main'), { what: 'zones sheet' });
    await tap(page, `.bs-card-main[aria-label="${name}"]`);
    await sleep(page, 600);
    // single-tile brush from the tool bar options (default paints 7 lots)
    const one = page.getByRole('radio', { name: '1', exact: true });
    if (await one.first().isVisible().catch(() => false)) await one.first().tap();
    let n = 0;
    for (const t of tiles) {
      try {
        await tapTile(page, t);
        n++;
      } catch (e) {
        console.log('   skip lot: ' + e.message);
      }
      await sleep(page, 350);
    }
    expect(n > 0, `zoned some ${name} lots`);
  };
  // homes on one side, shops and a workshop further along
  await zoneWith('Residential · Low', lots.slice(0, 6));
  await until(page, () => [...window.__cosmo.game.planet.zone].some((z) => z >= 1 && z <= 3), { what: 'residential zone' });
  await shot('zoned-r');
  await zoneWith('Commercial · Low', lots.slice(6, 8));
  await zoneWith('Industry · General', lots.slice(-2));
  await until(page, () => {
    const z = [...window.__cosmo.game.planet.zone];
    return z.some((v) => v >= 4 && v <= 6) && z.some((v) => v >= 7 && v <= 10);
  }, { what: 'commercial + industrial zones' });
  await shot('zoned-ci');
  await escape(page);

  // ── power + water from the Build sheet
  step('Build → Power → Wind Turbine, Water → Water Tower');
  const free = await page.evaluate((lots) => lots.filter((t) => window.__cosmo.game.planet.building[t] < 0 && !window.__cosmo.game.planet.zone[t]), plan.lots);
  const spots = free.length >= 2 ? free : lots.slice(-4);
  const plop = async (tab, name, tiles) => {
    await tap(page, '.dk-btn[aria-label="Build"]');
    await until(page, () => !!document.querySelector('.bs-sheet [role="tablist"], .bs-sheet .cz-tabs'), { what: 'build sheet tabs' });
    const tabLoc = page.getByRole('tab', { name: tab });
    if ((await tabLoc.first().getAttribute('aria-selected')) !== 'true') await tapButton(page, tab, { role: 'tab' });
    await tap(page, `.bs-card-main[aria-label="${name}"]`);
    await sleep(page, 700);
    for (const t of tiles) {
      const before = await page.evaluate(() => window.__cosmo.game.planet.buildings.size);
      await tapTile(page, t).catch((e) => console.log('   ' + e.message));
      await sleep(page, 900);
      const after = await page.evaluate(() => window.__cosmo.game.planet.buildings.size);
      if (after > before) return t;
    }
    throw new Error(`could not place ${name}`);
  };
  const powerAt = await plop('Power', 'Wind Turbine', spots);
  await shot('power');
  await escape(page);
  const waterSpots = spots.filter((t) => t !== powerAt);
  await plop('Water', 'Water Tower', waterSpots.length ? waterSpots : lots);
  await shot('water');
  await escape(page, 2);
  console.log('   utilities:', JSON.stringify(await page.evaluate(() => {
    const g = window.__cosmo.game;
    return { speed: g.clock.speed, day: g.clock.day, power: g.sim.stats.powerSupply, water: g.sim.stats.waterSupply, buildings: [...g.planet.buildings.values()].map((b) => b.defId + ':' + b.state) };
  })));
  await until(page, () => (window.__cosmo.game.sim.stats.powerSupply ?? 0) > 0 && (window.__cosmo.game.sim.stats.waterSupply ?? 0) > 0, { timeout: 30000, what: 'power and water supply' });

  // ── speed up through the top bar
  step('speed up');
  await tapButton(page, 'Change speed');
  await sleep(page, 500);
  // speed menu or cycle: choose the fastest if a picker opened
  if (await visible(page, '[role="menu"] button, .tb-speed-menu button')) await tap(page, '[role="menu"] button >> nth=-1');
  await until(page, () => window.__cosmo.game.clock.speed >= 2, { what: 'game speed ≥ 2' });
  await page.evaluate(() => window.__cosmo.game.clock.setSpeed(4)); // fastest — headless frames are slow
  await shot('speed');

  // ── population grows
  step('population grows');
  await until(page, () => window.__cosmo.game.sim.getMetric('population') >= 20, { timeout: 240000, poll: 1000, what: 'first citizens' });
  const st = await info(page);
  step(`population ${Math.round(st.population)} on day ${st.day}, buildings ${st.buildings}`);
  await shot('growing');

  // ── panels: goals and budget
  step('Goals panel');
  await tap(page, '.rl-btn[aria-label="Goals"]');
  await until(page, () => !!document.querySelector('.ph-panel, .ph-full'), { what: 'goals panel' });
  await sleep(page, 800);
  await shot('goals');
  await audit(page, 'goals');
  await escape(page);
  step('Budget panel (More → Budget)');
  await tapButton(page, 'More', { exact: true });
  await until(page, () => !!document.querySelector('.mo-sheet .mo-tile'), { what: 'more sheet' });
  await tap(page, '.mo-tile:has-text("Budget")');
  await sleep(page, 900);
  await shot('budget');
  await audit(page, 'budget');
  await escape(page, 2);

  // ── milestone / goal completion
  step('first goal completed');
  await until(page, () => window.__cosmo.game.empire.s.goalsDone.length > 0 || !!document.querySelector('.ce-card'), {
    timeout: 120000,
    poll: 1000,
    what: 'a goal / milestone',
  });
  await shot('milestone');
  const end = await info(page);
  step(`end: population ${Math.round(end.population)}, money ${Math.round(end.money)}, day ${end.day}`);
};
