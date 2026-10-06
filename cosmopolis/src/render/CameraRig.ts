/**
 * OWNER: tools.
 * CameraRig — Google-Earth-style planet camera.
 *
 * State: `target` (unit direction of the look point), `distance` (look point → camera), `heading` (radians from
 * local north) and `tilt` (0 = straight down … ≈1.5 = skimming the horizon). The look point sits on the smoothed
 * ground under the target (plus `lift` when following something airborne).
 *
 * Direct manipulation is exact: grabStart/grabMove keep the grabbed world point under the finger by rotating the
 * whole rig about the planet centre (heading is parallel-transported so nothing twists), release flings with
 * inertia; pinch zooms toward the pinch centre, twists the heading and keeps the midpoint anchored; two-finger
 * vertical drags tilt; wheel / double-tap zoom glide toward the cursor. Distance runs from street level (2.5) to
 * 4.5 R with rubber-band limits; pulling hard past the outer limit asks the cosmos for the star-system view.
 * Tilt follows an automatic curve with zoom (horizon skyline at street level, top-down from orbit) until the
 * player tilts manually. The camera never clips terrain or tall buildings.
 *
 * Also: flyTo (eased arcs that climb for long trips; promise resolves on arrival or interruption), snap(),
 * shake(intensity, seconds) (smooth noise, scaled down with reduce-motion), cinematic tour (Hermite spline over
 * the tallest buildings / landmarks with slow orbits, ending in a pull-out to orbit; any touch cancels it),
 * follow(getPos) for vehicles and orbitals.
 *
 * CONTRACT
 *   target: Vector3 (unit dir)   distance: number   heading / tilt: radians   minDistance / maxDistance
 *   attach(view), update(dt), flyTo(tile | dir, opts) → Promise, snap(), shake(intensity, seconds),
 *   rotateBy(dxPixels, dyPixels), panBy (alias), zoomBy(factor), tiltBy(rad), headingBy(rad),
 *   targetTile(): number, zoom01: number (0 = closest … 1 = farthest), startTour(), stopTour(), touring,
 *   follow(getPos, opts?), stopFollow(), following
 *   + gestures for the InputController: grabStart/grabMove/grabEnd, pinchStart/pinchMove/pinchEnd, zoomAt,
 *     orbitBy, keyMove, interrupt()
 */
import { Quaternion, Ray, Vector2, Vector3, type PerspectiveCamera } from 'three';
import type { Game } from '../game/Game';
import type { System } from '../game/System';
import type { PlanetView } from './PlanetView';
import { getItem } from '../content/catalog';
import { settings } from '../core/settings';
import { pickTile, tileNormal } from '../world/geo';
import { homeSite } from '../world/planetgen';
import { ui } from '../ui/store';

export interface FlyOpts {
  distance?: number;
  tilt?: number;
  heading?: number;
  /** seconds (default: from travel length) */
  duration?: number;
}

export interface FollowOpts {
  distance?: number;
  tilt?: number;
}

interface Pose {
  target: Vector3;
  distance: number;
  heading: number;
  tilt: number;
}

interface Flight {
  from: Pose;
  to: Pose;
  t: number;
  dur: number;
  /** log of the peak distance of the arc (0 = no climb) */
  peak: number;
  done: () => void;
}

interface TourKey {
  t: number;
  x: number;
  y: number;
  z: number;
  /** log distance */
  ld: number;
  h: number;
  tilt: number;
}

interface Pinch {
  d0: number;
  a0: number;
  mid0: Vector2;
  dist0: number;
  heading0: number;
  tilt0: number;
  anchor: Vector3 | null;
  anchorR: number;
  mode: 'undecided' | 'pinch' | 'tilt';
  twistOn: boolean;
  /** twist already applied (radians) */
  twist: number;
  raw: number;
  zoomOutAsked: boolean;
  aY0: number;
  bY0: number;
}

const MIN_D = 2.5;
const TWIST_THRESHOLD = 0.14;
/** distance (log space) → automatic tilt */
const AUTO_TILT: [number, number][] = [
  [2.5, 1.36],
  [6, 1.24],
  [15, 1.06],
  [30, 0.88],
  [60, 0.56],
  [110, 0.24],
  [180, 0.05],
  [260, 0],
];
const MAX_TILT: [number, number][] = [
  [2.5, 1.5],
  [10, 1.45],
  [30, 1.32],
  [66, 1.08],
  [150, 0.72],
  [300, 0.48],
];

const _up = new Vector3();
const _f = new Vector3();
const _r = new Vector3();
const _n0 = new Vector3();
const _r0 = new Vector3();
const _p = new Vector3();
const _l = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _cu = new Vector3();
const _axis = new Vector3();
const _q = new Quaternion();
const _ray = new Ray();
const _ndc = new Vector2();
const _m = new Vector2();
const Y = new Vector3(0, 1, 0);

function curve(table: [number, number][], d: number): number {
  if (d <= table[0][0]) return table[0][1];
  const ld = Math.log(d);
  for (let i = 1; i < table.length; i++) {
    if (d <= table[i][0]) {
      const l0 = Math.log(table[i - 1][0]), l1 = Math.log(table[i][0]);
      const s = (ld - l0) / (l1 - l0);
      const e = s * s * (3 - 2 * s);
      return table[i - 1][1] + (table[i][1] - table[i - 1][1]) * e;
    }
  }
  return table[table.length - 1][1];
}

