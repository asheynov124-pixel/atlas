/**
 * OWNER: god-powers agent.
 * FxLayer — particle systems, shockwaves, beams, debris, fire, smoke, water waves, camera-facing flashes used by
 * disasters and god powers. Owns a Group under view.root (planet-fixed) and one under view.scene (world-fixed).
 * (Foundation stub.)
 */
import { Group } from 'three';
import type { PlanetView } from '../PlanetView';

export class FxLayer {
  readonly planetGroup = new Group();
  readonly worldGroup = new Group();
  constructor(view: PlanetView) {
    view.root.add(this.planetGroup);
    view.scene.add(this.worldGroup);
  }
  update(_dt: number): void {}
  dispose(): void {
    this.planetGroup.removeFromParent();
    this.worldGroup.removeFromParent();
  }
}
