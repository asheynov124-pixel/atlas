/**
 * OWNER: life.
 * Beacons — aviation obstruction lights: a slow red blink on the crown of every very tall building (roof > 8 units,
 * with a second light halfway up the true giants) and a steady soft red glow on mid-rise roofs at night.
 * Each building gets its own blink phase so the skyline twinkles instead of pulsing in unison.
 */
import { Vector3 } from 'three';
import { hf } from './common';
import type { LifeCtx } from './ctx';
import type { Sites } from './sites';

interface Beacon {
  x: number;
  y: number;
  z: number;
  size: number;
  blink: boolean;
  phase: number;
}

const _p = new Vector3();

export class Beacons {
  private list: Beacon[] = [];
  private version = -1;
  count = 0;

  constructor(private sites: Sites) {}

  update(_ctx: LifeCtx, _dt: number): void {
    this.sites.refresh();
    if (this.version === this.sites.version) return;
    this.version = this.sites.version;
    this.list = [];
    for (const s of this.sites.all) {
      if (s.top < 5) continue;
      if (s.tags.includes('elevator')) continue; // the tether has its own beacon bands
      const tall = s.top > 8;
      _p.copy(s.pos).addScaledVector(s.up, s.top + 0.06);
      this.list.push({ x: _p.x, y: _p.y, z: _p.z, size: tall ? 0.16 : 0.09, blink: tall, phase: hf(s.id, 5) });
      if (s.top > 18) {
        _p.copy(s.pos).addScaledVector(s.up, s.top * 0.55).addScaledVector(s.fwd, s.radius * 0.55);
        this.list.push({ x: _p.x, y: _p.y, z: _p.z, size: 0.12, blink: true, phase: hf(s.id, 9) });
      }
    }
    this.count = this.list.length;
  }

  render(ctx: LifeCtx): void {
    const cull = ctx.cull;
    if (cull.altitude > 140) return;
    const sp = ctx.sprites;
    for (const b of this.list) {
      if (!cull.visible(b.x, b.y, b.z, 0.2, 160)) continue;
      if (b.blink) sp.push(b.x, b.y, b.z, b.size, 2.6, 0.12, 0.08, 0.55, 0.75, b.phase, 0.22);
      else sp.push(b.x, b.y, b.z, b.size, 1.4, 0.08, 0.06, 1);
    }
  }

  dispose(): void {
    this.list.length = 0;
  }
}
