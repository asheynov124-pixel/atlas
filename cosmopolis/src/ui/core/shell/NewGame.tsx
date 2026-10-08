/**
 * OWNER: ui-core.
 * NewGameModal — found a civilisation. Career: name your civilisation + first city, pick a homeworld among the
 * cradle archetypes (the rest are shown locked — "unlock by exploring"). Sandbox: any archetype, planet size,
 * empty planet vs Instant City, and a seed with dice. Launch shows the loading overlay, then calls game.newGame().
 */
import { useEffect, useState } from 'preact/hooks';
import { PLANET_TYPES } from '../../../content/planetTypes';
import type { GameMode, PlanetTypeId } from '../../../core/types';
import { buildDemoCity } from '../../../dev/demoCity';
import { game } from '../../../game/instance';
import { Icon } from '../../icons';
import { ui, notify } from '../../store';
import { Button, IconButton } from '../Button';
import { Segmented, TextInput } from '../controls';
import { SectionHeader } from '../display';
import { nextPaint, uiSound, unlockAudio } from '../env';
import { Modal } from '../Modal';
import { hasPortrait, planetPortrait, warmPortraits } from './art';
import { randomCityName, randomCivName, randomWorldName } from './names';

export const PORTRAIT = 136;
export const CAREER_WORLDS: PlanetTypeId[] = ['terran', 'tundra', 'desert', 'ocean'];
export const ALL_WORLDS: PlanetTypeId[] = ['terran', 'tundra', 'desert', 'ocean', 'jungle', 'arctic', 'volcanic', 'barren', 'toxic', 'crystal', 'fungal', 'machine'];

const SIZES = [
  { value: 30, label: 'Small', title: 'Small · ~9 000 tiles' },
  { value: 40, label: 'Medium', title: 'Medium · ~16 000 tiles' },
  { value: 50, label: 'Large', title: 'Large · ~25 000 tiles' },
  { value: 58, label: 'Huge', title: 'Huge · ~34 000 tiles (best on iPad / desktop)' },
];

interface Props {
  open: boolean;
  mode: GameMode;
  onClose: () => void;
  onMode: (m: GameMode) => void;
}

