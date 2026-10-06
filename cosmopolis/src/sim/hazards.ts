/**
 * Disaster interplay (daily): fire spread & firefighting, flood recession, natural decay of lingering tile
 * states, spontaneous fires, casualties. God powers set the tile flags; the sim makes them matter:
 *   Burning    spreads to flammable neighbours (buildings, forests) by chance — reduced by fire coverage,
 *              smoke-detector policy and shield fields — and destroys a building after a few days unless
 *              firefighters (fire coverage × budget) put it out. Leaves Scorched ground.
 *   Flooded    buildings abandon after ~5 days and collapse after ~14 if the water stays (buildings.ts);
 *              flags recede on dry land after ~8 days.
 *   Irradiated / Goo  residents flee (abandon after 3 days, goo eats the block after 14). Both decay slowly.
 *   Frozen     thaws ~12 %/day.  Scorched fades ~4 %/day.  Blessed and Locked are never touched here.
 * Shelters ("shelter" tag) cut casualties; shields ("shield" tag) cut damage — see damageResistance().
 */
import { BuildingState, Feature, TileFlag } from '../core/types';
import type { Simulation } from './Simulation';
import { SERVICE_INDEX, budgetEffect } from './params';

const S_FIRE = SERVICE_INDEX.fire;
const DECAY_MASK = TileFlag.Irradiated | TileFlag.Goo | TileFlag.Frozen | TileFlag.Scorched | TileFlag.Flooded;

export class Hazards {
  /** tiles currently carrying any hazard flag we track */
  tracked = new Set<number>();
  /** days a dry tile has been flagged Flooded */
  private floodAge = new Map<number, number>();
  /** buildings saved / lost this month (news) */
  saved = 0;
  lost = 0;
  fireTiles = 0;

  constructor(private sim: Simulation) {}

  scanAll(): void {
    const p = this.sim.planet!;
    this.tracked.clear();
    for (let t = 0; t < p.count; t++) if (p.flags[t] & (DECAY_MASK | TileFlag.Burning)) this.tracked.add(t);
  }

  onFlags(tiles: number[]): void {
    const p = this.sim.planet!;
    for (const t of tiles) {
      if (p.flags[t] & (DECAY_MASK | TileFlag.Burning)) this.tracked.add(t);
      else {
        this.tracked.delete(t);
        this.floodAge.delete(t);
      }
    }
  }

