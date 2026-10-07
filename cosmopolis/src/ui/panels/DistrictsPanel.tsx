/**
 * OWNER: ui-panels.
 * Districts panel ('districts') — every neighbourhood with its colour, population, jobs, happiness and policies.
 * Create, rename, recolour, delete (undoable through game.commands where available), pick an architectural style
 * (new buildings use it; "Restyle N buildings" re-skins the existing ones in one undo step), jump to the paint
 * tool for a district, open its policies, or fly the camera to its centre. District borders are shown on the
 * planet while the panel is open.
 */
import { useEffect, useState } from 'preact/hooks';
import { getItem } from '../../content/catalog';
import { STYLES } from '../../content/styles';
import { bus } from '../../core/events';
import type { StyleId } from '../../core/types';
import { DISTRICT_COLORS } from '../../game/Commands';
import { game } from '../../game/instance';
import type { District, Planet } from '../../world/planet';
import { Button, ColorSwatches, EmptyState, Icon, IconButton, SectionHeader, TextInput } from '../core';
import { closePanel, openPanel, uiSound } from '../core/env';
import { fmtCompact, fmtInt, fmtMoney } from '../core/format';
import { confirmDialog, notify, ui } from '../store';
import { css, flyToTile, planet, safe, sim, useLive } from './common';
import { focusDistrict, policyScope } from './state';
import { StylePicker } from './StylePicker';

interface DistrictInfo {
  tiles: number;
  /** tile nearest the district's centre of mass */
  centre: number;
}

/** One pass over the planet: tile counts and centroid tiles per district. */
export function districtGeometry(p: Planet): Map<number, DistrictInfo> {
  const sums = new Map<number, { n: number; x: number; y: number; z: number }>();
  const c = p.grid.center;
  for (let t = 0; t < p.count; t++) {
    const d = p.district[t];
    if (!d) continue;
    let s = sums.get(d);
    if (!s) sums.set(d, (s = { n: 0, x: 0, y: 0, z: 0 }));
    s.n++;
    s.x += c[t * 3];
    s.y += c[t * 3 + 1];
    s.z += c[t * 3 + 2];
  }
  const out = new Map<number, DistrictInfo>();
  for (const [d, s] of sums) {
    const l = Math.hypot(s.x, s.y, s.z) || 1;
    const x = s.x / l, y = s.y / l, z = s.z / l;
    let best = -1, bd = -2;
    for (let t = 0; t < p.count; t++) {
      if (p.district[t] !== d) continue;
      const dot = c[t * 3] * x + c[t * 3 + 1] * y + c[t * 3 + 2] * z;
      if (dot > bd) (bd = dot), (best = t);
    }
    out.set(d, { tiles: s.n, centre: best });
  }
  return out;
}

function districtTiles(p: Planet, id: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < p.count; t++) if (p.district[t] === id) out.push(t);
  return out;
}

function styleableIn(p: Planet, id: number, style: StyleId): number[] {
  const out: number[] = [];
  for (const b of p.buildings.values()) {
    if (p.district[b.tile] !== id || b.style === style) continue;
    const def = getItem(b.defId);
    if (def?.styleable) out.push(b.id);
  }
  return out;
}

function paintDistrict(id: number | 'new'): void {
  closePanel();
  try {
    game.tools.select({ id: 'district', label: 'Districts' });
    game.tools.setOption('district', id);
  } catch (e) {
    console.warn('[panels] district tool unavailable', e);
  }
}

function createDistrict(): District | null {
  const p = planet();
  if (!p) return null;
  const c = safe(() => game.commands, null);
  let d: District | null = null;
  if (c && typeof c.createDistrict === 'function') d = c.createDistrict();
  else if (game.ops) d = game.ops.createDistrict('New District', DISTRICT_COLORS[p.districts.length % DISTRICT_COLORS.length]);
  if (d) uiSound('chime');
  return d;
}

function recolor(p: Planet, d: District, color: number): void {
  d.color = color;
  const tiles = districtTiles(p, d.id);
  if (tiles.length) bus.emit('tiles:district', { tiles });
}

