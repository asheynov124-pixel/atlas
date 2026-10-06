/**
 * OWNER: terrain.
 * PlanetSurface — terrain, water, atmosphere, clouds, aurora, zone lots, build grid, district borders and the tile
 * overlay of the active planet. Built from the Planet model; updates incrementally on bus events.
 *
 * CONTRACT used by other modules:
 *   overlay: TileOverlay                      lenses (showValues / showColors), named highlight channels, clear()
 *   setZoneDisplay(mode)                      'subtle' normally, 'strong' while zoning (region outlines), 'off'
 *   setGrid(on)                               crisp hex outlines on land while building (respects settings.grid)
 *   setDistrictDisplay(on)                    coloured district borders + faint fill
 *   setAurora(intensity | null)               polar aurora (null = archetype default; solar flares → 1.5)
 *   setCloudCover(v | null), setStorm(0..1)   weather overrides (null = planet default)
 *   setGlow(v)                                emissive multiplier for lava / toxic / crystal / coolant glows
 *   setLayerVisible('terrain'|'water'|'atmosphere'|'clouds'|'aurora', on)   photo mode / god powers
 *   terrainMesh: Mesh | null                  terrain ROOT: a Mesh with no triangles of its own (layers disabled)
 *                                             whose children are the per-region chunk meshes. Hide everything with
 *                                             `terrainMesh.visible = false`; clone it with `terrainMesh.clone()`
 *                                             (shares geometries); `buildMergedGeometry()` returns one standalone
 *                                             BufferGeometry of the whole planet (caller disposes).
 *   chunks: SurfaceChunk[]                    { info: {tiles, dir, angle}, mesh, water } per icosahedron face
 *   terrainMaterial / waterMaterial / uniforms   live shader state (e.g. uniforms.uGlow, uSnowLine)
 *   atmosphere / clouds / aurora              sub-renderers (Atmosphere.setColor/setDensity, Clouds.setTint)
 *   update(dt) / dispose()
 *
 * Events handled: tiles:terrain (chunk rebuilds, time-budgeted), planet:sea (live sea radius; water fans rebuilt
 * when the covered level changes), tiles:flags / tiles:zone / tiles:road / tiles:district, building:added/removed,
 * settings:changed, quality:changed.
 */
import { BufferGeometry, Group, Mesh, SRGBColorSpace, Vector3, type Material, type ShaderMaterial, Color, type MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bus } from '../../core/events';
import { settings } from '../../core/settings';
import type { PlanetTypeId } from '../../core/types';
import { PLANET_TYPES } from '../../content/planetTypes';
import { game } from '../../game/instance';
import { Planet } from '../../world/planet';
import type { PlanetView } from '../PlanetView';
import { Atmosphere } from './Atmosphere';
import { Aurora } from './Aurora';
import { Clouds } from './Clouds';
import { surfacePalette, type SurfacePalette } from './palette';
import { createSurfaceUniforms, type SurfaceUniforms } from './SurfaceUniforms';
import { buildTerrainChunk, buildWaterChunk, chunkBounds, partition, type ChunkInfo } from './TerrainBuilder';
import { createTerrainMaterial } from './TerrainMaterial';
import { TileData, type TileOverlay } from './TileData';
import { createWaterMaterial } from './WaterMaterial';

export type { ColorRamp, TileOverlay } from './TileData';

export interface SurfaceChunk {
  info: ChunkInfo;
  mesh: Mesh;
  water: Mesh | null;
  dirty: boolean;
  waterDirty: boolean;
}

export type SurfaceLayer = 'terrain' | 'water' | 'atmosphere' | 'clouds' | 'aurora';

/** Snow line (terrace level) per archetype; 99 = never. */
const SNOW_LEVEL: Record<PlanetTypeId, number> = {
  terran: 9, tundra: 6, arctic: 4, crystal: 10, desert: 14, jungle: 12, fungal: 11,
  ocean: 99, toxic: 99, volcanic: 99, barren: 99, machine: 99,
};
const AURORA: Partial<Record<PlanetTypeId, number>> = { arctic: 0.95, tundra: 0.7, crystal: 0.35 };
const WATER_GLOW: Partial<Record<PlanetTypeId, number>> = { toxic: 0.4, machine: 0.65, crystal: 0.22 };

