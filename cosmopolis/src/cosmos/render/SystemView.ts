/**
 * OWNER: cosmos.
 * SystemView — one star system: animated star (or binary pair / pulsar / black hole), orbit lines, every planet and
 * moon as a lit procedural sphere with atmosphere, clouds, rings and — on colonies — night-side city lights; locked
 * worlds are dimmed. Camera orbits the star or follows a focused world; pinch past the limits to change level.
 */
import { BufferGeometry, Color, Float32BufferAttribute, Group, LineBasicMaterial, LineLoop, Vector3 } from 'three';
import type { PlanetSpec } from '../../core/types';
import { STAR_INFO, type Galaxy, type PlanetEntry, type StarSystem } from '../Universe';
import { BlackHole, PlanetBody, StarBody } from './bodies';
import { CosmosView, type BodyLabel, type LabelState, type Pickable } from './CosmosView';
import { SkyDome } from './sky';
import { hashString } from '../../core/rng';

export interface SystemCtx {
  spec(e: PlanetEntry): PlanetSpec;
  status(e: PlanetEntry): LabelState;
  pixelRatio: number;
  seed: number;
}

interface BodyRec {
  entry: PlanetEntry;
  body: PlanetBody;
  pos: Vector3;
  line: LineLoop | null;
  lineMat: LineBasicMaterial | null;
  moonGroup: Group | null;
  state: LabelState;
}

const ORBIT_SPEED = 1;
const _a = new Vector3();
const _b = new Vector3();

function circle(r: number, seg = 160): BufferGeometry {
  const pts: number[] = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push(Math.cos(a) * r, 0, Math.sin(a) * r);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  return g;
}

export class SystemView extends CosmosView {
  readonly kind = 'system' as const;
  readonly bodies = new Map<string, BodyRec>();
  private sky: SkyDome;
  private stars: { obj: StarBody | BlackHole; pos: Vector3; orbit: number; phase: number; speed: number }[] = [];
  private starId: string;
  readonly extent: number;
  private flyFrom = new Vector3();
  private flyT = 1;
  private orbitColor = new Color(0x8fb4ff);
  private selColor = new Color(0x5ef0ff);

  constructor(readonly system: StarSystem, readonly galaxy: Galaxy, private ctx: SystemCtx) {
    super(48, 0.05, 6000);
    this.starId = system.id + '.star';
    const seed = hashString(system.id) ^ ctx.seed;
    this.sky = new SkyDome({ seed, stars: 2600, radius: 4500, pixelRatio: ctx.pixelRatio, nebula: [galaxy.colors[1], galaxy.colors[0], 0x000000], nebulaIntensity: 0.75 });
    this.scene.add(this.sky.group);
    this.scene.background = new Color(0x010208);

    // stars
    if (system.star === 'blackhole') {
      const bh = new BlackHole(this.shared);
      this.scene.add(bh.group);
      this.stars.push({ obj: bh, pos: new Vector3(), orbit: 0, phase: 0, speed: 0 });
    } else if (system.star === 'binary') {
      const a = new StarBody('binary', this.shared, seed, 0.9);
      const b = new StarBody(system.companion ?? 'orange', this.shared, seed + 7, 0.62);
      this.scene.add(a.group, b.group);
      const sep = a.radius + b.radius + 3.2;
      this.stars.push({ obj: a, pos: new Vector3(), orbit: sep * 0.38, phase: 0, speed: 0.35 }, { obj: b, pos: new Vector3(), orbit: sep * 0.62, phase: Math.PI, speed: 0.35 });
    } else {
      const s = new StarBody(system.star, this.shared, seed);
      this.scene.add(s.group);
      this.stars.push({ obj: s, pos: new Vector3(), orbit: 0, phase: 0, speed: 0 });
    }

    // planets & moons
    let maxOrbit = 20;
    for (const e of system.planets) {
      const spec = ctx.spec(e);
      const state = ctx.status(e);
      const body = new PlanetBody({ entry: e, spec, shared: this.shared, colony: state === 'colony' || state === 'current' || state === 'home', locked: state === 'locked', hi: e.kind !== 'moon' });
      this.scene.add(body.group);
      let line: LineLoop | null = null;
      let lineMat: LineBasicMaterial | null = null;
      let moonGroup: Group | null = null;
      if (!e.parent) {
        maxOrbit = Math.max(maxOrbit, e.orbit);
        lineMat = new LineBasicMaterial({ color: this.orbitColor, transparent: true, opacity: state === 'locked' ? 0.08 : 0.16, depthWrite: false });
        line = new LineLoop(circle(e.orbit), lineMat);
        line.rotation.x = e.inclination;
        this.scene.add(line);
      } else {
        lineMat = new LineBasicMaterial({ color: this.orbitColor, transparent: true, opacity: 0.1, depthWrite: false });
        line = new LineLoop(circle(e.orbit, 96), lineMat);
        moonGroup = new Group();
        moonGroup.rotation.x = e.inclination;
        moonGroup.add(line);
        this.scene.add(moonGroup);
      }
      this.bodies.set(e.id, { entry: e, body, pos: new Vector3(), line, lineMat, moonGroup, state });
    }
    this.extent = maxOrbit;
    this.cam.maxDist = maxOrbit * 3.2;
    this.cam.minDist = 3;
    this.cam.autoRotate = 0.012;
    this.buildLabels();
    this.positionAll(0);
    this.focus(null, true);
  }

