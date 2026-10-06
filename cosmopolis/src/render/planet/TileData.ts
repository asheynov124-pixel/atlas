/**
 * OWNER: terrain.
 * TileData — per-tile state for the surface shaders, packed into RGBA8 data textures (256 texels per row,
 * fetched with texelFetch(tex, ivec2(id & 255, id >> 8))):
 *
 *   tile    R flags (TileFlag bits) · G zone · B bits (1 building, 2 road, 4 water, 8 districted) · A district-edge mask
 *   mask    R zone-edge mask · G highlight-edge mask · B district id · A water-edge mask (edges touching the sea)
 *   overlay lens colour (sRGB) + alpha
 *   high    composited highlight colour (sRGB) + alpha
 *   distPal 256×1 district palette (sRGB)
 *
 * Also implements the public TileOverlay (lens values / colours, named highlight channels). Uploads are batched:
 * mutate → mark dirty → flush() once per frame.
 */
import { DataTexture, NearestFilter, RGBAFormat, UnsignedByteType } from 'three';
import type { Planet } from '../../world/planet';
import type { SurfaceUniforms } from './SurfaceUniforms';

export type ColorRamp = 'heat' | 'good' | 'bad' | 'cool' | 'rainbow' | ((v: number) => number);

export interface TileOverlay {
  /** per-tile scalar 0..1 rendered through a ramp (NaN / negative = transparent); null hides */
  showValues(values: ArrayLike<number> | null, ramp?: ColorRamp, opacity?: number): void;
  /** per-tile explicit colours (0xRRGGBB, negative = transparent); null hides */
  showColors(colors: ArrayLike<number> | null, opacity?: number): void;
  /** named highlight channel (e.g. 'tool', 'selection', 'god'); null tiles clears it */
  setHighlight(channel: string, tiles: number[] | null, color?: number, opacity?: number): void;
  clear(): void;
}

const W = 256;

const RAMP_STOPS: Record<Exclude<ColorRamp, (v: number) => number>, number[]> = {
  heat: [0x1a2a6c, 0x2f6fd0, 0x5fd6c8, 0xf6e05a, 0xf98a2e, 0xd7263d],
  good: [0xd7263d, 0xf3722c, 0xf9d84a, 0x9be564, 0x2fbf71],
  bad: [0x2fbf71, 0xb8e05a, 0xf9d84a, 0xf3722c, 0xd7263d, 0x8a1d5c],
  cool: [0x0b1d51, 0x1f5fa8, 0x37b6e0, 0x9eeaf9, 0xf0fbff],
  rainbow: [0xe63946, 0xf4a261, 0xf9e45b, 0x52d681, 0x3fa7f0, 0x7b5cff, 0xd65db1],
};

function makeTex(w: number, h: number): DataTexture {
  const tex = new DataTexture(new Uint8Array(w * h * 4), w, h, RGBAFormat, UnsignedByteType);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.unpackAlignment = 4;
  tex.needsUpdate = true;
  return tex;
}

interface Channel {
  tiles: number[];
  color: number;
  opacity: number;
}

export class TileData implements TileOverlay {
  readonly tile: DataTexture;
  readonly mask: DataTexture;
  readonly overlay: DataTexture;
  readonly high: DataTexture;
  readonly distPal: DataTexture;
  /** target overlay opacity (PlanetSurface animates the uniform toward it) */
  overlayTarget = 0;
  private overlayShown = false;
  private channels = new Map<string, Channel>();
  private highTiles: number[] = [];
  private dirtyTile = false;
  private dirtyMask = false;
  private dirtyOverlay = false;
  private dirtyHigh = false;
  private dirtyPal = false;
  private distSig = '';
  private lut = new Uint8Array(256 * 3);
  private lutKey: ColorRamp | null = null;

  constructor(private planet: Planet, u: SurfaceUniforms) {
    const H = Math.ceil(planet.count / W);
    this.tile = makeTex(W, H);
    this.mask = makeTex(W, H);
    this.overlay = makeTex(W, H);
    this.high = makeTex(W, H);
    this.distPal = makeTex(256, 1);
    u.uTileTex.value = this.tile;
    u.uMaskTex.value = this.mask;
    u.uOverlayTex.value = this.overlay;
    u.uHighTex.value = this.high;
    u.uDistPal.value = this.distPal;
    this.refreshAll();
  }

  // ───────────────────────────────────────── state textures

  refreshAll(): void {
    const n = this.planet.count;
    for (let i = 0; i < n; i++) this.writeTile(i);
    for (let i = 0; i < n; i++) this.writeMask(i);
    this.refreshPalette(true);
  }

  /** Flags changed: only the R channel. */
  refreshFlags(tiles: Iterable<number>): void {
    const d = this.tile.image.data as Uint8Array;
    const f = this.planet.flags;
    for (const t of tiles) d[t * 4] = f[t];
    this.dirtyTile = true;
  }