function restyleExisting(p: Planet, d: District, style: StyleId): number {
  const ids = styleableIn(p, d.id, style);
  if (!ids.length) return 0;
  const c = game.commands;
  const grouped = typeof c?.begin === 'function' && typeof c?.end === 'function';
  try {
    if (grouped) c.begin(`Restyle ${d.name}`);
    for (const id of ids) {
      if (typeof c?.restyle === 'function') c.restyle(id, style);
      else game.ops?.updateBuilding(id, { style });
    }
  } finally {
    if (grouped) c.end();
  }
  return ids.length;
}

function Editor({ p, d, info }: { p: Planet; d: District; info?: DistrictInfo }) {
  const [name, setName] = useState(d.name);
  useEffect(() => setName(d.name), [d.id]);
  const st = safe(() => sim()!.districtStats(d.id), null);
  const style = d.style ?? null;
  const restyleCount = style ? styleableIn(p, d.id, style).length : 0;
  const rename = () => {
    const v = name.trim();
    if (!v || v === d.name) return;
    if (typeof game.commands?.renameDistrict === 'function') game.commands.renameDistrict(d.id, v);
    else {
      d.name = v.slice(0, 32);
      const tiles = districtTiles(p, d.id);
      if (tiles.length) bus.emit('tiles:district', { tiles });
    }
    notify({ title: `Renamed to ${v}`, kind: 'good', icon: 'pencil' });
  };
  const del = async () => {
    const ok = await confirmDialog({ title: `Dissolve ${d.name}?`, body: 'Buildings stay where they are; the district, its colour and its policies go. You can undo this.', okLabel: 'Dissolve', danger: true });
    if (!ok) return;
    if (typeof game.commands?.deleteDistrict === 'function') game.commands.deleteDistrict(d.id);
    else game.ops?.deleteDistrict(d.id);
    uiSound('demolish');
  };
  return (
    <div class="up-dist-editor">
      <TextInput
        label="Name"
        value={name}
        onChange={setName}
        onSubmit={rename}
        maxLength={32}
        trailing={name.trim() && name.trim() !== d.name ? <IconButton icon="check" label="Save name" size="sm" variant="primary" onClick={rename} /> : undefined}
      />
      <div class="up-field-label">Colour</div>
      <ColorSwatches colors={DISTRICT_COLORS} value={d.color} onChange={(c) => typeof c === 'number' && c >= 0 && recolor(p, d, c)} allowCustom size={32} />
      {st && (
        <div class="up-dist-stats">
          <span>
            <Icon name="population" size={14} /> <b class="num">{fmtCompact(st.population)}</b> residents
          </span>
          <span>
            <Icon name="jobs" size={14} /> <b class="num">{fmtCompact(st.jobs)}</b> jobs
          </span>
          <span>
            <Icon name="building" size={14} /> <b class="num">{fmtInt(st.buildings)}</b> buildings
          </span>
          <span>
            <Icon name="smile" size={14} /> <b class="num">{st.happiness}%</b> happy
          </span>
          <span>
            <Icon name="landValue" size={14} /> land <b class="num">{st.landValue}</b>
          </span>
          <span>
            <Icon name="crime" size={14} /> crime <b class="num">{st.crime}</b>
          </span>
          <span>
            <Icon name="pollution" size={14} /> smog <b class="num">{st.pollution}</b>
          </span>
          <span>
            <Icon name="grid" size={14} /> <b class="num">{fmtInt(info?.tiles ?? 0)}</b> tiles
          </span>
        </div>
      )}
      <div class="up-field-label">
        Architecture <span class="dim">· {style ? STYLES[style].name : `city default (${STYLES[p.city.style]?.name ?? p.city.style})`}</span>
      </div>
      <StylePicker
        compact
        allowInherit
        value={style}
        onInherit={() => (d.style = undefined)}
        onChange={(s) => {
          d.style = s;
          bus.emit('catalog:changed', {});
        }}
      />
      {style && restyleCount > 0 && (
        <Button
          variant="secondary"
          icon="magic"
          block
          onClick={() => {
            const n = restyleExisting(p, d, style);
            if (n) notify({ title: `${n} building${n > 1 ? 's' : ''} restyled`, body: `${d.name} now looks ${STYLES[style].name}.`, kind: 'good', icon: 'magic' });
          }}
        >
          Restyle {restyleCount} existing building{restyleCount > 1 ? 's' : ''}
        </Button>
      )}
      <div class="up-dist-actions">
        <Button variant="primary" icon="brush" onClick={() => paintDistrict(d.id)}>
          Paint
        </Button>
        <Button
          variant="glass"
          icon="policy"
          onClick={() => {
            policyScope.value = d.id;
            openPanel('policies');
          }}
        >
          Policies{d.policies.length ? ` · ${d.policies.length}` : ''}
        </Button>
        <IconButton icon="locate" label="Fly there" variant="glass" disabled={!info || info.centre < 0} onClick={() => flyToTile(info?.centre, { distance: 40 })} />
        <IconButton icon="trash" label="Dissolve district" variant="danger" onClick={() => void del()} />
      </div>
      {st && st.policyCost !== 0 && <div class="dim up-dist-cost num">District policies cost {fmtMoney(st.policyCost)}/mo</div>}
    </div>
  );
}

