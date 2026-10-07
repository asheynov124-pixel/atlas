/**
 * OWNER: god.
 * Creatures & machines for god powers, all built with the content kit (MeshBuilder) and drawn with the shared
 * building material, so they share the city's art direction (lit windows / neon / lava channels, night glow,
 * burning / frozen / goo states via aState):
 *
 *   Saucer     classic flying saucer: polished hull, glass canopy with a pilot, chasing rim lights, belly glow
 *   Kaiju      a 16-unit "space leviathan": articulated legs / arms / jaw / 9-segment tail, glowing dorsal plates,
 *              procedural walk cycle (pose(phase)), roar & breath poses; footsteps reported to the effect
 *   Worm       giant sandworm: 28 ribbed segments following a breach curve + a four-petal maw with teeth
 *   Tentacles  kraken arms: chains of tapering segments curling toward a target (one InstancedMesh for all arms)
 *   Robots     an InstancedMesh swarm of little bipedal mechs with red visors (walk bob / stride per instance)
 *
 * Every object is an FxObject (update(dt, time), dispose()); effects move them around (planet space).
 */
import {
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { Mat, MeshBuilder } from '../../content/kit';
import { getBuildingMaterial, InstState, patchBuildingMaterial } from '../materials';
import type { FxObject } from './FxLayer';

const _m = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();
const _s = new Vector3();
const _white = new Color(0xffffff);
const _id = new Matrix4();
const _ox = new Vector3();
const _oy = new Vector3();
const _p0 = new Vector3();
const _p1 = new Vector3();
const _p2 = new Vector3();
const _mb = new Matrix4();
const _ml = new Matrix4();
const _mh = new Matrix4();
const _mr = new Matrix4();
const _q2 = new Quaternion();
const _qp = new Quaternion();

let metalMat: MeshStandardMaterial | null = null;
/** Polished variant of the building material (saucers, robots). */
export function fxMetalMaterial(): MeshStandardMaterial {
  if (!metalMat) {
    metalMat = patchBuildingMaterial(new MeshStandardMaterial({ roughness: 0.32, metalness: 0.65 }), 'cosmo-fx-metal');
    metalMat.name = 'fx-metal';
  }
  return metalMat;
}

/** InstancedMesh around a kit geometry with a per-instance aState (building material compatible). */
export function kitInstanced(geo: BufferGeometry, count: number, state: number = InstState.Normal, material = getBuildingMaterial()): InstancedMesh {
  const states = new Float32Array(count).fill(state);
  const attr = new InstancedBufferAttribute(states, 1);
  attr.setUsage(DynamicDrawUsage);
  geo.setAttribute('aState', attr);
  const m = new InstancedMesh(geo, material, count);
  m.frustumCulled = false;
  m.instanceMatrix.setUsage(DynamicDrawUsage);
  for (let i = 0; i < count; i++) {
    m.setMatrixAt(i, _id);
    m.setColorAt(i, _white);
  }
  m.castShadow = true;
  return m;
}

function setState(mesh: InstancedMesh, state: number): void {
  const a = mesh.geometry.getAttribute('aState') as InstancedBufferAttribute;
  const arr = a.array as Float32Array;
  if (arr[0] === state) return;
  arr.fill(state);
  a.needsUpdate = true;
}

/** Base for creatures made of a few kit parts under a planet-space root group. */
abstract class KitCreature implements FxObject {
  readonly root = new Group();
  protected parts: InstancedMesh[] = [];
  protected geos: BufferGeometry[] = [];

  constructor(parent: Object3D) {
    parent.add(this.root);
  }
  protected part(geo: BufferGeometry, parent: Object3D = this.root, material?: MeshStandardMaterial, state = 0): InstancedMesh {
    const m = kitInstanced(geo, 1, state, material);
    this.geos.push(geo);
    this.parts.push(m);
    parent.add(m);
    return m;
  }
  /** Put the root on the planet at `pos`, standing along `up`, facing `fwd`. */
  place(pos: Vector3, up: Vector3, fwd: Vector3, scale = 1): void {
    const x = _v.crossVectors(up, fwd).normalize();
    const z = _s.crossVectors(x, up).normalize();
    _m.makeBasis(x, up, z);
    this.root.quaternion.setFromRotationMatrix(_m);
    this.root.position.copy(pos);
    this.root.scale.setScalar(scale);
  }
  setVisualState(state: number): void {
    for (const p of this.parts) setState(p, state);
  }
  abstract update(dt: number, time: number): void;
  dispose(): void {
    this.root.removeFromParent();
    for (const p of this.parts) p.dispose();
    for (const g of this.geos) g.dispose();
    this.parts = [];
    this.geos = [];
  }
}

// ───────────────────────────────────────────────────────────── saucer

function saucerGeometry(hull: number, glow: number): BufferGeometry {
  const b = new MeshBuilder(0);
  // lens-shaped hull (lathe profile, radius 2.4)
  b.lathe(
    [
      [0, -0.42],
      [0.9, -0.36],
      [1.9, -0.18],
      [2.45, 0],
      [2.3, 0.1],
      [1.6, 0.26],
      [1.05, 0.4],
      [0, 0.44],
    ],
    { color: hull, mat: Mat.Metal, seg: 32 },
  );
  // rim band
  b.torus(2.35, 0.07, { color: 0x3a4250, mat: Mat.Metal, seg: 40, tube: 6, y: 0 });
  // canopy & pilot
  b.dome(0.82, { color: 0x9fe8ff, mat: Mat.Glass, wSeg: 18, hSeg: 8, y: 0.38 });
  b.sphere(0.24, { color: 0x6dd66a, mat: Mat.Plain, y: 0.68, wSeg: 10, hSeg: 6 });
  b.sphere(0.07, { color: 0x111111, mat: Mat.Plain, x: -0.09, y: 0.72, z: 0.2, wSeg: 6, hSeg: 4 });
  b.sphere(0.07, { color: 0x111111, mat: Mat.Plain, x: 0.09, y: 0.72, z: 0.2, wSeg: 6, hSeg: 4 });
  // rim lights
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.sphere(0.11, { color: i % 2 ? glow : 0xffffff, mat: Mat.Glow, x: Math.sin(a) * 2.18, y: 0.12, z: Math.cos(a) * 2.18, wSeg: 6, hSeg: 4 });
  }
  // belly emitter ring + core
  b.torus(0.75, 0.1, { color: glow, mat: Mat.Glow, seg: 28, tube: 6, y: -0.4 });
  b.cyl(0.42, 0.5, 0.12, { color: 0xeaffff, mat: Mat.Glow, y: -0.5, seg: 18 });
  // landing struts (folded)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    b.box(0.12, 0.3, 0.12, { color: 0x50586a, mat: Mat.Metal, x: Math.sin(a) * 1.4, y: -0.55, z: Math.cos(a) * 1.4 });
  }
  return b.build();
}

