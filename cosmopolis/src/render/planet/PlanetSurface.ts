/**
 * OWNER: terrain agent.
 * PlanetSurface — terrain mesh, water, atmosphere, clouds, zone lots, grid lines and the tile overlay.
 * (Foundation stub: flat-coloured hex prisms + plain water sphere. Replace with the real implementation.)
 *
 * CONTRACT used by other modules:
 *   overlay: TileOverlay                      (lenses, tool highlights)
 *   setZoneDisplay(mode)                      ('subtle' normally, 'strong' while zoning, 'off')
 *   setGrid(on)                               (tile outlines while building)
 *   terrainMesh: Mesh | null                  (god powers may clone / deform)
 *   update(dt) / dispose()
 */
import { BufferAttribute, BufferGeometry, Color, Mesh, MeshStandardMaterial, SphereGeometry, type Object3D } from 'three';
import { bus } from '../../core/events';
import { Biome } from '../../core/types';
import type { PlanetView } from '../PlanetView';
import type { Planet } from '../../world/planet';

export type ColorRamp = 'heat' | 'good' | 'bad' | 'cool' | 'rainbow' | ((v: number) => number);

export interface TileOverlay {
  /** per-tile scalar 0..1 rendered through a ramp; null hides */
  showValues(values: ArrayLike<number> | null, ramp?: ColorRamp, opacity?: number): void;
  /** per-tile explicit colours (0xRRGGBB, negative = transparent); null hides */
  showColors(colors: ArrayLike<number> | null, opacity?: number): void;
  /** named highlight channel (e.g. 'tool', 'selection', 'god'); null tiles clears it */
  setHighlight(channel: string, tiles: number[] | null, color?: number, opacity?: number): void;
  clear(): void;
}

const BIOME_COLORS: Partial<Record<Biome, number>> = {
  [Biome.DeepOcean]: 0x123a66, [Biome.Ocean]: 0x1d5a8a, [Biome.Beach]: 0xe6d5a0, [Biome.Grass]: 0x6aa84f,
  [Biome.Forest]: 0x3f7f3a, [Biome.Jungle]: 0x2e7a35, [Biome.Savanna]: 0xb5a858, [Biome.Desert]: 0xdcb072,
  [Biome.Tundra]: 0x9aa58a, [Biome.Snow]: 0xf2f6fa, [Biome.Ice]: 0xcfe6f5, [Biome.Rock]: 0x8a8278,
  [Biome.Mountain]: 0x77706a, [Biome.Volcanic]: 0x3a302c, [Biome.Lava]: 0xff5a1a, [Biome.Regolith]: 0x9a9a9a,
  [Biome.Crater]: 0x7a7a7a, [Biome.Crystal]: 0xa48ef0, [Biome.Toxic]: 0x8a9a2a, [Biome.Fungal]: 0x8a5a9a,
  [Biome.Salt]: 0xe8e4dc, [Biome.Swamp]: 0x4a6a3a, [Biome.Ash]: 0x5a5250, [Biome.Metal]: 0x6a7480,
  [Biome.Coral]: 0xff9a8a, [Biome.Meadow]: 0x8ac060,
};

class NullOverlay implements TileOverlay {
  showValues(): void {}
  showColors(): void {}
  setHighlight(): void {}
  clear(): void {}
}

export class PlanetSurface {
  readonly overlay: TileOverlay = new NullOverlay();
  terrainMesh: Mesh | null = null;
  private water: Mesh | null = null;
  private offs: (() => void)[] = [];
  private dirty = false;

  constructor(private view: PlanetView) {
    this.rebuild();
    this.offs.push(
      bus.on('tiles:terrain', () => (this.dirty = true)),
      bus.on('planet:sea', () => this.updateWater()),
    );
  }

  setZoneDisplay(_mode: 'subtle' | 'strong' | 'off'): void {}
  setGrid(_on: boolean): void {}

  private rebuild(): void {
    const p = this.view.planet;
    const geo = buildTerrain(p);
    if (this.terrainMesh) {
      this.terrainMesh.geometry.dispose();
      this.terrainMesh.geometry = geo;
    } else {
      this.terrainMesh = new Mesh(geo, new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }));
      this.terrainMesh.name = 'terrain';
      this.terrainMesh.receiveShadow = true;
      this.view.root.add(this.terrainMesh);
    }
    this.updateWater();
  }

  private updateWater(): void {
    const p = this.view.planet;
    if (!p.spec.hasOcean) return;
    if (!this.water) {
      this.water = new Mesh(new SphereGeometry(1, 96, 64), new MeshStandardMaterial({ color: p.spec.oceanColor, transparent: true, opacity: 0.82, roughness: 0.15, metalness: 0.1 }));
      this.water.name = 'water';
      this.view.root.add(this.water as Object3D);
    }
    this.water.scale.setScalar(p.radius + p.waterHeight);
  }

  update(_dt: number): void {
    if (this.dirty) {
      this.dirty = false;
      this.rebuild();
    }
  }

  dispose(): void {
    this.offs.forEach((f) => f());
    this.terrainMesh?.geometry.dispose();
    this.terrainMesh?.removeFromParent();
    this.water?.removeFromParent();
  }
}

/** Simple hex-prism terrain: top polygon per tile + skirt walls down to the lowest neighbour. */
function buildTerrain(p: Planet): BufferGeometry {
  const g = p.grid;
  const pos: number[] = [];
  const col: number[] = [];
  const c = new Color();
  for (let i = 0; i < p.count; i++) {
    const d = g.degree(i);
    const s = g.start[i];
    const r = p.radius + p.heightOf(i);
    c.setHex(BIOME_COLORS[p.biome[i] as Biome] ?? 0xff00ff);
    const cx = g.center[i * 3] * r, cy = g.center[i * 3 + 1] * r, cz = g.center[i * 3 + 2] * r;
    for (let k = 0; k < d; k++) {
      const a = (s + k) * 3, b = (s + ((k + 1) % d)) * 3;
      pos.push(cx, cy, cz, g.corner[a] * r, g.corner[a + 1] * r, g.corner[a + 2] * r, g.corner[b] * r, g.corner[b + 1] * r, g.corner[b + 2] * r);
      for (let q = 0; q < 3; q++) col.push(c.r, c.g, c.b);
      // wall toward lower neighbour
      const n = g.nbr[s + k];
      const rn = p.radius + p.heightOf(n);
      if (rn < r) {
        const ax = g.corner[a], ay = g.corner[a + 1], az = g.corner[a + 2];
        const bx = g.corner[b], by = g.corner[b + 1], bz = g.corner[b + 2];
        pos.push(ax * r, ay * r, az * r, ax * rn, ay * rn, az * rn, bx * rn, by * rn, bz * rn);
        pos.push(ax * r, ay * r, az * r, bx * rn, by * rn, bz * rn, bx * r, by * r, bz * r);
        for (let q = 0; q < 6; q++) col.push(c.r * 0.7, c.g * 0.7, c.b * 0.7);
      }
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  geo.computeVertexNormals();
  return geo;
}