  private buildLabels(): void {
    const labels: BodyLabel[] = [];
    this.labelPos = [];
    for (const r of this.bodies.values()) {
      const e = r.entry;
      const sub = r.state === 'current' ? 'You are here' : r.state === 'home' ? 'Homeworld' : r.state === 'colony' ? 'Colony' : r.state === 'locked' ? 'Locked' : e.kind === 'giant' ? (e.giant?.ice ? 'Ice giant' : 'Gas giant') : 'Open';
      labels.push({ id: e.id, name: this.ctx.spec(e).name || e.name, sub, state: e.kind === 'giant' ? 'neutral' : r.state, kind: e.kind, priority: e.kind === 'moon' ? 2 : 1 });
      this.labelPos.push(r.pos);
    }
    this.labels = labels;
  }

  /** Refresh colony / lock state (after unlocks or founding). */
  refreshStates(): void {
    for (const r of this.bodies.values()) {
      const s = this.ctx.status(r.entry);
      r.state = s;
      r.body.setState(s === 'colony' || s === 'current' || s === 'home', s === 'locked');
      if (r.lineMat && !r.entry.parent) r.lineMat.opacity = s === 'locked' ? 0.08 : 0.16;
    }
    this.buildLabels();
    this.refreshLabels();
    this.select(this.selected);
  }

  private positionAll(dt: number): void {
    const t = this.time * ORBIT_SPEED;
    // stars (binary pairs waltz around the barycentre)
    for (const s of this.stars) {
      if (s.orbit > 0) {
        const a = s.phase + t * s.speed * 0.2;
        s.pos.set(Math.cos(a) * s.orbit, 0, Math.sin(a) * s.orbit);
      }
      s.obj.group.position.copy(s.pos);
      s.obj.update(dt);
    }
    this.shared.uStar.value.set(0, 0, 0);
    // planets first, then moons around them
    for (const r of this.bodies.values()) {
      const e = r.entry;
      if (e.parent) continue;
      const a = e.phase + e.speed * t;
      const ci = Math.cos(e.inclination), si = Math.sin(e.inclination);
      r.pos.set(Math.cos(a) * e.orbit, Math.sin(a) * e.orbit * si, Math.sin(a) * e.orbit * ci);
      r.body.group.position.copy(r.pos);
      r.body.update(dt);
    }
    for (const r of this.bodies.values()) {
      const e = r.entry;
      if (!e.parent) continue;
      const p = this.bodies.get(e.parent);
      if (!p) continue;
      const a = e.phase + e.speed * t;
      _a.set(Math.cos(a) * e.orbit, 0, Math.sin(a) * e.orbit).applyAxisAngle(_b.set(1, 0, 0), e.inclination);
      r.pos.copy(p.pos).add(_a);
      r.body.group.position.copy(r.pos);
      r.moonGroup?.position.copy(p.pos);
      r.body.update(dt);
    }
  }

  protected tick(dt: number): void {
    this.positionAll(dt);
    this.sky.update(this.camera, this.time);
    // follow the focused body (eased fly-in, then locked on)
    const target = this.focusPos();
    if (target) {
      this.flyT = Math.min(1, this.flyT + dt / 0.9);
      const k = this.flyT < 1 ? 1 - Math.pow(1 - this.flyT, 3) : 1;
      this.cam.goalTarget.copy(target);
      this.cam.target.copy(this.flyFrom).lerp(target, k);
    }
    // selection pulse
    const pulse = 0.55 + 0.45 * Math.sin(this.time * 3);
    for (const r of this.bodies.values()) r.body.setSelected(r.entry.id === this.selected ? pulse : 0);
  }

