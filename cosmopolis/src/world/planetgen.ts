/**
 * OWNER: terrain agent (foundation version: noise continents + banded biomes + features).
 * generatePlanet(spec) → a fully initialised Planet (elevation, biome, feature). Deterministic per spec.seed.
 */
import { Biome, Feature } from '../core/types';
import type { PlanetSpec } from '../core/types';
import { Noise3, Rng, clamp } from '../core/rng';
import { PLANET_TYPES } from '../content/planetTypes';
import { MAX_LEVEL, Planet } from './planet';

export function generatePlanet(spec: PlanetSpec): Planet {
  const p = new Planet(spec);
  const arch = PLANET_TYPES[spec.type] ?? PLANET_TYPES.terran;
  const noise = new Noise3(spec.seed);
  const moist = new Noise3(spec.seed ^ 0x5bd1e995);
  const rng = new Rng(spec.seed ^ 0x27d4eb2d);
  const g = p.grid;
  const n = p.count;
  const raw = new Float32Array(n);
  const rug = clamp(arch.ruggedness * 0.6 + spec.mountains * 0.6, 0.1, 1.2);
  for (let i = 0; i < n; i++) {
    const x = g.center[i * 3], y = g.center[i * 3 + 1], z = g.center[i * 3 + 2];
    const cont = noise.fbm(x * 1.25 + 7.1, y * 1.25, z * 1.25 - 3.3, 5);
    const ridge = noise.ridged(x * 2.6 - 1.7, y * 2.6 + 4.2, z * 2.6, 4);
    raw[i] = cont + Math.max(0, cont + 0.15) * ridge * 0.9 * rug;
  }
  const sorted = Float32Array.from(raw).sort();
  const lo = sorted[0], hi = sorted[n - 1];
  const coverage = spec.hasOcean ? clamp(arch.oceanCoverage + spec.oceanLevel * 0.35, 0, 0.95) : 0;
  const thr = spec.hasOcean ? sorted[Math.min(n - 1, Math.floor(coverage * n))] : lo - 1e-6;
  const landSpan = Math.max(1e-6, hi - thr);
  const seaSpan = Math.max(1e-6, thr - lo);
  const maxLand = Math.round(8 + rug * 9);
  for (let i = 0; i < n; i++) {
    const e = raw[i];
    if (!spec.hasOcean) {
      const t = (e - lo) / Math.max(1e-6, hi - lo);
      p.elevation[i] = Math.round(-3 + Math.pow(t, 1.2) * (maxLand + 3));
    } else if (e >= thr) {
      const t = (e - thr) / landSpan;
      p.elevation[i] = Math.min(MAX_LEVEL, Math.round(Math.pow(t, 1.35) * maxLand));
    } else {
      const t = (thr - e) / seaSpan;
      p.elevation[i] = -1 - Math.round(Math.pow(t, 0.8) * 7);
    }
  }
  // biomes
  for (let i = 0; i < n; i++) {
    const x = g.center[i * 3], y = g.center[i * 3 + 1], z = g.center[i * 3 + 2];
    const lv = p.elevation[i];
    const lat = Math.abs(y) + noise.noise(x * 4, y * 4, z * 4) * 0.06;
    const m = moist.fbm(x * 2.2, y * 2.2, z * 2.2, 3) * 0.5 + 0.5;
    const pickFrom = (list: Biome[]) => list[Math.min(list.length - 1, Math.floor(m * list.length))];
    let b: Biome;
    if (p.isWater(i)) b = arch.biomes.seabed === Biome.Ocean && lv < -3 ? Biome.DeepOcean : arch.biomes.seabed;
    else if (lat > 0.9 - (arch.temperature < 0 ? 0.25 : 0) + (arch.temperature > 40 ? 0.2 : 0)) b = arch.biomes.polar;
    else if (lv === 0 && p.isCoastal(i)) b = arch.biomes.shore;
    else if (lv >= maxLand - 1) b = arch.biomes.peak;
    else if (lv >= maxLand * 0.6) b = pickFrom(arch.biomes.high);
    else if (lv >= maxLand * 0.25) b = pickFrom(arch.biomes.mid);
    else b = pickFrom(arch.biomes.low);
    p.biome[i] = b;
  }
  // features
  const feats = Object.entries(arch.features) as [string, number][];
  for (let i = 0; i < n; i++) {
    if (p.isWater(i)) {
      if (arch.features[Feature.Kelp] && p.elevation[i] >= -2 && rng.chance(arch.features[Feature.Kelp]!)) p.feature[i] = Feature.Kelp;
      continue;
    }
    if (p.biome[i] === arch.biomes.shore && p.elevation[i] === 0) continue;
    for (const [f, prob] of feats) {
      const fid = Number(f) as Feature;
      if (fid === Feature.Kelp) continue;
      // forests cluster: modulate by moisture noise
      const x = g.center[i * 3], y = g.center[i * 3 + 1], z = g.center[i * 3 + 2];
      const cluster = fid === Feature.Trees || fid === Feature.DenseTrees || fid === Feature.AlienFlora ? clamp(moist.noise(x * 5, y * 5, z * 5) + 0.6, 0, 1.6) : 1;
      if (rng.chance(prob * cluster)) {
        p.feature[i] = fid;
        break;
      }
    }
  }
  p.city.style = arch.defaultStyle;
  p.terrainVersion++;
  return p;
}
