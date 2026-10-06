/**
 * OWNER: tools. CameraRig gestures on a headless planet: direct-manipulation invariants (the grabbed ground stays
 * under the finger, pinches zoom toward the fingers), limits, rubber-banding, the zoom-out hand-off, flights,
 * automatic tilt and terrain / building anti-clipping.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PerspectiveCamera, Vector2, Vector3 } from 'three';
import { CameraRig } from '../src/render/CameraRig';
import { Planet } from '../src/world/planet';
import { pickTile, tileNormal } from '../src/world/geo';
import { registerItems } from '../src/content/catalog';
import { Biome, type PlanetSpec } from '../src/core/types';
import type { Game } from '../src/game/Game';
import type { PlanetView } from '../src/render/PlanetView';

registerItems([{ id: 'tc_tower', name: 'Test Tower', category: 'landmarks', description: '', footprint: 1, placement: 'surface', cost: 0, upkeep: 0, tier: 0, height: 30, requires: { road: false } }]);

const W = 390;
const H = 844;

function spec(): PlanetSpec {
  return {
    id: 'test.camera', name: 'Lensia', type: 'terran', seed: 7, frequency: 16, oceanLevel: 0, mountains: 0, temperature: 15, gravity: 1, axialTilt: 0, dayLength: 240,
    atmosphere: { color: 0x88aaff, density: 1, breathable: true }, hasOcean: false, oceanColor: 0x2266aa, cloudCover: 0, rings: null, moons: [],
  };
}

interface Rig {
  rig: CameraRig;
  planet: Planet;
  cam: PerspectiveCamera;
  zoomOuts: number;
}

function setup(): Rig {
  const planet = new Planet(spec());
  planet.elevation.fill(2);
  planet.biome.fill(Biome.Grass);
  const cam = new PerspectiveCamera(50, W / H, 0.05, planet.radius * 400);
  const out: Rig = { rig: null as unknown as CameraRig, planet, cam, zoomOuts: 0 };
  const game = {
    engine: { width: W, height: H, canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }) } },
    cosmos: { requestZoomOut: () => out.zoomOuts++ },
  } as unknown as Game;
  const view = { planet, camera: cam } as unknown as PlanetView;
  out.rig = new CameraRig(game);
  out.rig.attach(view);
  out.rig.snap();
  out.rig.update(1 / 60);
  return out;
}

/** World point of the ground under a screen pixel. */
function groundAt(r: Rig, x: number, y: number): Vector3 | null {
  const ndc = r.rig.ndc(x, y, new Vector2());
  const hit = pickTile(r.planet, r.rig.rayAt(ndc));
  return hit ? hit.point.clone() : null;
}

function settle(r: Rig, seconds = 2): void {
  for (let i = 0; i < seconds * 60; i++) r.rig.update(1 / 60);
}