const _cam = new Vector3();
const _dir = new Vector3();

export class PlanetSurface {
  readonly overlay: TileOverlay;
  terrainMesh: Mesh | null = null;
  readonly chunks: SurfaceChunk[] = [];
  readonly water = new Group();
  readonly uniforms: SurfaceUniforms;
  readonly terrainMaterial: MeshStandardMaterial;
  readonly waterMaterial: ShaderMaterial;
  readonly atmosphere: Atmosphere;
  readonly clouds: Clouds;
  readonly aurora: Aurora;
  readonly tileData: TileData;

  private planet: Planet;
  private pal: SurfacePalette;
  private chunkOf: Uint8Array;
  private offs: (() => void)[] = [];
  private builtSea: number;
  private coverLevel: number;
  private gridWanted = false;
  private zoneMode: 'subtle' | 'strong' | 'off' = 'subtle';
  private districtOn = false;
  private cloudOverride: number | null = null;
  private stormTarget = 0;
  private paletteTimer = 0;
  private errorLogged = false;
  private maxH = 0;

  constructor(private view: PlanetView) {
    const p = view.planet;
    this.planet = p;
    this.pal = surfacePalette(p.spec);
    const u = (this.uniforms = createSurfaceUniforms());
    this.configureUniforms();
    this.tileData = new TileData(p, u);
    this.overlay = this.tileData;
    this.terrainMaterial = createTerrainMaterial(u);
    this.waterMaterial = createWaterMaterial(u);

    // terrain root + chunks
    const root = new Mesh(new BufferGeometry(), this.terrainMaterial);
    root.name = 'terrain';
    root.layers.disableAll();
    root.frustumCulled = false;
    this.terrainMesh = root;
    view.root.add(root);
    this.water.name = 'water';
    view.root.add(this.water);
    const part = partition(p.grid);
    this.chunkOf = part.chunkOf;
    this.builtSea = p.seaOffset;
    this.coverLevel = Math.ceil(p.seaOffset);
    for (const info of part.chunks) {
      const mesh = new Mesh(undefined, this.terrainMaterial);
      mesh.name = 'terrain-chunk-' + info.id;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      root.add(mesh);
      const ch: SurfaceChunk = { info, mesh, water: null, dirty: true, waterDirty: true };
      this.chunks.push(ch);
      this.buildChunk(ch);
      this.buildWater(ch);
    }

    // sky layers
    const spec = p.spec;
    this.atmosphere = new Atmosphere(p.radius, spec.atmosphere.color, Math.min(1.8, spec.atmosphere.density));
    view.root.add(this.atmosphere.mesh);
    this.clouds = new Clouds(p.radius, spec.cloudCover, spec.seed | 0, u);
    this.clouds.enabled = settings.value.clouds;
    view.root.add(this.clouds.mesh);
    this.aurora = new Aurora(p.radius, AURORA[spec.type] ?? 0);
    view.root.add(this.aurora.mesh);

    const td = this.tileData;
    this.offs.push(
      bus.on('tiles:terrain', ({ tiles }) => this.onTerrain(tiles)),
      bus.on('planet:sea', () => this.onSea()),
      bus.on('tiles:flags', ({ tiles }) => td.refreshFlags(tiles)),
      bus.on('tiles:zone', ({ tiles }) => td.refreshTiles(tiles)),
      bus.on('tiles:road', ({ tiles }) => td.refreshTiles(tiles)),
      bus.on('tiles:district', ({ tiles }) => {
        td.refreshPalette();
        td.refreshTiles(tiles);
      }),
      bus.on('building:added', ({ id }) => {
        const b = this.planet.buildings.get(id);
        if (b) td.refreshTiles(b.tiles);
      }),
      bus.on('building:removed', ({ tiles }) => td.refreshTiles(tiles)),
      bus.on('settings:changed', () => {
        this.clouds.enabled = settings.value.clouds;
        this.applyGrid();
      }),
    );
  }