  /** Recompute tile + mask texels for `tiles` and their neighbours (zone / road / building / district / water). */
  refreshTiles(tiles: Iterable<number>): void {
    const g = this.planet.grid;
    const touched = new Set<number>();
    for (const t of tiles) {
      if (t < 0 || t >= this.planet.count) continue;
      touched.add(t);
      for (let q = g.start[t]; q < g.start[t + 1]; q++) touched.add(g.nbr[q]);
    }
    for (const t of touched) this.writeTile(t);
    for (const t of touched) this.writeMask(t);
  }

  private writeTile(i: number): void {
    const p = this.planet;
    const g = p.grid;
    const d = this.tile.image.data as Uint8Array;
    const dist = p.district[i];
    let bits = 0;
    if (p.building[i] >= 0) bits |= 1;
    if (p.road[i] !== 0) bits |= 2;
    if (p.isWater(i)) bits |= 4;
    if (dist > 0) bits |= 8;
    let dm = 0;
    if (dist > 0) {
      const s = g.start[i], e = g.start[i + 1];
      for (let q = s; q < e; q++) if (p.district[g.nbr[q]] !== dist) dm |= 1 << (q - s);
    }
    d[i * 4] = p.flags[i];
    d[i * 4 + 1] = p.zone[i];
    d[i * 4 + 2] = bits;
    d[i * 4 + 3] = dm;
    this.dirtyTile = true;
  }

  private writeMask(i: number): void {
    const p = this.planet;
    const g = p.grid;
    const d = this.mask.image.data as Uint8Array;
    const s = g.start[i], e = g.start[i + 1];
    const z = p.zone[i];
    let zm = 0, wm = 0;
    const water = p.isWater(i);
    for (let q = s; q < e; q++) {
      const m = g.nbr[q];
      if (z > 0 && p.zone[m] !== z) zm |= 1 << (q - s);
      if (!water && p.isWater(m)) wm |= 1 << (q - s);
    }
    d[i * 4] = zm;
    d[i * 4 + 2] = p.district[i];
    d[i * 4 + 3] = wm;
    this.dirtyMask = true;
  }

  /** Water status changed everywhere (sea level). */
  refreshWater(): void {
    const n = this.planet.count;
    const d = this.tile.image.data as Uint8Array;
    for (let i = 0; i < n; i++) d[i * 4 + 2] = (d[i * 4 + 2] & ~4) | (this.planet.isWater(i) ? 4 : 0);
    for (let i = 0; i < n; i++) this.writeMask(i);
    this.dirtyTile = true;
  }

  /** Rebuild the district colour palette if the districts changed (cheap signature check). */
  refreshPalette(force = false): void {
    const ds = this.planet.districts;
    let sig = String(ds.length);
    for (const dd of ds) sig += dd ? ',' + dd.color : ',x';
    if (!force && sig === this.distSig) return;
    this.distSig = sig;
    const pd = this.distPal.image.data as Uint8Array;
    pd.fill(0);
    for (let k = 1; k < Math.min(256, ds.length); k++) {
      const c = ds[k]?.color ?? 0xffffff;
      pd[k * 4] = (c >> 16) & 255;
      pd[k * 4 + 1] = (c >> 8) & 255;
      pd[k * 4 + 2] = c & 255;
      pd[k * 4 + 3] = 255;
    }
    this.dirtyPal = true;
  }

  // ───────────────────────────────────────── TileOverlay

  showValues(values: ArrayLike<number> | null, ramp: ColorRamp = 'heat', opacity = 0.85): void {
    if (!values) {
      this.hideOverlay();
      return;
    }
    this.buildLut(ramp);
    const d = this.overlay.image.data as Uint8Array;
    const n = Math.min(values.length, this.planet.count);
    const lut = this.lut;
    for (let i = 0; i < n; i++) {
      const v = values[i];
      // NaN / negative / missing = no data → transparent
      if (!(v >= 0)) {
        d[i * 4 + 3] = 0;
        continue;
      }
      const k = Math.max(0, Math.min(255, Math.round(v * 255)));
      d[i * 4] = lut[k * 3];
      d[i * 4 + 1] = lut[k * 3 + 1];
      d[i * 4 + 2] = lut[k * 3 + 2];
      d[i * 4 + 3] = 255;
    }
    for (let i = n; i < this.planet.count; i++) d[i * 4 + 3] = 0;
    this.overlayTarget = Math.max(0, Math.min(1, opacity));
    this.overlayShown = true;
    this.dirtyOverlay = true;
  }

