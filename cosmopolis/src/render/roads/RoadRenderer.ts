/**
 * OWNER: roads & props agent.
 * RoadRenderer — draws the road / rail network from planet.road + planet.roadLinks (lanes, markings, bridges,
 * intersections, street lights, maglev rails, hyperloop tubes). Rebuilds incrementally on 'tiles:road'.
 * (Foundation stub: dark discs on road tiles.)
 *
 * CONTRACT: update(dt), dispose(); optional laneSegments(tile) helper for traffic (see LifeRenderer).
 */
import { Matrix4 } from 'three';
import { bus } from '../../core/events';
import { MeshBuilder } from '../../content/kit';
import { tileMatrix } from '../../world/geo';
import { InstancePool } from '../InstancePool';
import { getBuildingMaterial } from '../materials';
import type { PlanetView } from '../PlanetView';

const _m = new Matrix4();

export class RoadRenderer {
  private pool: InstancePool;
  private handles = new Map<number, number>();
  private off: () => void;

  constructor(private view: PlanetView) {
    const b = new MeshBuilder(0);
    b.cyl(0.95, 0.95, 0.04, { color: 0x2a2c33, seg: 6 });
    const geo = b.build();
    this.pool = new InstancePool(view.root, getBuildingMaterial(), () => geo, { name: 'roads-stub' });
    for (let t = 0; t < view.planet.count; t++) if (view.planet.road[t]) this.sync(t);
    this.off = bus.on('tiles:road', ({ tiles }) => tiles.forEach((t) => this.sync(t)));
  }

  private sync(t: number): void {
    const p = this.view.planet;
    const h = this.handles.get(t);
    if (h !== undefined) this.pool.remove(h);
    this.handles.delete(t);
    if (p.road[t]) this.handles.set(t, this.pool.add('road', tileMatrix(p, t, 0, _m), 0xffffff, 1.2));
  }

  update(_dt: number): void {
    this.pool.update(this.view.camera, this.view.planet.radius);
  }

  dispose(): void {
    this.off();
    this.pool.dispose();
  }
}
