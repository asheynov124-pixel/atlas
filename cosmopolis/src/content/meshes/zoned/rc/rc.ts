/**
 * zoned-rc · RC context factory: resolves the style skin, a variant-stable palette and RNGs for one mesh build.
 * Colour & layout choices are seeded by (def id, variant) only — so a building keeps its identity (colours,
 * orientation, roof type…) while it levels up 1 → 5; only its size, detail and prestige change.
 */
import type { MeshContext } from '../../../catalog';
import { MeshBuilder } from '../../../kit';
import { Rng, hash2, hashString } from '../../../../core/rng';
import type { StyleId } from '../../../../core/types';
import { STYLES, type StylePalette } from '../../../styles';
import { FL, clamp } from './common';
import type { Pal, RC, Skin, SkinCost } from './skin';
import { ClassicSkin } from './skins/classic';
import { NeoSkin } from './skins/neo';
import { SolarpunkSkin } from './skins/solarpunk';
import { CyberSkin } from './skins/cyber';
import { MarsSkin } from './skins/mars';
import { IceSkin } from './skins/ice';
import { CrystalSkin } from './skins/crystal';
import { OrganicSkin } from './skins/organic';

export const SKINS: Record<StyleId, Skin> = {
  classic: new ClassicSkin(),
  neo: new NeoSkin(),
  solarpunk: new SolarpunkSkin(),
  cyber: new CyberSkin(),
  mars: new MarsSkin(),
  ice: new IceSkin(),
  crystal: new CrystalSkin(),
  organic: new OrganicSkin(),
};

function pickI(arr: readonly number[], seed: number, salt: number): number {
  return arr[hash2(seed, salt) % arr.length];
}

function buildRC(b: MeshBuilder, defId: string, variant: number, level: number, styleId: StyleId, st: StylePalette, rng: Rng, lod: 0 | 1): RC {
  const sk = SKINS[styleId] ?? SKINS.classic;
  const seed = hash2(hashString(defId), variant * 7919 + 13);
  const wi = hash2(seed, 1) % st.walls.length;
  const w2 = st.walls.length > 1 ? (wi + 1 + (hash2(seed, 2) % (st.walls.length - 1))) % st.walls.length : wi;
  const ai = hash2(seed, 3) % st.accents.length;
  const p: Pal = {
    wall: st.walls[wi],
    wall2: st.walls[w2],
    roof: pickI(st.roofs, seed, 4),
    trim: pickI(st.trims, seed, 5),
    trim2: pickI(st.trims, seed, 6),
    accent: st.accents[ai],
    accent2: st.accents[(ai + 1) % st.accents.length],
    accent3: st.accents[(ai + 2) % st.accents.length],
    glass: st.glass,
    ground: sk.ground,
    pave: sk.pave,
    plaza: sk.plaza,
    asphalt: sk.asphalt,
    green: sk.green,
    green2: sk.green,
    trunk: sk.trunk,
    dark: 0x24262c,
    metal: 0x9aa0aa,
    gold: sk.gold,
    timber: sk.timber,
    awning: st.accents[ai],
  };
  sk.palette(p, new Rng(hash2(seed, 99)));
  return { b, L: clamp(Math.round(level || 1), 1, 5), v: variant, seed, vr: new Rng(hash2(seed, 7)), rng, sid: styleId, st, p, sk, lo: lod === 1, reserve: 0 };
}

/**
 * Measure the MANDATORY triangle cost of every skin element (optional parts are suppressed by an infinite
 * reserve) over a spread of representative parameters. Types use these numbers to reserve budget.
 */
