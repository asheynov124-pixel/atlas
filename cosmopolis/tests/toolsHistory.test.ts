/**
 * OWNER: tools. Undo / redo (game/Commands + tools/history) on a headless planet.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { registerItems, type ItemDef } from '../src/content/catalog';
import { Planet } from '../src/world/planet';
import { PlanetOps } from '../src/world/ops';
import { Empire } from '../src/game/Empire';
import { Clock } from '../src/game/Clock';
import { Commands } from '../src/game/Commands';
import { Biome, RoadKind, Zone, type PlanetSpec } from '../src/core/types';
import type { Game } from '../src/game/Game';

const defs: ItemDef[] = [
  { id: 'tt_shop', name: 'Test Shop', category: 'services', description: '', footprint: 1, placement: 'surface', cost: 4000, upkeep: 0, tier: 0, requires: { road: false } },
  { id: 'tt_big', name: 'Test Plaza', category: 'leisure', description: '', footprint: 7, placement: 'surface', cost: 20000, upkeep: 0, tier: 0, requires: { road: false } },
  { id: 'tt_wonder', name: 'Test Wonder', category: 'landmarks', description: '', footprint: 19, placement: 'surface', cost: 900000, upkeep: 0, tier: 5, unique: true, requires: { road: false } },
  { id: 'tt_house', name: 'Test House', category: 'zones', description: '', footprint: 1, placement: 'surface', cost: 0, upkeep: 0, tier: 0, hidden: true, growable: { zone: Zone.ResLow } },
  { id: 'tt_street', name: 'Test Street', category: 'roads', description: '', footprint: 1, placement: 'surface', cost: 50, upkeep: 0, tier: 0, road: { kind: RoadKind.Street, capacity: 600, speed: 1 } },
  { id: 'tt_avenue', name: 'Test Avenue', category: 'roads', description: '', footprint: 1, placement: 'surface', cost: 120, upkeep: 0, tier: 0, road: { kind: RoadKind.Avenue, capacity: 1200, speed: 1.2 } },
  { id: 'tt_tree', name: 'Test Tree', category: 'decor', description: '', footprint: 1, placement: 'free', cost: 30, upkeep: 0, tier: 0 },
  { id: 'tt_sat', name: 'Test Satellite', category: 'orbital', description: '', footprint: 1, placement: 'orbit', cost: 15000, upkeep: 0, tier: 0, orbit: { radius: 1.5, speed: 0.1 } },
  { id: 'zone_r1', name: 'Res Low', category: 'zones', description: '', footprint: 1, placement: 'surface', cost: 0, upkeep: 0, tier: 0, zone: Zone.ResLow, tool: 'zone' },
];
registerItems(defs);

function spec(): PlanetSpec {
  return {
    id: 'test.tools', name: 'Toolia', type: 'terran', seed: 3, frequency: 12, oceanLevel: 0, mountains: 0, temperature: 15, gravity: 1, axialTilt: 0, dayLength: 240,
    atmosphere: { color: 0x88aaff, density: 1, breathable: true }, hasOcean: true, oceanColor: 0x2266aa, cloudCover: 0, rings: null, moons: [],
  };
}

interface H {
  game: Game;
  planet: Planet;
  ops: PlanetOps;
  cmd: Commands;
}

function harness(mode: 'career' | 'sandbox' = 'career'): H {
  const planet = new Planet(spec());
  planet.elevation.fill(2);
  planet.biome.fill(Biome.Grass);
  const ops = new PlanetOps(planet);
  const empire = Empire.create(mode, 'Test', 1);
  const clock = new Clock();
  const progression = { isItemUnlocked: (d: ItemDef) => empire.sandbox || d.tier <= empire.s.tier, lockReason: () => 'Reach a higher tier' };
  const audio = { sfx: () => {}, unlocked: true };
  const camera = { target: { x: 0, y: 1, z: 0 }, distance: 20, flyTo: () => Promise.resolve() };
  const game = { planet, ops, empire, clock, progression, audio, camera } as unknown as Game;
  const cmd = new Commands(game);
  (game as unknown as { commands: Commands }).commands = cmd;
  return { game, planet, ops, cmd };
}

/** Serialise the mutable bits we care about (ids included). */
function state(p: Planet): string {
  const tiles: string[] = [];
  for (let t = 0; t < p.count; t++) tiles.push(`${p.elevation[t]},${p.biome[t]},${p.feature[t]},${p.zone[t]},${p.road[t]},${p.roadLinks[t]},${p.district[t]},${p.building[t]}`);
  const b = [...p.buildings.values()].map((x) => `${x.id}:${x.defId}@${x.tile}/${x.rot}/${x.level}/${x.tint ?? '-'}/${x.name ?? '-'}`).sort();
  const pr = [...p.props.values()].map((x) => `${x.id}:${x.defId}@${x.tile}`).sort();
  const o = [...p.orbitals.values()].map((x) => `${x.id}:${x.defId}`).sort();
  return JSON.stringify({ tiles: tiles.join(';'), b, pr, o, sea: p.seaOffset, d: p.districts.map((d) => d && d.name) });
}

