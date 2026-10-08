/**
 * OWNER: ui-panels.
 * First-run tutorial overlay ('tutorial') — coach marks for a brand-new career city:
 *   welcome → draw a road → zone homes → add shops & industry → power & water → speed up → watch it grow → open goals
 * Each step highlights the control to use (a glowing ring around the dock / top-bar / rail button) and advances on
 * its own when the city state says the job is done (roads, zones, utility supply, clock speed, population, panel).
 * While a build sheet, panel or tool is open the card folds into a small pill under the top bar so it never covers
 * the work. Skippable at any time; honours settings.tutorial. Progress lives in empire.s.ext['ui-panels.tutorial']
 * so it survives saves; the help panel can replay it (state.tutorialRequest). Test param: &tutorial=1.
 */
import { effect, signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { bus } from '../../core/events';
import { setSettings, settings } from '../../core/settings';
import { Zone } from '../../core/types';
import { game } from '../../game/instance';
import { Icon } from '../core';
import { uiSound, viewport } from '../core/env';
import { ui } from '../store';
import { planet, safe, useLive } from './common';
import { tutorialRequest } from './state';

const EXT_KEY = 'ui-panels.tutorial';
const GROW_TARGET = 60;

interface TutState {
  step: number;
  done: boolean;
}

interface Step {
  id: string;
  icon: string;
  title: string;
  body: string;
  /** short instruction for the folded pill */
  short: string;
  target?: string;
  check?: () => boolean;
  /** manual advance button label */
  next?: string;
  progress?: () => [number, number];
}

function anyZone(test: (z: number) => boolean): boolean {
  const p = planet();
  if (!p) return false;
  const z = p.zone;
  for (let i = 0; i < z.length; i++) if (z[i] && test(z[i])) return true;
  return false;
}

function anyRoad(): boolean {
  const p = planet();
  if (!p) return false;
  const r = p.road;
  for (let i = 0; i < r.length; i++) if (r[i]) return true;
  return false;
}

const isR = (z: number) => z >= Zone.ResLow && z <= Zone.ResHigh;
const isC = (z: number) => z >= Zone.ComLow && z <= Zone.ComLeisure;
const isI = (z: number) => z >= Zone.IndGeneral && z <= Zone.IndTech;

let sawFast = false;

const STEPS: Step[] = [
  {
    id: 'welcome',
    icon: 'crown',
    title: 'Welcome, Mayor',
    body: 'This patch of planet is yours. Let’s turn it into a city — it takes about two minutes, and nobody is grading you. Yet.',
    short: 'Welcome!',
    next: 'Let’s build',
  },
  {
    id: 'road',
    icon: 'roads',
    title: 'Lay the first road',
    body: 'Tap Roads, then drag across the ground — or tap a start point and an end point. Every city begins with a street.',
    short: 'Draw a road: drag across the ground',
    target: '.dk-btn[aria-label="Roads"]',
    check: anyRoad,
  },
  {
    id: 'res',
    icon: 'home',
    title: 'Somewhere to live',
    body: 'Tap Zones, pick Residential and paint the lots along your road. Houses grow there by themselves.',
    short: 'Paint green Residential by the road',
    target: '.dk-btn[aria-label="Zones"]',
    check: () => anyZone(isR),
  },
  {
    id: 'ci',
    icon: 'shop',
    title: 'Shops and jobs',
    body: 'New residents need work and somewhere to spend it. Paint some Commercial and some Industrial — keep the factories a little away from homes.',
    short: 'Paint blue Commercial and amber Industrial',
    target: '.dk-btn[aria-label="Zones"]',
    check: () => anyZone(isC) && anyZone(isI),
  },
  {
    id: 'utilities',
    icon: 'power',
    title: 'Power and water',
    body: 'Nothing grows in the dark. Open Build, place a power plant and a water tower (pumps go on the shore) next to your road.',
    short: 'Build → power plant + water tower',
    target: '.dk-btn[aria-label="Build"]',
    check: () => {
      const st = ui.stats.value;
      const free = st.utilitiesFree ?? 0;
      return ((st.powerSupply ?? 0) > 0 || !!(free & 1)) && ((st.waterSupply ?? 0) > 0 || !!(free & 2));
    },
  },
  {
    id: 'speed',
    icon: 'fastForward',
    title: 'Speed up time',
    body: 'Cities take a while. Tap the speed control up top and pick a faster speed. You can always pause when things get exciting.',
    short: 'Tap the speed control to go faster',
    target: '.tb-time',
    check: () => sawFast || ui.speed.value >= 2,
  },
  {
    id: 'grow',
    icon: 'population',
    title: 'Watch it grow',
    body: 'Moving vans are on their way. Watch the first citizens arrive — the top bar counts every one of them.',
    short: 'Waiting for your first citizens…',
    check: () => ui.population.value >= GROW_TARGET,
    progress: () => [Math.min(GROW_TARGET, ui.population.value), GROW_TARGET],
  },
  {
    id: 'goals',
    icon: 'trophy',
    title: 'Set your sights higher',
    body: 'Goals turn a town into an empire: tiers unlock new buildings, policies, god powers — and other planets. Open Goals to see what’s next.',
    short: 'Open Goals on the left rail',
    target: '.rl-btn[aria-label="Goals"]',
    check: () => ui.panel.value === 'goals',
  },
  {
    id: 'done',
    icon: 'sparkles',
    title: 'You’re a natural',
    body: 'That’s the loop: roads, zones, services, growth. Explore the build menu, try the data lenses, and when you are ready — the stars. Help is always under the ? button.',
    short: 'Tutorial complete',
    next: 'Let’s go!',
  },
];

/** live tutorial state (null = inactive) */
const active = signal<TutState | null>(null);

function stored(): TutState | null {
  return safe(() => (game.empire.s.ext[EXT_KEY] as TutState | undefined) ?? null, null);
}

function store(s: TutState): void {
  safe(() => (game.empire.s.ext[EXT_KEY] = { ...s }), undefined);
}

function finish(skipped: boolean): void {
  const cur = active.value;
  store({ step: cur?.step ?? 0, done: true });
  active.value = null;
  uiSound(skipped ? 'close' : 'milestone');
}

function start(step = 0): void {
  sawFast = false;
  const s = { step, done: false };
  store(s);
  active.value = s;
}

/** Decide whether a freshly loaded city should get the tutorial. */
function consider(): void {
  if (ui.screen.value !== 'game' || ui.mode.value !== 'career' || !settings.value.tutorial) return;
  const st = stored();
  if (st) {
    active.value = st.done ? null : st;
    return;
  }
  const p = planet();
  if (!p) return;
  const fresh = p.buildings.size === 0 && !anyRoad();
  if (fresh) start(0);
  else store({ step: STEPS.length - 1, done: true });
}

let timer: ReturnType<typeof setTimeout> | undefined;
bus.on('planet:loaded', () => {
  clearTimeout(timer);
  active.value = null;
  timer = setTimeout(consider, 1200);
});
effect(() => {
  if (!settings.value.tutorial && active.value) active.value = null;
});
effect(() => {
  if (ui.screen.value !== 'game') active.value = null;
});
let lastReq = 0;
effect(() => {
  const r = tutorialRequest.value;
  if (r === lastReq) return;
  lastReq = r;
  setTimeout(() => {
    if (ui.screen.value === 'game') start(0);
  }, 350);
});
if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('tutorial') === '1') {
  const off = bus.on('planet:loaded', () => {
    off();
    setTimeout(() => {
      setSettings({ tutorial: true });
      start(Number(new URLSearchParams(location.search).get('tutorialStep') ?? 0) || 0);
    }, 1500);
  });
}

