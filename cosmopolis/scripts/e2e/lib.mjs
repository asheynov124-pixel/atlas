/**
 * Shared helpers for the end-to-end playtests (scripts/e2e/*.mjs). The scenarios drive the REAL interface with
 * Playwright touch taps (run them with --device iphone) and only read game state through window.__cosmo to decide
 * where to tap and to assert outcomes.
 *
 *   node scripts/shot.mjs --script scripts/e2e/career.mjs --query "" --device iphone --out .shots/e2e --name career
 *
 * Every helper throws a descriptive Error on failure so shot.mjs records it (exit code 1) with a failure screenshot.
 */

/** Sleep (Playwright clock). */
export const sleep = (page, ms) => page.waitForTimeout(ms);

/** Log a scenario step (prefixed so it stands out in shot.mjs output). */
export function step(msg) {
  console.log(`  ▸ ${msg}`);
}

/** Wait until `fn(arg)` (evaluated in the page) is truthy; returns its value. */
export async function until(page, fn, { timeout = 30000, poll = 250, arg, what = 'condition' } = {}) {
  try {
    const h = await page.waitForFunction(fn, arg, { timeout, polling: poll });
    return await h.jsonValue();
  } catch (e) {
    throw new Error(`timed out waiting for ${what}: ${e.message.split('\n')[0]}`);
  }
}

/** Game debug info. */
export const info = (page) => page.evaluate(() => window.__cosmo.debugInfo());

/** The informative part of a Playwright action error: the timeout line plus the last distinct call-log lines. */
function callLog(e) {
  const lines = e.message.split('\n').map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').trim()).filter(Boolean);
  const head = lines[0];
  const tail = [...new Set(lines.slice(1).filter((l) => !/^Call log:?$/i.test(l)))].slice(-6);
  return [head, ...tail].join(' | ');
}

/**
 * Wait until an element has stopped moving (sheets slide in slowly while the main thread renders thumbnails on
 * SwiftShader) and sits inside the viewport; scroll it into view only once it is at rest, so a scroll never fights
 * an opening transition.
 */
async function settle(page, loc, timeout) {
  const t0 = Date.now();
  const vp = page.viewportSize() ?? { width: 9999, height: 9999 };
  let prev = null;
  let scrolled = false;
  while (Date.now() - t0 < timeout) {
    const b = await loc.boundingBox().catch(() => null);
    if (b && prev && Math.abs(prev.x - b.x) < 0.5 && Math.abs(prev.y - b.y) < 0.5 && Math.abs(prev.height - b.height) < 0.5) {
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      if (cx >= 0 && cy >= 0 && cx <= vp.width && cy <= vp.height) return;
      if (!scrolled) {
        await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
        scrolled = true;
      }
    }
    prev = b;
    await page.waitForTimeout(150);
  }
}

/** Tap a visible element matched by a Playwright locator (CSS / text= / role=). */
export async function tap(page, selector, { timeout = 15000, nth = 0, force = false } = {}) {
  const loc = page.locator(selector).nth(nth);
  try {
    await loc.waitFor({ state: 'visible', timeout });
    await settle(page, loc, timeout);
    await loc.tap({ timeout, force });
  } catch (e) {
    throw new Error(`could not tap "${selector}": ${callLog(e)}`);
  }
}

/** Tap a button by its accessible name (aria-label or text). */
export async function tapButton(page, name, opts = {}) {
  const exact = opts.exact ?? false;
  const loc = page.getByRole(opts.role ?? 'button', { name, exact }).nth(opts.nth ?? 0);
  try {
    await loc.waitFor({ state: 'visible', timeout: opts.timeout ?? 15000 });
    await settle(page, loc, opts.timeout ?? 15000);
    await loc.tap({ timeout: opts.timeout ?? 15000, force: opts.force ?? false });
  } catch (e) {
    throw new Error(`could not tap button "${name}": ${callLog(e)}`);
  }
}

/** True when an element matching the selector is visible right now. */
export async function visible(page, selector) {
  return page.locator(selector).first().isVisible().catch(() => false);
}

/** Install page-side helpers (window.__e2e): tile → screen projection and "is this tile tappable" checks. */
export async function installHelpers(page) {
  await page.evaluate(() => {
    if (window.__e2e) return;
    const screen = (tile, lift = 0.05) => {
      const g = window.__cosmo.game;
      const p = g.planet;
      const v = g.planetView;
      if (!p || !v || tile < 0 || tile >= p.count) return null;
      const c = p.grid.center;
      const r = p.radius + Math.max(p.elevation[tile] ?? 0, p.isWater(tile) ? p.seaOffset ?? 0 : -99) * 0.32 + lift;
      const cam = v.camera;
      cam.updateMatrixWorld();
      const x = c[tile * 3] * r, y = c[tile * 3 + 1] * r, z = c[tile * 3 + 2] * r;
      const dx = cam.position.x - x, dy = cam.position.y - y, dz = cam.position.z - z;
      if (dx * c[tile * 3] + dy * c[tile * 3 + 1] + dz * c[tile * 3 + 2] <= 0) return null;
      const e = cam.matrixWorldInverse.elements, pr = cam.projectionMatrix.elements;
      const vx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const vy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const vz = e[2] * x + e[6] * y + e[10] * z + e[14];
      const cx = pr[0] * vx + pr[4] * vy + pr[8] * vz + pr[12];
      const cy = pr[1] * vx + pr[5] * vy + pr[9] * vz + pr[13];
      const cw = pr[3] * vx + pr[7] * vy + pr[11] * vz + pr[15];
      if (cw <= 0) return null;
      const sx = ((cx / cw + 1) / 2) * innerWidth, sy = ((1 - cy / cw) / 2) * innerHeight;
      if (sx < 0 || sy < 0 || sx > innerWidth || sy > innerHeight) return null;
      return { x: sx, y: sy };
    };
    // tappable: on screen, not under UI, and the planet pick at that point really is this tile
    const tappable = (tile) => {
      const s = screen(tile);
      if (!s) return null;
      const el = document.elementFromPoint(s.x, s.y);
      if (!el || el.tagName !== 'CANVAS') return null;
      return s;
    };
    window.__e2e = { screen, tappable };
  });
}

