/**
 * OWNER: ui-panels.
 * Help panel ('help') — How to play (twelve illustrated sections), the touch gesture guide drawn as inline SVG
 * (gestures from input/shortcuts GESTURES), keyboard shortcuts (input/shortcuts SHORTCUTS) and tips: the live
 * advisor plus hand-picked tricks, with a "Replay tutorial" button.
 */
import { useState } from 'preact/hooks';
import { GESTURES, SHORTCUTS, type ShortcutDef } from '../../input/shortcuts';
import { game } from '../../game/instance';
import { setSettings } from '../../core/settings';
import { Button, Icon, IconOrEmoji, Kbd, SectionHeader, Segmented } from '../core';
import { closePanel, viewport } from '../core/env';
import { ui } from '../store';
import { safe } from './common';
import { helpTab, tutorialRequest } from './state';

type Tab = 'basics' | 'gestures' | 'keys' | 'tips';

const BASICS: { icon: string; title: string; body: string; tone: string }[] = [
  { icon: 'roads', title: 'Roads come first', body: 'Every city starts with a road. Drag to draw, or tap a start and an end to chain segments. Avenues and highways carry more traffic.', tone: 'accent' },
  { icon: 'zones', title: 'Paint the zones', body: 'Residential (green), Commercial (blue), Industrial (amber) and Office (violet) along your roads. Buildings grow on their own when there is demand.', tone: 'good' },
  { icon: 'power', title: 'Keep the lights on', body: 'Lots need power and water to develop — and oxygen on airless worlds. Plants feed everything connected by road.', tone: 'warn' },
  { icon: 'services', title: 'Services & coverage', body: 'Police, fire, health, schools and parks cover a radius. The placement ghost shows exactly who they reach.', tone: 'info' },
  { icon: 'budget', title: 'Mind the money', body: 'Taxes in, upkeep out. Tap the treasury to open the budget. Red numbers are a vibe, not a strategy.', tone: 'money' },
  { icon: 'chart', title: 'Read the demand', body: 'The R · C · I · O bars show what the city wants next. City Hall explains why — and what is blocking growth.', tone: 'violet' },
  { icon: 'crown', title: 'Climb the tiers', body: 'Population unlocks tiers; tiers unlock buildings, policies, god powers — and the rest of the universe.', tone: 'money' },
  { icon: 'district', title: 'Districts & policies', body: 'Name neighbourhoods, give them their own architecture and their own laws. Free transit downtown, curfew in the suburbs.', tone: 'accent' },
  { icon: 'lens', title: 'Data lenses', body: 'Paint the planet with power, pollution, land value, traffic and twenty more maps. Problems become obvious.', tone: 'info' },
  { icon: 'rocket', title: 'Reach for space', body: 'Build a spaceport to reach your moon, then colonise planets, star systems and whole galaxies. Colonies keep growing while you are away.', tone: 'violet' },
  { icon: 'god', title: 'Play god', body: 'Tornadoes, meteors, tsunamis, black holes. Shelters and shield generators protect your city. Mostly.', tone: 'bad' },
  { icon: 'camera', title: 'Show it off', body: 'Photo mode hides the interface, grades the colours and captures postcards worth framing.', tone: 'good' },
];

const TIPS: { icon: string; text: string }[] = [
  { icon: '🛣️', text: 'Put homes a block away from industry: pollution and noise travel, commutes don’t mind.' },
  { icon: '🌳', text: 'Parks raise land value around them — and high land value lets buildings level up.' },
  { icon: '🚌', text: 'Gridlock? Upgrade the red roads to avenues, or let a maglev take the strain.' },
  { icon: '💸', text: 'Short on cash? Lean service budgets for a month beat a loan from a shark.' },
  { icon: '🏛️', text: 'Landmarks and wonders pull tourists from across the system — tourists spend.' },
  { icon: '🧭', text: 'Tap any notification with a location to fly straight there.' },
  { icon: '🎨', text: 'Give each district its own style. A solarpunk quarter next to a cyber strip is very photogenic.' },
  { icon: '🛡️', text: 'Before you summon a meteor shower, build a shield generator. Ask us how we know.' },
  { icon: '⏩', text: 'Ludicrous speed is great for watching growth — terrible for noticing fires.' },
  { icon: '📸', text: 'Golden hour plus the Cinematic grade and a little tilt-shift makes any city look like a model railway.' },
];