export class Saucer extends KitCreature {
  readonly hull: InstancedMesh;
  /** 0..1 hover wobble amount */
  wobble = 1;
  spin = 2.2;
  private angle = Math.random() * 6;
  private body = new Group();
  readonly velocity = new Vector3();

  constructor(parent: Object3D, hullColor = 0xc9d2de, glow = 0x6dffb0) {
    super(parent);
    this.root.add(this.body);
    this.hull = this.part(saucerGeometry(hullColor, glow), this.body, fxMetalMaterial());
    this.root.name = 'fx-saucer';
  }

  update(dt: number, time: number): void {
    this.angle += dt * this.spin;
    this.body.rotation.set(Math.sin(time * 1.3 + this.angle) * 0.06 * this.wobble, this.angle, Math.cos(time * 1.1) * 0.06 * this.wobble);
    this.body.position.y = Math.sin(time * 2.1 + this.angle * 0.1) * 0.15 * this.wobble;
  }

  /** World (planet-space) position of the belly emitter. */
  belly(out: Vector3): Vector3 {
    this.root.updateMatrixWorld();
    return out.set(0, -0.55, 0).applyMatrix4(this.root.matrix);
  }
}

// ───────────────────────────────────────────────────────────── kaiju

const SKIN = 0x2e4038;
const SKIN2 = 0x3c5446;
const BELLY = 0x8a8a66;
const PLATE = 0x7ff3ff;