  // ─────────────────────────────────────────── public API

  setZoneDisplay(mode: 'subtle' | 'strong' | 'off'): void {
    this.zoneMode = mode;
  }

  setGrid(on: boolean): void {
    this.gridWanted = on;
  }

  setDistrictDisplay(on: boolean): void {
    this.districtOn = on;
    if (on) this.tileData.refreshPalette();
  }

  /** Aurora intensity (0..2); null restores the archetype default. */
  setAurora(intensity: number | null): void {
    this.aurora.override = intensity === null ? null : Math.max(0, intensity);
  }

  /** Cloud cover 0..1; null restores the planet's own. */
  setCloudCover(v: number | null): void {
    this.cloudOverride = v === null ? null : Math.max(0, Math.min(1, v));
  }

  /** Storminess 0..1 (darker, denser clouds). */
  setStorm(v: number): void {
    this.stormTarget = Math.max(0, Math.min(1, v));
  }

  setGlow(v: number): void {
    this.uniforms.uGlow.value = Math.max(0, v);
  }

  setLayerVisible(layer: SurfaceLayer, on: boolean): void {
    if (layer === 'terrain' && this.terrainMesh) this.terrainMesh.visible = on;
    else if (layer === 'water') this.water.visible = on;
    else if (layer === 'atmosphere') this.atmosphere.mesh.visible = on && this.atmosphere.density > 0.01;
    else if (layer === 'clouds') this.clouds.enabled = on && settings.value.clouds;
    else if (layer === 'aurora') this.aurora.mesh.visible = on;
  }

  /** Chunk index of a tile. */
  chunkIndexOf(tile: number): number {
    return this.chunkOf[tile];
  }

  /** Force a rebuild of the chunks containing these tiles (and their neighbours). */
  rebuildTiles(tiles: Iterable<number>): void {
    this.onTerrain(tiles);
  }

  /** One standalone geometry of the whole terrain (god powers: shatter / clone). Caller disposes it. */
  buildMergedGeometry(): BufferGeometry | null {
    const geos = this.chunks.map((c) => c.mesh.geometry).filter((g) => g.attributes.position);
    if (!geos.length) return null;
    try {
      // unify index types so they can merge
      const prepared = geos.map((g) => {
        const c = g.clone();
        if (c.index && !(c.index.array instanceof Uint32Array)) c.setIndex(Array.from(c.index.array));
        return c;
      });
      const merged = mergeGeometries(prepared, false);
      prepared.forEach((g) => g.dispose());
      return merged;
    } catch (e) {
      console.error('[surface] merge failed', e);
      return null;
    }
  }

  // ─────────────────────────────────────────── setup

  private configureUniforms(): void {
    const p = this.planet;
    const spec = p.spec;
    const u = this.uniforms;
    const pal = this.pal;
    u.uRadius.value = p.radius;
    u.uWaterR.value = p.radius + p.waterHeight;
    u.uHasOcean.value = spec.hasOcean ? 1 : 0;
    u.uSeed.value = (spec.seed % 1000) * 0.137;
    u.uSnowLine.value = Planet.levelHeight(SNOW_LEVEL[spec.type] ?? 99) - 0.15;
    u.uRock.value.setRGB(pal.rock.r, pal.rock.g, pal.rock.b, SRGBColorSpace);
    u.uStrata.value.setRGB(pal.strata.r, pal.strata.g, pal.strata.b, SRGBColorSpace);
    u.uSnowCol.value.setRGB(pal.snow.r, pal.snow.g, pal.snow.b, SRGBColorSpace);
    u.uAtmoColor.value.setHex(spec.atmosphere.color);
    u.uAtmoDensity.value = Math.min(1.25, spec.atmosphere.density) * 0.9;
    u.uHazeNear.value = Math.max(22, p.radius * 0.4);
    u.uHazeFar.value = Math.max(120, p.radius * 2.2);
    u.uCloudCover.value = spec.cloudCover;
    const arch = PLANET_TYPES[spec.type] ?? PLANET_TYPES.terran;
    u.uLavaCol.value.setHex(spec.type === 'volcanic' ? 0xff4a10 : 0xff6a20);
    u.uWaterGlow.value = WATER_GLOW[spec.type] ?? 0;
    u.uGlow.value = spec.type === 'volcanic' ? 1.15 : 1;
    // water colours from the ocean colour: luminous turquoise-leaning shallows, deep saturated depths
    const hsl = { h: 0, s: 0, l: 0 };
    new Color(spec.oceanColor || arch.oceanColor).getHSL(hsl, SRGBColorSpace);
    const blue = hsl.h > 0.45 && hsl.h < 0.7;
    u.uShallow.value.setHSL(hsl.h - (blue ? 0.06 : 0.01), Math.min(1, hsl.s * 1.05 + 0.1), Math.min(0.56, hsl.l * 0.9 + 0.12), SRGBColorSpace);
    u.uDeep.value.setHSL(hsl.h + (blue ? 0.015 : 0), Math.min(1, hsl.s * 1.1), hsl.l * 0.4, SRGBColorSpace);
    u.uMoonCol.value.setRGB(0.05, 0.07, 0.12);
  }

