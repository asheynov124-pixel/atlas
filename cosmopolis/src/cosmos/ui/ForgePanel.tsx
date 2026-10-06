/**
 * OWNER: cosmos.
 * ForgePanel — the sandbox Planet Forge ('forge' panel): pick an archetype, then sculpt every knob of a PlanetSpec
 * (size = Goldberg frequency 16–64, seed dice, ocean level, mountains, temperature, clouds, atmosphere & ocean
 * colours, rings, moons, palette overrides, gravity, day length) with a live software-rendered preview. "Forge &
 * land" registers the world in the current star system (cosmos.forgePlanet) and warps there; "Add to system" just
 * places it in orbit and shows it on the star map. The draft survives closing the panel.
 */
import { signal } from '@preact/signals';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { MoonSpec, PlanetSpec, PlanetTypeId } from '../../core/types';
import { Rng } from '../../core/rng';
import { game } from '../../game/instance';
import { ui } from '../../ui/store';
import { Icon } from '../../ui/icons';
import { Button, IconButton } from '../../ui/core/Button';
import { ColorSwatches, Slider, Stepper, TextInput, Toggle } from '../../ui/core/controls';
import { EmptyState, SectionHeader } from '../../ui/core/display';
import { closePanel, uiSound } from '../../ui/core/env';
import { fmtCompact } from '../../ui/core/format';
import { PLANET_TYPES, PLANET_TYPE_IDS } from '../../content/planetTypes';
import { randomWorldName, rollSpec } from '../Universe';
import { moonName } from '../names';
import { planetArt } from './planetArt';

type PalKey = 'land' | 'lowland' | 'highland' | 'shore' | 'snow';

interface Draft {
  name: string;
  type: PlanetTypeId;
  seed: number;
  frequency: number;
  hasOcean: boolean;
  oceanLevel: number;
  mountains: number;
  temperature: number;
  cloudCover: number;
  atmo: number;
  atmoDensity: number;
  ocean: number;
  rings: boolean;
  ringColor: number;
  moons: number;
  gravity: number;
  dayLength: number;
  palette: Partial<Record<PalKey, number>>;
}

const ATMO_COLORS = [0x6fb6ff, 0xbfe6ff, 0x7fd0ff, 0x9cffb0, 0xc8ff4a, 0x66ffee, 0xffb36b, 0xff7a3d, 0xff5a8a, 0xff9ae0, 0xd59cff, 0xffffff];
const OCEAN_COLORS = [0x1d6fb8, 0x0e7fa8, 0x2a9db0, 0x1f8a7a, 0x3a7fa8, 0x22e0ff, 0x7fbf1f, 0x7a4fd0, 0xd0306a, 0xff5a1a, 0x3a2a5a, 0x101828];
const RING_COLORS = [0xd9c49a, 0xd8c8a8, 0xb8c8d8, 0xcdb8ff, 0xffb0d8, 0x9fe6ff, 0xffd27a, 0xe0e0e0];
const PAL_COLORS: Record<PalKey, number[]> = {
  land: [0x5f9e4a, 0x2e8a3c, 0xd9a35f, 0x9b9b9b, 0x8e7ad9, 0x7a4f8a, 0xe86fa8, 0x3a2e2c, 0xf0f0f0],
  lowland: [0x7fb85a, 0x3fa048, 0xe6be7d, 0x7f7f80, 0xb29cf0, 0x9a5fa0, 0xff9ac8, 0x2a2020, 0x48d0c0],
  highland: [0x7d7a60, 0x56704a, 0xa8673c, 0xb4b4b4, 0x5f4fa8, 0x5a4a6a, 0xa04070, 0x55443c, 0x2a4a8a],
  shore: [0xe8d8a0, 0xf6e7b8, 0xf2deb0, 0x8c8c8c, 0xe8defa, 0xc9a9d0, 0xffe0f0, 0x241a18, 0xffffff],
  snow: [0xf2f6ff, 0xffffff, 0xf0e6d0, 0xdadada, 0xf6f0ff, 0xf0e0f6, 0xffd6ec, 0x6d6560, 0xbfefff],
};
const PAL_LABEL: Record<PalKey, string> = { land: 'Land', lowland: 'Lowlands', highland: 'Highlands', shore: 'Shores', snow: 'Snow & ice' };

