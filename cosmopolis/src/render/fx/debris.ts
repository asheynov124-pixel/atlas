/**
 * OWNER: god.
 * Debris — instanced rock / rubble / ice / goo chunks with real (cheap) physics: gravity toward the planet centre,
 * air drag, tumbling, bouncing on the terrain or splashing into the sea, then settling and shrinking away.
 * One InstancedMesh (the shared building material, so chunks can burn, freeze, glow or turn to goo via the
 * per-instance `aState`), capacity per quality tier, oldest chunk recycled when full. No allocations per frame.
 */
import { BufferGeometry, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { MeshBuilder, Mat } from '../../content/kit';
import { getBuildingMaterial, InstState } from '../materials';
import type { Planet } from '../../world/planet';
import { fxRand } from './particles';

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _axis = new Vector3();
const _col = new Color();

function chunkGeometry(): BufferGeometry {
  const b = new MeshBuilder(0);
  // an irregular faceted rock: a squashed low-poly sphere with a chipped cap
  b.sphere(0.5, { color: 0xffffff, wSeg: 6, hSeg: 4, flat: true, sy: 0.75, mat: Mat.Plain, paint: true });
  b.box(0.42, 0.18, 0.5, { color: 0xffffff, y: 0.2, rx: 0.4, ry: 0.6, mat: Mat.Plain, paint: true });
  return b.build();
}

export interface DebrisOpts {
  size?: number;
  color?: number;
  /** InstState (Burning, Frozen, Goo…) */
  state?: number;
  /** seconds before it starts to fade once settled */
  life?: number;
  /** air drag 1/s */
  drag?: number;
  /** gravity multiplier */
  grav?: number;
  /** no collision (space debris drifting) */
  free?: boolean;
}

export class Debris {
  readonly mesh: InstancedMesh;
  private cap: number;
  private n = 0;
  private next = 0;
  private pos: Float32Array;
  private vel: Float32Array;
  private axis: Float32Array;
  private spin: Float32Array;
  private angle: Float32Array;
  private size: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private flags: Uint8Array; // 1 settled · 2 free-floating
  private drag: Float32Array;
  private grav: Float32Array;
  private states: Float32Array;
  private stateAttr: InstancedBufferAttribute;
  private alive: Uint8Array;
  /** extra planet-centred gravity (units/s²) */
  gravity = 14;
  /** optional attractor (black hole) pulling everything */
  attractor: Vector3 | null = null;
  attractorStrength = 0;
  /** called when a chunk hits the ground at speed (dust puff / splash) */
  onImpact: ((x: number, y: number, z: number, water: boolean, speed: number) => void) | null = null;

  constructor(parent: Object3D, capacity: number, private planet: Planet) {
    this.cap = capacity;
    const geo = chunkGeometry();
    this.mesh = new InstancedMesh(geo, getBuildingMaterial(), capacity);
    this.mesh.name = 'fx-debris';
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.count = 0;
    this.states = new Float32Array(capacity);
    this.stateAttr = new InstancedBufferAttribute(this.states, 1);
    this.stateAttr.setUsage(DynamicDrawUsage);
    geo.setAttribute('aState', this.stateAttr);
    // instance colours
    this.mesh.setColorAt(0, _col.setHex(0xffffff));
    this.mesh.instanceColor!.setUsage(DynamicDrawUsage);
    parent.add(this.mesh);
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.axis = new Float32Array(capacity * 3);
    this.spin = new Float32Array(capacity);
    this.angle = new Float32Array(capacity);
    this.size = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.flags = new Uint8Array(capacity);
    this.drag = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.alive = new Uint8Array(capacity);
  }

  get count(): number {
    return this.n;
  }

  /** Throw a chunk from (x,y,z) with velocity (vx,vy,vz). */
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, o: DebrisOpts = {}): void {
    let i: number;
    if (this.n < this.cap) {
      i = this.n++;
    } else {
      i = this.next;
      this.next = (this.next + 1) % this.cap;
    }
    const i3 = i * 3;
    this.pos[i3] = x;
    this.pos[i3 + 1] = y;
    this.pos[i3 + 2] = z;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    _axis.set(fxRand() - 0.5, fxRand() - 0.5, fxRand() - 0.5).normalize();
    this.axis[i3] = _axis.x;
    this.axis[i3 + 1] = _axis.y;
    this.axis[i3 + 2] = _axis.z;
    this.spin[i] = (fxRand() * 2 - 1) * 9;
    this.angle[i] = fxRand() * 6.28;
    const s = o.size ?? 0.35 + fxRand() * 0.4;
    this.size[i3] = s * (0.7 + fxRand() * 0.6);
    this.size[i3 + 1] = s * (0.6 + fxRand() * 0.6);
    this.size[i3 + 2] = s * (0.7 + fxRand() * 0.6);
    this.age[i] = 0;
    this.life[i] = o.life ?? 3 + fxRand() * 3;
    this.flags[i] = o.free ? 2 : 0;
    this.drag[i] = o.drag ?? 0.25;
    this.grav[i] = o.grav ?? 1;
    this.alive[i] = 1;
    this.states[i] = o.state ?? InstState.Normal;
    this.stateAttr.needsUpdate = true;
    _col.setHex(o.color ?? 0x8a8378);
    this.mesh.setColorAt(i, _col);
    this.mesh.instanceColor!.needsUpdate = true;
  }

  /** Burst of chunks from a point, flung along `dir` with spread. */
  burst(center: Vector3, dir: Vector3, count: number, speed: number, o: DebrisOpts = {}, spread = 0.8): void {
    for (let k = 0; k < count; k++) {
      _p.set(fxRand() * 2 - 1, fxRand() * 2 - 1, fxRand() * 2 - 1).multiplyScalar(spread).add(dir).normalize().multiplyScalar(speed * (0.5 + fxRand() * 0.8));
      this.spawn(center.x, center.y, center.z, _p.x, _p.y, _p.z, o);
    }
  }

  update(dt: number): void {
    if (!this.n) return;
    const p = this.planet;
    const R = p.radius;
    const g = p.grid;
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      any = true;
      const i3 = i * 3;
      let x = this.pos[i3], y = this.pos[i3 + 1], z = this.pos[i3 + 2];
      let vx = this.vel[i3], vy = this.vel[i3 + 1], vz = this.vel[i3 + 2];
      this.age[i] += dt;
      const r = Math.hypot(x, y, z) || 1;
      const nx = x / r, ny = y / r, nz = z / r;
      const fl = this.flags[i];
      if (fl !== 1) {
        if (fl !== 2) {
          const gg = this.gravity * this.grav[i];
          vx -= nx * gg * dt;
          vy -= ny * gg * dt;
          vz -= nz * gg * dt;
        }
        if (this.attractor && this.attractorStrength > 0) {
          const ax = this.attractor.x - x, ay = this.attractor.y - y, az = this.attractor.z - z;
          const d = Math.hypot(ax, ay, az) || 1;
          const f = (this.attractorStrength * dt) / Math.max(1, d * 0.05);
          vx += (ax / d) * f;
          vy += (ay / d) * f;
          vz += (az / d) * f;
          if (d < 2) this.life[i] = 0;
        }
        const k = Math.exp(-this.drag[i] * dt);
        vx *= k;
        vy *= k;
        vz *= k;
        x += vx * dt;
        y += vy * dt;
        z += vz * dt;
        this.angle[i] += this.spin[i] * dt;
        if (fl !== 2) {
          // ground / sea collision
          const r2 = Math.hypot(x, y, z);
          const tile = g.tileAt(x, y, z);
          const water = p.isWater(tile);
          const ground = R + (water ? p.waterHeight : p.heightOf(tile)) + this.size[i3 + 1] * 0.3;
          if (r2 < ground) {
            const vn = vx * nx + vy * ny + vz * nz;
            const speed = Math.hypot(vx, vy, vz);
            if (this.onImpact && speed > 4) this.onImpact(x, y, z, water, speed);
            if (water) {
              this.life[i] = Math.min(this.life[i], this.age[i] + 0.4);
              this.flags[i] = 1;
              vx = vy = vz = 0;
            } else {
              // push out and bounce
              const push = ground - r2;
              x += nx * push;
              y += ny * push;
              z += nz * push;
              vx = (vx - nx * vn * 1.45) * 0.55;
              vy = (vy - ny * vn * 1.45) * 0.55;
              vz = (vz - nz * vn * 1.45) * 0.55;
              this.spin[i] *= 0.6;
              if (speed < 2.5) {
                this.flags[i] = 1;
                vx = vy = vz = 0;
                this.life[i] = Math.max(this.life[i], this.age[i] + 1.5);
              }
            }
          }
        }
      } else if (water(p, x, y, z)) {
        // sinking
        x -= nx * dt * 0.6;
        y -= ny * dt * 0.6;
        z -= nz * dt * 0.6;
      }
      this.pos[i3] = x;
      this.pos[i3 + 1] = y;
      this.pos[i3 + 2] = z;
      this.vel[i3] = vx;
      this.vel[i3 + 1] = vy;
      this.vel[i3 + 2] = vz;
      // fade by shrinking
      const remain = this.life[i] - this.age[i];
      const fade = remain < 0.8 ? Math.max(0, remain / 0.8) : 1;
      if (remain <= 0) {
        this.alive[i] = 0;
        _s.set(0, 0, 0);
      } else _s.set(this.size[i3] * fade, this.size[i3 + 1] * fade, this.size[i3 + 2] * fade);
      _axis.set(this.axis[i3], this.axis[i3 + 1], this.axis[i3 + 2]);
      _q.setFromAxisAngle(_axis, this.angle[i]);
      _p.set(x, y, z);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    // compact the tail
    while (this.n > 0 && !this.alive[this.n - 1]) this.n--;
    if (this.next >= this.n) this.next = 0;
    this.mesh.count = this.n;
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.n = 0;
    this.next = 0;
    this.alive.fill(0);
    this.mesh.count = 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

function water(p: Planet, x: number, y: number, z: number): boolean {
  return p.spec.hasOcean && p.isWater(p.grid.tileAt(x, y, z));
}