function kaijuTorso(): BufferGeometry {
  const b = new MeshBuilder(0);
  // barrel chest leaning forward, hips at the origin
  b.sphere(2.3, { color: SKIN, sy: 1.3, sz: 1.05, y: 2.2, z: 0.3, wSeg: 14, hSeg: 10 });
  b.sphere(1.9, { color: SKIN2, sy: 0.9, y: 0.2, wSeg: 12, hSeg: 8 });
  b.sphere(1.75, { color: BELLY, sy: 1.25, sz: 0.55, y: 1.9, z: 1.15, wSeg: 12, hSeg: 8 });
  // belly scutes
  for (let i = 0; i < 5; i++) b.box(1.5 - i * 0.12, 0.08, 0.5, { color: 0x6f6e52, y: 0.9 + i * 0.6, z: 1.72 - Math.abs(i - 2) * 0.12, rx: -0.2 });
  // dorsal plates down the spine (glowing edges)
  for (let i = 0; i < 6; i++) {
    const y = 0.6 + i * 0.75;
    const h = 0.9 + Math.sin((i / 5) * Math.PI) * 0.9;
    b.prism(3, 0.42, h, { color: 0x24302a, y: y, z: -1.9 + i * 0.12, rx: -0.5, sz: 0.35 });
    b.prism(3, 0.24, h * 0.92, { color: PLATE, mat: Mat.Glow, y: y + 0.08, z: -2.05 + i * 0.12, rx: -0.5, sz: 0.25 });
  }
  return b.build();
}

function kaijuHead(): BufferGeometry {
  const b = new MeshBuilder(0);
  // neck stub
  b.cyl(0.95, 1.25, 1.4, { color: SKIN, y: -0.8, seg: 12 });
  // skull + brow + snout
  b.sphere(1.05, { color: SKIN, sx: 0.95, sy: 0.85, sz: 1.2, y: 0.5, wSeg: 12, hSeg: 8 });
  b.box(1.5, 0.65, 1.7, { color: SKIN2, y: 0.05, z: 1.05, rx: 0.08 });
  b.box(1.65, 0.28, 0.6, { color: 0x24302a, y: 0.78, z: 0.75, rx: -0.25 });
  // teeth (upper)
  for (let i = 0; i < 6; i++) b.cone(0.09, 0.28, { color: 0xf4efd8, x: -0.55 + i * 0.22, y: -0.18, z: 1.75, rx: Math.PI, seg: 5 });
  // eyes
  b.sphere(0.16, { color: 0xffc23a, mat: Mat.Glow, x: -0.62, y: 0.52, z: 1.08, wSeg: 8, hSeg: 6 });
  b.sphere(0.16, { color: 0xffc23a, mat: Mat.Glow, x: 0.62, y: 0.52, z: 1.08, wSeg: 8, hSeg: 6 });
  // crest spikes
  for (let i = 0; i < 3; i++) b.cone(0.22, 0.8 - i * 0.15, { color: PLATE, mat: Mat.Glow, y: 1.05 - i * 0.12, z: -0.2 - i * 0.45, rx: -0.6, seg: 5 });
  return b.build();
}

function kaijuJaw(): BufferGeometry {
  const b = new MeshBuilder(0);
  b.box(1.3, 0.4, 1.6, { color: SKIN2, y: -0.4, z: 0.75 });
  for (let i = 0; i < 5; i++) b.cone(0.08, 0.24, { color: 0xf4efd8, x: -0.45 + i * 0.22, y: -0.05, z: 1.4, seg: 5 });
  b.box(1.0, 0.1, 1.2, { color: 0x8a2a2a, y: -0.06, z: 0.7 });
  return b.build();
}

function kaijuThigh(): BufferGeometry {
  const b = new MeshBuilder(0);
  b.sphere(1.0, { color: SKIN, sy: 1.6, y: -1.2, wSeg: 10, hSeg: 8 });
  b.cyl(0.85, 1.0, 2.8, { color: SKIN, y: -2.8, seg: 10 });
  return b.build();
}

function kaijuShin(): BufferGeometry {
  const b = new MeshBuilder(0);
  b.cyl(0.6, 0.85, 2.9, { color: SKIN2, y: -2.9, seg: 10 });
  // foot with three claws
  b.box(1.5, 0.55, 2.0, { color: SKIN, y: -3.25, z: 0.45 });
  for (let i = -1; i <= 1; i++) b.cone(0.16, 0.55, { color: 0xe8e2c8, x: i * 0.5, y: -3.05, z: 1.55, rx: Math.PI / 2, seg: 5 });
  return b.build();
}