function fromArchetype(type: PlanetTypeId, keep?: Partial<Draft>): Draft {
  const a = PLANET_TYPES[type];
  const seed = keep?.seed ?? 1 + Math.floor(Math.random() * 1e9);
  return {
    name: keep?.name ?? randomWorldName(seed),
    type,
    seed,
    frequency: keep?.frequency ?? Math.round((a.frequency[0] + a.frequency[1]) / 4) * 2,
    hasOcean: a.hasOcean,
    oceanLevel: 0,
    mountains: a.ruggedness,
    temperature: a.temperature,
    cloudCover: a.cloudCover,
    atmo: a.atmosphere.color,
    atmoDensity: a.atmosphere.density,
    ocean: a.oceanColor,
    rings: keep?.rings ?? a.ringChance >= 0.4,
    ringColor: keep?.ringColor ?? 0xd9c49a,
    moons: keep?.moons ?? Math.max(a.moons[0], Math.min(2, a.moons[1])),
    gravity: Math.round(((a.gravity[0] + a.gravity[1]) / 2) * 100) / 100,
    dayLength: 240,
    palette: {},
  };
}

const draftSig = signal<Draft>(fromArchetype('terran', { seed: 4242, name: 'Nova Prime' }));

function buildSpec(d: Draft, id = 'forge.preview'): PlanetSpec {
  const base = rollSpec(id, d.name || 'Unnamed', d.type, d.seed);
  const rng = new Rng(d.seed ^ 0x6d00);
  const moons: MoonSpec[] = [];
  for (let i = 0; i < d.moons; i++) {
    moons.push({
      name: moonName(rng),
      radius: rng.range(0.1, 0.28),
      distance: 3.2 + i * 1.7 + rng.range(0, 0.6),
      color: rng.pick([0xb8b8c0, 0xc8b8a0, 0x9fb4c6, 0xd0c0e0, 0xa0a090]),
      type: rng.chance(0.75) ? 'barren' : rng.pick(['arctic', 'volcanic', 'crystal'] as PlanetTypeId[]),
      speed: 0.012 + rng.range(0, 0.02),
      inclination: rng.range(-0.25, 0.25),
      phase: rng.range(0, Math.PI * 2),
    });
  }
  const pal: Partial<Record<PalKey, number>> = {};
  for (const k of Object.keys(d.palette) as PalKey[]) if (d.palette[k] !== undefined && d.palette[k]! >= 0) pal[k] = d.palette[k];
  return {
    ...base,
    name: d.name.trim() || 'Unnamed',
    frequency: d.frequency,
    hasOcean: d.hasOcean,
    oceanLevel: d.oceanLevel,
    mountains: d.mountains,
    temperature: Math.round(d.temperature),
    cloudCover: d.cloudCover,
    atmosphere: { color: d.atmo, density: d.atmoDensity, breathable: PLANET_TYPES[d.type].atmosphere.breathable },
    oceanColor: d.ocean,
    rings: d.rings ? { inner: 1.4, outer: 2.4, color: d.ringColor, opacity: 0.72, tilt: 0.28 } : null,
    moons,
    gravity: d.gravity,
    dayLength: d.dayLength,
    palette: Object.keys(pal).length ? pal : undefined,
  };
}

const sizeWord = (f: number) => (f < 24 ? 'Tiny' : f < 32 ? 'Small' : f < 42 ? 'Medium' : f < 52 ? 'Large' : 'Huge');
const tempWord = (t: number) => (t < -60 ? 'Cryogenic' : t < -10 ? 'Frozen' : t < 8 ? 'Cold' : t < 26 ? 'Temperate' : t < 45 ? 'Hot' : t < 120 ? 'Scorching' : 'Molten');
const fmtTemp = (t: number) => `${t < 0 ? '−' : ''}${Math.abs(Math.round(t))} °C`;

function ArchetypeChip({ type, on, onPick }: { type: PlanetTypeId; on: boolean; onPick: () => void }) {
  const a = PLANET_TYPES[type];
  const url = useMemo(() => {
    try {
      return planetArt(rollSpec('forge.type.' + type, a.name, type, 777), { size: 44, rings: false });
    } catch {
      return '';
    }
  }, [type]);
  return (
    <button type="button" class={'fg-type' + (on ? ' is-on' : '')} aria-pressed={on} onClick={onPick} title={a.tagline}>
      {url ? <img src={url} width={44} height={44} alt="" draggable={false} /> : <span class="fg-type-fallback" />}
      <span>{a.name.replace(' Moon', '').replace(' World', '')}</span>
    </button>
  );
}

