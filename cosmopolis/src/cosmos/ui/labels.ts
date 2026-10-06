/**
 * OWNER: cosmos.
 * DomLabels — the LabelSink used by the cosmos views: absolutely-positioned, tappable name tags that follow bodies.
 * Positions are written straight to `style.transform` (only when they move ≥ 0.5 px) so following 20 labels costs
 * nothing per frame and never re-renders Preact. Tap = select, second tap within 380 ms = enter / activate.
 */
import type { BodyLabel, LabelSink } from '../render/CosmosView';

const ICON: Record<string, string> = {
  current: '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="currentColor"/><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  locked: '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
};

interface Item {
  el: HTMLButtonElement;
  x: number;
  y: number;
  vis: boolean;
  fade: number;
  id: string;
}

export class DomLabels implements LabelSink {
  private items: Item[] = [];
  private selected: string | null = null;

  constructor(
    private root: HTMLElement,
    private onTap: (id: string) => void,
  ) {}

  setLabels(labels: BodyLabel[], selected: string | null): void {
    this.root.textContent = '';
    this.items = labels.map((l) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `cx-label is-${l.state} kind-${l.kind}`;
      el.setAttribute('aria-label', `${l.name}${l.sub ? ', ' + l.sub : ''}`);
      const dot = l.state === 'current' ? ICON.current : l.state === 'locked' ? ICON.locked : '<i class="cx-label-dot"></i>';
      el.innerHTML = `<span class="cx-label-pill">${dot}<span class="cx-label-name"></span></span>${l.sub ? '<span class="cx-label-sub"></span>' : ''}`;
      (el.querySelector('.cx-label-name') as HTMLElement).textContent = l.name;
      if (l.sub) (el.querySelector('.cx-label-sub') as HTMLElement).textContent = l.sub;
      el.style.opacity = '0';
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.onTap(l.id);
      });
      this.root.appendChild(el);
      return { el, x: -1e4, y: -1e4, vis: false, fade: 0, id: l.id };
    });
    this.setSelected(selected);
  }

  place(i: number, x: number, y: number, visible: boolean, fade: number): void {
    const it = this.items[i];
    if (!it) return;
    const f = visible ? fade : 0;
    if (Math.abs(it.fade - f) > 0.02 || (f === 0) !== (it.fade === 0)) {
      it.fade = f;
      it.el.style.opacity = f.toFixed(2);
      it.el.style.pointerEvents = f > 0.3 ? 'auto' : 'none';
      it.el.style.visibility = f <= 0.01 ? 'hidden' : 'visible';
    }
    if (f <= 0.01) return;
    if (Math.abs(it.x - x) >= 0.5 || Math.abs(it.y - y) >= 0.5) {
      it.x = x;
      it.y = y;
      it.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, 0)`;
    }
  }

  setSelected(id: string | null): void {
    this.selected = id;
    for (const it of this.items) it.el.classList.toggle('is-selected', it.id === id);
  }

  dispose(): void {
    this.root.textContent = '';
    this.items = [];
  }
}