export function DistrictsPanel() {
  useLive(1500);
  const p = planet();
  const [open, setOpen] = useState<number>(() => {
    const f = focusDistrict.value;
    focusDistrict.value = -1;
    return f;
  });
  void ui.catalogVersion.value;
  // show district borders while browsing districts
  useEffect(() => {
    const surf = safe(() => game.planetView?.surface ?? null, null);
    if (!surf) return;
    surf.setDistrictDisplay(true);
    return () => {
      if (ui.tool.value?.id !== 'district') safe(() => game.planetView?.surface.setDistrictDisplay(false), undefined);
    };
  }, [ui.planetId.value]);
  // re-render on district edits (undo, tool strokes)
  const [, bump] = useState(0);
  useEffect(() => bus.on('tiles:district', () => bump((x) => x + 1)), []);
  if (!p) return <EmptyState icon="district" title="No city loaded" />;
  const list = p.districts.filter((d, i) => i > 0 && !!d);
  const geo = districtGeometry(p);
  const s = sim();
  const total = list.reduce((t, d) => t + safe(() => s!.districtStats(d.id).population, 0), 0);
  const add = () => {
    const d = createDistrict();
    if (d) {
      setOpen(d.id);
      notify({ title: `${d.name} founded`, body: 'Paint it onto the map to give it some streets.', kind: 'good', icon: 'district' });
    }
  };
  return (
    <div class="up-root up-districts">
      <div class="up-actions-row">
        <Button variant="primary" icon="brush" onClick={() => paintDistrict(list.length ? list[list.length - 1].id : 'new')}>
          Paint districts
        </Button>
        <Button variant="glass" icon="plus" onClick={add}>
          New district
        </Button>
      </div>
      {list.length === 0 ? (
        <EmptyState
          icon="district"
          title="No districts yet"
          body="Group neighbourhoods into districts to give them a name, a colour, their own architecture and their own laws. Night-life quarter with a curfew exemption? Go for it."
        />
      ) : (
        <>
          <SectionHeader title={`${list.length} district${list.length > 1 ? 's' : ''}`} icon="district" subtitle={`${fmtCompact(total)} of ${fmtCompact(ui.population.value)} citizens live in a district`} />
          <div class="up-dist-list">
            {list.map((d) => {
              const st = safe(() => s!.districtStats(d.id), null);
              const info = geo.get(d.id);
              const isOpen = open === d.id;
              return (
                <section key={d.id} class={'up-card up-dist' + (isOpen ? ' is-open' : '')} style={{ '--dc': css(d.color) } as Record<string, string>}>
                  <button type="button" class="up-dist-head" aria-expanded={isOpen} onClick={() => (uiSound('tap'), setOpen(isOpen ? -1 : d.id))}>
                    <span class="up-dist-swatch" />
                    <span class="grow up-dist-title">
                      <span class="up-dist-name ellipsis">{d.name}</span>
                      <span class="dim up-dist-sub num">
                        {fmtCompact(st?.population ?? 0)} residents · {fmtInt(info?.tiles ?? 0)} tiles{d.style ? ` · ${STYLES[d.style].name}` : ''}
                      </span>
                    </span>
                    {d.policies.length > 0 && (
                      <span class="up-dist-pol num" title="Policies">
                        <Icon name="policy" size={13} />
                        {d.policies.length}
                      </span>
                    )}
                    <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={18} class="dim" />
                  </button>
                  {isOpen && <Editor p={p} d={d} info={info} />}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
