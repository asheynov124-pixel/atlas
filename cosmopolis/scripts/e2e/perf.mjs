/**
 * Performance sanity on the metropolis demo: draw calls / triangles per view (close, horizon, orbit × day, night),
 * a per-layer breakdown of what is drawn, and the simulation's cost (sim day + per-frame update).
 *
 *   node scripts/shot.mjs --script scripts/e2e/perf.mjs --query "autostart=sandbox&demo=metropolis&ui=0" --device iphone --timeout 180000 --out .shots/perf --name perf
 *
 * Budgets (iPhone, Medium): ≤ 250 draw calls, ≤ 1.5 M triangles in typical views, sim tick < 4 ms on average.
 * Prints a table; exits non-zero (via an Error) when a budget is blown so it can gate CI.
 */
import { sleep, step } from './lib.mjs';

const VIEWS = {
  close: { distance: 18, tilt: 0.85 },
  horizon: { distance: 9, tilt: 1.3 },
  orbit: { distanceR: 1.7, tilt: 0.2 },
};
const BUDGET = { calls: 250, triangles: 1_500_000, simMs: 4 };

export default async ({ page, shot }) => {
  const strict = process.env.PERF_STRICT === '1';
  const rows = [];
  for (const dn of ['day', 'night']) {
    for (const [name, v] of Object.entries(VIEWS)) {
      const r = await page.evaluate(
        async ({ dn, v }) => {
          const { setSettings } = await import('/src/core/settings.ts');
          setSettings({ dayNight: dn });
          const g = window.__cosmo.game;
          const cam = g.camera;
          const R = g.planet.radius;
          cam.flyTo(cam.target, { distance: v.distanceR ? R * v.distanceR : v.distance, tilt: v.tilt, duration: 0.01 });
          cam.snap?.();
          // settle LOD / culling / time-sliced rebuilds
          window.__cosmo.step(1.5, 20);
          const info = g.engine.info();
          // breakdown: visible drawables per PlanetView layer (before frustum culling)
          const layers = {};
          const scene = g.planetView.scene;
          const visibleChain = (o) => {
            for (let x = o; x; x = x.parent) if (!x.visible) return false;
            return true;
          };
          const layerOf = (o) => {
            let x = o, last = o;
            while (x.parent && x.parent !== scene) {
              last = x;
              x = x.parent;
            }
            return (x.name || x.type) + (x === g.planetView.root ? '/' + (last.name || last.type) : '');
          };
          scene.traverse((o) => {
            if (!(o.isMesh || o.isPoints || o.isLine) || !visibleChain(o)) return;
            const geo = o.geometry;
            if (!geo) return;
            const n = geo.index ? geo.index.count : geo.attributes.position?.count ?? 0;
            const inst = o.isInstancedMesh ? o.count : 1;
            if (inst === 0 || n === 0) return;
            const k = layerOf(o);
            const L = (layers[k] ??= { objects: 0, tris: 0 });
            L.objects++;
            L.tris += o.isMesh ? Math.round((n / 3) * inst) : 0;
          });
          return { info, layers, fps: window.__cosmo.debugInfo().fps };
        },
        { dn, v },
      );
      rows.push({ view: `${name}/${dn}`, calls: r.info.calls, triangles: r.info.triangles, programs: r.info.programs });
      step(`${name}/${dn}: ${r.info.calls} calls, ${(r.info.triangles / 1e6).toFixed(2)} M tris, ${r.info.programs} programs`);
      const top = Object.entries(r.layers).sort((a, b) => b[1].objects - a[1].objects).slice(0, 8);
      console.log('     layers: ' + top.map(([k, L]) => `${k} ${L.objects}×/${(L.tris / 1000).toFixed(0)}k`).join(' · '));
      await shot(`${name}-${dn}`);
    }
  }
  // simulation cost: a sim day (amortised over frames at speed 4 = 12 days / s) and the per-frame update
  const sim = await page.evaluate(() => {
    const g = window.__cosmo.game;
    const t = [];
    for (let i = 0; i < 40; i++) {
      const t0 = performance.now();
      g.clock.day += 1;
      g.sim.tick(1);
      t.push(performance.now() - t0);
    }
    t.sort((a, b) => a - b);
    g.clock.setSpeed(4);
    const u = [];
    for (let i = 0; i < 120; i++) {
      const t0 = performance.now();
      g.sim.update(1 / 60);
      u.push(performance.now() - t0);
    }
    u.sort((a, b) => a - b);
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    return { dayAvg: avg(t), dayMedian: t[t.length >> 1], dayMax: t[t.length - 1], updAvg: avg(u), updMax: u[u.length - 1], buildings: g.planet.buildings.size, pop: g.sim.stats.population };
  });
  step(`sim: day avg ${sim.dayAvg.toFixed(2)} ms (median ${sim.dayMedian.toFixed(2)}, max ${sim.dayMax.toFixed(2)}) · update avg ${sim.updAvg.toFixed(3)} ms (max ${sim.updMax.toFixed(2)}) · ${sim.buildings} buildings, pop ${sim.pop}`);
  // at speed 4 (12 days/s, 60 fps) a frame carries 0.2 sim days on average
  const perFrame = sim.dayAvg * 0.2 + sim.updAvg;
  step(`sim per frame at speed 4 ≈ ${perFrame.toFixed(2)} ms`);
  const over = rows.filter((r) => r.calls > BUDGET.calls || r.triangles > BUDGET.triangles);
  if (over.length) console.log('  ! over budget: ' + over.map((r) => `${r.view} (${r.calls} calls, ${(r.triangles / 1e6).toFixed(2)} M)`).join(', '));
  if (sim.dayAvg > BUDGET.simMs) console.log(`  ! sim day average ${sim.dayAvg.toFixed(2)} ms > ${BUDGET.simMs} ms`);
  if (strict && (over.length || sim.dayAvg > BUDGET.simMs)) throw new Error('performance budget exceeded');
  await sleep(page, 100);
};