  /** One sim day. */
  day(): void {
    const sim = this.sim;
    const p = sim.planet!;
    const ops = sim.ops;
    if (!ops || !this.tracked.size) {
      this.maybeSpontaneousFire();
      return;
    }
    const f = sim.fields!;
    const rng = sim.rng;
    const g = p.grid;
    const fireEff = budgetEffect(sim.budget.fire ?? 1);
    const spreadMod = sim.cityMods.fireSpread;
    const ignite: number[] = [];
    const extinguish: number[] = [];
    const clear: Record<number, number[]> = {};
    const scorch: number[] = [];
    const destroyIds = new Set<number>();
    let burning = 0;
    const list = [...this.tracked];
    const cap = Math.min(list.length, 5000);
    for (let i = 0; i < cap; i++) {
      const t = list[i];
      const fl = p.flags[t];
      if (fl & TileFlag.Burning) {
        burning++;
        const cov = f.cov[S_FIRE][t] * fireEff;
        const bid = p.building[t];
        if (bid >= 0) {
          const r = sim.recMap.get(bid);
          const b = p.buildings.get(bid);
          if (r && b) {
            if (b.tile === t) r.burnDays++;
            const putOut = 0.1 + cov * 0.6;
            if (rng.chance(putOut)) {
              for (const x of b.tiles) extinguish.push(x);
              if (r.burnDays > 1) scorch.push(t);
              if (b.tile === t) {
                r.burnDays = 0;
                this.saved++;
                sim.noteFireSaved(t);
                if (b.state === BuildingState.Burning) ops.updateBuilding(bid, { state: BuildingState.Active });
              }
            } else if (r.burnDays >= 4 + Math.floor(r.h * 3)) {
              destroyIds.add(bid);
            }
          } else extinguish.push(t);
        } else {
          // forest / grass / road fire
          const feat = p.feature[t];
          const fuel = feat === Feature.Trees || feat === Feature.DenseTrees || feat === Feature.AlienFlora || feat === Feature.Flowers;
          if (rng.chance(fuel ? 0.18 + cov * 0.5 : 0.5 + cov * 0.4)) {
            extinguish.push(t);
            if (fuel) {
              scorch.push(t);
              if (rng.chance(0.7)) ops.setFeature([t], Feature.None);
            }
          }
        }
        // spread
        for (let q = g.start[t]; q < g.start[t + 1]; q++) {
          const nb = g.nbr[q];
          if (p.flags[nb] & (TileFlag.Burning | TileFlag.Flooded | TileFlag.Frozen) || p.isWater(nb)) continue;
          const feat = p.feature[nb];
          const hasB = p.building[nb] >= 0;
          const fuel = hasB ? 0.09 : feat === Feature.DenseTrees ? 0.2 : feat === Feature.Trees || feat === Feature.AlienFlora ? 0.15 : feat === Feature.Flowers ? 0.06 : 0;
          if (!fuel) continue;
          const chance = fuel * (1 - Math.min(0.9, f.cov[S_FIRE][nb] * fireEff * 0.85)) * spreadMod * (1 - f.shield[nb]);
          if (rng.chance(chance)) ignite.push(nb);
        }
        continue;
      }
      // lingering states decay
      if (fl & TileFlag.Frozen && rng.chance(0.12)) (clear[TileFlag.Frozen] ??= []).push(t);
      if (fl & TileFlag.Scorched && rng.chance(0.04)) (clear[TileFlag.Scorched] ??= []).push(t);
      if (fl & TileFlag.Irradiated && rng.chance(0.012 + f.cov[SERVICE_INDEX.health][t] * 0.02)) (clear[TileFlag.Irradiated] ??= []).push(t);
      if (fl & TileFlag.Goo && rng.chance(0.015)) (clear[TileFlag.Goo] ??= []).push(t);
      if (fl & TileFlag.Flooded) {
        if (p.isWater(t)) this.floodAge.delete(t);
        else {
          const age = (this.floodAge.get(t) ?? 0) + 1;
          this.floodAge.set(t, age);
          if (age > 8 && rng.chance(0.35)) (clear[TileFlag.Flooded] ??= []).push(t);
        }
      }
    }
    this.fireTiles = burning;
    for (const id of destroyIds) {
      const b = p.buildings.get(id);
      if (!b) continue;
      const tiles = b.tiles.slice();
      this.lost++;
      sim.noteFireLoss(b.tile);
      ops.removeBuilding(id, 'disaster');
      for (const x of tiles) extinguish.push(x);
      scorch.push(...tiles);
    }
    if (extinguish.length) ops.setFlags(extinguish, TileFlag.Burning, false);
    if (scorch.length) ops.setFlags(scorch, TileFlag.Scorched, true);
    if (ignite.length) ops.setFlags(ignite, TileFlag.Burning, true);
    for (const k in clear) ops.setFlags(clear[k], Number(k), false);
    this.maybeSpontaneousFire();
  }

  /** Career cities without fire cover occasionally catch fire (a reason to build fire stations). */
  private maybeSpontaneousFire(): void {
    const sim = this.sim;
    if (sim.sandbox || sim.agg.population < 1500 || !sim.recs.length) return;
    if (!sim.rng.chance(0.012)) return;
    const r = sim.recs[Math.floor(sim.rng.next() * sim.recs.length)];
    if (!r || r.b.state !== BuildingState.Active) return;
    const cov = sim.fields!.cov[S_FIRE][r.b.tile];
    if (cov > 0.25 || sim.rng.chance(cov * 3)) return;
    sim.ops?.setFlags([r.b.tile], TileFlag.Burning, true);
    sim.noteFireStart(r.b.tile);
  }
}

/**
 * Damage resistance of a tile 0..1 for god powers: shield generators, divine blessing and shelters.
 * 0 = full damage, 1 = immune.
 */
export function resistanceAt(sim: Simulation, tile: number): number {
  const p = sim.planet;
  const f = sim.fields;
  if (!p || !f || tile < 0 || tile >= p.count) return 0;
  let r = f.shield[tile];
  if (p.flags[tile] & TileFlag.Blessed) r = 1 - (1 - r) * 0.5;
  r = 1 - (1 - r) * (1 - f.shelter[tile] * 0.2);
  return Math.max(0, Math.min(1, r));
}
