/**
 * OWNER: ui-panels.
 * Map labels overlay ('labels') — floating name tags for districts (at each district's centroid tile, shown from
 * neighbourhood to orbital zoom) and for landmarks, wonders, unique and player-named buildings (shown up close).
 * One imperative DOM layer: positions are projected from game.planetView.camera in a single rAF pass and written as
 * transforms only when they move ≥ 0.5 px; no Preact re-render per frame, no per-frame allocations. Labels on the far
 * side of the planet or outside their zoom band fade out; landmark tags that would overlap a nearer one hide.
 * Rebuilt (debounced) when districts / buildings change. Honours settings.labels; hidden with the rest of the chrome,
 * shown in photo mode only when the photo "Labels" toggle is on. Tap a district → districts panel; a landmark →
 * select it.
 */
import { useEffect, useRef } from 'preact/hooks';
import { Matrix4, Vector3 } from 'three';
import { getItem } from '../../content/catalog';
import { bus } from '../../core/events';
import { settings } from '../../core/settings';
import { game } from '../../game/instance';
import type { Planet } from '../../world/planet';
import { tilePosition } from '../../world/geo';
import { openPanel, setSelection, uiSound } from '../core/env';
import { ui } from '../store';
import { css, flyToTile } from './common';
import { districtGeometry } from './geometry';
import { focusDistrict, photoLabels } from './state';

interface Label {
  kind: 'district' | 'landmark';
  id: number;
  tile: number;
  el: HTMLButtonElement;
  pos: Vector3;
  normal: Vector3;
  x: number;
  y: number;
  shown: boolean;
  priority: number;
}

const _v = new Vector3();
const _c = new Vector3();
const _m = new Matrix4();

class LabelLayer {
  private items: Label[] = [];
  private raf = 0;
  private rebuildTimer: ReturnType<typeof setTimeout> | undefined;
  private offs: (() => void)[] = [];
  private lastCam = new Vector3(Infinity, 0, 0);
  private lastW = 0;
  private lastH = 0;
  private dirty = true;
  private planet: Planet | null = null;

  constructor(private root: HTMLElement) {
    const later = () => this.scheduleRebuild();
    this.offs.push(
      bus.on('tiles:district', later),
      bus.on('building:added', later),
      bus.on('building:removed', later),
      bus.on('building:updated', (e) => e.what === 'name' && later()),
      bus.on('planet:loaded', later),
    );
    this.rebuild();
    this.raf = requestAnimationFrame(this.frame);
  }

  private scheduleRebuild(): void {
    clearTimeout(this.rebuildTimer);
    this.rebuildTimer = setTimeout(() => this.rebuild(), 400);
  }

  private clear(): void {
    for (const it of this.items) it.el.remove();
    this.items = [];
  }

  rebuild(): void {
    this.clear();
    const p = game?.planet;
    const view = game?.planetView;
    this.planet = p ?? null;
    if (!p || !view) return;
    view.root.updateMatrixWorld();
    _m.copy(view.root.matrixWorld);
    // districts
    try {
      const geo = districtGeometry(p);
      for (const d of p.districts) {
        if (!d || !d.id) continue;
        const g = geo.get(d.id);
        if (!g || g.centre < 0) continue;
        const el = this.make('district', d.name, css(d.color), Math.min(1, g.tiles / 40));
        el.addEventListener('click', () => {
          uiSound('tap');
          focusDistrict.value = d.id;
          openPanel('districts');
        });
        this.add('district', d.id, g.centre, el, 1.4, 10 + g.tiles);
      }
    } catch (e) {
      console.warn('[labels] district labels skipped', e);
    }
    // landmarks, wonders, unique & named buildings
    let n = 0;
    for (const b of p.buildings.values()) {
      const def = getItem(b.defId);
      if (!def) continue;
      const special = def.category === 'landmarks' || !!def.unique || !!b.name;
      if (!special || def.placement === 'orbit') continue;
      const name = b.name || def.name;
      const el = this.make('landmark', name, '', 0, def.icon);
      el.addEventListener('click', () => {
        uiSound('tap');
        setSelection({ kind: 'building', id: b.id });
        flyToTile(b.tile, { distance: 16, keepPanel: true });
      });
      this.add('landmark', b.id, b.tile, el, (def.height ?? 2) + 0.6, (def.unique ? 30 : 10) + (def.height ?? 1));
      if (++n >= 48) break;
    }
    this.items.sort((a, b) => b.priority - a.priority);
    this.dirty = true;
  }