function calibrate(sk: Skin): void {
  if (sk.calibrated) return;
  sk.calibrated = true;
  const st = STYLES[sk.id] ?? STYLES.classic;
  const m = (fn: (rc: RC) => void): number => {
    let worst = 0;
    for (let v = 0; v < 4; v++) {
      const rc = buildRC(new MeshBuilder(0), 'rc_calibrate', v, 5, sk.id, st, new Rng(v + 1), 0);
      rc.reserve = 1e9;
      fn(rc);
      worst = Math.max(worst, rc.b.triangles);
    }
    return worst;
  };
  const max = (...fns: ((rc: RC) => void)[]): number => Math.max(...fns.map(m));
  const c: SkinCost = {
    house: max(
      (rc) => sk.house(rc, { w: 0.62, d: 0.5, floors: 2, prestige: 1 }),
      (rc) => sk.house(rc, { w: 0.98, d: 0.44, floors: 1, roof: 'hip', prestige: 1 }),
      (rc) => sk.house(rc, { w: 0.44, d: 0.56, floors: 2, roof: 'front' }),
      (rc) => sk.house(rc, { w: 0.6, d: 0.46, floors: 3, roof: 'flat', prestige: 1 }),
    ),
    pod: max((rc) => sk.pod(rc, 0, 0, 0.34, 0.3), (rc) => sk.pod(rc, 0, 0, 0.2, 0.2, true)),
    block: max(
      (rc) => sk.block(rc, { w: 1.1, d: 0.8, h: FL * 6 + 0.03, use: 'res', prestige: 1 }),
      (rc) => sk.block(rc, { w: 0.4, d: 0.6, h: FL * 3 + 0.03, use: 'res' }),
      (rc) => sk.block(rc, { w: 1.4, d: 1.0, h: FL * 3, use: 'shop' }),
      (rc) => sk.block(rc, { w: 1.2, d: 0.9, h: FL * 10, use: 'office' }),
    ),
    tower: max(
      (rc) => sk.tower(rc, { w: 0.95, d: 0.9, h: FL * 24, use: 'res', seg: 0, prestige: 1 }),
      (rc) => sk.tower(rc, { w: 0.8, d: 0.8, h: FL * 12, use: 'res', seg: 1, round: true, prestige: 1 }),
      (rc) => sk.tower(rc, { w: 0.7, d: 0.6, h: FL * 30, use: 'office', seg: 2 }),
      (rc) => sk.tower(rc, { w: 1.0, d: 0.66, h: FL * 10, use: 'res', seg: 3, lite: true }),
    ),
    crown: max(
      ...[0, 1, 2].map((k) => (rc: RC) => void sk.crown(rc, { y: 4, w: 0.7, d: 0.7, prestige: 1, tall: 2, kind: k })),
    ),
    roof: max(
      ...(['flat', 'pitched', 'garden', 'deck', 'mech'] as const).map((kind) => (rc: RC) => sk.roof(rc, { y: 1, w: 1.1, d: 0.8, kind, prestige: 1 })),
      (rc) => sk.roof(rc, { y: 1, w: 0.4, d: 0.6, kind: 'pitched' }),
    ),
    portico: max((rc) => sk.portico(rc, 0.5, FL * 2), (rc) => sk.portico(rc, 0.3, FL)),
    shop: max(
      (rc) => sk.shopfront(rc, { w: 1.2, h: FL * 1.1, glyphs: 5 }),
      (rc) => sk.shopfront(rc, { w: 0.7, h: FL, glyphs: 4, kind: 'cafe' }),
    ),
    bridge: max((rc) => sk.bridge(rc, -0.1, 0, 0.1, 0, 3, FL * 2, 0.2)),
    terrace: max((rc) => sk.terrace(rc, 0, 0, 1, 0.9, 0.3), (rc) => sk.terrace(rc, 0, 0, 1, 0.3, 0.3)),
  };
  sk.cost = c;
}

/** Build the per-mesh context. */
export function makeRC(ctx: MeshContext): RC {
  const sk = SKINS[ctx.styleId] ?? SKINS.classic;
  calibrate(sk);
  return buildRC(ctx.b, ctx.def.id, ctx.variant, ctx.level, ctx.styleId, ctx.style, ctx.rng, ctx.lod);
}

/** Exposed for tooling: the measured element costs of a style. */
export function skinCost(id: StyleId): SkinCost {
  const sk = SKINS[id] ?? SKINS.classic;
  calibrate(sk);
  return sk.cost;
}

/** Wrap a factory body so the RC is built once. */
export function factory(fn: (rc: RC) => void): (ctx: MeshContext) => void {
  return (ctx) => fn(makeRC(ctx));
}
