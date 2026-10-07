/**
 * OWNER: god.
 * God Mode panel — category tabs, a magnitude slider, and power cards (icon, name, danger rating, targeting,
 * description, flavour, lock / cooldown states). Tapping a tile / drag power arms the tools' god targeting
 * (game.tools.select({ id: 'god', powerId })); global powers fire immediately (planet-ending ones confirm first).
 * Above the cards: Chrono (rewind the last catastrophe) and the running effects with a "Calm the heavens" button.
 */
import { useEffect, useState } from 'preact/hooks';
import { game } from '../../game/instance';
import { ui, confirmDialog, notify } from '../../ui/store';
import { Button, Chip, Icon, IconOrEmoji, Slider, Tabs, uiSound, fmtDuration } from '../../ui/core';
import type { GodCategory, GodPowerDef } from '../GodPowers';
import { CATEGORY_COLOR } from '../GodPowers';
import { godUi } from '../state';
import { armFallback } from './fallback';

const CATEGORIES: { id: GodCategory; label: string; icon: string; blurb: string }[] = [
  { id: 'weather', label: 'Weather', icon: 'cloud', blurb: 'Storms, twisters, frost and fire from the sky.' },
  { id: 'earth', label: 'Earth', icon: 'quake', blurb: 'Quakes, volcanoes, floods and the hungry sea.' },
  { id: 'sky', label: 'Sky', icon: 'meteor', blurb: 'Rocks, rods and radiance from space.' },
  { id: 'creature', label: 'Creatures', icon: 'monster', blurb: 'Visitors, monsters and things that eat cities.' },
  { id: 'cosmic', label: 'Cosmic', icon: 'galaxy', blurb: 'Bend physics: moons, rings, gravity, time.' },
  { id: 'creation', label: 'Creation', icon: 'sparkles', blurb: 'Benevolent miracles. Make the world lovelier.' },
  { id: 'apocalypse', label: 'Apocalypse', icon: 'skull', blurb: 'Planet-ending. Time can be rewound… probably.' },
];

const DANGER = ['Blessing', 'Mild', 'Moderate', 'Severe', 'Catastrophic', 'Apocalyptic'];
const TARGET: Record<GodPowerDef['targeting'], { label: string; icon: string }> = {
  tile: { label: 'Tap', icon: 'target' },
  drag: { label: 'Draw', icon: 'brush' },
  global: { label: 'World', icon: 'globe' },
};

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

function magnitudeLabel(v: number): string {
  if (v < 0.75) return 'Gentle';
  if (v < 1.25) return 'Severe';
  if (v < 1.75) return 'Biblical';
  return 'Cataclysmic';
}

/** Danger pips: 5 bars filled to the power's rating (or a sparkle for blessings). */
function Danger({ n, kind }: { n: number; kind?: boolean }) {
  if (n <= 0)
    return (
      <span class="gd-danger is-kind" title={kind ? 'Benevolent' : 'Harmless'}>
        <Icon name={kind ? 'sparkles' : 'check'} size={12} />
        <span>{kind ? 'Blessing' : 'Harmless'}</span>
      </span>
    );
  return (
    <span class={'gd-danger lv-' + n} title={DANGER[n]} aria-label={`Danger: ${DANGER[n]}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} class={i <= n ? 'on' : ''} />
      ))}
      <span>{DANGER[n]}</span>
    </span>
  );
}

async function cast(p: GodPowerDef): Promise<void> {
  const god = game.god;
  const lock = god.locked(p.id);
  if (lock) {
    uiSound('error');
    notify({ title: `${p.name} is sealed`, body: lock, kind: 'info', icon: 'lock' });
    return;
  }
  const cd = god.cooldownLeft(p.id);
  if (cd > 0) {
    uiSound('error');
    notify({ title: `${p.name} is recharging`, body: `Ready in ${fmtDuration(Math.ceil(cd))}`, kind: 'info', icon: 'hourglass' });
    return;
  }
  if (p.targeting === 'global') {
    if (p.planetEnding || p.confirm) {
      const ok = await confirmDialog({
        title: `Unleash ${p.name}?`,
        body: p.planetEnding ? `${p.description} This world will not survive — though time can be rewound.` : `${p.description} This will hurt.`,
        okLabel: p.planetEnding ? 'End this world' : 'Unleash',
        danger: true,
      });
      if (!ok) return;
    }
    ui.panel.value = null;
    uiSound('magic');
    if (!god.trigger(p.id, {})) notify({ title: 'The heavens hesitate', body: `${p.name} can't be cast right now.`, kind: 'info', icon: 'god' });
    return;
  }
  ui.panel.value = null;
  uiSound('magic');
  const tools = game.tools as unknown as { tools?: Record<string, unknown>; select?: (s: unknown) => void };
  if (tools?.tools?.god && typeof tools.select === 'function') tools.select({ id: 'god', powerId: p.id, label: p.name });
  else armFallback(p);
}

function Choices({ p }: { p: GodPowerDef }) {
  const list = p.choices ?? [];
  const cur = godUi.choice.value[p.id] ?? list[0]?.id;
  return (
    <div class="gd-choices scroll-x" role="radiogroup" aria-label={`${p.name} variant`}>
      {list.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={cur === c.id}
          class={'gd-choice' + (cur === c.id ? ' is-on' : '')}
          onClick={() => {
            uiSound('tap');
            godUi.choice.value = { ...godUi.choice.value, [p.id]: c.id };
          }}
        >
          {c.icon && <Icon name={c.icon} size={14} />}
          <span>{c.label}</span>
        </button>
      ))}
    </div>
  );
}