  private make(kind: 'district' | 'landmark', text: string, color: string, size: number, icon?: string): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'lb-label lb-' + kind;
    el.tabIndex = -1;
    if (kind === 'district') {
      el.style.setProperty('--lc', color);
      el.style.setProperty('--ls', String(0.92 + size * 0.22));
      const dot = document.createElement('i');
      el.appendChild(dot);
    } else if (icon && !/^[a-z]/i.test(icon)) {
      const s = document.createElement('span');
      s.className = 'lb-icon';
      s.textContent = icon;
      el.appendChild(s);
    }
    const t = document.createElement('span');
    t.className = 'lb-text';
    t.textContent = text;
    el.appendChild(t);
    el.setAttribute('aria-label', text);
    this.root.appendChild(el);
    return el;
  }

  private add(kind: 'district' | 'landmark', id: number, tile: number, el: HTMLButtonElement, lift: number, priority: number): void {
    const p = this.planet!;
    const pos = tilePosition(p, tile, new Vector3(), lift).applyMatrix4(_m);
    const normal = pos.clone().normalize();
    this.items.push({ kind, id, tile, el, pos, normal, x: -1e4, y: -1e4, shown: false, priority });
  }

  private frame = (): void => {
    this.raf = requestAnimationFrame(this.frame);
    try {
      this.update();
    } catch (e) {
      console.error('[labels] frame failed', e);
      cancelAnimationFrame(this.raf);
    }
  };

  private update(): void {
    const view = game?.planetView;
    if (!view || game.planet !== this.planet) {
      if (this.items.length) this.clear();
      if (view && game.planet && game.planet !== this.planet) this.rebuild();
      return;
    }
    const camera = view.camera;
    const w = this.root.clientWidth, h = this.root.clientHeight;
    const moved = camera.position.distanceToSquared(this.lastCam) > 1e-6 || w !== this.lastW || h !== this.lastH;
    if (!moved && !this.dirty) return;
    this.lastCam.copy(camera.position);
    this.lastW = w;
    this.lastH = h;
    this.dirty = false;
    const R = view.planet.radius;
    const camDist = camera.position.length() - R;
    // occupied boxes for landmark declutter (reuse array storage)
    let placed = 0;
    const boxes = this.boxes;
    for (const it of this.items) {
      let show = false;
      // facing the camera?
      _c.copy(camera.position).sub(it.pos);
      const d = _c.length();
      const facing = _c.dot(it.normal) / Math.max(1e-6, d);
      if (facing > 0.08) {
        if (it.kind === 'district') show = camDist > 14 && camDist < R * 2.6;
        else show = d < 110;
      }
      if (show) {
        _v.copy(it.pos).project(camera);
        if (_v.z > 1 || _v.x < -1.15 || _v.x > 1.15 || _v.y < -1.15 || _v.y > 1.15) show = false;
        else {
          const x = (_v.x * 0.5 + 0.5) * w;
          const y = (-_v.y * 0.5 + 0.5) * h;
          if (it.kind === 'landmark') {
            for (let k = 0; k < placed; k++) {
              if (Math.abs(boxes[k * 2] - x) < 70 && Math.abs(boxes[k * 2 + 1] - y) < 22) {
                show = false;
                break;
              }
            }
          }
          if (show) {
            if (placed < 64) {
              boxes[placed * 2] = x;
              boxes[placed * 2 + 1] = y;
              placed++;
            }
            if (Math.abs(x - it.x) >= 0.5 || Math.abs(y - it.y) >= 0.5) {
              it.x = x;
              it.y = y;
              it.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
            }
          }
        }
      }
      if (show !== it.shown) {
        it.shown = show;
        it.el.classList.toggle('is-shown', show);
      }
    }
  }

  private boxes = new Float32Array(128);

  dispose(): void {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.rebuildTimer);
    for (const o of this.offs) o();
    this.offs = [];
    this.clear();
  }
}

export function Labels() {
  const ref = useRef<HTMLDivElement>(null);
  const photo = ui.photo.value;
  const visible =
    settings.value.labels && ui.screen.value === 'game' && ui.view.value === 'planet' && (photo ? photoLabels.value : !ui.chromeHidden.value);
  useEffect(() => {
    if (!visible || !ref.current) return;
    let layer: LabelLayer | null = null;
    try {
      layer = new LabelLayer(ref.current);
    } catch (e) {
      console.error('[labels] init failed', e);
    }
    return () => layer?.dispose();
  }, [visible, ui.planetId.value]);
  const passive = !!ui.tool.value || photo;
  return <div ref={ref} class={'lb-root' + (visible ? '' : ' is-hidden') + (passive ? ' is-passive' : '')} />;
}