  private focusPos(): Vector3 | null {
    if (!this.focusId || this.focusId === this.starId) return _b.set(0, 0, 0);
    return this.bodies.get(this.focusId)?.pos ?? null;
  }

  focus(id: string | null, snap = false): void {
    const prev = this.focusId;
    this.focusId = id;
    this.flyFrom.copy(this.cam.target);
    this.flyT = snap ? 1 : 0;
    const r = id ? this.bodies.get(id) : null;
    if (r) {
      const size = r.entry.size * (r.entry.spec.rings ? 1.9 : 1);
      this.cam.minDist = r.entry.size * 1.7;
      const toStar = _a.copy(r.pos).negate().normalize();
      const yaw = Math.atan2(toStar.x, toStar.z) + 0.95;
      this.cam.set({ dist: size * 5.2 + 1.5, pitch: 0.32, yaw: this.nearestYaw(yaw) }, false);
      if (snap) {
        this.cam.goalTarget.copy(r.pos);
        this.cam.snap();
      }
    } else {
      const star = this.stars[0]?.obj.radius ?? 3;
      this.cam.minDist = star * 2.6;
      this.cam.set({ dist: this.extent * 1.55, pitch: 0.62, yaw: prev ? this.cam.goalYaw : 0.7 }, false);
      if (snap) {
        this.cam.goalTarget.set(0, 0, 0);
        this.cam.snap();
      }
    }
    this.highlightOrbit();
  }

  /** choose the equivalent yaw closest to the current one (no spinning the long way round) */
  private nearestYaw(y: number): number {
    const cur = this.cam.goalYaw;
    let d = (y - cur) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return cur + d;
  }

  override select(id: string | null): void {
    super.select(id);
    this.highlightOrbit();
  }

  private highlightOrbit(): void {
    for (const r of this.bodies.values()) {
      if (!r.lineMat) continue;
      const on = r.entry.id === this.selected || r.entry.id === this.focusId;
      r.lineMat.color.copy(on ? this.selColor : this.orbitColor);
      r.lineMat.opacity = on ? 0.55 : r.entry.parent ? 0.1 : r.state === 'locked' ? 0.08 : 0.16;
    }
  }

  protected pickables(): Pickable[] {
    const out: Pickable[] = [{ id: this.starId, pos: this.stars[0].pos, radius: this.stars[0].obj.radius }];
    for (const r of this.bodies.values()) out.push({ id: r.entry.id, pos: r.pos, radius: r.entry.size });
    return out;
  }

  protected labelWorld(i: number, out: Vector3): boolean {
    const p = this.labelPos[i];
    const lab = this.labels[i];
    if (!p || !lab) return false;
    const r = this.bodies.get(lab.id);
    if (!r) return false;
    // anchor below the body (screen-space offset handled by CSS)
    out.copy(p);
    out.y -= r.entry.size * 1.15;
    return true;
  }

  protected override labelFade(i: number, dist: number): number {
    const lab = this.labels[i];
    const r = lab && this.bodies.get(lab.id);
    if (!r) return 0;
    if (lab.id === this.selected || lab.id === this.focusId) return 1;
    if (r.entry.kind === 'moon') {
      const parentFocused = r.entry.parent === this.focusId || r.entry.parent === this.selected;
      return parentFocused ? 1 : Math.max(0, Math.min(1, (55 - dist) / 25));
    }
    return Math.max(0.35, Math.min(1, (this.extent * 4 - dist) / (this.extent * 2)));
  }

  /** world radius of the primary star */
  get starRadius(): number {
    return this.stars[0]?.obj.radius ?? STAR_INFO.yellow.radius;
  }

  get starPickId(): string {
    return this.starId;
  }

  dispose(): void {
    this.exit();
    for (const r of this.bodies.values()) {
      r.body.dispose();
      r.line?.geometry.dispose();
      r.lineMat?.dispose();
      r.line?.removeFromParent();
      r.moonGroup?.removeFromParent();
    }
    this.bodies.clear();
    for (const s of this.stars) s.obj.dispose();
    this.sky.dispose();
    this.scene.clear();
  }
}
