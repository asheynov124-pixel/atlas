/**
 * OWNER: ui-core.
 * Inspector — the card for `ui.selection`: a bottom card on phones, a side card on tablets / desktop / landscape.
 * Buildings: editable name, type, level stars, state, live rows from sim.inspectBuilding (bars & tones), and
 * actions Paint · Rename · Locate · Info · Bulldoze (confirm). Tiles: terrain / zone summary + sim.inspectTile.
 * Props and orbitals: name + remove.
 */
import type { Ref } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { getItem, type ItemDef } from '../../../content/catalog';
import { zoneInfo } from '../../../content/zones';
import { bus } from '../../../core/events';
import { Biome, BuildingState, Feature, RoadKind, Zone, type InspectRow, type Selection } from '../../../core/types';
import { game } from '../../../game/instance';
import { Icon } from '../../icons';
import { confirmDialog, ui } from '../../store';
import { InspectRows, Stars, Chip } from '../display';
import { TextInput } from '../controls';
import { call, setSelection, uiSound, useLayer, viewport } from '../env';
import { usePresence } from '../presence';
import { detailItem, selectTool } from './actions';
import { CATEGORY_META } from './buildModel';
import { ItemArt } from './ItemArt';

const STATE_LABEL: Partial<Record<BuildingState, { label: string; tone: 'warn' | 'bad' | 'info' | 'violet' }>> = {
  [BuildingState.Constructing]: { label: 'Under construction', tone: 'info' },
  [BuildingState.Abandoned]: { label: 'Abandoned', tone: 'warn' },
  [BuildingState.Burning]: { label: 'On fire!', tone: 'bad' },
  [BuildingState.Ruined]: { label: 'Ruins', tone: 'bad' },
  [BuildingState.Upgrading]: { label: 'Upgrading', tone: 'violet' },
};

const humanize = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const biomeName = (b: number) => humanize(Biome[b] ?? 'Unknown');
const featureName = (f: number) => (f ? humanize(Feature[f] ?? '') : '');
const roadName = (r: number) => (r ? humanize(RoadKind[r] ?? 'Road') : '');

function safeRows(fn: () => InspectRow[]): InspectRow[] {
  try {
    const r = fn();
    return Array.isArray(r) ? r : [];
  } catch (e) {
    console.error('[ui] inspect failed', e);
    return [];
  }
}

function useTick(ms: number, active: boolean): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    const h = setInterval(() => setT((x) => x + 1), ms);
    return () => clearInterval(h);
  }, [active, ms]);
  return t;
}

interface Action {
  id: string;
  icon: string;
  label: string;
  run: () => void;
  danger?: boolean;
}

