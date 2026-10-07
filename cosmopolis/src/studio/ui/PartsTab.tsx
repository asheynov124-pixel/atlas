/**
 * OWNER: studio.
 * Parts tab — lot size, the layer list (top of the building first; tap to select, tap again to edit, drag the
 * grip to reorder) and the add-part grid (43 parts in five families).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { game } from '../../game/instance';
import { Chip, Icon, SectionHeader, Segmented, uiSound } from '../../ui/core';
import { MATERIALS, type DesignSpec, type Footprint, type PartSpec } from '../model';
import { FAMILIES, PART_DEFS, PART_LIST } from '../parts';
import { studioUi } from '../state';
import { fmtMetres, Glyph, PartBadge } from './common';

const FP_OPTIONS: { value: Footprint; label: string; title: string }[] = [
  { value: 1, label: '1 tile', title: 'Small lot — 1 tile' },
  { value: 7, label: '7 tiles', title: 'Medium lot — 7 tiles' },
  { value: 19, label: '19 tiles', title: 'Large lot — 19 tiles' },
];

function subtitle(p: PartSpec): string {
  const mat = MATERIALS.find((m) => m.id === p.m)?.label ?? '';
  const def = PART_DEFS[p.t];
  const size = def.params.some((q) => q.key === 'h' && q.label === 'Height') ? fmtMetres(p.h) + ' tall' : fmtMetres(p.w) + ' wide';
  return `${size} · ${mat}${p.stack ? '' : ' · free'}`;
}

export function PartsTab({ draft }: { draft: DesignSpec }) {
  const st = game.studio;
  const sel = studioUi.selected.value;
  const n = draft.parts.length;
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number } | null>(null);
  const dragRef = useRef<{ id: number; y0: number; row: number; h: number; from: number } | null>(null);
  const fam = studioUi.family.value;

  // scroll the picked part into view when the user taps it on the stage
  useEffect(() => {
    if (sel < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-part="${sel}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [studioUi.pickTick.value]);

  const onGripDown = (e: PointerEvent, row: number) => {
    e.preventDefault();
    e.stopPropagation();
    const el = (e.currentTarget as HTMLElement).closest('.st-layer') as HTMLElement | null;
    const h = el?.offsetHeight ?? 56;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = { id: e.pointerId, y0: e.clientY, row, h: h + 6, from: n - 1 - row };
    setDrag({ from: row, to: row, dy: 0 });
    uiSound('tap', 0.5);
  };
  const onGripMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y0;
    const to = Math.max(0, Math.min(n - 1, d.row + Math.round(dy / d.h)));
    setDrag({ from: d.row, to, dy });
  };
  const onGripUp = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    const dy = e.clientY - d.y0;
    const toRow = Math.max(0, Math.min(n - 1, d.row + Math.round(dy / d.h)));
    setDrag(null);
    if (toRow !== d.row) st.reorder(n - 1 - d.row, n - 1 - toRow);
  };

  const rows = draft.parts.map((p, i) => ({ p, i })).reverse();
  const shown = PART_LIST.filter((d) => fam === 'all' || d.family === fam);

  return (
    <div class="st-tab st-parts">
      <div class="st-lot">
        <span class="st-lot-label">
          <Icon name="zones" size={16} /> Lot
        </span>
        <Segmented size="sm" options={FP_OPTIONS} value={draft.footprint} onChange={(v) => st.setFootprint(v)} ariaLabel="Lot size" />
      </div>

      <SectionHeader title="Layers" subtitle="Top of the building first · drag ≡ to reorder" action={<span class="st-count num">{n}</span>} />
      <div class="st-layers" ref={listRef} role="listbox" aria-label="Parts">
        {rows.length === 0 && <div class="st-empty-layers">An empty lot — add a part below.</div>}
        {rows.map(({ p, i }, row) => {
          const def = PART_DEFS[p.t];
          const active = i === sel;
          let shift = 0;
          if (drag) {
            if (row === drag.from) shift = drag.dy;
            else if (drag.from < drag.to && row > drag.from && row <= drag.to) shift = -1;
            else if (drag.from > drag.to && row < drag.from && row >= drag.to) shift = 1;
          }
          const style = drag ? { transform: row === drag.from ? `translate3d(0, ${shift}px, 0) scale(1.02)` : `translate3d(0, ${shift * 62}px, 0)` } : undefined;
          return (
            <div
              key={i + ':' + p.t}
              data-part={i}
              class={'st-layer' + (active ? ' is-active' : '') + (drag && row === drag.from ? ' is-dragging' : '')}
              style={style}
              role="option"
              aria-selected={active}
            >
              <span
                class="st-grip"
                role="button"
                tabIndex={-1}
                aria-label={`Reorder ${def.label}`}
                onPointerDown={(e) => onGripDown(e as unknown as PointerEvent, row)}
                onPointerMove={(e) => onGripMove(e as unknown as PointerEvent)}
                onPointerUp={(e) => onGripUp(e as unknown as PointerEvent)}
                onPointerCancel={(e) => onGripUp(e as unknown as PointerEvent)}
              >
                <Icon name="menu" size={18} />
              </span>
              <button
                type="button"
                class="st-layer-main"
                onClick={() => {
                  uiSound('tap');
                  if (active) studioUi.tab.value = 'edit';
                  else st.select(i);
                }}
              >
                <PartBadge def={def} part={p} size={36} />
                <span class="st-layer-text">
                  <span class="st-layer-name">{def.label}</span>
                  <span class="st-layer-sub">{subtitle(p)}</span>
                </span>
              </button>
              <button
                type="button"
                class="st-layer-edit"
                aria-label={`Edit ${def.label}`}
                onClick={() => {
                  uiSound('tap');
                  st.select(i);
                  studioUi.tab.value = 'edit';
                }}
              >
                <Icon name="sliders" size={18} />
              </button>
            </div>
          );
        })}
      </div>

      <SectionHeader title="Add a part" subtitle="New parts go above the selected one" />
      <div class="st-fams scroll-x" role="tablist" aria-label="Part families">
        <Chip size="sm" selected={fam === 'all'} onClick={() => (studioUi.family.value = 'all')}>
          All {PART_LIST.length}
        </Chip>
        {FAMILIES.map((f) => (
          <Chip key={f.id} size="sm" icon={f.icon} selected={fam === f.id} onClick={() => (studioUi.family.value = f.id)}>
            {f.label}
          </Chip>
        ))}
      </div>
      <div class="st-addgrid">
        {shown.map((d) => (
          <button key={d.t} type="button" class="st-add" title={d.blurb} onClick={() => st.addPart(d.t)}>
            <span class="st-add-glyph">
              <Glyph svg={d.glyph} size={28} />
            </span>
            <span class="st-add-label">{d.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
