/**
 * OWNER: studio.
 * StudioOverlay — the Architect Studio screen, shown while game.studio is open (view 'studio'):
 *   top bar      Cancel · name · undo / redo · Save
 *   stage        the 3D preview area (gestures: drag = orbit, pinch / wheel = zoom, two-finger or right-drag = pan
 *                up/down, tap = select part, double-tap = reset view) + height / detail chips + day/night & reset
 *   panel        tabs Parts / Edit / Templates / Save — bottom sheet with two heights on portrait phones, a side
 *                column on landscape phones, a floating card on tablets & desktop
 * Reports the stage rectangle to the StudioView so the model is centred in the visible area. Desktop shortcuts:
 * ⌘/Ctrl+Z undo · ⇧⌘Z / Ctrl+Y redo · ⌘/Ctrl+S save · Del remove part · D duplicate · N night · R reset view ·
 * [ ] previous / next part · Esc leave.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { game } from '../../game/instance';
import { ui } from '../../ui/store';
import { Button, Icon, IconButton, Segmented, useLayer, viewport, uiSound } from '../../ui/core';
import { TRI_BUDGET } from '../builder';
import { studioUi, type StudioTab } from '../state';
import { EditTab } from './EditTab';
import { PartsTab } from './PartsTab';
import { SaveTab } from './SaveTab';
import { TemplatesTab } from './TemplatesTab';
import { fmtFloors, fmtMetres } from './common';

const TABS: { value: StudioTab; label: string; icon: string }[] = [
  { value: 'parts', label: 'Parts', icon: 'layers' },
  { value: 'edit', label: 'Edit', icon: 'sliders' },
  { value: 'templates', label: 'Templates', icon: 'grid' },
  { value: 'save', label: 'Save', icon: 'save' },
];

function doSave(): void {
  const r = game.studio.save();
  if (!r.ok) {
    uiSound('error');
    studioUi.tab.value = 'save';
    import('../../ui/store').then(({ notify }) => notify({ title: 'Can’t save yet', body: r.reason, kind: 'warn', icon: 'custom' }));
  }
}

// ───────────────────────────────────────────── stage gestures

function Stage() {
  const ref = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setHint(false), 5200);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pts = new Map<number, { x: number; y: number; b: number; type: string }>();
    let start = { x: 0, y: 0, t: 0 };
    let moved = false;
    let pinch = 0;
    let midY = 0;
    let lastTap = { t: 0, x: 0, y: 0 };
    const view = () => game.studio.view;
    const two = () => {
      const [a, b] = [...pts.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y), my: (a.y + b.y) / 2 };
    };
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, type: e.pointerType });
      if (pts.size === 1) {
        start = { x: e.clientX, y: e.clientY, t: performance.now() };
        moved = false;
      } else if (pts.size === 2) {
        const t = two();
        pinch = t.d;
        midY = t.my;
        moved = true;
      }
      setHint(false);
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      const v = view();
      if (!v) return;
      if (pts.size === 1) {
        if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) > (p.type === 'mouse' ? 3 : 8)) moved = true;
        if (!moved) return;
        if (p.b === 2 || p.b === 1 || e.shiftKey) v.panBy(dy);
        else v.rotate(dx, dy);
      } else if (pts.size === 2) {
        const t = two();
        if (pinch > 0 && t.d > 0) v.zoomBy(pinch / t.d);
        v.panBy(t.my - midY);
        pinch = t.d;
        midY = t.my;
      }
    };
    const up = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size === 0) {
        const now = performance.now();
        if (!moved && now - start.t < 400) {
          const dbl = now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30;
          if (dbl) {
            view()?.resetView();
            uiSound('whoosh', 0.5);
            lastTap = { t: 0, x: 0, y: 0 };
          } else {
            game.studio.pickAt(e.clientX, e.clientY);
            lastTap = { t: now, x: e.clientX, y: e.clientY };
          }
        }
        pinch = 0;
      } else if (pts.size === 1) {
        pinch = 0;
        moved = true;
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const k = e.ctrlKey ? 0.012 : 0.0018;
      view()?.zoomBy(Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * k))));
    };
    const ctx = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('contextmenu', ctx);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('contextmenu', ctx);
    };
  }, []);

  // report the stage rectangle (centres the model in the visible area)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      game.studio.view?.setStage({ x: r.left, y: r.top, w: r.width, h: r.height });
    };
    report();
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(report);
      ro.observe(el);
    } catch {
      /* old browsers: window resize below */
    }
    window.addEventListener('resize', report);
    const t = setInterval(report, 600);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', report);
      clearInterval(t);
    };
  }, []);

  const tris = studioUi.triangles.value;
  const h = studioUi.height.value;
  const night = studioUi.night.value;
  const frac = Math.min(1, tris / TRI_BUDGET);
  return (
    <div class="st-stage pe" ref={ref} aria-label="3D preview — drag to orbit, pinch to zoom, tap a part to select it">
      <div class="st-chips">
        <span class="st-chip num" title="Height">
          <Icon name="building" size={14} /> {fmtMetres(h)} · {fmtFloors(h)}
        </span>
        <span class={'st-chip st-tri num' + (frac > 1 - 1e-9 && tris > TRI_BUDGET ? ' is-over' : frac > 0.85 ? ' is-warn' : '')} title="Detail budget (triangles)">
          <span class="st-tri-bar" style={{ transform: `scaleX(${frac})` }} />
          <span class="st-tri-text">
            {tris.toLocaleString()} / {(TRI_BUDGET / 1000).toFixed(0)}k
          </span>
        </span>
      </div>
      <div class="st-stage-tools">
        <IconButton icon={night ? 'sun' : 'moon'} label={night ? 'Daylight preview' : 'Night preview'} active={night} onClick={() => game.studio.setNight(!night)} kbd="N" />
        <IconButton icon="locate" label="Reset view" onClick={() => game.studio.view?.resetView()} kbd="R" />
      </div>
      {hint && (
        <div class="st-hint" aria-hidden="true">
          <Icon name="rotate" size={16} /> Drag to orbit · pinch to zoom · tap a part
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────── top bar

function TopBar() {
  const d = studioUi.draft.value;
  const dirty = studioUi.dirty.value;
  const st = game.studio;
  return (
    <header class="st-top pe">
      <IconButton icon="close" label={dirty ? 'Cancel (discard changes)' : 'Close studio'} onClick={() => st.close()} kbd="Esc" />
      <label class="st-name">
        <span class="st-name-icon" aria-hidden="true">
          {d?.icon ?? '🏗️'}
        </span>
        <input
          class="st-name-input"
          value={d?.name ?? ''}
          maxLength={40}
          placeholder="Name your building"
          aria-label="Design name"
          onInput={(e) => st.setMeta({ name: (e.currentTarget as HTMLInputElement).value })}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          }}
          autoComplete="off"
          spellcheck={false}
        />
        {dirty && <span class="st-dirty" title="Unsaved changes" />}
      </label>
      <IconButton icon="undo" label="Undo" size="sm" variant="ghost" disabled={!studioUi.canUndo.value} onClick={() => st.undo()} kbd="⌘Z" />
      <IconButton icon="redo" label="Redo" size="sm" variant="ghost" disabled={!studioUi.canRedo.value} onClick={() => st.redo()} kbd="⇧⌘Z" />
      <Button variant="primary" icon="save" onClick={doSave} class="st-savebtn" sound={false}>
        Save
      </Button>
    </header>
  );
}

// ───────────────────────────────────────────── panel

function SavedBanner() {
  const s = studioUi.saved.value;
  if (!s) return null;
  return (
    <div class="st-saved" role="status">
      <span class="st-saved-icon">
        <Icon name="check" size={18} />
      </span>
      <span class="st-saved-text">
        <b>{s.fresh ? 'Saved!' : 'Updated!'}</b> {s.name} is in Build › My Designs.
      </span>
      <Button size="sm" variant="primary" icon="build" onClick={() => game.studio.placeDesign(s.id)}>
        Place it
      </Button>
      <IconButton icon="close" label="Dismiss" size="sm" variant="ghost" onClick={() => (studioUi.saved.value = null)} />
    </div>
  );
}

function Panel({ mode }: { mode: 'bottom' | 'side' | 'float' }) {
  const draft = studioUi.draft.value;
  const tab = studioUi.tab.value;
  const [tall, setTall] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [tab]);
  if (!draft) return null;
  const sel = studioUi.selected.value;
  const tabs = TABS.map((t) => (t.value === 'edit' && sel >= 0 ? { ...t, label: 'Edit' } : t));
  return (
    <section class={`st-panel glass-strong pe st-${mode}` + (tall ? ' is-tall' : '')} aria-label="Studio editor">
      {mode === 'bottom' && (
        <button type="button" class="st-grip-bar" aria-label={tall ? 'Lower the panel' : 'Raise the panel'} onClick={() => (uiSound('tap'), setTall(!tall))}>
          <span />
        </button>
      )}
      <div class="st-tabs">
        <Segmented block size="sm" options={tabs} value={tab} onChange={(v) => (studioUi.tab.value = v)} ariaLabel="Studio sections" />
      </div>
      <SavedBanner />
      <div class="st-body scroll-y" ref={bodyRef}>
        {tab === 'parts' && <PartsTab draft={draft} />}
        {tab === 'edit' && <EditTab draft={draft} />}
        {tab === 'templates' && <TemplatesTab draft={draft} />}
        {tab === 'save' && <SaveTab draft={draft} onSave={doSave} />}
      </div>
    </section>
  );
}