function Actions({ list }: { list: Action[] }) {
  return (
    <div class="in-actions">
      {list.map((a) => (
        <button key={a.id} type="button" class={'in-act' + (a.danger ? ' is-danger' : '')} onClick={() => (uiSound('click'), a.run())}>
          <Icon name={a.icon} size={19} />
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}

function flyTo(tile: number): void {
  try {
    void game.camera.flyTo(tile, { distance: 14, tilt: 0.9 });
    uiSound('whoosh');
  } catch {
    /* camera optional */
  }
}

function BuildingBody({ id, onClose }: { id: number; onClose: () => void }) {
  const tick = useTick(700, true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [, bump] = useState(0);
  useEffect(() => {
    const offs = [
      bus.on('building:updated', (e) => e.id === id && bump((x) => x + 1)),
      bus.on('building:removed', (e) => e.id === id && onClose()),
    ];
    return () => offs.forEach((o) => o());
  }, [id]);
  const b = game.planet?.buildings.get(id);
  if (!b) return null;
  const def = getItem(b.defId);
  const rows = safeRows(() => game.sim.inspectBuilding(id));
  void tick;
  const display = b.name || def?.name || b.defId;
  const st = STATE_LABEL[b.state];
  const commit = (v: string) => {
    const n = v.trim().slice(0, 40);
    setEditing(false);
    if (n === (b.name ?? '')) return;
    if (hasMethod(game.commands, 'rename')) call(game.commands, 'rename', id, n);
    else game.ops?.updateBuilding(id, { name: n || undefined });
    uiSound('chime');
  };
  const actions: Action[] = [
    { id: 'locate', icon: 'locate', label: 'Locate', run: () => flyTo(b.tile) },
    {
      id: 'paint',
      icon: 'paint',
      label: 'Paint',
      run: () => {
        setSelection(null);
        selectTool({ id: 'paint', label: 'Paint' });
      },
    },
    {
      id: 'rename',
      icon: 'edit',
      label: 'Rename',
      run: () => {
        setName(b.name ?? def?.name ?? '');
        setEditing(true);
      },
    },
  ];
  if (def && !def.growable) actions.push({ id: 'info', icon: 'info', label: 'Info', run: () => (detailItem.value = def) });
  actions.push({
    id: 'bulldoze',
    icon: 'bulldoze',
    label: 'Bulldoze',
    danger: true,
    run: async () => {
      const ok = await confirmDialog({ title: `Bulldoze ${display}?`, body: def?.unique ? 'This one-of-a-kind wonder will be reduced to rubble.' : 'The building and everything in it will be demolished.', okLabel: 'Bulldoze', danger: true });
      if (!ok) return;
      const tiles = game.planet?.buildings.get(id)?.tiles ?? b.tiles;
      try {
        game.commands.bulldoze(tiles);
      } catch (e) {
        console.error('[ui] bulldoze failed', e);
      }
      onClose();
    },
  });
  return (
    <>
      <div class="in-head">
        <span class="in-art">{def ? <ItemArt def={def} size={56} /> : <Icon name="building" size={24} />}</span>
        <div class="in-titles grow">
          {editing ? (
            <TextInput value={name} onChange={setName} onSubmit={commit} maxLength={40} autoFocus trailing={<button type="button" class="in-ok" aria-label="Save name" onClick={() => commit(name)}><Icon name="check" size={18} /></button>} />
          ) : (
            <button type="button" class="in-name" onClick={() => (setName(b.name ?? def?.name ?? ''), setEditing(true))} aria-label="Rename">
              <span class="ellipsis">{display}</span>
              <Icon name="edit" size={14} class="in-name-edit" />
            </button>
          )}
          <div class="in-sub">
            {b.name && def ? <span class="ellipsis">{def.name}</span> : <span class="ellipsis">{def?.group ?? (def ? CATEGORY_META[def.category]?.label : '')}</span>}
            {(def?.growable || b.level > 1) && <Stars value={b.level} size={12} />}
          </div>
        </div>
      </div>
      {st && (
        <div class="in-state">
          <Chip size="sm" tone={st.tone} icon={b.state === BuildingState.Burning ? 'fire' : b.state === BuildingState.Constructing ? 'build' : 'alert'}>
            {st.label}
            {b.progress !== undefined && (b.state === BuildingState.Constructing || b.state === BuildingState.Upgrading) ? ` · ${Math.round(b.progress * 100)}%` : ''}
          </Chip>
        </div>
      )}
      {rows.length > 0 && (
        <div class="in-rows scroll-y">
          <InspectRows rows={rows} />
        </div>
      )}
      <Actions list={actions} />
    </>
  );
}

function TileBody({ tile, onClose }: { tile: number; onClose: () => void }) {
  const tick = useTick(1000, true);
  const p = game.planet;
  if (!p || tile < 0 || tile >= p.count) return null;
  void tick;
  const rows = safeRows(() => game.sim.inspectTile(tile));
  const water = p.isWater(tile);
  const z = p.zone[tile] as Zone;
  const zi = z ? zoneInfo(z) : undefined;
  const road = p.road[tile];
  const feat = featureName(p.feature[tile]);
  const title = road ? roadName(road) : zi ? zi.name : water ? (p.biome[tile] === Biome.DeepOcean ? 'Deep ocean' : 'Ocean') : biomeName(p.biome[tile]);
  const icon = road ? 'roads' : zi ? 'zones' : water ? 'water' : 'terraform';
  const props = [...p.props.values()].filter((x) => x.tile === tile);
  const actions: Action[] = [{ id: 'locate', icon: 'locate', label: 'Locate', run: () => flyTo(tile) }];
  if (road || props.length || p.feature[tile] === Feature.Rubble)
    actions.push({
      id: 'clear',
      icon: 'bulldoze',
      label: 'Clear tile',
      danger: true,
      run: () => {
        try {
          game.commands.bulldoze([tile]);
        } catch (e) {
          console.error('[ui] bulldoze failed', e);
        }
        onClose();
      },
    });
  return (
    <>
      <div class="in-head">
        <span class="in-art in-art-icon" style={zi ? ({ '--zc': '#' + zi.color.toString(16).padStart(6, '0') } as Record<string, string>) : undefined}>
          <Icon name={icon} size={24} />
        </span>
        <div class="in-titles grow">
          <div class="in-name is-static">
            <span class="ellipsis">{title}</span>
          </div>
          <div class="in-sub">
            <span class="ellipsis num">
              {zi ? biomeName(p.biome[tile]) + ' · ' : ''}
              {water ? 'Under water' : `Elevation ${p.elevation[tile]}`}
              {feat ? ` · ${feat}` : ''}
            </span>
          </div>
        </div>
      </div>
      {props.length > 0 && (
        <div class="in-state">
          {props.slice(0, 4).map((pr) => (
            <Chip key={pr.id} size="sm" icon="nature">
              {getItem(pr.defId)?.name ?? 'Decoration'}
            </Chip>
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <div class="in-rows scroll-y">
          <InspectRows rows={rows} />
        </div>
      )}
      <Actions list={actions} />
    </>
  );
}

function ThingBody({ kind, id, onClose }: { kind: 'prop' | 'orbital'; id: number; onClose: () => void }) {
  const p = game.planet;
  const inst = kind === 'prop' ? p?.props.get(id) : p?.orbitals.get(id);
  if (!inst) return null;
  const def: ItemDef | undefined = getItem(inst.defId);
  const actions: Action[] = [];
  if (kind === 'prop') actions.push({ id: 'locate', icon: 'locate', label: 'Locate', run: () => flyTo((inst as { tile: number }).tile) });
  if (def) actions.push({ id: 'info', icon: 'info', label: 'Info', run: () => (detailItem.value = def) });
  actions.push({
    id: 'remove',
    icon: 'trash',
    label: 'Remove',
    danger: true,
    run: () => {
      const method = kind === 'prop' ? 'removeProp' : 'removeOrbital';
      if (hasMethod(game.commands, method)) call(game.commands, method, id);
      else if (kind === 'prop') game.ops?.removeProp(id);
      else game.ops?.removeOrbital(id);
      uiSound('bulldoze');
      onClose();
    },
  });
  return (
    <>
      <div class="in-head">
        <span class="in-art">{def ? <ItemArt def={def} size={56} /> : <Icon name={kind === 'prop' ? 'nature' : 'satellite'} size={24} />}</span>
        <div class="in-titles grow">
          <div class="in-name is-static">
            <span class="ellipsis">{(inst as { name?: string }).name ?? def?.name ?? 'Unknown'}</span>
          </div>
          <div class="in-sub">
            <span class="ellipsis">{kind === 'prop' ? 'Decoration' : 'In orbit'}</span>
          </div>
        </div>
      </div>
      {def?.flavor && <p class="in-flavor">“{def.flavor}”</p>}
      <Actions list={actions} />
    </>
  );
}

function hasMethod(obj: object | null | undefined, name: string): boolean {
  return !!obj && typeof (obj as Record<string, unknown>)[name] === 'function';
}

function keyOf(s: Selection): string {
  if (!s) return '';
  return s.kind === 'tile' ? `t${s.tile}` : `${s.kind}${s.id}`;
}

export function Inspector() {
  const sel = ui.selection.value;
  const visible = !!sel && ui.view.value === 'planet' && !ui.category.value && !!game.planet;
  const last = useRef<Selection>(sel);
  if (sel) last.current = sel;
  const { mounted, shown } = usePresence(visible, 280);
  const close = () => {
    uiSound('close');
    setSelection(null);
  };
  useLayer(visible, close);
  // a selected building that disappears (bulldozed, destroyed) closes the card
  useEffect(() => {
    if (!sel || sel.kind !== 'building') return;
    if (!game.planet?.buildings.has(sel.id)) setSelection(null);
  }, [keyOf(sel)]);
  // phones: swipe the card down to dismiss it
  const ref = useRef<HTMLElement>(null);
  const swipe = useRef<{ id: number; y0: number; dy: number } | null>(null);
  const onDown = (e: PointerEvent) => {
    if (!viewport.value.phone) return;
    if ((e.target as HTMLElement).closest('button, input, .in-rows')) return;
    swipe.current = { id: e.pointerId, y0: e.clientY, dy: 0 };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const onMove = (e: PointerEvent) => {
    const sw = swipe.current;
    if (!sw || sw.id !== e.pointerId) return;
    sw.dy = Math.max(0, e.clientY - sw.y0);
    if (ref.current) {
      ref.current.style.transition = 'none';
      ref.current.style.transform = `translateY(${sw.dy}px)`;
    }
  };
  const onUp = (e: PointerEvent) => {
    const sw = swipe.current;
    if (!sw || sw.id !== e.pointerId) return;
    swipe.current = null;
    if (ref.current) {
      ref.current.style.transition = '';
      ref.current.style.transform = '';
    }
    if (sw.dy > 70) close();
  };
  if (!mounted) return null;
  const s = last.current;
  if (!s) return null;
  return (
    <aside
      ref={ref as Ref<HTMLElement>}
      class={'in-root glass-strong pe' + (shown ? ' is-shown' : '')}
      aria-label="Inspector"
      key={keyOf(s)}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <button type="button" class="cz-close in-close" aria-label="Close inspector" onClick={close}>
        <Icon name="close" size={17} />
      </button>
      {s.kind === 'building' && <BuildingBody id={s.id} onClose={() => setSelection(null)} />}
      {s.kind === 'tile' && <TileBody tile={s.tile} onClose={() => setSelection(null)} />}
      {(s.kind === 'prop' || s.kind === 'orbital') && <ThingBody kind={s.kind} id={s.id} onClose={() => setSelection(null)} />}
    </aside>
  );
}