/** Screen position (CSS px) of a tile's surface, or null when behind the planet / off screen. */
export async function tileScreen(page, tile, lift = 0.05) {
  await installHelpers(page);
  return page.evaluate(({ tile, lift }) => window.__e2e.screen(tile, lift), { tile, lift });
}

/** Element at a screen point is the 3D canvas (not covered by UI)? */
export async function canvasAt(page, x, y) {
  return page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', { x, y });
}

/** Touch-tap a tile on the planet (throws when it is off screen or covered by UI). */
export async function tapTile(page, tile) {
  await installHelpers(page);
  const s = await tileScreen(page, tile);
  if (!s) throw new Error(`tile ${tile} is not on screen`);
  if (!(await canvasAt(page, s.x, s.y))) throw new Error(`tile ${tile} at ${Math.round(s.x)},${Math.round(s.y)} is covered by UI`);
  await page.touchscreen.tap(s.x, s.y);
  return s;
}

/** Frames per second of the game loop (helps scale waits on slow headless runs). */
export const fps = (page) => page.evaluate(() => window.__cosmo.debugInfo().fps || 1);

/** Wait for the game to render a few frames (SwiftShader is slow). */
export async function frames(page, n = 3) {
  await page.evaluate(
    (n) =>
      new Promise((res) => {
        let k = 0;
        const f = () => (++k >= n ? res(null) : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
    n,
  );
}

/** Collect UI layout problems: interactive elements that overlap each other or leave the viewport. */
export async function layoutAudit(page, scope = 'body') {
  return page.evaluate((scope) => {
    const root = document.querySelector(scope) ?? document.body;
    const els = [...root.querySelectorAll('button, [role="button"], input, a[href]')].filter((el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (!(r.width > 2 && r.height > 2 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05 && !el.closest('[aria-hidden="true"]'))) return false;
      // ignore elements covered by a sheet / modal: something else is on top at their centre
      const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
      const top = document.elementFromPoint(cx, cy);
      return !!top && (el === top || el.contains(top) || top.contains(el));
    });
    const out = [];
    const W = innerWidth, H = innerHeight;
    const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.className || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
    const rects = els.map((el) => ({ el, r: el.getBoundingClientRect() }));
    const scroller = (el) => {
      let s = el.parentElement;
      while (s && s !== document.body) {
        const cs = getComputedStyle(s);
        if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY)) return s;
        s = s.parentElement;
      }
      return document.body;
    };
    for (const { el, r } of rects) {
      if (r.right > W + 1 || r.bottom > H + 1 || r.left < -1 || r.top < -1) {
        // elements inside scrollable containers may legitimately extend beyond the viewport
        let s = el.parentElement, scroll = false;
        while (s && s !== document.body) {
          const cs = getComputedStyle(s);
          if (/(auto|scroll|hidden)/.test(cs.overflowX + cs.overflowY)) {
            scroll = true;
            break;
          }
          s = s.parentElement;
        }
        if (!scroll) out.push(`off-screen: "${name(el)}" ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        // content scrolled under a fixed header is not an overlap: compare only within one scroll container
        if (scroller(a.el) !== scroller(b.el)) continue;
        const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ox > 6 && oy > 6) {
          // only report when both are actually hit-testable at the overlap centre (i.e. one is not under a sheet)
          const cx = Math.max(a.r.left, b.r.left) + ox / 2, cy = Math.max(a.r.top, b.r.top) + oy / 2;
          const top = document.elementFromPoint(cx, cy);
          if (top && (a.el.contains(top) || b.el.contains(top))) out.push(`overlap: "${name(a.el)}" × "${name(b.el)}" (${Math.round(ox)}×${Math.round(oy)})`);
        }
      }
    }
    return out;
  }, scope);
}

/** Close any open sheet / modal / panel with the Escape key (the shell maps Esc to "close top layer"). */
export async function escape(page, times = 1) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press('Escape');
    await sleep(page, 250);
  }
}

/** Assert helper. */
export function expect(cond, msg) {
  if (!cond) throw new Error('expectation failed: ' + msg);
}

/** A real one-finger touch drag through CDP (touchStart → touchMove × steps → touchEnd) between screen points. */
export async function touchDrag(page, from, to, steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }] });
      await page.waitForTimeout(40);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await cdp.detach().catch(() => {});
  }
}

/** Find tappable land tiles near the camera target: { center, tiles[] } sorted by distance (retries while sheets close). */
export async function landNearCamera(page, maxRing = 8, want = 10, timeout = 15000) {
  await installHelpers(page);
  const t0 = Date.now();
  for (;;) {
    const r = await page.evaluate((maxRing) => {
      const g = window.__cosmo.game, p = g.planet, grid = p.grid;
      const center = g.camera.targetTile();
      const out = [];
      for (let r = 0; r <= maxRing; r++) for (const t of grid.ring(center, r)) if (!p.isWater(t) && window.__e2e.tappable(t)) out.push(t);
      return { center, tiles: out };
    }, maxRing);
    if (r.tiles.length >= want || Date.now() - t0 > timeout) return r;
    await page.waitForTimeout(500);
  }
}
