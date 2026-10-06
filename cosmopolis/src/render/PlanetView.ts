/**
 * PlanetView — the 3D scene of the active planet (FOUNDATION).
 * Composes the sub-renderers owned by different modules; each gets `(view)` and exposes update(dt) / dispose().
 *
 *   root         planet-fixed group at the world origin (everything on the planet goes in here)
 *   env          sky, stars, sun, lights, moons, rings      (render/space — space & post agent)
 *   surface      terrain, water, atmosphere, clouds, overlay (render/planet — terrain agent)
 *   roads/props  road network, trees & decor               (render/roads, render/props — roads & props agent)
 *   buildings    all buildings (foundation BuildingRenderer)
 *   life         vehicles, aircraft, ships, people dots     (render/agents — life agent)
 *   orbitals     satellites & stations in orbit            (render/agents — life agent)
 *   fx           disasters & god-power effects             (render/fx — god agent)
 *   toolLayer    tool previews / ghosts                     (tools — camera & tools agent)
 */
import { Group, PerspectiveCamera, Scene, Vector3 } from 'three';
import { settings } from '../core/settings';
import { game } from '../game/instance';
import type { Planet } from '../world/planet';
import { BuildingRenderer } from './BuildingRenderer';
import { shared } from './materials';
import { PlanetSurface } from './planet/PlanetSurface';
import { SpaceEnvironment } from './space/SpaceEnvironment';
import { RoadRenderer } from './roads/RoadRenderer';
import { PropRenderer } from './props/PropRenderer';
import { LifeRenderer } from './agents/LifeRenderer';
import { OrbitalRenderer } from './agents/OrbitalRenderer';
import { FxLayer } from './fx/FxLayer';
import type { View } from './View';

const _t = new Vector3();
const _r = new Vector3();
const UP = new Vector3(0, 1, 0);

export class PlanetView implements View {
  readonly kind = 'planet' as const;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly root = new Group();
  readonly toolLayer = new Group();
  /** unit vector planet → sun (world) — smoothed */
  readonly sunDir = new Vector3(0.8, 0.3, 0.5).normalize();
  private sunTarget = new Vector3().copy(this.sunDir);

  readonly env: SpaceEnvironment;
  readonly surface: PlanetSurface;
  readonly roads: RoadRenderer;
  readonly props: PropRenderer;
  readonly buildings: BuildingRenderer;
  readonly life: LifeRenderer;
  readonly orbitals: OrbitalRenderer;
  readonly fx: FxLayer;

  constructor(readonly planet: Planet) {
    this.camera = new PerspectiveCamera(50, 1, 0.05, planet.radius * 400);
    this.camera.position.set(0, planet.radius * 0.6, planet.radius * 3);
    this.camera.lookAt(0, 0, 0);
    this.root.name = 'planet-root';
    this.toolLayer.name = 'tool-layer';
    this.scene.add(this.root);
    this.root.add(this.toolLayer);
    this.scene.add(this.camera);
    this.env = new SpaceEnvironment(this);
    this.surface = new PlanetSurface(this);
    this.roads = new RoadRenderer(this);
    this.props = new PropRenderer(this);
    this.buildings = new BuildingRenderer(this);
    this.life = new LifeRenderer(this);
    this.orbitals = new OrbitalRenderer(this);
    this.fx = new FxLayer(this);
    this.computeSun(true);
  }

  /** Recompute the sun direction from the clock / settings. */
  private computeSun(snap = false, dt = 0.016): void {
    const mode = settings.value.dayNight;
    const cam = _t.copy(this.camera.position).normalize();
    _r.crossVectors(cam, UP);
    if (_r.lengthSq() < 1e-4) _r.set(1, 0, 0);
    _r.normalize();
    if (mode === 'cycle') {
      const a = (game?.clock.timeOfDay ?? 0.3) * Math.PI * 2;
      const tilt = this.planet.spec.axialTilt;
      this.sunTarget.set(Math.cos(a), Math.sin(tilt) * 0.9 + 0.12, Math.sin(a)).normalize();
    } else if (mode === 'day') {
      this.sunTarget.copy(cam).multiplyScalar(0.72).addScaledVector(_r, 0.55).addScaledVector(UP, 0.3).normalize();
    } else if (mode === 'golden') {
      this.sunTarget.copy(cam).multiplyScalar(0.12).addScaledVector(_r, 0.98).addScaledVector(UP, 0.1).normalize();
    } else {
      this.sunTarget.copy(cam).multiplyScalar(-0.9).addScaledVector(_r, 0.3).normalize();
    }
    if (snap) this.sunDir.copy(this.sunTarget);
    else if (mode === 'cycle' || this.sunDir.dot(this.sunTarget) < 0.5) this.sunDir.copy(this.sunTarget);
    else this.sunDir.lerp(this.sunTarget, 1 - Math.exp(-dt * 4)).normalize();
  }

  update(dt: number): void {
    this.computeSun(false, dt);
    shared.uSunDir.value.copy(this.sunDir);
    shared.uTime.value = game?.clock.time ?? 0;
    shared.uCameraPos.value.copy(this.camera.position);
    this.env.update(dt);
    this.surface.update(dt);
    this.roads.update(dt);
    this.props.update(dt);
    this.buildings.update(dt);
    this.life.update(dt);
    this.orbitals.update(dt);
    this.fx.update(dt);
  }

  onResize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.fx.dispose();
    this.orbitals.dispose();
    this.life.dispose();
    this.buildings.dispose();
    this.props.dispose();
    this.roads.dispose();
    this.surface.dispose();
    this.env.dispose();
    this.scene.clear();
  }
}