/** Inline SVG illustration for a touch gesture. */
function GestureArt({ kind }: { kind: string }) {
  const finger = (x: number, y: number, k: string) => (
    <g key={k}>
      <circle cx={x} cy={y} r="7" class="ga-touch" />
      <circle cx={x} cy={y} r="3.2" class="ga-dot" />
    </g>
  );
  const arrow = (d: string, k: string) => <path key={k} d={d} class="ga-arrow" marker-end="url(#ga-head)" />;
  const ripple = (x: number, y: number, k: string) => (
    <g key={k}>
      <circle cx={x} cy={y} r="11" class="ga-ripple" />
      <circle cx={x} cy={y} r="15.5" class="ga-ripple ga-ripple-2" />
    </g>
  );
  let body;
  switch (kind) {
    case 'pinch':
      body = [finger(20, 44, 'a'), finger(44, 20, 'b'), arrow('M18 46 L10 54', 'c'), arrow('M46 18 L54 10', 'd')];
      break;
    case 'twist':
      body = [<path key="o" d="M16 32 A16 16 0 0 1 32 16" class="ga-arrow" marker-end="url(#ga-head)" />, <path key="p" d="M48 32 A16 16 0 0 1 32 48" class="ga-arrow" marker-end="url(#ga-head)" />, finger(20, 44, 'a'), finger(44, 20, 'b')];
      break;
    case 'tilt':
      body = [finger(24, 38, 'a'), finger(40, 38, 'b'), arrow('M24 28 L24 12', 'c'), arrow('M40 28 L40 12', 'd')];
      break;
    case 'doubletap':
      body = [ripple(32, 34, 'r'), finger(32, 34, 'a'), <text key="t" x="46" y="18" class="ga-text">×2</text>];
      break;
    case 'twotap':
      body = [ripple(24, 34, 'r1'), ripple(42, 34, 'r2'), finger(24, 34, 'a'), finger(42, 34, 'b')];
      break;
    case 'onehand':
      body = [ripple(32, 26, 'r'), finger(32, 26, 'a'), arrow('M32 36 L32 54', 'c'), <text key="t" x="44" y="16" class="ga-text">×2</text>];
      break;
    case 'longpress':
      body = [<circle key="ring" cx="32" cy="32" r="14" class="ga-hold" />, finger(32, 32, 'a')];
      break;
    case 'draw':
      body = [<path key="p" d="M10 46 C18 20, 30 52, 40 28 S52 16, 54 20" class="ga-path" />, finger(54, 20, 'a')];
      break;
    case 'roads':
      body = [<path key="p" d="M14 48 L32 30 L50 18" class="ga-path ga-dashed" />, finger(14, 48, 'a'), finger(50, 18, 'b'), <circle key="m" cx="32" cy="30" r="3" class="ga-dot" />];
      break;
    case 'move':
      body = [<rect key="b" x="16" y="30" width="14" height="18" rx="2" class="ga-bld" />, <rect key="g" x="36" y="16" width="14" height="18" rx="2" class="ga-bld ga-ghost" />, arrow('M30 34 L38 28', 'c'), finger(23, 39, 'a')];
      break;
    default:
      body = [finger(22, 40, 'a'), <path key="t" d="M22 40 L44 22" class="ga-trail" />, arrow('M30 34 L46 20', 'c')];
  }
  return (
    <svg class="ga" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
      <defs>
        <marker id="ga-head" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" class="ga-head" />
        </marker>
      </defs>
      <rect x="3" y="3" width="58" height="58" rx="14" class="ga-screen" />
      {body}
    </svg>
  );
}

function gestureKind(g: string): string {
  const s = g.toLowerCase();
  if (s.includes('hold & slide')) return 'onehand';
  if (s.includes('pinch')) return 'pinch';
  if (s.includes('twist')) return 'twist';
  if (s.includes('up / down') || s.includes('tilt')) return 'tilt';
  if (s.includes('two-finger tap')) return 'twotap';
  if (s.includes('double')) return 'doubletap';
  if (s.includes('long-press a building')) return 'move';
  if (s.includes('long')) return 'longpress';
  if (s.includes('drawing')) return 'draw';
  if (s.includes('road')) return 'roads';
  return 'drag';
}

