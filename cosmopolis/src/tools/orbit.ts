/**
 * OWNER: tools.
 * OrbitTool — launch satellites, stations and megastructures. Tap a launch site: a rocket flare climbs from the
 * surface into the chosen orbit (dashed ring preview while aiming), then the orbital is added through Commands
 * (money, unlocks, undo). Options: altitude (low / standard / high) and inclination (equatorial / inclined /
 * polar — never lower than the launch latitude, so the orbit really passes over the pad). If the life renderer
 * offers `view.orbitals.launch(defId, from, params)` it is used instead of the built-in flare.
 *
 * Orbit parameter convention written here (Y = planet axis): ascending node N = (cos Ω, 0, sin Ω),
 * orbit normal n = (−sin Ω sin i, cos i, cos Ω sin i), position(u) = R·orbit·(cos u · N + sin u · (n × N)),
 * u = phase (+ speed · t).
 */
import { Vector3 } from 'three';
import { Tool, type PointerInfo } from './Tool';
import type { PickResult } from '../world/geo';
import type { ToolOption, ToolState } from '../ui/store';
import { getItem, type ItemDef } from '../content/catalog';
import type { OrbitalInstance } from '../world/planet';
import { money } from './util';
import { TOOL_COLORS } from './visuals';

type Alt = 'low' | 'mid' | 'high';
type Inc = 'equatorial' | 'inclined' | 'polar';
const ALT: Record<Alt, number> = { low: 0.82, mid: 1, high: 1.4 };
const INC: Record<Inc, number> = { equatorial: 0.04, inclined: 0.55, polar: 1.5 };
const Y = new Vector3(0, 1, 0);

const _p = new Vector3();
const _n = new Vector3();
const _e1 = new Vector3();
const _e2 = new Vector3();
const _N = new Vector3();
const _M = new Vector3();

export interface OrbitPlan {
  params: Pick<OrbitalInstance, 'orbit' | 'inclination' | 'node' | 'phase'>;
  normal: Vector3;
  /** orbit insertion point (world) */
  insertion: Vector3;
}

/** Orbit through the launch direction `dir` with (at least) inclination `inc`, radius multiple `orbit`. */
export function planOrbit(dir: Vector3, inc: number, orbit: number, planetRadius: number, lead = 0.35): OrbitPlan {
  const P = _p.copy(dir).normalize();
  const lat = Math.asin(Math.max(-1, Math.min(1, P.y)));
  const i = Math.min(Math.PI - 0.01, Math.max(inc, Math.abs(lat) + 0.015));
  _e1.copy(Y).addScaledVector(P, -P.y);
  if (_e1.lengthSq() < 1e-8) _e1.set(1, 0, 0);
  _e1.normalize();
  _e2.crossVectors(P, Y);
  if (_e2.lengthSq() < 1e-8) _e2.set(0, 0, 1);
  _e2.normalize();
  const cosLat = Math.max(1e-4, Math.cos(lat));
  const phi = Math.acos(Math.max(-1, Math.min(1, Math.cos(i) / cosLat)));
  const n = _n.copy(_e1).multiplyScalar(Math.cos(phi)).addScaledVector(_e2, Math.sin(phi)).normalize();
  const inclination = Math.acos(Math.max(-1, Math.min(1, n.y)));
  const sinI = Math.sin(inclination);
  const node = sinI > 1e-4 ? Math.atan2(-n.x, n.z) : 0;
  _N.set(Math.cos(node), 0, Math.sin(node));
  _M.crossVectors(n, _N);
  const u = Math.atan2(P.dot(_M), P.dot(_N)) + lead;
  const insertion = new Vector3().copy(_N).multiplyScalar(Math.cos(u)).addScaledVector(_M, Math.sin(u)).multiplyScalar(planetRadius * orbit);
  return { params: { orbit, inclination, node, phase: u }, normal: n.clone(), insertion };
}

export class OrbitTool extends Tool {
  readonly id = 'orbit';
  def: ItemDef | null = null;
  private alt: Alt = 'mid';
  private inc: Inc = 'inclined';
  private hoverTile = -1;
  private inFlight = 0;

  override get placing(): boolean {
    return true;
  }
  override get wantsGrid(): boolean {
    return false;
  }

  override enter(state: ToolState): void {
    super.enter(state);
    this.def = state.itemId ? getItem(state.itemId) ?? null : null;
    this.hoverTile = -1;
  }

  override exit(): void {
    this.clear();
  }

  override hint(): string {
    return this.mgr.touch ? `Tap a launch site for ${this.def?.name ?? 'the launch'}` : `Click a launch site for ${this.def?.name ?? 'the launch'}`;
  }