  showColors(colors: ArrayLike<number> | null, opacity = 0.85): void {
    if (!colors) {
      this.hideOverlay();
      return;
    }
    const d = this.overlay.image.data as Uint8Array;
    const n = Math.min(colors.length, this.planet.count);
    for (let i = 0; i < n; i++) {
      const c = colors[i];
      if (!(c >= 0)) {
        d[i * 4 + 3] = 0;
        continue;
      }
      d[i * 4] = (c >> 16) & 255;
      d[i * 4 + 1] = (c >> 8) & 255;
      d[i * 4 + 2] = c & 255;
      d[i * 4 + 3] = 255;
    }
    for (let i = n; i < this.planet.count; i++) d[i * 4 + 3] = 0;
    this.overlayTarget = Math.max(0, Math.min(1, opacity));
    this.overlayShown = true;
    this.dirtyOverlay = true;
  }

  setHighlight(channel: string, tiles: number[] | null, color = 0x4ff0ff, opacity = 0.55): void {
    if (!tiles || tiles.length === 0) {
      if (!this.channels.has(channel)) return;
      this.channels.delete(channel);
    } else {
      this.channels.delete(channel); // re-insert → latest channel draws on top
      this.channels.set(channel, { tiles: tiles.slice(), color, opacity });
    }
    this.composeHighlights();
  }

  clear(): void {
    this.hideOverlay();
    if (this.channels.size) {
      this.channels.clear();
      this.composeHighlights();
    }
  }

  get overlayVisible(): boolean {
    return this.overlayShown;
  }

  private hideOverlay(): void {
    this.overlayTarget = 0;
    this.overlayShown = false;
  }

  private composeHighlights(): void {
    const d = this.high.image.data as Uint8Array;
    const md = this.mask.image.data as Uint8Array;
    const g = this.planet.grid;
    const n = this.planet.count;
    for (const t of this.highTiles) {
      d[t * 4 + 3] = 0;
      md[t * 4 + 1] = 0;
    }
    const owner = new Map<number, number>();
    let ci = 0;
    for (const ch of this.channels.values()) {
      ci++;
      const a = Math.round(Math.max(0, Math.min(1, ch.opacity)) * 255);
      for (const t of ch.tiles) {
        if (t < 0 || t >= n) continue;
        d[t * 4] = (ch.color >> 16) & 255;
        d[t * 4 + 1] = (ch.color >> 8) & 255;
        d[t * 4 + 2] = ch.color & 255;
        d[t * 4 + 3] = Math.max(1, a);
        owner.set(t, ci);
      }
    }
    for (const [t, c] of owner) {
      let m = 0;
      const s = g.start[t], e = g.start[t + 1];
      for (let q = s; q < e; q++) if (owner.get(g.nbr[q]) !== c) m |= 1 << (q - s);
      md[t * 4 + 1] = m;
    }
    this.highTiles = [...owner.keys()];
    this.dirtyHigh = true;
    this.dirtyMask = true;
  }

  private buildLut(ramp: ColorRamp): void {
    if (ramp === this.lutKey && typeof ramp !== 'function') return;
    this.lutKey = ramp;
    const lut = this.lut;
    if (typeof ramp === 'function') {
      for (let k = 0; k < 256; k++) {
        let c = 0xffffff;
        try {
          c = ramp(k / 255) | 0;
        } catch {
          /* bad ramp → white */
        }
        lut[k * 3] = (c >> 16) & 255;
        lut[k * 3 + 1] = (c >> 8) & 255;
        lut[k * 3 + 2] = c & 255;
      }
      return;
    }
    const stops = RAMP_STOPS[ramp] ?? RAMP_STOPS.heat;
    for (let k = 0; k < 256; k++) {
      const x = (k / 255) * (stops.length - 1);
      const i0 = Math.min(stops.length - 2, Math.floor(x));
      const f = x - i0;
      const a = stops[i0], b = stops[i0 + 1];
      for (let ch = 0; ch < 3; ch++) {
        const sh = 16 - ch * 8;
        lut[k * 3 + ch] = Math.round(((a >> sh) & 255) * (1 - f) + ((b >> sh) & 255) * f);
      }
    }
  }

  /** Upload whatever changed (once per frame). */
  flush(): void {
    if (this.dirtyTile) this.tile.needsUpdate = true;
    if (this.dirtyMask) this.mask.needsUpdate = true;
    if (this.dirtyOverlay) this.overlay.needsUpdate = true;
    if (this.dirtyHigh) this.high.needsUpdate = true;
    if (this.dirtyPal) this.distPal.needsUpdate = true;
    this.dirtyTile = this.dirtyMask = this.dirtyOverlay = this.dirtyHigh = this.dirtyPal = false;
  }

  dispose(): void {
    this.tile.dispose();
    this.mask.dispose();
    this.overlay.dispose();
    this.high.dispose();
    this.distPal.dispose();
    this.channels.clear();
  }
}