/** CSS zoom of the app shell (settings.uiScale) — overlay coordinates live in zoomed CSS pixels. */
function uiScale(): number {
  const k = settings.value.uiScale || 1;
  return Math.abs(k - 1) > 0.01 ? k : 1;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function measure(sel?: string): Rect | null {
  if (!sel) return null;
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  const k = uiScale();
  return { x: r.left / k, y: r.top / k, w: r.width / k, h: r.height / k };
}

export function Tutorial() {
  useLive(500);
  const st = active.value;
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (st && ui.speed.value >= 2) sawFast = true;
  });
  // auto-advance: evaluated on every (500 ms) render, but the pending advance timer only restarts when the
  // step or its completion changes — re-rendering must not cancel it (it did, so steps never advanced at 60 fps)
  const curStep = st ? STEPS[st.step] : undefined;
  let stepDone = false;
  if (st && curStep?.check) {
    try {
      stepDone = curStep.check();
    } catch {
      stepDone = false;
    }
  }
  useEffect(() => {
    if (!st || !stepDone) return;
    const t = setTimeout(() => {
      uiSound('chime');
      const n = { step: st.step + 1, done: st.step + 1 >= STEPS.length };
      if (n.done) finish(false);
      else {
        store(n);
        active.value = n;
        setPulse((x) => x + 1);
      }
    }, 650);
    return () => clearTimeout(t);
  }, [st?.step, stepDone]);
  if (!st || ui.screen.value !== 'game' || ui.view.value !== 'planet' || ui.photo.value || ui.chromeHidden.value) return null;
  const step = STEPS[st.step];
  if (!step) return null;
  // fold into the pill while the player works: panels, sheets, tools, the inspector, the More menu or any modal
  const overlayOpen = typeof document !== 'undefined' && !!document.querySelector('.cz-modal-root.is-shown, .cz-sheet-root.is-shown');
  const busy = !!ui.panel.value || !!ui.category.value || !!ui.tool.value || !!ui.selection.value || overlayOpen;
  // waiting steps (nothing to tap, nothing to confirm) never cover the city — they show as the pill
  const waiting = !step.target && !step.next;
  const vp0 = viewport.value;
  const k = uiScale();
  const vp = { w: vp0.w / k, h: vp0.h / k, landscapePhone: vp0.landscapePhone };
  const prog = step.progress?.();
  if ((busy || waiting) && step.id !== 'goals') {
    // a sheet or modal owns the screen: stay out of its way entirely
    if (step.next || overlayOpen) return null;
    return (
      <div class="tu-pill pe" role="status">
        <span class="tu-pill-icon">
          <Icon name={step.icon} size={15} />
        </span>
        <span class="tu-pill-text">{step.short}</span>
        <button type="button" class="tu-pill-skip" aria-label="Skip tutorial" onClick={() => finish(true)}>
          <Icon name="close" size={14} />
        </button>
      </div>
    );
  }
  const r = measure(step.target);
  const W = Math.min(360, vp.w - 24);
  let style: Record<string, string> = {};
  let arrow: Record<string, string> | null = null;
  let below = false;
  if (r) {
    const cx = r.x + r.w / 2;
    const left = Math.max(12, Math.min(vp.w - W - 12, cx - W / 2));
    below = r.y + r.h / 2 < vp.h / 2;
    style = below ? { left: left + 'px', top: r.y + r.h + 16 + 'px', width: W + 'px' } : { left: left + 'px', bottom: vp.h - r.y + 16 + 'px', width: W + 'px' };
    arrow = { left: Math.max(18, Math.min(W - 18, cx - left)) + 'px' };
  } else {
    style = { left: (vp.w - W) / 2 + 'px', top: vp.landscapePhone ? '18%' : '30%', width: W + 'px' };
  }
  const total = STEPS.length - 2;
  const idx = Math.max(1, Math.min(total, st.step));
  return (
    <>
      {!r && <div class="tu-scrim" aria-hidden="true" />}
      {r && <div class="tu-ring" style={{ left: r.x - 6 + 'px', top: r.y - 6 + 'px', width: r.w + 12 + 'px', height: r.h + 12 + 'px' }} aria-hidden="true" />}
      <div key={st.step + ':' + pulse} class={'tu-card pe glass-strong' + (below ? ' is-below' : r ? ' is-above' : ' is-center')} style={style} role="dialog" aria-label={step.title}>
        {arrow && <span class={'tu-arrow' + (below ? ' is-up' : '')} style={arrow} aria-hidden="true" />}
        <div class="tu-head">
          <span class="tu-icon">
            <Icon name={step.icon} size={20} />
          </span>
          <div class="grow">
            {step.id !== 'welcome' && step.id !== 'done' && <div class="tu-step num">Step {idx} of {total}</div>}
            <div class="tu-title">{step.title}</div>
          </div>
        </div>
        <p class="tu-body">{step.body}</p>
        {prog && (
          <div class="tu-prog">
            <span style={{ transform: `scaleX(${prog[0] / prog[1]})` }} />
          </div>
        )}
        <div class="tu-actions">
          {step.id !== 'done' && (
            <button type="button" class="tu-skip" onClick={() => finish(true)}>
              Skip tutorial
            </button>
          )}
          {step.next && (
            <button
              type="button"
              class="tu-next"
              onClick={() => {
                if (step.id === 'done') finish(false);
                else {
                  uiSound('click');
                  const n = { step: st.step + 1, done: false };
                  store(n);
                  active.value = n;
                }
              }}
            >
              {step.next}
              <Icon name="chevronRight" size={16} />
            </button>
          )}
        </div>
        {step.id !== 'welcome' && step.id !== 'done' && (
          <div class="tu-dots" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <i key={i} class={i + 1 < idx ? 'is-done' : i + 1 === idx ? 'is-now' : ''} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
