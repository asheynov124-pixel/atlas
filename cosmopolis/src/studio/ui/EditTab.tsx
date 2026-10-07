/**
 * OWNER: studio.
 * Edit tab — everything about the selected part: shape & size parameters, stacking and position, rotation,
 * main colour (palette + HSL), accent colour and material. Live preview while dragging; one undo step per drag.
 */
import { Button, EmptyState, IconButton, SectionHeader, Segmented, Slider, uiSound } from '../../ui/core';
import { game } from '../../game/instance';
import { footprintRadius, type DesignSpec, type PartSpec } from '../model';
import { PART_DEFS } from '../parts';
import { studioUi } from '../state';
import { ColorPicker, fmtMetres, MaterialPicker, ParamControl, PartBadge, SwatchRow } from './common';

export function EditTab({ draft }: { draft: DesignSpec }) {
  const st = game.studio;
  const i = studioUi.selected.value;
  const p = i >= 0 ? draft.parts[i] : undefined;
  if (!p) {
    return (
      <div class="st-tab st-edit">
        <EmptyState icon="select" title="Pick a part to edit" body="Tap a part on the model, or choose one below." />
        <div class="st-quickpick">
          {draft.parts
            .map((q, k) => ({ q, k }))
            .reverse()
            .map(({ q, k }) => (
              <button key={k} type="button" class="st-quick" onClick={() => (uiSound('tap'), st.select(k))}>
                <PartBadge def={PART_DEFS[q.t]} part={q} size={30} />
                <span>{PART_DEFS[q.t].label}</span>
              </button>
            ))}
        </div>
      </div>
    );
  }
  const def = PART_DEFS[p.t];
  const fpR = footprintRadius(draft.footprint);
  const set = (patch: Partial<PartSpec>, key: string, final = false) => st.updatePart(i, patch, key, final);
  const lay = st.view?.partLayout(i);
  const offMax = Math.max(1, fpR * 1.6);
  const yMax = Math.max(4, Math.ceil(((studioUi.height.value || 4) + 2) / 2) * 2);

  return (
    <div class="st-tab st-edit">
      <div class="st-edit-head">
        <PartBadge def={def} part={p} size={44} />
        <div class="st-edit-titles">
          <div class="st-edit-name">{def.label}</div>
          <div class="st-edit-blurb">{def.blurb}</div>
        </div>
      </div>
      <div class="st-edit-tools" role="toolbar" aria-label="Part actions">
        <IconButton icon="arrowUp" label="Move up (later in the stack)" size="sm" disabled={i >= draft.parts.length - 1} onClick={() => st.movePart(i, 1)} />
        <IconButton icon="arrowDown" label="Move down (earlier in the stack)" size="sm" disabled={i <= 0} onClick={() => st.movePart(i, -1)} />
        <IconButton icon="copy" label="Duplicate part" size="sm" onClick={() => st.duplicatePart(i)} />
        <IconButton icon="trash" label="Delete part" size="sm" variant="danger" onClick={() => st.removePart(i)} />
        <span class="grow" />
        <Button size="sm" variant="ghost" icon="layers" onClick={() => (studioUi.tab.value = 'parts')}>
          Layers
        </Button>
      </div>

      <SectionHeader title="Shape & size" icon="sliders" />
      <div class="st-params">
        {def.params.map((q) => (
          <ParamControl key={q.key} def={q} part={p} fpR={fpR} onChange={(v, commit) => set({ [q.key]: v } as Partial<PartSpec>, q.key, commit)} />
        ))}
      </div>

      <SectionHeader title="Position" icon="navigate" subtitle={lay ? `Sits at ${fmtMetres(lay.base)}` : undefined} />
      <div class="st-params">
        <div class="st-param">
          <Segmented
            size="sm"
            block
            value={p.stack ? 'stack' : 'free'}
            options={[
              { value: 'stack', label: 'Stacked', icon: 'layers' },
              { value: 'free', label: 'Free', icon: 'navigate' },
            ]}
            onChange={(v) => {
              if (v === 'free' && p.stack) set({ stack: false, y: lay ? +lay.base.toFixed(3) : p.y }, '');
              else if (v === 'stack' && !p.stack) set({ stack: true, y: 0 }, '');
            }}
            ariaLabel="Stacking"
          />
          <p class="st-note">{p.stack ? 'Rests on the part below and lifts everything stacked above it.' : 'Floats at its own height — great for rings, bands, signs and bridges.'}</p>
        </div>
        <div class="st-param">
          <Slider
            label={p.stack ? 'Lift' : 'Height above ground'}
            value={p.y}
            min={p.stack ? -2 : 0}
            max={p.stack ? 4 : yMax}
            step={0.01}
            format={(v) => fmtMetres(v)}
            onChange={(v) => set({ y: v }, 'y')}
            onCommit={(v) => set({ y: v }, 'y', true)}
          />
        </div>
        <div class="st-param">
          <Slider label="Left ↔ right" value={p.x} min={-offMax} max={offMax} step={0.01} format={(v) => fmtMetres(v)} onChange={(v) => set({ x: v }, 'x')} onCommit={(v) => set({ x: v }, 'x', true)} />
        </div>
        <div class="st-param">
          <Slider label="Back ↔ front" value={p.z} min={-offMax} max={offMax} step={0.01} format={(v) => fmtMetres(v)} onChange={(v) => set({ z: v }, 'z')} onCommit={(v) => set({ z: v }, 'z', true)} />
        </div>
        <div class="st-param">
          <Slider
            label="Rotation"
            value={((p.ry % 360) + 360) % 360}
            min={0}
            max={360}
            step={1}
            ticks={[90, 180, 270]}
            format={(v) => `${Math.round(v)}°`}
            onChange={(v) => set({ ry: snapDeg(v) }, 'ry')}
            onCommit={(v) => set({ ry: snapDeg(v) }, 'ry', true)}
          />
        </div>
        {(p.x !== 0 || p.z !== 0 || p.ry !== 0 || (p.stack && p.y !== 0)) && (
          <Button size="sm" variant="ghost" icon="target" onClick={() => set({ x: 0, z: 0, ry: 0, ...(p.stack ? { y: 0 } : {}) }, '')}>
            Re-centre
          </Button>
        )}
      </div>

      <SectionHeader title="Colour" icon="palette" />
      <ColorPicker label="Main colour" value={p.c} onChange={(c, commit) => set({ c }, 'c', commit)} />
      {def.accent && <SwatchRow label={def.accent} value={p.c2} onChange={(c2) => set({ c2 }, '')} />}

      <SectionHeader title="Material" icon="layers" />
      <MaterialPicker value={p.m} onChange={(m) => set({ m }, '')} />
    </div>
  );
}

/** Gentle snapping to 15° steps near them. */
function snapDeg(v: number): number {
  const s = Math.round(v / 15) * 15;
  return Math.abs(s - v) < 3 ? s % 360 : Math.round(v);
}