  private buildChunk(ch: SurfaceChunk): void {
    const p = this.planet;
    const old = ch.mesh.geometry;
    const geo = buildTerrainChunk(p, ch.info, this.pal, Math.floor(p.seaOffset) - 3);
    let maxE = -99;
    for (const t of ch.info.tiles) if (p.elevation[t] > maxE) maxE = p.elevation[t];
    const maxH = Math.max(Planet.levelHeight(maxE), 0.2);
    this.maxH = Math.max(this.maxH, maxH);
    geo.boundingSphere = chunkBounds(p, ch.info, maxH);
    ch.mesh.geometry = geo;
    old?.dispose();
    ch.dirty = false;
  }

  private buildWater(ch: SurfaceChunk): void {
    const p = this.planet;
    ch.waterDirty = false;
    const geo = buildWaterChunk(p, ch.info, this.coverLevel);
    if (!geo) {
      if (ch.water) {
        ch.water.geometry.dispose();
        ch.water.removeFromParent();
        ch.water = null;
      }
      return;
    }
    geo.boundingSphere = chunkBounds(p, ch.info, Math.max(p.waterHeight, 0.2) + 0.5);
    if (ch.water) {
      ch.water.geometry.dispose();
      ch.water.geometry = geo;
    } else {
      const m = new Mesh(geo, this.waterMaterial);
      m.name = 'water-chunk-' + ch.info.id;
      m.renderOrder = 2;
      m.matrixAutoUpdate = false;
      this.water.add(m);
      ch.water = m;
    }
  }

  // ─────────────────────────────────────────── events

  private onTerrain(tiles: Iterable<number>): void {
    const p = this.planet;
    const g = p.grid;
    const list: number[] = [];
    for (const t of tiles) {
      if (t < 0 || t >= p.count) continue;
      list.push(t);
      this.markChunk(this.chunkOf[t]);
      for (let q = g.start[t]; q < g.start[t + 1]; q++) this.markChunk(this.chunkOf[g.nbr[q]]);
    }
    if (list.length) this.tileData.refreshTiles(list);
  }

  private markChunk(c: number): void {
    const ch = this.chunks[c];
    if (!ch) return;
    ch.dirty = true;
    ch.waterDirty = true;
  }

  private onSea(): void {
    const p = this.planet;
    this.uniforms.uWaterR.value = p.radius + p.waterHeight;
    this.tileData.refreshWater();
    const cover = Math.ceil(p.seaOffset);
    if (cover !== this.coverLevel) {
      this.coverLevel = cover;
      for (const ch of this.chunks) this.buildWater(ch);
    }
    if (Math.abs(p.seaOffset - this.builtSea) >= 2) {
      this.builtSea = p.seaOffset;
      for (const ch of this.chunks) ch.dirty = true;
    }
  }

  private applyGrid(): void {
    /* evaluated each frame in update(); kept for settings changes */
  }

  // ─────────────────────────────────────────── frame