/** A straight-ish line of `n` tiles starting at `from`. */
function line(p: Planet, from: number, n: number): number[] {
  const out = [from];
  let prev = from;
  let cur = p.grid.neighbor(from, 0);
  out.push(cur);
  while (out.length < n) {
    let best = -1, bd = Infinity;
    for (const q of p.grid.neighbors(cur)) {
      const d = p.grid.dot(q, prev);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    prev = cur;
    cur = best;
    out.push(cur);
  }
  return out;
}

describe('Commands undo / redo', () => {
  let h: H;
  beforeEach(() => {
    h = harness();
  });

  it('undoes and redoes a placement with money and the same id', () => {
    const before = state(h.planet);
    const money0 = h.game.empire.money;
    const b = h.cmd.place('tt_big', 300, 2)!;
    expect(b).toBeTruthy();
    expect(h.game.empire.money).toBe(money0 - 20000);
    expect(h.cmd.canUndo).toBe(true);
    const after = state(h.planet);
    expect(h.cmd.undo()).toBe(true);
    expect(state(h.planet)).toBe(before);
    expect(h.game.empire.money).toBe(money0);
    expect(h.cmd.canRedo).toBe(true);
    expect(h.cmd.redo()).toBe(true);
    expect(state(h.planet)).toBe(after);
    expect(h.planet.buildings.get(b.id)?.rot).toBe(2);
    expect(h.game.empire.money).toBe(money0 - 20000);
  });

  it('restores roads including the link bits of neighbouring tiles', () => {
    const a = line(h.planet, 500, 6);
    h.cmd.buildRoad(a, RoadKind.Street);
    const mid = a[3];
    // branch off the middle of the first road
    const branchStart = h.planet.grid.neighbors(mid).find((n) => !a.includes(n))!;
    const before = state(h.planet);
    h.cmd.buildRoad([mid, branchStart, ...line(h.planet, branchStart, 3).slice(1)], RoadKind.Avenue);
    expect(h.planet.roadLinks[mid]).not.toBe(0);
    h.cmd.undo();
    expect(state(h.planet)).toBe(before);
    // bulldoze a road tile: neighbours lose their links; undo restores them
    const snap = state(h.planet);
    h.cmd.bulldoze([a[2]]);
    expect(h.planet.road[a[2]]).toBe(0);
    h.cmd.undo();
    expect(state(h.planet)).toBe(snap);
  });

  it('groups a gesture into one step and keeps step order', () => {
    const s0 = state(h.planet);
    h.cmd.begin('Zone stroke');
    h.cmd.zone([10, 11, 12], Zone.ResLow);
    h.cmd.zone([13, 14], Zone.ResLow);
    h.cmd.end();
    const s1 = state(h.planet);
    h.cmd.place('tt_shop', 900);
    const s2 = state(h.planet);
    expect(h.cmd.historySize.undo).toBe(2);
    h.cmd.undo();
    expect(state(h.planet)).toBe(s1);
    h.cmd.undo();
    expect(state(h.planet)).toBe(s0);
    h.cmd.redo();
    expect(state(h.planet)).toBe(s1);
    h.cmd.redo();
    expect(state(h.planet)).toBe(s2);
  });

  it('a new action clears the redo stack', () => {
    h.cmd.place('tt_shop', 100);
    h.cmd.undo();
    expect(h.cmd.canRedo).toBe(true);
    h.cmd.place('tt_shop', 120);
    expect(h.cmd.canRedo).toBe(false);
  });

  it('undoes zoning that replaced a growable of another zone', () => {
    h.ops.setZone([40], Zone.ResLow);
    h.ops.placeBuilding('tt_house', 40, 0, { level: 3, variant: 5 });
    const s0 = state(h.planet);
    h.cmd.zone([40, 41], Zone.ComLow);
    expect(h.planet.building[40]).toBe(-1);
    h.cmd.undo();
    expect(state(h.planet)).toBe(s0);
    expect(h.planet.buildings.get(h.planet.building[40])?.level).toBe(3);
  });

  it('refunds 75% when bulldozing something built today, and undo claws it back', () => {
    const b = h.cmd.place('tt_shop', 222)!;
    const m1 = h.game.empire.money;
    const r = h.cmd.bulldoze(b.tiles);
    expect(r.buildings).toBe(1);
    expect(h.game.empire.money).toBe(m1 + 3000);
    h.cmd.undo();
    expect(h.game.empire.money).toBe(m1);
    expect(h.planet.buildings.has(b.id)).toBe(true);
  });

  it('terraform raise + automatic biome is undoable', () => {
    const tiles = h.planet.grid.disk(700, 2);
    const s0 = state(h.planet);
    h.cmd.begin('Terraform');
    h.cmd.terraform(tiles, 'raise', 1);
    h.cmd.terraform(tiles, 'raise', 1);
    h.cmd.end();
    expect(h.planet.elevation[700]).toBe(4);
    h.cmd.undo();
    expect(state(h.planet)).toBe(s0);
    expect(h.cmd.historySize.undo).toBe(0);
  });

  it('terraform skips buildings unless sandbox force', () => {
    h.cmd.place('tt_shop', 800);
    const changed = h.cmd.terraform([800, h.planet.grid.neighbor(800, 0)], 'raise', 2);
    expect(changed).not.toContain(800);
    expect(h.planet.elevation[800]).toBe(2);
  });

  it('paint, rename, district and orbital changes are undoable', () => {
    const b = h.cmd.place('tt_shop', 333)!;
    const s0 = state(h.planet);
    h.cmd.paint(b.id, 0xff0000);
    h.cmd.rename(b.id, 'Bob’s');
    expect(h.planet.buildings.get(b.id)?.tint).toBe(0xff0000);
    h.cmd.undo();
    h.cmd.undo();
    expect(state(h.planet)).toBe(s0);
    const d = h.cmd.createDistrict('Neon Heights', 0xff00ff)!;
    h.cmd.paintDistrict([1, 2, 3], d.id);
    expect(h.planet.district[2]).toBe(d.id);
    h.cmd.undo();
    h.cmd.undo();
    expect(state(h.planet)).toBe(s0);
    const o = h.cmd.addOrbital('tt_sat')!;
    expect(h.planet.orbitals.has(o.id)).toBe(true);
    h.cmd.undo();
    expect(h.planet.orbitals.has(o.id)).toBe(false);
    h.cmd.redo();
    expect(h.planet.orbitals.get(o.id)?.defId).toBe('tt_sat');
  });

  it('props on a tile come back after bulldoze + undo', () => {
    h.cmd.addProp('tt_tree', 77, 0.2, -0.1, 1, 1.1);
    h.cmd.addProp('tt_tree', 77, -0.3, 0.2, 2, 0.9);
    const s0 = state(h.planet);
    h.cmd.bulldoze([77]);
    expect([...h.planet.props.values()].filter((x) => x.tile === 77).length).toBe(0);
    h.cmd.undo();
    expect(state(h.planet)).toBe(s0);
  });

  it('abort rolls back an open gesture and its spending', () => {
    const s0 = state(h.planet);
    const m0 = h.game.empire.money;
    h.cmd.begin('Stroke');
    h.cmd.place('tt_shop', 50);
    h.cmd.place('tt_shop', 60);
    h.cmd.abort();
    expect(state(h.planet)).toBe(s0);
    expect(h.game.empire.money).toBe(m0);
    expect(h.cmd.canUndo).toBe(false);
  });

  it('keeps at most 50 steps', () => {
    const sb = harness('sandbox');
    for (let i = 0; i < 60; i++) sb.cmd.place('tt_shop', 1000 + i * 3);
    expect(sb.cmd.historySize.undo).toBe(50);
  });

  it('locked items and unaffordable items are refused without history', () => {
    expect(h.cmd.place('tt_wonder', 400)).toBeNull();
    h.game.empire.s.money = 10;
    expect(h.cmd.place('tt_big', 400)).toBeNull();
    expect(h.cmd.canUndo).toBe(false);
  });

  it('sandbox free build ignores rules but never clears without replace', () => {
    const sb = harness('sandbox');
    sb.cmd.place('tt_shop', 600);
    expect(sb.cmd.place('tt_shop', 600, 0, { free: true })).toBeNull();
    expect(sb.cmd.place('tt_shop', 600, 0, { replace: true })).toBeTruthy();
    // sea level: sandbox only, undoable
    sb.cmd.setSeaLevel(3);
    expect(sb.planet.seaOffset).toBe(3);
    sb.cmd.undo();
    expect(sb.planet.seaOffset).toBe(0);
  });

  it('move keeps identity and is undoable', () => {
    const b = h.cmd.place('tt_shop', 444)!;
    h.cmd.paint(b.id, 0x00ff00);
    const s0 = state(h.planet);
    expect(h.cmd.move(b.id, 460, 1)).toBe(true);
    const moved = h.planet.buildings.get(b.id)!;
    expect(moved.tile).toBe(460);
    expect(moved.tint).toBe(0x00ff00);
    h.cmd.undo();
    expect(state(h.planet)).toBe(s0);
  });
});