function PowerCard({ p, now }: { p: GodPowerDef; now: number }) {
  const god = game.god;
  void ui.tier.value;
  void ui.mode.value;
  const lock = god.locked(p.id);
  const until = godUi.cooldowns.value[p.id] ?? 0;
  const cd = game.empire.sandbox ? 0 : Math.max(0, (until - now) / 1000);
  const color = hex(p.color ?? CATEGORY_COLOR[p.category]);
  const t = TARGET[p.targeting];
  const recent = godUi.recent.value[0] === p.id;
  const wide = !!p.choices?.length;
  return (
    <div class={'gd-cell' + (wide ? ' is-wide' : '')} style={{ '--gd-c': color } as never}>
      <button
        type="button"
        class={'gd-card' + (lock ? ' is-locked' : '') + (cd > 0 ? ' is-cooling' : '') + (p.planetEnding ? ' is-end' : '') + (recent ? ' is-recent' : '')}
        onClick={() => void cast(p)}
        aria-label={`${p.name}. ${t.label} to cast. ${p.description}${lock ? ' Locked: ' + lock : ''}`}
      >
        <span class="gd-card-top">
          <span class="gd-icon">
            <IconOrEmoji value={p.icon} size={24} />
          </span>
          <span class="gd-head">
            <span class="gd-name">{p.name}</span>
            <span class="gd-meta">
              <Danger n={p.planetEnding ? 5 : p.danger ?? 0} kind={p.category === 'creation'} />
              <span class="gd-target" title={t.label}>
                <Icon name={t.icon} size={12} />
                {t.label}
              </span>
            </span>
          </span>
        </span>
        <span class="gd-desc">{p.description}</span>
        {p.flavor && <span class="gd-flavor">{p.flavor}</span>}
        {lock && (
          <span class="gd-veil">
            <Icon name="lock" size={18} />
            <span>{lock}</span>
          </span>
        )}
        {!lock && cd > 0 && (
          <span class="gd-veil is-cd">
            <Icon name="hourglass" size={18} />
            <span class="num">{fmtDuration(Math.ceil(cd))}</span>
          </span>
        )}
      </button>
      {wide && !lock && <Choices p={p} />}
    </div>
  );
}

function ChronoCard() {
  const snap = godUi.snapshot.value;
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 15000);
    return () => clearInterval(id);
  }, []);
  if (!snap) return null;
  const ago = Math.max(0, (performance.now() - snap.at) / 1000);
  return (
    <div class="gd-chrono">
      <span class="gd-chrono-icon">
        <Icon name="rewind" size={22} />
      </span>
      <span class="gd-chrono-text">
        <b>Chrono insurance</b>
        <span class="ellipsis">
          Undo the {snap.name} · {ago < 60 ? 'just now' : fmtDuration(Math.round(ago)) + ' ago'}
        </span>
      </span>
      <Button size="sm" variant="primary" icon="rewind" sound="open" onClick={() => void game.god.chrono.rewind()}>
        Rewind
      </Button>
    </div>
  );
}

function ActiveStrip() {
  const act = godUi.active.value;
  if (!act.length) return null;
  return (
    <div class="gd-active">
      <span class="gd-active-label">Unfolding</span>
      <div class="gd-active-chips scroll-x">
        {act.map((a) => (
          <Chip key={a.key} icon={a.icon} size="sm" tone="warn">
            {a.name}
          </Chip>
        ))}
      </div>
      <Button size="sm" variant="ghost" icon="close" onClick={() => game.god.stopAll()} title="Stop every running power">
        Calm
      </Button>
    </div>
  );
}

export function GodPanel(_: { onClose: () => void }) {
  const tab = (godUi.tab.value as GodCategory) || 'weather';
  const cat = CATEGORIES.find((c) => c.id === tab) ?? CATEGORIES[0];
  const powers = game.god.powers.filter((p) => p.category === cat.id);
  const [now, setNow] = useState(performance.now());
  const cooling = !game.empire.sandbox && Object.values(godUi.cooldowns.value).some((u) => u > now);
  useEffect(() => {
    if (!cooling) return;
    const id = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(id);
  }, [cooling]);
  const k = godUi.intensity.value;
  const color = hex(CATEGORY_COLOR[cat.id]);
  const sandbox = ui.mode.value === 'sandbox';
  return (
    <div class={'gd-panel cat-' + cat.id} style={{ '--gd-c': color } as never}>
      <ChronoCard />
      <ActiveStrip />
      <Tabs
        tabs={CATEGORIES.map((c) => ({ id: c.id, label: c.label, icon: c.icon }))}
        value={cat.id}
        onChange={(id) => {
          uiSound('tap');
          godUi.tab.value = id;
        }}
        ariaLabel="Power categories"
        class="gd-tabs"
      />
      <div class="gd-intro">
        <span class="gd-blurb">{cat.blurb}</span>
        <Slider
          value={k}
          min={0.5}
          max={2}
          step={0.05}
          ticks={[0.5, 1, 1.5, 2]}
          label="Magnitude"
          icon="sliders"
          color={color}
          format={(v) => `${magnitudeLabel(v)} ×${v.toFixed(1)}`}
          onChange={(v) => (godUi.intensity.value = v)}
        />
      </div>
      <div class="gd-grid">
        {powers.map((p) => (
          <PowerCard key={p.id} p={p} now={now} />
        ))}
      </div>
      <p class="gd-foot muted">
        {sandbox ? 'Sandbox: every power is free and recharges instantly. ' : 'Career: powers unlock as your civilisation grows and need time to recharge. '}
        Destructive powers are covered by Chrono — you can rewind a catastrophe.
      </p>
    </div>
  );
}
