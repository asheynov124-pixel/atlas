/**
 * OWNER: tools. The tools end to end on a headless planet (ToolManager + real Commands + fake view):
 * tap-tap roads with chaining, zone strokes and block fill, drag-painted rows as one undo step, a second finger
 * rolling a stroke back, held terraforming, long-press lift & move, bulldoze confirmation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Group, PerspectiveCamera, Vector3 } from 'three';
import { registerItems, type ItemDef } from '../src/content/catalog';
import { Planet } from '../src/world/planet';
import { PlanetOps } from '../src/world/ops';
import { Empire } from '../src/game/Empire';
import { Clock } from '../src/game/Clock';
import { Commands } from '../src/game/Commands';
import { ToolManager } from '../src/tools/ToolManager';
import { Biome, RoadKind, Zone, type PlanetSpec } from '../src/core/types';
import { tilePosition, type PickResult } from '../src/world/geo';
import { ui } from '../src/ui/store';
import type { Game } from '../src/game/Game';
import type { PointerInfo } from '../src/tools/Tool';

const defs: ItemDef[] = [
  { id: 'tk_kiosk', name: 'Test Kiosk', category: 'services', description: '', footprint: 1, placement: 'surface', cost: 1000, upkeep: 0, tier: 0, requires: { road: false }, coverage: [{ service: 'police', radius: 3, strength: 1, capacity: 100 }] },
  { id: 'tk_tower', name: 'Test Tower', category: 'landmarks', description: '', footprint: 1, placement: 'surface', cost: 5000, upkeep: 0, tier: 0, unique: true, requires: { road: false } },
  { id: 'tk_street', name: 'Test Street', category: 'roads', description: '', footprint: 1, placement: 'surface', cost: 50, upkeep: 0, tier: 0, road: { kind: RoadKind.Street, capacity: 600, speed: 1 } },
  { id: 'tk_zone_r', name: 'Res Low', category: 'zones', description: '', footprint: 1, placement: 'surface', cost: 0, upkeep: 0, tier: 0, zone: Zone.ResLow, tool: 'zone' },
];
registerItems(defs);

const TOUCH: PointerInfo = { touch: true, shift: false, alt: false, ctrl: false, button: 0 };

function spec(): PlanetSpec {
  return {
    id: 'test.toolbox', name: 'Toolbox', type: 'terran', seed: 5, frequency: 12, oceanLevel: 0, mountains: 0, temperature: 15, gravity: 1, axialTilt: 0, dayLength: 240,
    atmosphere: { color: 0x88aaff, density: 1, breathable: true }, hasOcean: false, oceanColor: 0x2266aa, cloudCover: 0, rings: null, moons: [],
  };
}

interface H {
  game: Game;
  planet: Planet;
  cmd: Commands;
  tools: ToolManager;
  hit: (t: number) => PickResult;
}

function harness(mode: 'career' | 'sandbox' = 'career'): H {
  const planet = new Planet(spec());
  planet.elevation.fill(2);
  planet.biome.fill(Biome.Grass);
  const ops = new PlanetOps(planet);
  const empire = Empire.create(mode, 'Test', 1);
  empire.s.money = 1e7;
  const clock = new Clock();
  const view = {
    planet,
    toolLayer: new Group(),
    camera: new PerspectiveCamera(50, 1, 0.05, 1000),
    surface: { overlay: { setHighlight: () => {}, showValues: () => {}, showColors: () => {}, clear: () => {} }, setGrid: () => {}, setZoneDisplay: () => {}, setDistrictDisplay: () => {} },
    buildings: { getMatrix: () => null, forceState: () => {} },
  };
  const game = {
    planet,
    ops,
    empire,
    clock,
    planetView: view,
    activeView: view,
    engine: { width: 390, height: 844, mobile: true },
    progression: { isItemUnlocked: () => true, lockReason: () => null },
    audio: { sfx: () => {}, unlocked: true },
    camera: { target: new Vector3(0, 1, 0), distance: 20, flyTo: () => Promise.resolve(), shake: () => {}, rayAt: () => null },
    input: { touch: true, pick: () => null, lastRay: null },
    god: { powers: [], trigger: () => true },
  } as unknown as Game;
  const cmd = new Commands(game);
  (game as unknown as { commands: Commands }).commands = cmd;
  const tools = new ToolManager(game);
  (game as unknown as { tools: ToolManager }).tools = tools;
  tools.onPlanetLoaded();
  const hit = (t: number): PickResult => ({ tile: t, point: tilePosition(planet, t, new Vector3()), water: false });
  return { game, planet, cmd, tools, hit };
}

/** A straight run of `n` tiles starting at `a` (keeps going "forward" through the hex grid). */
function line(p: Planet, a: number, n: number): number[] {
  const g = p.grid;
  const out = [a, g.neighbor(a, 0)];
  while (out.length < n) {
    const prev = out[out.length - 2], cur = out[out.length - 1];
    const k = g.neighborIndex(cur, prev);
    const d = g.degree(cur);
    out.push(g.neighbor(cur, (k + Math.floor(d / 2)) % d));
  }
  return out;
}