// ───────────────────────────────────────────── keyboard

function useKeys(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const st = game.studio;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const sel = studioUi.selected.value;
      const n = studioUi.draft.value?.parts.length ?? 0;
      let handled = true;
      if (mod && k === 'z' && !e.shiftKey) st.undo();
      else if ((mod && k === 'z' && e.shiftKey) || (mod && k === 'y')) st.redo();
      else if (mod && k === 's') doSave();
      else if (mod) handled = false;
      else if ((k === 'delete' || k === 'backspace') && sel >= 0) st.removePart(sel);
      else if (k === 'd' && sel >= 0) st.duplicatePart(sel);
      else if (k === 'n') st.setNight(!studioUi.night.value);
      else if (k === 'r') st.view?.resetView();
      else if (k === ']') st.select(Math.min(n - 1, sel + 1));
      else if (k === '[') st.select(Math.max(0, sel - 1));
      else if (k === '1' || k === '2' || k === '3' || k === '4') studioUi.tab.value = TABS[Number(k) - 1].value;
      else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active]);
}

// ───────────────────────────────────────────── root

export function StudioOverlay() {
  const open = studioUi.open.value && ui.view.value === 'studio' && ui.screen.value === 'game';
  useLayer(open, () => game.studio.close());
  useKeys(open);
  if (!open) return null;
  const vp = viewport.value;
  const mode: 'bottom' | 'side' | 'float' = vp.landscapePhone ? 'side' : vp.wide ? 'float' : 'bottom';
  return (
    <div class={`st-root st-mode-${mode}`}>
      <TopBar />
      <Stage />
      <Panel mode={mode} />
    </div>
  );
}