  update(dt: number): void {
    try {
      this.frame(dt);
    } catch (e) {
      if (!this.errorLogged) {
        this.errorLogged = true;
        console.error('[surface] update failed', e);
      }
    }
  }

  private frame(dt: number): void {
    const p = this.planet;
    const u = this.uniforms;
    const k = 1 - Math.exp(-dt * 7);
    // fades
    const gridT = this.gridWanted && settings.value.grid ? 1 : 0;
    u.uGrid.value += (gridT - u.uGrid.value) * k;
    const zv = this.zoneMode === 'off' ? 0 : 1;
    const zs = this.zoneMode === 'strong' ? 1 : 0;
    u.uZoneVis.value += (zv - u.uZoneVis.value) * k;
    u.uZoneStrong.value += (zs - u.uZoneStrong.value) * k;
    const ov = this.tileData.overlayTarget;
    u.uOverlay.value += (ov - u.uOverlay.value) * k;
    if (Math.abs(ov - u.uOverlay.value) < 0.002) u.uOverlay.value = ov;
    u.uDistrict.value += ((this.districtOn ? 1 : 0) - u.uDistrict.value) * k;
    u.uCloudStorm.value += (this.stormTarget - u.uCloudStorm.value) * (1 - Math.exp(-dt * 1.5));
    const cover = this.cloudOverride ?? p.spec.cloudCover;
    u.uCloudCover.value += (Math.min(1, cover + this.stormTarget * 0.3) - u.uCloudCover.value) * (1 - Math.exp(-dt * 1.2));
    u.uWaterR.value = p.radius + p.waterHeight;
    if (this.districtOn && (this.paletteTimer -= dt) <= 0) {
      this.paletteTimer = 1;
      this.tileData.refreshPalette();
    }
    this.tileData.flush();

    // incremental rebuilds (time-budgeted)
    const t0 = performance.now();
    for (const ch of this.chunks) {
      if (!ch.dirty && !ch.waterDirty) continue;
      if (ch.dirty) this.buildChunk(ch);
      if (ch.waterDirty) this.buildWater(ch);
      if (performance.now() - t0 > 5) break;
    }

    // horizon culling of chunks (frustum culling is done by three per chunk bounding sphere)
    const cam = this.view.camera;
    _cam.copy(cam.position);
    this.view.root.worldToLocal(_cam);
    const D = _cam.length();
    const R = p.radius;
    const horizon = D > R ? Math.acos(Math.min(1, R / D)) : Math.PI;
    const margin = Math.acos(R / (R + Math.max(2, this.maxH + 1)));
    _dir.copy(_cam).divideScalar(Math.max(D, 1e-6));
    for (const ch of this.chunks) {
      const ang = Math.acos(Math.max(-1, Math.min(1, _dir.dot(ch.info.dir))));
      const vis = ang - ch.info.angle < horizon + margin;
      ch.mesh.visible = vis;
      if (ch.water) ch.water.visible = vis;
    }

    // sky
    const altitude = D - R;
    const engine = game?.engine;
    if (!this.clouds.ready && engine && p.spec.cloudCover > 0.005) this.clouds.bake(engine.renderer);
    this.clouds.update(dt, altitude, game?.clock.time ?? 0, (engine?.tier ?? 2) === 0);
    this.aurora.update(dt);
  }

  dispose(): void {
    this.offs.forEach((f) => f());
    this.offs = [];
    for (const ch of this.chunks) {
      ch.mesh.geometry.dispose();
      ch.mesh.removeFromParent();
      if (ch.water) {
        ch.water.geometry.dispose();
        ch.water.removeFromParent();
      }
    }
    this.chunks.length = 0;
    if (this.terrainMesh) {
      this.terrainMesh.geometry.dispose();
      this.terrainMesh.removeFromParent();
    }
    this.terrainMesh = null;
    this.water.removeFromParent();
    (this.terrainMaterial as Material).dispose();
    this.waterMaterial.dispose();
    this.atmosphere.dispose();
    this.clouds.dispose();
    this.aurora.dispose();
    this.tileData.dispose();
  }
}
