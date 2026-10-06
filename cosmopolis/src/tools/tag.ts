/**
 * OWNER: tools.
 * ToolTag — a small glass pill that floats over a world point (road length & price at the cursor, terraform
 * level, lots zoned, refunds…). Plain DOM positioned with a transform once per frame (no layout reads), hidden
 * when the point is behind the planet, off-screen, or the chrome is hidden. Styles in tools.css.
 */
import { Vector3, type PerspectiveCamera } from 'three';
import { ui } from '../ui/store';
import './tools.css';

export type TagTone = 'info' | 'ok' | 'bad' | 'warn' | 'god';

const _v = new Vector3();
const _d = new Vector3();

export class ToolTag {
  private el: HTMLDivElement | null = null;
  private main: HTMLSpanElement | null = null;
  private sub: HTMLSpanElement | null = null;
  private world = new Vector3();
  private text = '';
  private subText = '';
  private tone: TagTone = 'info';
  private want = false;
  private shown = false;
  private lastX = -1;
  private lastY = -1;

  private ensure(): HTMLDivElement | null {
    if (this.el) return this.el;
    if (typeof document === 'undefined') return null;
    const el = document.createElement('div');
    el.className = 'ct-tag';
    el.setAttribute('aria-hidden', 'true');
    this.main = document.createElement('span');
    this.main.className = 'ct-tag-main';
    this.sub = document.createElement('span');
    this.sub.className = 'ct-tag-sub';
    el.append(this.main, this.sub);
    document.body.appendChild(el);
    this.el = el;
    return el;
  }

  set(world: Vector3, text: string, tone: TagTone = 'info', sub = ''): void {
    const el = this.ensure();
    if (!el) return;
    this.world.copy(world);
    this.want = true;
    if (text !== this.text) {
      this.text = text;
      this.main!.textContent = text;
    }
    if (sub !== this.subText) {
      this.subText = sub;
      this.sub!.textContent = sub;
      this.sub!.style.display = sub ? '' : 'none';
    }
    if (tone !== this.tone) {
      el.classList.remove('is-' + this.tone);
      this.tone = tone;
      el.classList.add('is-' + tone);
    }
  }

  hide(): void {
    this.want = false;
  }

  update(camera: PerspectiveCamera, width: number, height: number): void {
    const el = this.el;
    if (!el) return;
    let visible = this.want && !ui.chromeHidden.value && !ui.photo.value;
    let x = 0, y = 0;
    if (visible) {
      _d.copy(this.world).sub(camera.position);
      // behind the planet's limb?
      if (_v.copy(this.world).normalize().dot(_d) > 0.25 * _d.length()) visible = false;
      _v.copy(this.world).project(camera);
      if (_v.z > 1 || _v.x < -1.1 || _v.x > 1.1 || _v.y < -1.1 || _v.y > 1.1) visible = false;
      x = Math.round(((_v.x + 1) / 2) * width);
      y = Math.round(((1 - _v.y) / 2) * height);
    }
    if (visible && (x !== this.lastX || y !== this.lastY)) {
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      this.lastX = x;
      this.lastY = y;
    }
    if (visible !== this.shown) {
      this.shown = visible;
      el.classList.toggle('is-on', visible);
    }
  }

  dispose(): void {
    this.el?.remove();
    this.el = null;
  }
}
