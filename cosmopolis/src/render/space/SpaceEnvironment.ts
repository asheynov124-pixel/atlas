/**
 * OWNER: space & post agent.
 * SpaceEnvironment — skybox / nebula, starfield, sun disc + glare, lights, moons, planetary rings, distant planets.
 * (Foundation stub: black background + sun & ambient lights.)
 *
 * CONTRACT: sunLight (DirectionalLight, follows view.sunDir), update(dt), dispose().
 */
import { AmbientLight, Color, DirectionalLight, HemisphereLight } from 'three';
import type { PlanetView } from '../PlanetView';

export class SpaceEnvironment {
  readonly sunLight: DirectionalLight;
  private ambient: AmbientLight;
  private hemi: HemisphereLight;

  constructor(private view: PlanetView) {
    view.scene.background = new Color(0x02030a);
    this.sunLight = new DirectionalLight(0xfff1dd, 3.2);
    this.ambient = new AmbientLight(0x334466, 0.35);
    this.hemi = new HemisphereLight(0x8899bb, 0x111118, 0.25);
    view.scene.add(this.sunLight, this.sunLight.target, this.ambient, this.hemi);
  }

  update(_dt: number): void {
    const r = this.view.planet.radius;
    this.sunLight.position.copy(this.view.sunDir).multiplyScalar(r * 6);
    this.sunLight.target.position.set(0, 0, 0);
  }

  dispose(): void {
    this.sunLight.removeFromParent();
    this.ambient.removeFromParent();
    this.hemi.removeFromParent();
  }
}