  override options(): ToolOption[] {
    return [
      {
        id: 'alt',
        label: 'Altitude',
        type: 'choice',
        value: this.alt,
        choices: [
          { value: 'low', label: 'Low' },
          { value: 'mid', label: 'Standard' },
          { value: 'high', label: 'High' },
        ],
      },
      {
        id: 'inc',
        label: 'Orbit',
        type: 'choice',
        value: this.inc,
        choices: [
          { value: 'equatorial', label: 'Equator' },
          { value: 'inclined', label: 'Inclined' },
          { value: 'polar', label: 'Polar' },
        ],
      },
    ];
  }

  override setOption(id: string, value: unknown): void {
    if (id === 'alt' && (value === 'low' || value === 'mid' || value === 'high')) this.alt = value;
    if (id === 'inc' && (value === 'equatorial' || value === 'inclined' || value === 'polar')) this.inc = value;
    const t = this.hoverTile;
    this.hoverTile = -1;
    if (t >= 0) this.aim(t, null);
  }

  private orbitMul(): number {
    return (this.def?.orbit?.radius ?? 1.6) * ALT[this.alt];
  }

  private clear(): void {
    const v = this.mgr.visuals;
    v?.reticle.hide();
    v?.hideOrbit();
    this.mgr.hideTag();
    this.mgr.setCost(null);
  }

  private aim(tile: number, point: Vector3 | null): OrbitPlan | null {
    const p = this.mgr.planet;
    const v = this.mgr.visuals;
    if (!p || !v || !this.def) return null;
    this.hoverTile = tile;
    const pos = point ?? new Vector3(p.grid.center[tile * 3], p.grid.center[tile * 3 + 1], p.grid.center[tile * 3 + 2]).multiplyScalar(p.radius + p.heightOf(tile));
    const plan = planOrbit(pos, INC[this.inc], this.orbitMul(), p.radius);
    const up = pos.clone().normalize();
    v.reticle.show(pos, up, 2.2, TOOL_COLORS.accent, true);
    v.showOrbit(p.radius * this.orbitMul(), plan.normal, TOOL_COLORS.accent, plan.insertion);
    const cost = this.game.empire.sandbox ? 0 : this.def.cost;
    const afford = this.game.empire.canAfford(this.def.cost);
    this.mgr.setCost(cost, afford, afford ? undefined : `Needs ${money(this.def.cost)}`);
    const deg = Math.round((plan.params.inclination * 180) / Math.PI);
    this.mgr.showTag(pos, this.def.name, afford ? 'info' : 'bad', `${deg}° orbit · ${this.alt === 'mid' ? 'standard' : this.alt} altitude`);
    return plan;
  }

  override hover(hit: PickResult | null): void {
    if (!hit) {
      this.hoverTile = -1;
      this.clear();
      return;
    }
    if (hit.tile === this.hoverTile) return;
    this.aim(hit.tile, hit.point);
  }

  override tap(hit: PickResult | null, _info: PointerInfo): void {
    if (!hit || !this.def) return;
    const def = this.def;
    const cmd = this.game.commands;
    try {
      if (!this.game.progression.isItemUnlocked(def)) {
        cmd.feedback(`${def.name} is locked`, this.game.progression.lockReason(def) ?? undefined, 'warn', 'lock');
        return;
      }
    } catch {
      /* progression optional */
    }
    if (!this.game.empire.canAfford(def.cost)) {
      cmd.feedback('Not enough credits', `${def.name} costs ${money(def.cost)}`, 'bad', 'money');
      return;
    }
    if (this.inFlight >= 3) return;
    const plan = this.aim(hit.tile, hit.point);
    const p = this.mgr.planet;
    const v = this.mgr.visuals;
    if (!plan || !p || !v) return;
    const params = { ...plan.params };
    const view = this.game.planetView as unknown as { orbitals?: { launch?: (defId: string, from: Vector3, params: unknown, done: () => void) => unknown } } | null;
    const add = () => {
      this.inFlight = Math.max(0, this.inFlight - 1);
      const o = cmd.addOrbital(def.id, params);
      if (o) {
        cmd.sfx('chime', 0.2);
        this.mgr.setHint(`${def.name} reached orbit`);
      }
    };
    this.inFlight++;
    cmd.sfx('launch', 0.1);
    const up = hit.point.clone().normalize();
    const custom = view?.orbitals?.launch;
    if (typeof custom === 'function') {
      try {
        custom.call(view!.orbitals, def.id, hit.point.clone(), params, add);
      } catch (e) {
        console.error('[tools] orbital launch hook failed', e);
        v.launch(hit.point, up, plan.insertion, add);
      }
    } else v.launch(hit.point, up, plan.insertion, add);
    this.game.camera.shake(0.18, 0.6);
    this.mgr.setHint('Liftoff!');
  }
}