function wrapPi(a: number): number {
  return a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Local frame at direction t, rotated by heading: up, forward (screen-up when looking down), right. */
function frameAt(t: Vector3, heading: number, up: Vector3, f: Vector3, r: Vector3): void {
  up.copy(t).normalize();
  f.copy(Y).addScaledVector(up, -up.y);
  if (f.lengthSq() < 1e-8) f.set(0, 0, up.y > 0 ? -1 : 1);
  f.normalize();
  r.crossVectors(f, up).normalize();
  const c = Math.cos(heading), s = Math.sin(heading);
  const fx = f.x * c + r.x * s, fy = f.y * c + r.y * s, fz = f.z * c + r.z * s;
  const rx = r.x * c - f.x * s, ry = r.y * c - f.y * s, rz = r.z * c - f.z * s;
  f.set(fx, fy, fz);
  r.set(rx, ry, rz);
}

/** Heading of tangent `fwd` at direction t (inverse of frameAt). */
function headingOf(t: Vector3, fwd: Vector3): number {
  frameAt(t, 0, _a, _n0, _r0);
  return Math.atan2(fwd.dot(_r0), fwd.dot(_n0));
}

export class CameraRig implements System {
  view: PlanetView | null = null;
  readonly target = new Vector3(0, 0, 1);
  distance = 60;
  heading = 0;
  tilt = 0.75;
  minDistance = MIN_D;
  maxDistance = 300;
  touring = false;
  following = false;
  /** tilt follows zoom until the player tilts by hand */
  autoTilt = true;
  /** extra height of the look point (following aircraft / orbitals) */
  lift = 0;

  private goal: Pose = { target: new Vector3(0, 0, 1), distance: 60, heading: 0, tilt: 0.75 };
  private groundH = 0;
  private groundFrozen = false;
  private clipLift = 0;
  private flight: Flight | null = null;
  private shakeT = 0;
  private shakeDur = 1;
  private shakeI = 0;
  private shakeSeed = 0;
  private time = 0;
  /** inertia: angular velocity (axis * rad/s) */
  private spin = new Vector3();
  private spinAvg = new Vector3();
  private lastGrabT = 0;
  private grabbing = false;
  private grabPoint = new Vector3();
  private grabR = 0;
  private grabMissNdc = new Vector2();
  private grabMiss = false;
  private pinch: Pinch | null = null;
  private zoomAnchor: { point: Vector3; ndc: Vector2; ttl: number } | null = null;
  private elastic = 0;
  private overscroll = 0;
  private overscrollT = 0;
  private lastZoomOutAsk = -10;
  private followFn: (() => Vector3 | null | undefined) | null = null;
  private followLift = 0;
  private tour: { keys: TourKey[]; t: number; chrome: boolean } | null = null;
  private lastNear = 0;
  private lastFar = 0;
  private rect: DOMRect | null = null;
  private rectT = 0;

  constructor(private game: Game) {}

  init(): void {}

  // ─────────────────────────────────────────────── lifecycle

  attach(view: PlanetView): void {
    this.view = view;
    const p = view.planet;
    const R = p.radius;
    this.minDistance = MIN_D;
    this.maxDistance = R * 4.5;
    this.stopTourInternal(false);
    this.stopFollow();
    this.finishFlight(false);
    this.pinch = null;
    this.grabbing = false;
    this.spin.set(0, 0, 0);
    this.zoomAnchor = null;
    this.elastic = 0;
    this.lift = 0;
    this.clipLift = 0;
    // look at the city (or the recommended settlement site)
    const site = this.citySite();
    tileNormal(p, site, this.target);
    this.goal.target.copy(this.target);
    this.heading = this.goal.heading = 0;
    this.autoTilt = true;
    this.distance = this.goal.distance = R * 3.2;
    this.tilt = this.goal.tilt = curve(AUTO_TILT, this.distance);
    this.groundH = this.surfaceAt(site);
    this.applyPose(0);
    // arrival: descend from orbit toward the city
    void this.flyTo(site, { distance: Math.min(R * 0.7, 46), duration: this.reduceMotion ? 0.01 : 2.6 });
  }

  private citySite(): number {
    const p = this.view!.planet;
    if (p.buildings.size) {
      _p.set(0, 0, 0);
      for (const b of p.buildings.values()) _p.add(tileNormal(p, b.tile, _a));
      if (_p.lengthSq() > 1e-6) return p.grid.tileAt(_p.x, _p.y, _p.z);
    }
    try {
      return homeSite(p);
    } catch {
      return 0;
    }
  }

  private get reduceMotion(): boolean {
    if (settings.value.reduceMotion) return true;
    try {
      return matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────── queries

  get zoom01(): number {
    const v = Math.log(this.distance / this.minDistance) / Math.log(this.maxDistance / this.minDistance);
    return Math.max(0, Math.min(1, v));
  }

  targetTile(): number {
    const p = this.view?.planet;
    return p ? p.grid.tileAt(this.target.x, this.target.y, this.target.z) : 0;
  }

  /** Effective tilt limit at a distance (wider views can't look as far up). */
  maxTiltAt(d: number): number {
    return curve(MAX_TILT, d);
  }

  autoTiltAt(d: number): number {
    return curve(AUTO_TILT, d);
  }

  /** Camera altitude above the ground directly below it. */
  get altitude(): number {
    const v = this.view;
    if (!v) return this.distance;
    const c = v.camera.position;
    const t = v.planet.grid.tileAt(c.x, c.y, c.z);
    return c.length() - v.planet.radius - this.surfaceAt(t);
  }

  private surfaceAt(tile: number): number {
    const p = this.view!.planet;
    const h = p.heightOf(tile);
    return p.spec.hasOcean ? Math.max(h, p.waterHeight) : h;
  }

  /** Top of whatever stands on a tile (terrain, water or building), above the planet radius. */
  private obstacleTop(tile: number): number {
    const p = this.view!.planet;
    let h = this.surfaceAt(tile);
    const bid = p.building[tile];
    if (bid >= 0) {
      const b = p.buildings.get(bid);
      const def = b ? getItem(b.defId) : undefined;
      if (def) h += (def.height ?? 2) * (def.growable ? 0.5 + 0.12 * b!.level : 1.05);
    }
    return h;
  }

  // ─────────────────────────────────────────────── programmatic control

  rotateBy(dx: number, dy: number): void {
    const v = this.view;
    if (!v) return;
    const R = v.planet.radius;
    const wpp = (2 * this.goal.distance * Math.tan(((v.camera.fov ?? 50) * Math.PI) / 360)) / Math.max(1, this.game.engine.height);
    frameAt(this.goal.target, this.goal.heading, _up, _f, _r);
    this.goal.target.addScaledVector(_r, (-dx * wpp) / R).addScaledVector(_f, (dy * wpp) / R).normalize();
  }

  panBy(dx: number, dy: number): void {
    this.rotateBy(dx, dy);
  }

  zoomBy(f: number): void {
    this.goal.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.goal.distance * f));
  }

  tiltBy(d: number): void {
    this.autoTilt = false;
    this.goal.tilt = Math.max(0, Math.min(this.maxTiltAt(this.goal.distance), this.goal.tilt + d));
  }

  headingBy(d: number): void {
    this.goal.heading += d;
  }

  /**
   * Glide to a tile or a direction (unit vector or any world point). Long trips climb in an arc.
   * Resolves on arrival (or when interrupted).
   */
  flyTo(where: number | Vector3, o: FlyOpts = {}): Promise<void> {
    const v = this.view;
    if (!v) return Promise.resolve();
    const p = v.planet;
    const to: Pose = { target: new Vector3(), distance: this.goal.distance, heading: this.goal.heading, tilt: this.goal.tilt };
    if (typeof where === 'number') {
      if (where < 0 || where >= p.count) return Promise.resolve();
      tileNormal(p, where, to.target);
    } else to.target.copy(where).normalize();
    if (o.distance !== undefined) to.distance = Math.max(this.minDistance, Math.min(this.maxDistance, o.distance));
    if (o.heading !== undefined) to.heading = this.heading + wrapPi(o.heading - this.heading);
    if (o.tilt !== undefined) {
      this.autoTilt = false;
      to.tilt = Math.min(o.tilt, this.maxTiltAt(to.distance));
    } else if (this.autoTilt) to.tilt = this.autoTiltAt(to.distance);
    else to.tilt = Math.min(to.tilt, this.maxTiltAt(to.distance));
    this.finishFlight(false);
    this.stopTourInternal(false);
    this.spin.set(0, 0, 0);
    this.zoomAnchor = null;
    const from: Pose = { target: this.target.clone(), distance: this.distance, heading: this.heading, tilt: this.tilt };
    const ang = Math.acos(Math.max(-1, Math.min(1, from.target.dot(to.target))));
    const surface = ang * p.radius;
    const near = Math.max(from.distance, to.distance);
    let peak = 0;
    if (surface > near * 1.6 && !this.reduceMotion) peak = Math.log(Math.min(this.maxDistance * 0.95, Math.max(near * 1.4, surface * 0.85)));
    let dur = o.duration ?? Math.min(3.2, 0.85 + ang * 1.5 + Math.abs(Math.log(to.distance / from.distance)) * 0.22 + (peak ? 0.5 : 0));
    if (this.reduceMotion) dur = Math.min(dur, 0.3);
    return new Promise<void>((resolve) => {
      this.flight = { from, to, t: 0, dur: Math.max(0.01, dur), peak, done: resolve };
      this.goal.target.copy(to.target);
      this.goal.distance = to.distance;
      this.goal.heading = to.heading;
      this.goal.tilt = to.tilt;
    });
  }

  /** Jump to the goal instantly (completes any flight). */
  snap(): void {
    if (this.flight) this.finishFlight(true);
    this.target.copy(this.goal.target);
    this.distance = this.goal.distance;
    this.heading = this.goal.heading;
    this.tilt = this.goal.tilt;
    if (this.view) {
      this.groundH = this.surfaceAt(this.targetTile());
      this.applyPose(0);
    }
  }

  shake(intensity: number, seconds: number): void {
    if (!(intensity > 0) || !(seconds > 0)) return;
    if (this.shakeT <= 0) this.shakeSeed = Math.random() * 100;
    this.shakeI = Math.max(this.shakeI * (this.shakeT > 0 ? 1 : 0), intensity);
    this.shakeT = Math.max(this.shakeT, seconds);
    this.shakeDur = Math.max(this.shakeT, 0.01);
  }

  // ─────────────────────────────────────────────── follow

  /** Keep the look point on a moving world position (return null to end). Panning stops following. */
  follow(getPos: () => Vector3 | null | undefined, o: FollowOpts = {}): void {
    this.stopTourInternal(false);
    this.finishFlight(false);
    this.followFn = getPos;
    this.following = true;
    if (o.distance !== undefined) this.goal.distance = Math.max(this.minDistance, Math.min(this.maxDistance, o.distance));
    if (o.tilt !== undefined) {
      this.autoTilt = false;
      this.goal.tilt = o.tilt;
    }
  }

  stopFollow(): void {
    this.followFn = null;
    this.following = false;
    this.followLift = 0;
  }

  // ─────────────────────────────────────────────── cinematic tour

  startTour(): void {
    const v = this.view;
    if (!v) return;
    const p = v.planet;
    const R = p.radius;
    this.finishFlight(false);
    this.stopFollow();
    this.spin.set(0, 0, 0);
    // points of interest: landmarks, wonders and the tallest towers, spread apart
    const scored: { tile: number; score: number; h: number }[] = [];
    for (const b of p.buildings.values()) {
      const def = getItem(b.defId);
      if (!def) continue;
      const h = (def.height ?? 1.5) * (def.growable ? 0.5 + 0.12 * b.level : 1);
      let s = h + def.footprint * 0.25;
      if (def.category === 'landmarks') s += 8;
      if (def.unique) s += 12;
      if (b.name) s += 2;
      scored.push({ tile: b.tile, score: s, h });
    }
    scored.sort((a, b) => b.score - a.score);
    const pois: { dir: Vector3; h: number }[] = [];
    for (const s of scored) {
      const dir = tileNormal(p, s.tile, new Vector3());
      if (pois.some((q) => q.dir.dot(dir) > Math.cos(0.11))) continue;
      pois.push({ dir, h: s.h });
      if (pois.length >= 6) break;
    }
    if (!pois.length) {
      // an empty world: sweep over its highest peaks
      const peaks: number[] = [];
      for (let t = 0; t < p.count; t++) if (!p.isWater(t)) peaks.push(t);
      peaks.sort((a, b) => p.elevation[b] - p.elevation[a]);
      for (const t of peaks) {
        const dir = tileNormal(p, t, new Vector3());
        if (pois.some((q) => q.dir.dot(dir) > Math.cos(0.5))) continue;
        pois.push({ dir, h: 2 });
        if (pois.length >= 4) break;
      }
    }
    // nearest-neighbour order from where we are
    const ordered: typeof pois = [];
    let cur = this.target.clone();
    const left = pois.slice();
    while (left.length) {
      let bi = 0, bd = -2;
      left.forEach((q, i) => {
        const d = q.dir.dot(cur);
        if (d > bd) {
          bd = d;
          bi = i;
        }
      });
      const q = left.splice(bi, 1)[0];
      ordered.push(q);
      cur = q.dir;
    }
    const keys: TourKey[] = [];
    let t = 0;
    let h = this.heading;
    const push = (dir: Vector3, d: number, heading: number, tilt: number) => keys.push({ t, x: dir.x, y: dir.y, z: dir.z, ld: Math.log(Math.max(MIN_D, Math.min(this.maxDistance, d))), h: heading, tilt });
    push(this.target, this.distance, h, this.tilt);
    let prev = this.target.clone();
    for (const q of ordered) {
      const ang = Math.acos(Math.max(-1, Math.min(1, prev.dot(q.dir))));
      const near = Math.max(9, Math.min(28, q.h * 2.6 + 7));
      if (ang * R > 40) {
        t += 2.6 + Math.min(3, ang * 2);
        h += 0.5;
        push(_a.copy(prev).add(q.dir).normalize(), Math.min(this.maxDistance * 0.8, Math.max(near * 2, ang * R * 0.75)), h, 0.62);
      }
      t += 3.4 + Math.min(4, (ang * R) / 18);
      h += 0.7;
      push(q.dir, near, h, 1.12);
      t += 3.6;
      h += 0.8;
      push(q.dir, near * 0.9, h, 1.24);
      t += 3.6;
      h += 0.8;
      push(q.dir, near * 1.08, h, 1.06);
      prev = q.dir;
    }
    t += 6;
    h += 0.6;
    push(prev, R * 2.6, h, 0.1);
    this.tour = { keys, t: 0, chrome: ui.chromeHidden.value };
    this.touring = true;
    this.autoTilt = false;
  }

  stopTour(): void {
    this.stopTourInternal(true);
  }

  private stopTourInternal(restoreChrome: boolean): void {
    if (!this.tour) {
      this.touring = false;
      return;
    }
    const chrome = this.tour.chrome;
    this.tour = null;
    this.touring = false;
    this.goal.target.copy(this.target);
    this.goal.distance = this.distance;
    this.goal.heading = this.heading;
    this.goal.tilt = this.tilt;
    if (restoreChrome && chrome) ui.chromeHidden.value = false;
  }

  private sampleTour(time: number): void {
    const k = this.tour!.keys;
    let i = 0;
    while (i < k.length - 2 && time > k[i + 1].t) i++;
    const a = k[i], b = k[i + 1];
    const prev = k[i - 1], next = k[i + 2];
    const span = Math.max(1e-3, b.t - a.t);
    const s = Math.max(0, Math.min(1, (time - a.t) / span));
    const s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    const tan = (pa: number, pb: number, kPrev: TourKey | undefined, kNext: TourKey | undefined, getter: (x: TourKey) => number, which: 'a' | 'b'): number => {
      // Catmull-Rom tangents with non-uniform timing; ease to zero at the ends
      if (which === 'a') return kPrev ? ((pb - getter(kPrev)) / (b.t - kPrev.t)) * span : 0;
      return kNext ? ((getter(kNext) - pa) / (kNext.t - a.t)) * span : 0;
    };
    const comp = (g: (x: TourKey) => number) => {
      const pa = g(a), pb = g(b);
      return h00 * pa + h10 * tan(pa, pb, prev, next, g, 'a') + h01 * pb + h11 * tan(pa, pb, prev, next, g, 'b');
    };
    this.target.set(comp((x) => x.x), comp((x) => x.y), comp((x) => x.z)).normalize();
    this.distance = Math.exp(comp((x) => x.ld));
    this.heading = comp((x) => x.h);
    this.tilt = Math.max(0, Math.min(this.maxTiltAt(this.distance), comp((x) => x.tilt)));
    this.goal.target.copy(this.target);
    this.goal.distance = this.distance;
    this.goal.heading = this.heading;
    this.goal.tilt = this.tilt;
  }

  // ─────────────────────────────────────────────── gestures (InputController)

  /** Stop anything automatic (flight, tour, inertia, zoom glides). */
  interrupt(): void {
    if (this.tour) this.stopTourInternal(true);
    this.finishFlight(false);
    this.spin.set(0, 0, 0);
    this.zoomAnchor = null;
  }

  /** Normalised device coords from client px (canvas rect cached, refreshed every second). */
  ndc(clientX: number, clientY: number, out = new Vector2()): Vector2 {
    const now = performance.now();
    if (!this.rect || now - this.rectT > 1000) {
      this.rect = this.game.engine.canvas.getBoundingClientRect();
      this.rectT = now;
    }
    const r = this.rect;
    return out.set(((clientX - r.left) / Math.max(1, r.width)) * 2 - 1, -((clientY - r.top) / Math.max(1, r.height)) * 2 + 1);
  }

  /** Forget the cached canvas rect (resize / orientation change). */
  refreshRect(): void {
    this.rect = null;
  }

  /** World ray through NDC for the current camera pose. */
  rayAt(ndc: Vector2, out = _ray): Ray {
    const cam = this.view!.camera;
    out.origin.setFromMatrixPosition(cam.matrixWorld);
    out.direction.set(ndc.x, ndc.y, 0.5).unproject(cam).sub(out.origin).normalize();
    return out;
  }

  /** Where a ray meets the sphere of radius `rad` (or the horizon direction when it misses). */
  private sphereHit(ray: Ray, rad: number, out: Vector3): boolean {
    const o = ray.origin, d = ray.direction;
    const b = o.dot(d);
    const c = o.lengthSq() - rad * rad;
    const disc = b * b - c;
    if (disc >= 0) {
      const t = -b - Math.sqrt(disc);
      if (t > 0) {
        out.copy(d).multiplyScalar(t).add(o);
        return true;
      }
    }
    // miss: closest approach → horizon direction
    out.copy(d).multiplyScalar(Math.max(0, -b)).add(o);
    if (out.lengthSq() < 1e-6) out.copy(o);
    out.setLength(rad);
    return false;
  }

  /** Rotate the whole rig about the planet centre (heading transported so the view does not twist). */
  private rotateRig(q: Quaternion): void {
    frameAt(this.target, this.heading, _up, _f, _r);
    _f.applyQuaternion(q);
    this.target.applyQuaternion(q).normalize();
    const h = headingOf(this.target, _f);
    this.heading = this.heading + wrapPi(h - this.heading);
    this.goal.target.copy(this.target);
    this.goal.heading = this.heading;
  }

  /** Keep world point `anchor` under screen position `ndc` (rotating the rig). */
  private anchorTo(anchor: Vector3, ndc: Vector2): void {
    this.applyPose(0);
    const rad = anchor.length();
    this.sphereHit(this.rayAt(ndc), rad, _b);
    _a.copy(anchor).normalize();
    _b.normalize();
    if (_a.dot(_b) > 0.9999999) return;
    _q.setFromUnitVectors(_b, _a);
    this.rotateRig(_q);
  }

  private pick(ndc: Vector2, out: Vector3): boolean {
    const v = this.view!;
    const ray = this.rayAt(ndc);
    const hit = pickTile(v.planet, ray);
    if (hit) {
      out.copy(hit.point);
      return true;
    }
    return this.sphereHit(ray, v.planet.radius + this.groundH, out);
  }

  grabStart(ndc: Vector2): void {
    if (!this.view) return;
    this.interrupt();
    this.stopFollow();
    this.applyPose(0);
    this.grabbing = true;
    this.groundFrozen = true;
    this.spinAvg.set(0, 0, 0);
    this.lastGrabT = performance.now();
    this.grabMiss = !this.pick(ndc, this.grabPoint);
    this.grabMissNdc.copy(ndc);
    this.grabR = this.grabPoint.length();
  }

  grabMove(ndc: Vector2): void {
    if (!this.view || !this.grabbing) return;
    const now = performance.now();
    const dt = Math.max(0.004, (now - this.lastGrabT) / 1000);
    this.lastGrabT = now;
    if (this.grabMiss) {
      // grabbed empty space: trackball spin
      const k = 1.6;
      const dx = ndc.x - this.grabMissNdc.x, dy = ndc.y - this.grabMissNdc.y;
      this.grabMissNdc.copy(ndc);
      frameAt(this.target, this.heading, _up, _f, _r);
      _axis.copy(_r).multiplyScalar(dy * k).addScaledVector(_f, -dx * k);
      const ang = _axis.length();
      if (ang > 1e-6) {
        _axis.normalize();
        _q.setFromAxisAngle(_axis, ang);
        this.rotateRig(_q);
        this.trackSpin(_axis, ang, dt);
      }
      this.applyPose(0);
      return;
    }
    this.applyPose(0);
    this.sphereHit(this.rayAt(ndc), this.grabR, _b);
    _a.copy(this.grabPoint).normalize();
    _b.normalize();
    const dot = _a.dot(_b);
    if (dot > 0.99999999) return;
    _q.setFromUnitVectors(_b, _a);
    _axis.crossVectors(_b, _a);
    const ang = Math.acos(Math.min(1, dot));
    this.rotateRig(_q);
    if (_axis.lengthSq() > 1e-12) this.trackSpin(_axis.normalize(), ang, dt);
    this.applyPose(0);
  }

  private trackSpin(axis: Vector3, ang: number, dt: number): void {
    // exponential average of angular velocity (axis * rad/s)
    const w = Math.min(1, dt / 0.05);
    _p.copy(axis).multiplyScalar(ang / dt);
    this.spinAvg.multiplyScalar(1 - w).addScaledVector(_p, w);
  }

  grabEnd(): void {
    if (!this.grabbing) return;
    this.grabbing = false;
    this.groundFrozen = false;
    const idle = (performance.now() - this.lastGrabT) / 1000;
    if (idle < 0.08 && !this.reduceMotion) {
      this.spin.copy(this.spinAvg);
      // cap the fling: surface speed ≤ ~5 screen heights per second
      const R = this.view?.planet.radius ?? 60;
      const max = (this.distance * 5) / R;
      if (this.spin.length() > max) this.spin.setLength(max);
    } else this.spin.set(0, 0, 0);
  }

  /** Two-finger gesture start (client px of both fingers). */
  pinchStart(ax: number, ay: number, bx: number, by: number): void {
    if (!this.view) return;
    this.interrupt();
    if (this.grabbing) {
      this.grabbing = false;
      this.spin.set(0, 0, 0);
    }
    this.applyPose(0);
    this.groundFrozen = true;
    const mid = new Vector2((ax + bx) / 2, (ay + by) / 2);
    const anchor = new Vector3();
    const hit = this.pick(this.ndc(mid.x, mid.y, _m), anchor);
    this.pinch = {
      d0: Math.max(1, Math.hypot(bx - ax, by - ay)),
      a0: Math.atan2(by - ay, bx - ax),
      mid0: mid,
      dist0: this.distance,
      heading0: this.heading,
      tilt0: this.tilt,
      anchor: hit ? anchor : null,
      anchorR: anchor.length(),
      mode: 'undecided',
      twistOn: false,
      twist: 0,
      raw: this.distance,
      zoomOutAsked: false,
      aY0: ay,
      bY0: by,
    };
  }

  pinchMove(ax: number, ay: number, bx: number, by: number): void {
    const pz = this.pinch;
    if (!pz || !this.view) return;
    const d = Math.max(1, Math.hypot(bx - ax, by - ay));
    const ang = Math.atan2(by - ay, bx - ax);
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const dAng = wrapPi(ang - pz.a0);
    if (pz.mode === 'undecided') {
      const dyA = ay - pz.aY0, dyB = by - pz.bY0;
      const spread = Math.abs(d - pz.d0);
      const twistPx = Math.abs(dAng) * d * 0.5;
      const horizontalish = Math.abs(Math.cos(pz.a0)) > 0.55;
      if (horizontalish && Math.sign(dyA) === Math.sign(dyB) && Math.abs(dyA) > 9 && Math.abs(dyB) > 9 && spread < Math.min(Math.abs(dyA), Math.abs(dyB)) * 0.6 && twistPx < 14) pz.mode = 'tilt';
      else if (spread > 8 || twistPx > 10 || Math.hypot(mx - pz.mid0.x, my - pz.mid0.y) > 8) pz.mode = 'pinch';
      else return;
    }
    if (pz.mode === 'tilt') {
      this.autoTilt = false;
      const t = pz.tilt0 + (pz.mid0.y - my) * 0.0058;
      this.tilt = this.goal.tilt = Math.max(0, Math.min(this.maxTiltAt(this.distance), t));
      this.applyPose(0);
      return;
    }
    // zoom with rubber-band limits
    pz.raw = pz.dist0 * (pz.d0 / d);
    this.distance = this.goal.distance = this.rubber(pz.raw);
    if (!pz.zoomOutAsked && pz.raw > this.maxDistance * 1.55) {
      pz.zoomOutAsked = true;
      this.askZoomOut();
    }
    // twist (with a dead zone so pure pinches never rotate)
    if (!pz.twistOn && Math.abs(dAng) > TWIST_THRESHOLD) pz.twistOn = true;
    if (pz.twistOn) {
      const eff = dAng - Math.sign(dAng) * TWIST_THRESHOLD * (Math.abs(dAng) > TWIST_THRESHOLD ? 1 : Math.abs(dAng) / TWIST_THRESHOLD);
      // incremental so the heading transport done by the anchor rotation accumulates correctly
      this.heading -= eff - pz.twist;
      this.goal.heading = this.heading;
      pz.twist = eff;
    }
    if (this.autoTilt) this.tilt = this.goal.tilt = this.autoTiltAt(this.distance);
    else this.tilt = this.goal.tilt = Math.min(this.tilt, this.maxTiltAt(this.distance));
    if (pz.anchor) this.anchorTo(pz.anchor, this.ndc(mx, my, _m));
    this.applyPose(0);
  }

  pinchEnd(): void {
    if (!this.pinch) return;
    this.pinch = null;
    this.groundFrozen = false;
    this.goal.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
    if (this.goal.distance > this.maxDistance * 0.9 && !this.autoTilt) this.autoTilt = true;
  }

  /** True while a two-finger gesture is running. */
  get pinching(): boolean {
    return !!this.pinch;
  }

  /** Zoom by `factor` (<1 = in) keeping the point under `ndc` fixed. */
  zoomAt(ndc: Vector2, factor: number, smooth = true): void {
    const v = this.view;
    if (!v) return;
    this.finishFlight(false);
    if (this.tour) this.stopTourInternal(true);
    const point = new Vector3();
    this.applyPose(0);
    const hit = this.pick(ndc, point);
    const before = this.goal.distance;
    let next = before * factor;
    if (factor > 1 && before >= this.maxDistance * 0.999) {
      // pulling out past the limit: elastic + ask for the system view
      this.elastic = Math.min(0.16, this.elastic + (factor - 1) * 0.5);
      this.overscroll += factor - 1;
      this.overscrollT = 0.7;
      if (this.overscroll > 0.55) {
        this.overscroll = 0;
        this.askZoomOut();
      }
    }
    next = Math.max(this.minDistance, Math.min(this.maxDistance, next));
    this.goal.distance = next;
    if (this.autoTilt) this.goal.tilt = this.autoTiltAt(next);
    if (!hit) {
      this.zoomAnchor = null;
      return;
    }
    if (smooth && !this.reduceMotion) {
      this.zoomAnchor = { point, ndc: ndc.clone(), ttl: 0.9 };
    } else {
      this.distance = next;
      this.tilt = this.goal.tilt = Math.min(this.goal.tilt, this.maxTiltAt(next));
      this.anchorTo(point, ndc);
      this.applyPose(0);
    }
  }

  /** Mouse right-drag / keyboard: rotate heading and tilt directly. */
  orbitBy(dHeading: number, dTilt: number): void {
    this.interrupt();
    this.heading += dHeading;
    this.goal.heading = this.heading;
    if (dTilt) {
      this.autoTilt = false;
      this.tilt = this.goal.tilt = Math.max(0, Math.min(this.maxTiltAt(this.distance), this.tilt + dTilt));
    }
  }

  /** Continuous keyboard motion: pan (screen axes, −1..1), heading / tilt rates, zoom rate (log). */
  keyMove(dt: number, pan: Vector2, dHeading: number, dTilt: number, dZoom: number): void {
    if (!this.view) return;
    if (pan.lengthSq() || dHeading || dTilt || dZoom) {
      if (this.tour) this.stopTourInternal(true);
      this.finishFlight(false);
      this.spin.set(0, 0, 0);
    }
    const R = this.view.planet.radius;
    if (pan.lengthSq()) {
      this.stopFollow();
      const speed = (this.goal.distance * 1.1 * dt) / R;
      frameAt(this.goal.target, this.goal.heading, _up, _f, _r);
      this.goal.target.addScaledVector(_r, pan.x * speed).addScaledVector(_f, pan.y * speed).normalize();
    }
    if (dHeading) this.goal.heading += dHeading * dt * 1.6;
    if (dTilt) this.tiltBy(dTilt * dt * 1.1);
    if (dZoom) {
      this.goal.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.goal.distance * Math.exp(dZoom * dt * 1.6)));
      if (this.autoTilt) this.goal.tilt = this.autoTiltAt(this.goal.distance);
    }
  }

  private rubber(raw: number): number {
    const lo = this.minDistance, hi = this.maxDistance;
    if (raw < lo) return lo * Math.pow(raw / lo, 0.28);
    if (raw > hi) return hi * Math.pow(raw / hi, 0.28);
    return raw;
  }

  private askZoomOut(): void {
    const now = this.time;
    if (now - this.lastZoomOutAsk < 1.5) return;
    this.lastZoomOutAsk = now;
    try {
      const c = this.game.cosmos as unknown as { requestZoomOut?: () => void };
      if (c && typeof c.requestZoomOut === 'function') c.requestZoomOut();
    } catch (e) {
      console.error('[camera] requestZoomOut failed', e);
    }
  }

  private finishFlight(jump: boolean): void {
    const f = this.flight;
    if (!f) return;
    this.flight = null;
    if (jump) {
      this.target.copy(f.to.target);
      this.distance = f.to.distance;
      this.heading = f.to.heading;
      this.tilt = f.to.tilt;
    }
    this.goal.target.copy(this.target);
    this.goal.distance = this.distance;
    this.goal.heading = this.heading;
    this.goal.tilt = this.tilt;
    try {
      f.done();
    } catch {
      /* ignore */
    }
  }

  // ─────────────────────────────────────────────── frame

  update(dt: number): void {
    const v = this.view;
    if (!v) return;
    dt = Math.min(0.1, Math.max(0, dt));
    this.time += dt;
    const p = v.planet;
    const R = p.radius;
    if (this.tour) {
      this.tour.t += dt;
      const end = this.tour.keys[this.tour.keys.length - 1].t;
      if (this.tour.keys.length < 2 || this.tour.t >= end) {
        if (this.tour.keys.length >= 2) this.sampleTour(end);
        this.stopTourInternal(true);
        this.autoTilt = true;
        this.goal.tilt = this.autoTiltAt(this.goal.distance);
      } else this.sampleTour(this.tour.t);
    } else if (this.flight) {
      const f = this.flight;
      f.t += dt;
      const s = Math.min(1, f.t / f.dur);
      const e = easeInOut(s);
      // travel lags the climb on long arcs (zoom out → glide → zoom in)
      const st = f.peak ? easeInOut(Math.max(0, Math.min(1, (s - 0.12) / 0.76))) : e;
      slerpDir(f.from.target, f.to.target, st, this.target);
      const l0 = Math.log(f.from.distance), l1 = Math.log(f.to.distance);
      let ld = l0 + (l1 - l0) * e;
      if (f.peak) ld += Math.max(0, f.peak - Math.max(l0, l1)) * Math.sin(Math.PI * s);
      this.distance = Math.exp(ld);
      this.heading = f.from.heading + (f.to.heading - f.from.heading) * e;
      let tl = f.from.tilt + (f.to.tilt - f.from.tilt) * e;
      if (f.peak) tl *= 1 - 0.65 * Math.sin(Math.PI * s);
      this.tilt = Math.min(tl, this.maxTiltAt(this.distance));
      if (s >= 1) this.finishFlight(true);
    } else {
      // follow
      if (this.followFn) {
        let pos: Vector3 | null | undefined = null;
        try {
          pos = this.followFn();
        } catch (err) {
          console.error('[camera] follow target failed', err);
        }
        if (!pos || !Number.isFinite(pos.x)) this.stopFollow();
        else {
          this.goal.target.copy(pos).normalize();
          const t = p.grid.tileAt(pos.x, pos.y, pos.z);
          this.followLift = Math.max(0, pos.length() - R - this.surfaceAt(t));
        }
      }
      // inertia
      const sp = this.spin.length();
      if (sp > 1e-5) {
        _q.setFromAxisAngle(_a.copy(this.spin).divideScalar(sp), sp * dt);
        this.rotateRig(_q);
        this.spin.multiplyScalar(Math.exp(-dt * 3.6));
        if (sp < 0.0015) this.spin.set(0, 0, 0);
      }
      // elastic overscroll relaxes
      if (this.overscrollT > 0) {
        this.overscrollT -= dt;
        if (this.overscrollT <= 0) this.overscroll = 0;
      }
      if (this.elastic > 1e-4) this.elastic *= Math.exp(-dt * 7);
      else this.elastic = 0;
      if (this.autoTilt && !this.pinch) this.goal.tilt = this.autoTiltAt(this.goal.distance);
      this.goal.tilt = Math.max(0, Math.min(this.maxTiltAt(this.goal.distance), this.goal.tilt));
      if (!this.pinch && !this.grabbing) {
        const k = 1 - Math.exp(-dt * 9);
        if (this.target.distanceToSquared(this.goal.target) > 1e-14) slerpDir(this.target, this.goal.target, this.followFn ? 1 - Math.exp(-dt * 6) : k, this.target);
        const goalD = this.goal.distance * (1 + this.elastic);
        this.distance = Math.exp(Math.log(this.distance) + (Math.log(goalD) - Math.log(this.distance)) * k);
        this.heading += wrapPi(this.goal.heading - this.heading) * k;
        this.goal.heading = this.heading + wrapPi(this.goal.heading - this.heading);
        this.tilt += (this.goal.tilt - this.tilt) * k;
        if (this.zoomAnchor) {
          this.anchorTo(this.zoomAnchor.point, this.zoomAnchor.ndc);
          this.zoomAnchor.ttl -= dt;
          if (this.zoomAnchor.ttl <= 0 || Math.abs(Math.log(this.distance / this.goal.distance)) < 0.002) this.zoomAnchor = null;
        }
      }
    }
    this.lift += (this.followLift - this.lift) * (1 - Math.exp(-dt * 5));
    if (!this.groundFrozen) {
      const gh = this.surfaceAt(this.targetTile());
      this.groundH += (gh - this.groundH) * (1 - Math.exp(-dt * 5));
    }
    this.applyPose(dt);
  }

  /** Position the camera from the current state (with anti-clip + shake) and refresh matrices. */
  private applyPose(dt: number): void {
    const v = this.view;
    if (!v) return;
    const cam: PerspectiveCamera = v.camera;
    const p = v.planet;
    const R = p.radius;
    const d = this.distance;
    const tilt = Math.max(0, Math.min(this.maxTiltAt(d), this.tilt));
    frameAt(this.target, this.heading, _up, _f, _r);
    _l.copy(_up).multiplyScalar(R + this.groundH + this.lift);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    _p.copy(_l).addScaledVector(_up, ct * d).addScaledVector(_f, -st * d);
    _cu.copy(_up).multiplyScalar(st).addScaledVector(_f, ct);
    // anti-clip: stay above terrain, water and building tops around the camera
    const g = p.grid;
    const ct0 = g.tileAt(_p.x, _p.y, _p.z);
    let top = this.obstacleTop(ct0);
    for (let q = g.start[ct0]; q < g.start[ct0 + 1]; q++) top = Math.max(top, this.obstacleTop(g.nbr[q]));
    const need = R + top + 0.32 + d * 0.012 - _p.length();
    if (need > this.clipLift) this.clipLift = need;
    else if (dt > 0) this.clipLift += (Math.max(0, need) - this.clipLift) * (1 - Math.exp(-dt * 2.5));
    else this.clipLift = Math.max(0, Math.max(need, this.clipLift));
    if (this.clipLift > 0) _p.addScaledVector(_a.copy(_p).normalize(), this.clipLift);
    // shake (smooth layered noise)
    if (this.shakeT > 0 && dt > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const env = Math.min(1, this.shakeT / Math.max(0.01, this.shakeDur)) ** 1.5;
      const amp = this.shakeI * env * Math.min(d, 45) * 0.022 * (this.reduceMotion ? 0.2 : 1);
      const t = this.time * 1.0 + this.shakeSeed;
      const sx = Math.sin(t * 31.7) * 0.6 + Math.sin(t * 53.3 + 1.7) * 0.4;
      const sy = Math.sin(t * 27.1 + 0.6) * 0.6 + Math.sin(t * 47.9 + 2.9) * 0.4;
      _p.addScaledVector(_r, sx * amp).addScaledVector(_cu, sy * amp);
      _l.addScaledVector(_r, sx * amp * 0.35).addScaledVector(_cu, sy * amp * 0.35);
      if (this.shakeT <= 0) this.shakeI = 0;
    }
    cam.position.copy(_p);
    cam.up.copy(_cu);
    cam.lookAt(_l);
    // clip planes scaled to altitude for depth precision
    const alt = Math.max(0.05, _p.length() - R - this.surfaceAt(ct0));
    const near = Math.max(0.02, Math.min(40, Math.min(d * 0.02, alt * 0.45)));
    const far = R * 400;
    if (Math.abs(near - this.lastNear) > this.lastNear * 0.02 || far !== this.lastFar) {
      cam.near = near;
      cam.far = far;
      this.lastNear = near;
      this.lastFar = far;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }
}

/** Spherical interpolation between unit vectors (writes out, safe when out aliases a). */
function slerpDir(a: Vector3, b: Vector3, t: number, out: Vector3): Vector3 {
  const dot = Math.max(-1, Math.min(1, a.dot(b)));
  const th = Math.acos(dot);
  if (th < 1e-5) return out.copy(b);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  const x = a.x * wa + b.x * wb, y = a.y * wa + b.y * wb, z = a.z * wa + b.z * wb;
  return out.set(x, y, z).normalize();
}