describe('tools', () => {
  let h: H;
  beforeEach(() => {
    h = harness();
    ui.confirm.value = null;
  });

  it('roads: tap the start, tap the end, then keep chaining from the end', () => {
    const { tools, planet: p, hit } = h;
    tools.select({ id: 'road', itemId: 'tk_street' });
    const run = line(p, 100, 9);
    tools.tap(hit(run[0]), TOUCH);
    expect(p.road[run[0]]).toBe(0); // only an anchor so far
    tools.tap(hit(run[4]), TOUCH);
    for (const t of run.slice(0, 5)) expect(p.road[t]).toBe(RoadKind.Street);
    tools.tap(hit(run[8]), TOUCH); // chained from the last end
    for (const t of run) expect(p.road[t]).toBe(RoadKind.Street);
    expect(p.grid.neighborIndex(run[3], run[4])).toBeGreaterThanOrEqual(0);
    expect(p.roadLinks[run[4]]).not.toBe(0);
    expect(tools.escape()).toBe(true); // drops the anchor first
    expect(h.cmd.historySize.undo).toBe(2);
  });

  it('roads: a drag routes around a building', () => {
    const { tools, planet: p, hit, cmd } = h;
    const run = line(p, 300, 7);
    cmd.place('tk_kiosk', run[3], 0);
    tools.select({ id: 'road', itemId: 'tk_street' });
    tools.pointerDown(hit(run[0]), TOUCH);
    tools.pointerMove(hit(run[6]), TOUCH);
    tools.pointerUp(hit(run[6]), TOUCH);
    expect(p.road[run[0]]).toBe(RoadKind.Street);
    expect(p.road[run[6]]).toBe(RoadKind.Street);
    expect(p.road[run[3]]).toBe(0);
    expect(p.building[run[3]]).toBeGreaterThanOrEqual(0);
  });

  it('zones: a brush stroke is one undo step, fill floods a block along its roads', () => {
    const { tools, planet: p, hit, cmd } = h;
    tools.select({ id: 'zone', itemId: 'tk_zone_r' });
    tools.setOption('size', 1);
    const run = line(p, 500, 5);
    tools.pointerDown(hit(run[0]), TOUCH);
    for (const t of run) tools.pointerMove(hit(t), TOUCH);
    tools.pointerUp(hit(run[4]), TOUCH);
    let zoned = 0;
    for (let t = 0; t < p.count; t++) if (p.zone[t] === Zone.ResLow) zoned++;
    expect(zoned).toBeGreaterThanOrEqual(5 * 3);
    expect(cmd.historySize.undo).toBe(1);
    cmd.undo();
    for (let t = 0; t < p.count; t++) expect(p.zone[t]).toBe(0);
    // block fill needs roads around it
    const road = line(p, 700, 6);
    cmd.buildRoad(road, RoadKind.Street);
    tools.setOption('mode', 'fill');
    const seed = p.grid.neighbors(road[2]).find((t) => !p.road[t])!;
    tools.tap(hit(seed), TOUCH);
    let filled = 0;
    for (let t = 0; t < p.count; t++) if (p.zone[t] === Zone.ResLow) filled++;
    expect(filled).toBeGreaterThan(6);
  });

  it('plop: dragging a 1-tile item paints a row as one step; a second finger rolls it back', () => {
    const { tools, planet: p, hit, cmd, game } = h;
    tools.select({ id: 'plop', itemId: 'tk_kiosk' });
    const run = line(p, 900, 5);
    const money0 = game.empire.money;
    tools.pointerDown(hit(run[0]), TOUCH);
    for (const t of run) tools.pointerMove(hit(t), TOUCH);
    tools.pointerUp(hit(run[4]), TOUCH);
    expect(p.buildings.size).toBe(5);
    expect(cmd.historySize.undo).toBe(1);
    expect(game.empire.money).toBe(money0 - 5000);
    // another stroke interrupted by a pinch
    const run2 = line(p, 1100, 4);
    tools.pointerDown(hit(run2[0]), TOUCH);
    for (const t of run2) tools.pointerMove(hit(t), TOUCH);
    expect(p.buildings.size).toBe(9);
    tools.cancelStroke();
    expect(p.buildings.size).toBe(5);
    expect(game.empire.money).toBe(money0 - 5000);
    expect(cmd.historySize.undo).toBe(1);
  });

  it('plop: unique items deselect themselves after landing', async () => {
    const { tools, hit, planet: p } = h;
    tools.select({ id: 'plop', itemId: 'tk_tower' });
    tools.tap(hit(1300), TOUCH);
    expect(p.building[1300]).toBeGreaterThanOrEqual(0);
    await new Promise((r) => setTimeout(r, 80));
    expect(tools.current).toBe(null);
  });

  it('terraform: holding raises the ground over time, one undo step per stroke', () => {
    const { tools, planet: p, hit, cmd } = h;
    tools.select({ id: 'terraform' });
    tools.setOption('size', 2);
    const t = 1000;
    const e0 = p.elevation[t];
    tools.pointerDown(hit(t), TOUCH);
    for (let i = 0; i < 60; i++) tools.update(1 / 30);
    tools.pointerUp(hit(t), TOUCH);
    expect(p.elevation[t]).toBeGreaterThan(e0 + 1);
    expect(cmd.historySize.undo).toBe(1);
    cmd.undo();
    expect(p.elevation[t]).toBe(e0);
  });

  it('long-press lifts a building; lifting the finger sets it down elsewhere (undoable, same id)', () => {
    const { tools, planet: p, hit, cmd } = h;
    const b = cmd.place('tk_kiosk', 1200, 0)!;
    expect(tools.longPress(hit(1200), TOUCH)).toBe(true);
    expect(tools.current?.id).toBe('move');
    const dest = line(p, 1200, 4)[3];
    tools.pointerMove(hit(dest), TOUCH);
    tools.pointerUp(hit(dest), TOUCH);
    expect(p.buildings.get(b.id)?.tile).toBe(dest);
    expect(tools.current).toBe(null); // back to the hand
    cmd.undo();
    expect(p.buildings.get(b.id)?.tile).toBe(1200);
  });

  it('bulldoze asks before flattening a landmark, and does nothing when declined', async () => {
    const { tools, planet: p, hit, cmd } = h;
    cmd.place('tk_tower', 1400, 0);
    tools.select({ id: 'bulldoze' });
    tools.tap(hit(1400), TOUCH);
    await Promise.resolve();
    expect(ui.confirm.value?.title).toContain('Test Tower');
    ui.confirm.value!.resolve(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(p.building[1400]).toBeGreaterThanOrEqual(0);
    tools.tap(hit(1400), TOUCH);
    await Promise.resolve();
    ui.confirm.value!.resolve(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(p.building[1400]).toBe(-1);
  });
});