export function NewGameModal({ open, mode, onClose, onMode }: Props) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const [civ, setCiv] = useState(() => randomCivName(seed));
  const [city, setCity] = useState(() => randomCityName(seed));
  const [world, setWorld] = useState<PlanetTypeId>('terran');
  const [size, setSize] = useState(40);
  const [instant, setInstant] = useState(false);
  const [, setArtTick] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    return warmPortraits(ALL_WORLDS, PORTRAIT, () => setArtTick((t) => t + 1));
  }, [open]);

  useEffect(() => {
    if (mode === 'career' && !CAREER_WORLDS.includes(world)) setWorld('terran');
  }, [mode]);

  const reroll = () => {
    const s = Math.floor(Math.random() * 1e6);
    setSeed(s);
    setCiv(randomCivName(s));
    setCity(randomCityName(s));
    uiSound('magic');
  };

  const worldName = randomWorldName(world, seed);

  const launch = async () => {
    if (busy) return;
    setBusy(true);
    unlockAudio();
    uiSound('warp');
    onClose();
    ui.loading.value = mode === 'sandbox' ? 'Forging a sandbox universe…' : `Seeding ${worldName}…`;
    await nextPaint();
    try {
      game.newGame(mode, {
        empireName: civ.trim() || randomCivName(seed),
        cityName: city.trim() || randomCityName(seed),
        planetName: worldName,
        planetType: world,
        seed,
        // planet size (sandbox only)
        frequency: mode === 'sandbox' && size !== 40 ? size : undefined,
      });
    } catch (e) {
      console.error('[ui] newGame failed', e);
      notify({ title: 'Could not start the game', body: String((e as Error)?.message ?? e), kind: 'bad', icon: 'alert' });
    }
    if (mode === 'sandbox' && instant && game.planet) {
      ui.loading.value = 'Raising an Instant City…';
      await nextPaint();
      try {
        buildDemoCity(game, 'city');
      } catch (e) {
        console.error('[ui] instant city failed', e);
      }
    }
    ui.loading.value = null;
    setBusy(false);
    if (game.planet) {
      notify({
        title: mode === 'sandbox' ? 'Sandbox ready' : `Welcome to ${city.trim() || 'your city'}`,
        body: mode === 'sandbox' ? 'No budget, no limits. Build anything — or break everything.' : 'Lay a road, zone some homes and watch your outpost come alive.',
        kind: 'good',
        icon: mode === 'sandbox' ? 'sparkles' : 'rocket',
      });
    }
  };

  const selectable = mode === 'career' ? CAREER_WORLDS : ALL_WORLDS;
  const locked = mode === 'career' ? ALL_WORLDS.filter((t) => !CAREER_WORLDS.includes(t)) : [];
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon={mode === 'sandbox' ? 'sparkles' : 'rocket'}
      title={mode === 'sandbox' ? 'New Sandbox' : 'New Career'}
      subtitle={mode === 'sandbox' ? 'Infinite credits, every building, every god power.' : 'From a dusty outpost to a galactic civilisation.'}
      class="ng-modal"
      footer={
        <div class="ng-foot">
          <div class="ng-summary grow">
            <span class="ng-summary-k">{mode === 'sandbox' ? 'Sandbox' : 'Career'}</span>
            <span class="ng-summary-v ellipsis">
              {city || '—'} · {worldName}
            </span>
          </div>
          <Button variant="primary" size="lg" icon="rocket" onClick={launch} loading={busy} sound={false}>
            {mode === 'sandbox' ? 'Launch' : 'Found city'}
          </Button>
        </div>
      }
    >
      <div class="ng-body">
        <Segmented
          block
          value={mode}
          onChange={onMode}
          ariaLabel="Game mode"
          options={[
            { value: 'career', label: 'Career', icon: 'trophy' },
            { value: 'sandbox', label: 'Sandbox', icon: 'sparkles' },
          ]}
        />
        <SectionHeader title="Identity" icon="flag" subtitle="Tap the dice for inspiration." action={<IconButton icon="dice" label="Roll new names" size="sm" variant="ghost" onClick={reroll} sound={false} />} />
        <div class="ng-names">
          <TextInput label="Civilisation" value={civ} onChange={setCiv} maxLength={32} icon="crown" />
          <TextInput label="First city" value={city} onChange={setCity} maxLength={28} icon="building" />
        </div>
        <SectionHeader title="Homeworld" icon="planet" subtitle={mode === 'career' ? 'Choose the cradle of your civilisation.' : 'Every archetype is yours to play.'} />
        <div class={'ng-worlds' + (mode === 'career' ? ' is-career' : '')} role="radiogroup" aria-label="Homeworld">
          {selectable.map((t) => {
            const a = PLANET_TYPES[t];
            const on = world === t;
            const art = hasPortrait(t, PORTRAIT) ? planetPortrait(t, PORTRAIT) : '';
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={on}
                class={'ng-world' + (on ? ' is-active' : '')}
                onClick={() => {
                  uiSound('tap');
                  setWorld(t);
                }}
                title={a?.tagline}
              >
                <span class="ng-world-art">{art && <img src={art} alt="" draggable={false} />}</span>
                <span class="ng-world-name">{a?.name ?? t}</span>
                <span class="ng-world-tag">{a?.tagline}</span>
                {on && (
                  <span class="ng-world-check">
                    <Icon name="check" size={14} stroke={2.4} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {locked.length > 0 && (
          <div class="ng-locked" aria-label={`${locked.length} more worlds unlock by exploring`}>
            <div class="ng-locked-art">
              {locked.map((t) => {
                const art = hasPortrait(t, PORTRAIT) ? planetPortrait(t, PORTRAIT) : '';
                return <span key={t} title={`${PLANET_TYPES[t]?.name} — unlock by exploring`}>{art && <img src={art} alt="" draggable={false} />}</span>;
              })}
            </div>
            <div class="ng-locked-text">
              <Icon name="lock" size={13} />
              <span>
                {locked.length} more worlds — volcanic, crystal, machine… — unlock as you explore.
              </span>
            </div>
          </div>
        )}
        <div class="ng-world-desc">
          <b>{worldName}</b> — {PLANET_TYPES[world]?.description}
        </div>
        {mode === 'sandbox' && (
          <>
            <SectionHeader title="Sandbox options" icon="sliders" />
            <div class="ng-opts">
              <div class="ng-opt">
                <span class="ng-opt-label">Planet size</span>
                <Segmented size="sm" block value={size} onChange={setSize} options={SIZES} ariaLabel="Planet size" />
              </div>
              <div class="ng-opt">
                <span class="ng-opt-label">Start with</span>
                <Segmented
                  size="sm"
                  block
                  value={instant ? 'city' : 'empty'}
                  onChange={(v) => setInstant(v === 'city')}
                  ariaLabel="Start with"
                  options={[
                    { value: 'empty', label: 'Empty planet', icon: 'globe' },
                    { value: 'city', label: 'Instant City', icon: 'building' },
                  ]}
                />
              </div>
              <div class="ng-opt">
                <span class="ng-opt-label">Seed</span>
                <TextInput
                  value={String(seed)}
                  inputMode="numeric"
                  onChange={(v) => {
                    const n = parseInt(v.replace(/\D/g, ''), 10);
                    setSeed(Number.isFinite(n) ? n % 1e9 : 0);
                  }}
                  icon="dice"
                  trailing={<IconButton icon="shuffle" label="Random seed" size="sm" variant="ghost" onClick={() => setSeed(Math.floor(Math.random() * 1e6))} />}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