describe('CameraRig', () => {
  let r: Rig;
  beforeEach(() => {
    r = setup();
    // a comfortable building view
    void r.rig.flyTo(r.rig.targetTile(), { distance: 24, tilt: 0.7, heading: 0 });
    r.rig.snap();
    r.rig.update(1 / 60);
  });

  it('keeps the grabbed ground under the finger while dragging', () => {
    const p0 = groundAt(r, 200, 520)!;
    expect(p0).toBeTruthy();
    r.rig.grabStart(r.rig.ndc(200, 520));
    for (let i = 1; i <= 10; i++) r.rig.grabMove(r.rig.ndc(200 - i * 8, 520 - i * 14));
    const p1 = groundAt(r, 120, 380)!;
    r.rig.grabEnd();
    expect(p1.distanceTo(p0)).toBeLessThan(0.15);
    expect(r.rig.distance).toBeCloseTo(24, 5);
  });

  it('pinch zooms toward the fingers, keeping the midpoint anchored', () => {
    const mid = groundAt(r, 195, 450)!;
    r.rig.pinchStart(150, 450, 240, 450);
    for (let i = 1; i <= 10; i++) r.rig.pinchMove(150 - i * 7, 450, 240 + i * 7, 450);
    r.rig.pinchEnd();
    expect(r.rig.distance).toBeLessThan(24 * 0.6);
    const after = groundAt(r, 195, 450)!;
    expect(after.distanceTo(mid)).toBeLessThan(0.25);
  });

  it('twisting two fingers rotates the heading (with a dead zone for pure pinches)', () => {
    const h0 = r.rig.heading;
    r.rig.pinchStart(150, 450, 240, 450);
    r.rig.pinchMove(148, 450, 242, 450); // tiny spread, no twist
    expect(r.rig.heading).toBeCloseTo(h0, 6);
    // rotate the finger pair by ~40°
    const a = (40 * Math.PI) / 180;
    const cx = 195, cy = 450, rad = 45;
    for (let i = 1; i <= 8; i++) {
      const t = (a * i) / 8;
      r.rig.pinchMove(cx - Math.cos(t) * rad, cy - Math.sin(t) * rad, cx + Math.cos(t) * rad, cy + Math.sin(t) * rad);
    }
    r.rig.pinchEnd();
    expect(Math.abs(r.rig.heading - h0)).toBeGreaterThan(0.3);
  });

  it('a parallel two-finger slide tilts', () => {
    const t0 = r.rig.tilt;
    r.rig.pinchStart(140, 520, 250, 520);
    for (let i = 1; i <= 10; i++) r.rig.pinchMove(140, 520 - i * 14, 250, 520 - i * 14);
    r.rig.pinchEnd();
    expect(r.rig.tilt).toBeGreaterThan(t0 + 0.3);
    expect(r.rig.autoTilt).toBe(false);
  });

  it('clamps zoom with rubber-band limits and hands off to the star map past the far limit', () => {
    r.rig.zoomBy(1e-4);
    settle(r, 3);
    expect(r.rig.distance).toBeGreaterThanOrEqual(r.rig.minDistance - 1e-6);
    expect(r.rig.distance).toBeLessThan(r.rig.minDistance + 0.05);
    // pinch far past the outer limit
    r.rig.zoomBy(1e4);
    settle(r, 4);
    expect(r.rig.distance).toBeCloseTo(r.rig.maxDistance, 0);
    r.rig.pinchStart(100, 450, 290, 450);
    r.rig.pinchMove(150, 450, 240, 450);
    r.rig.pinchMove(185, 450, 205, 450);
    expect(r.rig.distance).toBeGreaterThan(r.rig.maxDistance); // rubber band
    expect(r.rig.distance).toBeLessThan(r.rig.maxDistance * 1.6);
    r.rig.pinchEnd();
    expect(r.zoomOuts).toBe(1);
    settle(r, 2);
    expect(r.rig.distance).toBeLessThanOrEqual(r.rig.maxDistance * 1.001);
  });

  it('wheel pulls past the limit also ask for the star map (once per burst)', () => {
    r.rig.zoomBy(1e4);
    settle(r, 4);
    for (let i = 0; i < 8; i++) r.rig.zoomAt(r.rig.ndc(195, 400), 1.2, true);
    expect(r.zoomOuts).toBe(1);
  });

  it('flies to a far tile in an arc that climbs and arrives', async () => {
    const p = r.planet;
    const from = r.rig.target.clone();
    // a tile on the other side of the world
    const far = p.grid.tileAt(-from.x, -from.y, -from.z);
    let arrived = false;
    const done = r.rig.flyTo(far, { distance: 20 }).then(() => (arrived = true));
    let peak = 0;
    for (let i = 0; i < 60 * 5; i++) {
      r.rig.update(1 / 60);
      peak = Math.max(peak, r.rig.distance);
    }
    await done;
    expect(arrived).toBe(true);
    expect(peak).toBeGreaterThan(60);
    const dir = tileNormal(p, far, new Vector3());
    expect(r.rig.target.dot(dir)).toBeGreaterThan(0.9999);
    expect(r.rig.distance).toBeCloseTo(20, 3);
  });

  it('tilts toward the skyline automatically as it zooms in', () => {
    r.rig.autoTilt = true;
    r.rig.zoomBy(1e4);
    settle(r, 4);
    const orbitTilt = r.rig.tilt;
    r.rig.zoomBy(1e-4);
    settle(r, 4);
    expect(orbitTilt).toBeLessThan(0.1);
    expect(r.rig.tilt).toBeGreaterThan(1.2);
  });

  it('never clips into the ground or a tall tower', () => {
    const p = r.planet;
    // a tall tower right where the street-level camera wants to be
    r.rig.autoTilt = true;
    r.rig.zoomBy(1e-4);
    settle(r, 3);
    const camTile = p.grid.tileAt(r.cam.position.x, r.cam.position.y, r.cam.position.z);
    p.buildings.set(1, { id: 1, defId: 'tc_tower', tile: camTile, tiles: [camTile], rot: 0, level: 1, variant: 0, style: 'classic', state: 0, builtDay: 0 });
    p.building[camTile] = 1;
    settle(r, 1);
    const ground = p.radius + p.heightOf(camTile);
    expect(r.cam.position.length()).toBeGreaterThan(ground + 30);
    p.building[camTile] = -1;
    p.buildings.delete(1);
    settle(r, 4);
    expect(r.cam.position.length() - (p.radius + p.heightOf(camTile))).toBeGreaterThan(0.3);
    expect(r.cam.position.length() - (p.radius + p.heightOf(camTile))).toBeLessThan(5);
  });

  it('flings with inertia after a quick drag and then comes to rest', () => {
    r.rig.grabStart(r.rig.ndc(200, 600));
    for (let i = 1; i <= 6; i++) r.rig.grabMove(r.rig.ndc(200 - i * 30, 600));
    r.rig.grabEnd();
    const a = r.rig.target.clone();
    r.rig.update(1 / 60);
    const b = r.rig.target.clone();
    expect(a.angleTo(b)).toBeGreaterThan(1e-5);
    settle(r, 4);
    const c = r.rig.target.clone();
    r.rig.update(1 / 60);
    expect(c.angleTo(r.rig.target)).toBeLessThan(1e-6);
  });

  it('follow tracks a moving point and panning releases it', () => {
    const p = r.planet;
    const pos = new Vector3();
    let k = 0;
    const base = tileNormal(p, r.rig.targetTile(), new Vector3());
    r.rig.follow(() => pos.copy(base).applyAxisAngle(new Vector3(0, 1, 0), (k += 0.002)).multiplyScalar(p.radius + 3));
    settle(r, 3);
    expect(r.rig.target.angleTo(pos)).toBeLessThan(0.02);
    expect(r.rig.following).toBe(true);
    r.rig.grabStart(r.rig.ndc(200, 500));
    expect(r.rig.following).toBe(false);
    r.rig.grabEnd();
  });

  it('a cinematic tour runs to the end and pulls out to orbit', () => {
    r.rig.startTour();
    expect(r.rig.touring).toBe(true);
    for (let i = 0; i < 60 * 60 && r.rig.touring; i++) r.rig.update(1 / 30);
    expect(r.rig.touring).toBe(false);
    expect(r.rig.distance).toBeGreaterThan(r.planet.radius * 2);
  });
});