function Basics() {
  return (
    <div class="up-help-grid">
      {BASICS.map((b) => (
        <section key={b.title} class="up-card up-help-card">
          <span class={'up-help-icon tone-' + b.tone}>
            <Icon name={b.icon} size={22} />
          </span>
          <div>
            <h4 class="up-help-title">{b.title}</h4>
            <p class="up-help-body">{b.body}</p>
          </div>
        </section>
      ))}
    </div>
  );
}

function Gestures() {
  return (
    <div class="up-help-grid">
      {GESTURES.map((g) => (
        <section key={g.gesture} class="up-card up-gesture">
          <GestureArt kind={gestureKind(g.gesture)} />
          <div>
            <h4 class="up-help-title">{g.gesture}</h4>
            <p class="up-help-body">{g.label}</p>
          </div>
        </section>
      ))}
    </div>
  );
}

function Keys() {
  const groups = new Map<string, ShortcutDef[]>();
  for (const s of SHORTCUTS) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group)!.push(s);
  }
  return (
    <div class="up-stack-v">
      {viewport.value.touch && <p class="up-footnote">Got a keyboard attached to your iPad? All of these work there too.</p>}
      <div class="up-keys-grid">
        {[...groups.entries()].map(([g, list]) => (
          <section key={g} class="up-card up-keys">
            <h4 class="up-keys-title">{g}</h4>
            {list.map((s) => (
              <div key={s.label} class="up-key-row">
                <span class="up-key-combo">
                  {s.keys.map((k, i) => (
                    <span key={k + i} class="up-key-part">
                      {i > 0 && s.keys.length > 1 && /Ctrl|Shift|Cmd/.test(s.keys[0]) ? <span class="dim">+</span> : null}
                      <Kbd>{k}</Kbd>
                    </span>
                  ))}
                </span>
                <span class="up-key-label">{s.label}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function Tips() {
  const advice = safe(() => game.sim.advisor(), []);
  return (
    <div class="up-stack-v">
      {ui.screen.value === 'game' && advice.length > 0 && (
        <>
          <SectionHeader title="Right now" icon="info" subtitle="Your advisor looked at the city" />
          {advice.map((t, i) => (
            <section key={i} class={'up-card up-tip tone-' + t.tone}>
              <span class="up-tip-icon">{t.icon}</span>
              <span class="grow">{t.text}</span>
            </section>
          ))}
        </>
      )}
      <SectionHeader title="Tricks of the trade" icon="sparkles" />
      <div class="up-help-grid">
        {TIPS.map((t) => (
          <section key={t.text} class="up-card up-tip">
            <span class="up-tip-icon">
              <IconOrEmoji value={t.icon} size={20} />
            </span>
            <span class="grow">{t.text}</span>
          </section>
        ))}
      </div>
      {ui.screen.value === 'game' && ui.mode.value === 'career' && (
        <Button
          variant="glass"
          icon="play"
          block
          onClick={() => {
            setSettings({ tutorial: true });
            tutorialRequest.value++;
            closePanel();
          }}
        >
          Replay the tutorial
        </Button>
      )}
    </div>
  );
}

export function HelpPanel() {
  const [tab, setTab] = useState<Tab>(helpTab.value);
  const go = (t: Tab) => {
    helpTab.value = t;
    setTab(t);
  };
  return (
    <div class="up-root up-help">
      <Segmented
        block
        sound="tap"
        value={tab}
        onChange={go}
        ariaLabel="Help sections"
        options={[
          { value: 'basics', label: 'Basics' },
          { value: 'gestures', label: 'Gestures' },
          { value: 'keys', label: 'Keys' },
          { value: 'tips', label: 'Tips' },
        ]}
      />
      {tab === 'basics' ? <Basics /> : tab === 'gestures' ? <Gestures /> : tab === 'keys' ? <Keys /> : <Tips />}
    </div>
  );
}