function Row({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return (
    <div class="fg-row">
      <span class="fg-row-l">{label}</span>
      <div class="fg-row-c">{children}</div>
    </div>
  );
}

export function ForgePanel(_p: { onClose: () => void }) {
  const sandbox = ui.mode.value === 'sandbox';
  const d = draftSig.value;
  const set = (patch: Partial<Draft>) => (draftSig.value = { ...draftSig.value, ...patch });
  const spec = useMemo(() => buildSpec(d), [d]);
  // the software preview is debounced so dragging a slider stays smooth
  const [art, setArt] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setArt(planetArt(spec, { size: 148, dpr: Math.min(2, window.devicePixelRatio || 1) * 0.85 }));
      } catch (e) {
        console.warn('[forge] preview failed', e);
      }
    }, art ? 110 : 0);
    return () => clearTimeout(t);
  }, [spec]);

  if (!sandbox)
    return <EmptyState icon="magic" title="The Planet Forge is a sandbox tool" body="Start a Sandbox game from the main menu to design worlds of your own — continents, climates, rings and moons." />;

  const a = PLANET_TYPES[d.type];
  const tiles = 10 * d.frequency * d.frequency + 2;
  const forge = (land: boolean) => {
    const c = game.cosmos;
    try {
      const { id: _preview, ...partial } = buildSpec(d);
      void _preview;
      const made = c.forgePlanet(partial);
      uiSound('magic');
      closePanel();
      if (land) void c.travelTo(made.id);
      else {
        c.openView('system', made.id);
        setTimeout(() => c.select(made.id), 80);
      }
      // next draft gets a fresh name & seed so forging twice makes two worlds
      const seed = 1 + Math.floor(Math.random() * 1e9);
      set({ seed, name: randomWorldName(seed) });
    } catch (e) {
      console.error('[forge] failed', e);
    }
  };
  const surprise = () => {
    uiSound('magic');
    const type = PLANET_TYPE_IDS[Math.floor(Math.random() * PLANET_TYPE_IDS.length)];
    const seed = 1 + Math.floor(Math.random() * 1e9);
    const base = fromArchetype(type, { seed, name: randomWorldName(seed) });
    const r = new Rng(seed);
    draftSig.value = {
      ...base,
      frequency: 2 * r.int(12, 24),
      oceanLevel: base.hasOcean ? Math.round(r.range(-0.6, 0.6) * 20) / 20 : 0,
      mountains: Math.round(r.range(0.2, 0.9) * 20) / 20,
      rings: r.chance(0.4),
      ringColor: r.pick(RING_COLORS),
      moons: r.int(0, 3),
      atmo: r.chance(0.35) ? r.pick(ATMO_COLORS) : base.atmo,
      ocean: r.chance(0.3) ? r.pick(OCEAN_COLORS) : base.ocean,
    };
  };

  return (
    <div class="fg-root">
      <div class="fg-hero">
        <div class="fg-preview">
          <div class="fg-preview-glow" style={{ background: `radial-gradient(circle, rgba(${(d.atmo >> 16) & 255},${(d.atmo >> 8) & 255},${d.atmo & 255},0.28), transparent 65%)` }} />
          {art ? <img src={art} width={148} height={148} alt={`Preview of ${spec.name}`} draggable={false} /> : <span class="fg-preview-empty" />}
        </div>
        <div class="fg-hero-text">
          <TextInput value={d.name} onChange={(v) => set({ name: v.slice(0, 28) })} label="Name" maxLength={28} trailing={<IconButton icon="dice" label="Random name" size="sm" variant="ghost" onClick={() => set({ name: randomWorldName(Math.floor(Math.random() * 1e9)) })} />} />
          <p class="fg-tagline">
            <b>{a.name}</b> · {a.tagline}
          </p>
          <div class="fg-hero-facts num">
            <span>{sizeWord(d.frequency)}</span>
            <span>{fmtCompact(tiles)} tiles</span>
            <span>{tempWord(d.temperature)}</span>
            {d.moons > 0 && <span>{d.moons} {d.moons === 1 ? 'moon' : 'moons'}</span>}
            {d.rings && <span>ringed</span>}
          </div>
        </div>
      </div>
      <div class="fg-cta">
        <IconButton icon="shuffle" label="Surprise me" variant="glass" onClick={surprise} />
        <Button variant="secondary" icon="starSystem" onClick={() => forge(false)}>
          Add to system
        </Button>
        <Button variant="primary" icon="rocket" onClick={() => forge(true)}>
          Forge &amp; land
        </Button>
      </div>

      <SectionHeader title="Archetype" icon="planet" subtitle="Sets the biomes, features and hazards. Resets climate & colours." />
      <div class="fg-types scroll-x">
        {PLANET_TYPE_IDS.map((t) => (
          <ArchetypeChip key={t} type={t} on={t === d.type} onPick={() => (uiSound('tap'), (draftSig.value = fromArchetype(t, { name: d.name, seed: d.seed, frequency: d.frequency, rings: d.rings, ringColor: d.ringColor, moons: d.moons })))} />
        ))}
      </div>

      <SectionHeader title="Shape" icon="globe" />
      <Slider label="Size" value={d.frequency} min={16} max={64} step={2} onChange={(v) => set({ frequency: v })} format={(v) => `${sizeWord(v)} · ${fmtCompact(10 * v * v + 2)} tiles`} icon="grid" />
      {d.frequency > 52 && (
        <p class="fg-warn">
          <Icon name="alert" size={13} /> Huge worlds are gorgeous — and heavy on older phones.
        </p>
      )}
      <Row label="Terrain seed">
        <span class="fg-seed num">#{d.seed.toString(36).toUpperCase()}</span>
        <Button variant="secondary" size="sm" icon="dice" onClick={() => (uiSound('tap'), set({ seed: 1 + Math.floor(Math.random() * 1e9) }))}>
          Re-roll
        </Button>
      </Row>
      <Slider label="Mountains" value={d.mountains} min={0} max={1} step={0.05} onChange={(v) => set({ mountains: v })} format={(v) => (v < 0.25 ? 'Plains' : v < 0.5 ? 'Rolling' : v < 0.75 ? 'Rugged' : 'Jagged')} icon="raise" />
      <Toggle checked={d.hasOcean} onChange={(v) => set({ hasOcean: v })} label="Oceans" description={d.hasOcean ? 'Seas, coasts and harbours.' : 'A dry world — rock all the way down.'} icon="wave" />
      {d.hasOcean && <Slider label="Sea level" value={d.oceanLevel} min={-1} max={1} step={0.05} onChange={(v) => set({ oceanLevel: v })} format={(v) => (v < -0.5 ? 'Dry basins' : v < -0.15 ? 'Low seas' : v < 0.15 ? 'Balanced' : v < 0.55 ? 'High seas' : 'Waterworld')} icon="water" />}

      <SectionHeader title="Climate" icon="temperature" />
      <Slider label="Temperature" value={d.temperature} min={-150} max={200} step={1} onChange={(v) => set({ temperature: v })} format={(v) => `${tempWord(v)} · ${fmtTemp(v)}`} icon="temperature" />
      <Slider label="Clouds" value={d.cloudCover} min={0} max={0.9} step={0.05} onChange={(v) => set({ cloudCover: v })} format={(v) => `${Math.round(v * 100)} %`} icon="cloud" />
      <Slider label="Atmosphere" value={d.atmoDensity} min={0} max={2} step={0.05} onChange={(v) => set({ atmoDensity: v })} format={(v) => (v < 0.1 ? 'Vacuum' : v < 0.6 ? 'Thin' : v < 1.3 ? 'Standard' : 'Thick')} icon="wind" />
      <Row label="Sky colour">
        <ColorSwatches colors={ATMO_COLORS} value={d.atmo} onChange={(c) => typeof c === 'number' && c >= 0 && set({ atmo: c })} size={30} allowCustom />
      </Row>
      {d.hasOcean && (
        <Row label="Ocean colour">
          <ColorSwatches colors={OCEAN_COLORS} value={d.ocean} onChange={(c) => typeof c === 'number' && c >= 0 && set({ ocean: c })} size={30} allowCustom />
        </Row>
      )}

      <SectionHeader title="Rings & moons" icon="moon" />
      <Toggle checked={d.rings} onChange={(v) => set({ rings: v })} label="Planetary rings" description="Ice and dust — visible from the surface at night." icon="station" />
      {d.rings && (
        <Row label="Ring colour">
          <ColorSwatches colors={RING_COLORS} value={d.ringColor} onChange={(c) => typeof c === 'number' && c >= 0 && set({ ringColor: c })} size={30} />
        </Row>
      )}
      <Row label="Moons">
        <Stepper value={d.moons} min={0} max={4} onChange={(v) => set({ moons: v })} label="Moons" />
      </Row>

      <SectionHeader title="Palette" icon="palette" subtitle="Override the archetype’s ground colours. Pink continents? Go on." />
      {(Object.keys(PAL_LABEL) as PalKey[]).map((k) => (
        <Row label={PAL_LABEL[k]} key={k}>
          <ColorSwatches colors={PAL_COLORS[k]} value={d.palette[k] ?? null} allowNone onChange={(c) => typeof c === 'number' && set({ palette: { ...d.palette, [k]: c >= 0 ? c : undefined } })} size={28} />
        </Row>
      ))}

      <SectionHeader title="Physics" icon="gravity" />
      <Slider label="Gravity" value={d.gravity} min={0.1} max={3} step={0.05} onChange={(v) => set({ gravity: v })} format={(v) => `${v.toFixed(2)} g`} icon="gravity" />
      <Slider label="Day length" value={d.dayLength} min={90} max={720} step={10} onChange={(v) => set({ dayLength: v })} format={(v) => `${Math.round(v / 60)} min ${String(Math.round(v % 60)).padStart(2, '0')} s`} icon="sunrise" />

      <div class="fg-end">
        <Button variant="primary" size="lg" icon="rocket" block onClick={() => forge(true)}>
          Forge {spec.name} &amp; land
        </Button>
      </div>
    </div>
  );
}