function kaijuArm(): BufferGeometry {
  const b = new MeshBuilder(0);
  b.sphere(0.55, { color: SKIN, y: -0.2, wSeg: 8, hSeg: 6 });
  b.cyl(0.38, 0.5, 1.6, { color: SKIN, y: -1.7, seg: 8, rx: 0.3 });
  b.cyl(0.3, 0.38, 1.3, { color: SKIN2, y: -2.8, z: 0.55, seg: 8, rx: -0.6 });
  for (let i = -1; i <= 1; i++) b.cone(0.1, 0.45, { color: 0xe8e2c8, x: i * 0.22, y: -3.1, z: 1.3, rx: 1.9, seg: 4 });
  return b.build();
}

function kaijuTail(i: number, n: number): BufferGeometry {
  const b = new MeshBuilder(0);
  const r0 = 1.45 * (1 - i / n) + 0.15;
  const r1 = 1.45 * (1 - (i + 1) / n) + 0.15;
  b.cyl(r1, r0, 1.45, { color: i % 2 ? SKIN : SKIN2, rx: -Math.PI / 2, seg: 10 });
  const h = 0.5 + r0 * 0.5;
  b.prism(3, 0.25 + r0 * 0.12, h, { color: PLATE, mat: Mat.Glow, y: r0 * 0.75, z: -0.7, rx: -0.9, sz: 0.3 });
  return b.build();
}

/**
 * The kaiju: hips at root-local (0, hipHeight, 0), facing +Z. Call `pose(phase, dt)` each frame with the walk phase
 * (radians); roar/breath blend in via `roar` (0..1) and `breath` (0..1).
 */
export class Kaiju extends KitCreature {
  readonly hipHeight = 6.1;
  private hips = new Group();
  private torso = new Group();
  private neck = new Group();
  private jaw = new Group();
  private legs: { hip: Group; knee: Group }[] = [];
  private arms: Group[] = [];
  private tail: Group[] = [];
  private torsoMesh: InstancedMesh;
  roar = 0;
  breath = 0;
  /** forward lean (radians) */
  lean = 0.18;

  constructor(parent: Object3D) {
    super(parent);
    this.root.name = 'fx-kaiju';
    this.root.add(this.hips);
    this.hips.position.y = this.hipHeight;
    this.hips.add(this.torso);
    this.torsoMesh = this.part(kaijuTorso(), this.torso);
    this.torso.add(this.neck);
    this.neck.position.set(0, 4.6, 1.2);
    this.part(kaijuHead(), this.neck);
    this.neck.add(this.jaw);
    this.jaw.position.set(0, -0.15, 0.25);
    this.part(kaijuJaw(), this.jaw);
    const thigh = kaijuThigh();
    const shin = kaijuShin();
    for (const side of [-1, 1]) {
      const hip = new Group();
      hip.position.set(side * 1.55, 0.2, 0);
      this.hips.add(hip);
      this.part(side < 0 ? thigh : thigh.clone(), hip);
      const knee = new Group();
      knee.position.set(0, -2.9, 0.25);
      hip.add(knee);
      this.part(side < 0 ? shin : shin.clone(), knee);
      this.legs.push({ hip, knee });
      const arm = new Group();
      arm.position.set(side * 2.0, 3.3, 1.2);
      this.torso.add(arm);
      this.part(kaijuArm(), arm);
      this.arms.push(arm);
    }
    let prev: Object3D = this.hips;
    const N = 9;
    for (let i = 0; i < N; i++) {
      const seg = new Group();
      seg.position.set(0, i === 0 ? 0.1 : 0, i === 0 ? -1.6 : -1.3);
      prev.add(seg);
      this.part(kaijuTail(i, N), seg).position.z = -0.65;
      this.tail.push(seg);
      prev = seg;
    }
  }

  /** Walk pose for `phase` (radians, one stride = 2π). */
  pose(phase: number, time: number): void {
    const s = Math.sin(phase), c = Math.cos(phase);
    for (let i = 0; i < 2; i++) {
      const ph = i === 0 ? phase : phase + Math.PI;
      const ls = Math.sin(ph), lc = Math.cos(ph);
      this.legs[i].hip.rotation.x = -ls * 0.42;
      this.legs[i].knee.rotation.x = Math.max(0, lc) * 0.75 + 0.12;
      this.arms[i].rotation.x = ls * 0.22 - 0.35 - this.roar * 0.9;
      this.arms[i].rotation.z = (i === 0 ? -1 : 1) * (0.15 + this.roar * 0.5);
    }
    // hips bob twice per stride, sway side to side
    this.hips.position.y = this.hipHeight - Math.abs(c) * 0.35 + 0.15;
    this.hips.rotation.z = s * 0.06;
    this.hips.rotation.y = s * 0.05;
    this.torso.rotation.x = this.lean - this.roar * 0.45 - this.breath * 0.15;
    this.torso.rotation.y = -s * 0.07;
    this.neck.rotation.x = -this.roar * 0.55 + this.breath * 0.35 + Math.sin(phase * 2) * 0.03;
    this.neck.rotation.y = Math.sin(time * 0.7) * 0.18 * (1 - this.roar);
    this.jaw.rotation.x = 0.08 + this.roar * 0.75 + this.breath * 0.6;
    for (let i = 0; i < this.tail.length; i++) {
      const k = (i + 1) / this.tail.length;
      this.tail[i].rotation.y = Math.sin(phase * 0.5 - i * 0.45) * 0.14 * (0.5 + k);
      this.tail[i].rotation.x = i === 0 ? 0.35 : -0.04 + Math.sin(time * 0.9 - i * 0.5) * 0.02;
    }
  }

  /** Glowing plates: Irradiated while charging breath. */
  charge(on: boolean): void {
    setState(this.torsoMesh, on ? InstState.Irradiated : InstState.Normal);
  }

  /** Root-local foot position → planet space. */
  foot(i: number, out: Vector3): Vector3 {
    this.root.updateMatrixWorld(true);
    out.set(0, -3.3, 0.6);
    return this.legs[i].knee.localToWorld(out).applyMatrix4(_m.copy(this.root.parent!.matrixWorld).invert());
  }

  /** Mouth position & direction in planet space. */
  mouth(out: Vector3, dir: Vector3): void {
    this.root.updateMatrixWorld(true);
    const inv = _m.copy(this.root.parent!.matrixWorld).invert();
    out.set(0, -0.1, 1.9);
    this.neck.localToWorld(out).applyMatrix4(inv);
    dir.set(0, -0.15, 1);
    _q.setFromRotationMatrix(this.neck.matrixWorld);
    dir.applyQuaternion(_q);
    _qp.setFromRotationMatrix(this.root.parent!.matrixWorld).invert();
    dir.applyQuaternion(_qp).normalize();
  }

  update(): void {
    /* posed by the effect */
  }
}

// ───────────────────────────────────────────────────────────── sandworm

function wormSegment(): BufferGeometry {
  const b = new MeshBuilder(0);
  b.cyl(1, 1, 1, { color: 0xb08a5c, seg: 14, rx: Math.PI / 2, z: -0.5 });
  b.torus(1.0, 0.12, { color: 0x7d5f3e, seg: 14, tube: 5, rx: Math.PI / 2, z: 0.42 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    b.box(0.36, 0.12, 0.6, { color: 0x8d6a46, x: Math.sin(a) * 0.98, y: Math.cos(a) * 0.98, rz: -a });
  }
  return b.build();
}

function wormPetal(): BufferGeometry {
  const b = new MeshBuilder(0);
  // one quarter of the maw: a curved plate with a row of teeth on its inner face
  b.box(1.5, 0.2, 2.2, { color: 0x9c7752, z: 1.1, x: 0, y: 0 });
  for (let i = 0; i < 4; i++) b.cone(0.1, 0.5, { color: 0xfff1d6, x: -0.55 + i * 0.36, y: -0.28, z: 0.5 + (i % 2) * 0.6, rx: Math.PI, seg: 4 });
  b.box(1.2, 0.08, 1.6, { color: 0xd4475a, z: 0.9, y: -0.12 });
  return b.build();
}

export class Worm implements FxObject {
  readonly segs: InstancedMesh;
  readonly maw: InstancedMesh;
  readonly count = 28;
  private group = new Group();
  /** segment spacing (world units) and radius */
  spacing = 1.25;
  radius = 1.5;
  /** 0 closed … 1 wide open */
  open = 0;
  private segGeo = wormSegment();
  private petalGeo = wormPetal();

  constructor(parent: Object3D) {
    this.segs = kitInstanced(this.segGeo, this.count);
    this.maw = kitInstanced(this.petalGeo, 4);
    this.group.add(this.segs, this.maw);
    this.group.name = 'fx-worm';
    parent.add(this.group);
  }

  /**
   * Lay the body along a curve: `at(s, out)` returns the planet-space point s units behind the head (s ≥ 0),
   * `up` is the local planet normal. Segments under ground are simply hidden by the terrain.
   */
  layout(at: (s: number, out: Vector3) => Vector3, up: Vector3, time: number): void {
    const p0 = _p0, p1 = _p1;
    for (let i = 0; i < this.count; i++) {
      at(i * this.spacing, p0);
      at(i * this.spacing + 0.3, p1);
      const fwd = _v.subVectors(p0, p1).normalize();
      const taper = i < 3 ? 0.85 + i * 0.05 : 1 - Math.max(0, (i - this.count * 0.65) / (this.count * 0.35)) * 0.55;
      const r = this.radius * taper * (1 + 0.04 * Math.sin(time * 6 - i * 0.9));
      orient(fwd, up, _q);
      _s.set(r, r, this.spacing * 0.98);
      _m.compose(p0, _q, _s);
      this.segs.setMatrixAt(i, _m);
    }
    this.segs.instanceMatrix.needsUpdate = true;
    // maw at the head, petals hinge open
    at(0, p0);
    at(0.3, p1);
    const fwd = _v.subVectors(p0, p1).normalize();
    orient(fwd, up, _q);
    const base = _mb.compose(p0, _q, _s.setScalar(this.radius * 0.95));
    for (let k = 0; k < 4; k++) {
      const local = _ml.makeRotationZ((k / 4) * Math.PI * 2 + Math.PI / 4);
      const hinge = _mh.makeRotationX(-0.25 - this.open * 1.15).setPosition(0, 0.85, 0);
      _m.copy(base).multiply(local).multiply(hinge);
      this.maw.setMatrixAt(k, _m);
    }
    this.maw.instanceMatrix.needsUpdate = true;
  }

  update(): void {
    /* laid out by the effect */
  }

  dispose(): void {
    this.group.removeFromParent();
    this.segs.dispose();
    this.maw.dispose();
    this.segGeo.dispose();
    this.petalGeo.dispose();
  }
}

/** Quaternion whose +Z = fwd and +Y ≈ up. */
function orient(fwd: Vector3, up: Vector3, out: Quaternion): Quaternion {
  const x = _ox.crossVectors(up, fwd);
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
  x.normalize();
  const y = _oy.crossVectors(fwd, x).normalize();
  _mr.makeBasis(x, y, fwd);
  return out.setFromRotationMatrix(_mr);
}

// ───────────────────────────────────────────────────────────── kraken tentacles

function tentacleSegment(): BufferGeometry {
  const b = new MeshBuilder(0);
  b.cyl(0.92, 1, 1, { color: 0x7a3f6e, seg: 10, rx: Math.PI / 2, z: -0.5 });
  // suckers on the underside
  b.sphere(0.28, { color: 0xe4b3c8, y: -0.82, z: 0, sy: 0.5, wSeg: 6, hSeg: 4 });
  b.sphere(0.2, { color: 0xe4b3c8, y: -0.78, z: -0.42, sy: 0.5, wSeg: 6, hSeg: 4 });
  return b.build();
}

function krakenHead(): BufferGeometry {
  const b = new MeshBuilder(0);
  b.sphere(5, { color: 0x6c3560, sy: 1.25, wSeg: 18, hSeg: 12 });
  b.sphere(4.4, { color: 0x8a4a7c, sy: 1.1, y: 1.2, z: -0.6, wSeg: 14, hSeg: 10 });
  for (const s of [-1, 1]) {
    b.sphere(1.05, { color: 0xfff2a8, mat: Mat.Glow, x: s * 2.4, y: -0.6, z: 4.0, wSeg: 12, hSeg: 8 });
    b.box(1.5, 0.3, 0.4, { color: 0x111111, x: s * 2.4, y: -0.6, z: 5.0 });
  }
  return b.build();
}

export class Tentacles implements FxObject {
  readonly mesh: InstancedMesh;
  readonly head: InstancedMesh;
  readonly arms: number;
  readonly segs = 16;
  private group = new Group();
  private geo = tentacleSegment();
  private headGeo = krakenHead();

  constructor(parent: Object3D, arms: number) {
    this.arms = arms;
    this.mesh = kitInstanced(this.geo, arms * this.segs);
    this.head = kitInstanced(this.headGeo, 1);
    this.group.add(this.mesh, this.head);
    this.group.name = 'fx-kraken';
    parent.add(this.group);
    for (let i = 0; i < arms * this.segs; i++) this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
  }

  /** Lay arm `a` along `pts` (segs + 1 points from base to tip) with base radius r0 tapering to 15 %. */
  layoutArm(a: number, pts: Vector3[], up: Vector3, r0: number): void {
    for (let i = 0; i < this.segs; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      const fwd = _v.subVectors(p1, p0);
      const len = Math.max(0.01, fwd.length());
      fwd.divideScalar(len);
      const r = r0 * (1 - (i / this.segs) * 0.85);
      orient(fwd, up, _q);
      _s.set(r, r, len * 1.08);
      _m.compose(p1, _q, _s);
      this.mesh.setMatrixAt(a * this.segs + i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  placeHead(pos: Vector3, up: Vector3, fwd: Vector3, scale: number): void {
    orient(fwd, up, _q);
    _m.compose(pos, _q, _s.setScalar(scale));
    this.head.setMatrixAt(0, _m);
    this.head.instanceMatrix.needsUpdate = true;
  }

  update(): void {
    /* driven by the effect */
  }

  dispose(): void {
    this.group.removeFromParent();
    this.mesh.dispose();
    this.head.dispose();
    this.geo.dispose();
    this.headGeo.dispose();
  }
}

// ───────────────────────────────────────────────────────────── robots

function robotGeometry(): BufferGeometry {
  const b = new MeshBuilder(0);
  // legs
  for (const s of [-1, 1]) {
    b.box(0.22, 0.75, 0.26, { color: 0x3c4450, mat: Mat.Metal, x: s * 0.26, y: 0 });
    b.box(0.3, 0.12, 0.42, { color: 0x2a3038, mat: Mat.Metal, x: s * 0.26, y: 0, z: 0.06 });
  }
  // torso
  b.box(0.9, 0.7, 0.6, { color: 0xb8c0cc, mat: Mat.Metal, y: 0.72 });
  b.box(0.5, 0.18, 0.05, { color: 0xff3a3a, mat: Mat.Glow, y: 1.0, z: 0.31 });
  // shoulder cannons
  for (const s of [-1, 1]) {
    b.box(0.22, 0.22, 0.6, { color: 0x58606c, mat: Mat.Metal, x: s * 0.58, y: 1.22, z: 0.1 });
    b.cyl(0.06, 0.06, 0.2, { color: 0xff5a3a, mat: Mat.Glow, x: s * 0.58, y: 1.22, z: 0.42, rx: Math.PI / 2, seg: 6 });
  }
  // head with visor
  b.box(0.48, 0.36, 0.42, { color: 0xd8dee8, mat: Mat.Metal, y: 1.45 });
  b.box(0.4, 0.1, 0.05, { color: 0xff2a2a, mat: Mat.Glow, y: 1.6, z: 0.22 });
  b.cyl(0.02, 0.02, 0.35, { color: 0x222222, y: 1.81, x: 0.14, seg: 4 });
  b.sphere(0.05, { color: 0xff3a3a, mat: Mat.Glow, y: 2.18, x: 0.14, wSeg: 6, hSeg: 4 });
  return b.build();
}

export interface RobotState {
  pos: Vector3;
  up: Vector3;
  fwd: Vector3;
  phase: number;
  alive: boolean;
  scale: number;
}

export class Robots implements FxObject {
  readonly mesh: InstancedMesh;
  readonly list: RobotState[] = [];
  private geo = robotGeometry();

  constructor(parent: Object3D, readonly max: number) {
    this.mesh = kitInstanced(this.geo, max, InstState.Normal, fxMetalMaterial());
    this.mesh.count = 0;
    this.mesh.name = 'fx-robots';
    parent.add(this.mesh);
  }

  add(pos: Vector3, up: Vector3, fwd: Vector3, scale = 1): RobotState | null {
    if (this.list.length >= this.max) return null;
    const r: RobotState = { pos: pos.clone(), up: up.clone(), fwd: fwd.clone(), phase: Math.random() * 6, alive: true, scale };
    this.list.push(r);
    return r;
  }

  update(): void {
    let n = 0;
    for (const r of this.list) {
      if (!r.alive) continue;
      const bob = Math.abs(Math.sin(r.phase)) * 0.12;
      orient(r.fwd, r.up, _q);
      // waddle: roll a little with the stride
      _q.multiply(_q2.setFromAxisAngle(_v.set(0, 0, 1), Math.sin(r.phase) * 0.12));
      _s.setScalar(r.scale);
      const p = _p2.copy(r.pos).addScaledVector(r.up, bob * r.scale);
      _m.compose(p, _q, _s);
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geo.dispose();
  }
}
