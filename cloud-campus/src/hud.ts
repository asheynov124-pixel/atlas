import type { Actor } from './actor';
import { slotsFor, traitsFor } from './powers';
import { ROSTER } from './roster';
import type { CharacterDef, PropType } from './types';
import { ACTOR_CAP, PROP_CAP, type World } from './world';

export interface HudHooks {
  possess(a: Actor): void;
  despawn(a: Actor): void;
  spawnDef(def: CharacterDef): void;
  spawnProp(type: PropType): void;
  reset(): void;
  core(): void;
  debug(): void;
  rowdy(): void;
}

const SPAWNABLE_PROPS: { type: PropType; label: string; note: string }[] = [
  { type: 'crate', label: 'Crate', note: 'Stackable, throwable, flammable' },
  { type: 'ball', label: 'Gym ball', note: 'Very bouncy' },
  { type: 'table', label: 'Cafeteria table', note: 'Heavy; Ethan can slide under' },
  { type: 'chair', label: 'Chair', note: 'Light and tumbly' },
  { type: 'mat', label: 'Gym mat', note: 'Grippy, soft landing' },
  { type: 'dummy', label: 'Training dummy', note: 'Practice target' },
  { type: 'tray', label: 'Lunch tray', note: 'Frisbee energy' },
];

const $ = (id: string) => document.getElementById(id)!;

function el(tag: string, cls = '', html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** DOM overlay: top bar, possessed-character panel, spawn strip, spawn menu, help, toasts. */
export class Hud {
  menuOpen = false;
  private stripSig = '';
  private slotSig = '';
  private cdEls: HTMLElement[] = [];
  private statusEl: HTMLElement | null = null;
  private btn: Record<string, HTMLButtonElement> = {};
  private helpTimer = 0;

  constructor(private hooks: HudHooks) {
    const buttons = $('buttons');
    const mk = (key: string, kbd: string, label: string, fn: () => void) => {
      const b = el('button', 'chip', `<kbd>${kbd}</kbd>${label}`) as HTMLButtonElement;
      b.addEventListener('click', () => { fn(); b.blur(); });
      buttons.appendChild(b);
      this.btn[key] = b;
    };
    mk('menu', 'Tab', 'Spawn', () => this.toggleMenu());
    mk('core', 'G', 'Core', () => hooks.core());
    mk('rowdy', 'T', 'Rowdy NPCs', () => hooks.rowdy());
    mk('debug', '`', 'Debug', () => hooks.debug());
    mk('reset', 'R', 'Reset', () => hooks.reset());
    mk('help', 'H', 'Help', () => this.toggleHelp());
    this.buildMenu();
    this.buildHelp();
  }

  toast(msg: string) {
    const box = $('toasts');
    for (const c of Array.from(box.children)) if (c.textContent === msg) c.remove();
    const t = el('div', 'toast', msg);
    box.appendChild(t);
    while (box.children.length > 3) box.firstChild?.remove();
    setTimeout(() => t.remove(), 3300);
  }

  toggleMenu(force?: boolean) {
    this.menuOpen = force ?? !this.menuOpen;
    $('menu').classList.toggle('hidden', !this.menuOpen);
    this.btn.menu.classList.toggle('on', this.menuOpen);
  }

  toggleHelp(force?: boolean) {
    const h = $('help');
    const show = force ?? h.classList.contains('hidden');
    h.classList.toggle('hidden', !show);
    this.btn.help.classList.toggle('on', show);
    this.helpTimer = 0;
  }

  private buildHelp() {
    $('help').innerHTML = `
      <h3>Cloud Campus Sandbox</h3>
      <table>
        <tr><td>A / D · ← →</td><td>move</td></tr>
        <tr><td>Space</td><td>jump (fliers rise while held)</td></tr>
        <tr><td>Mouse</td><td>aim</td></tr>
        <tr><td>J · left click</td><td>primary power</td></tr>
        <tr><td>K · right click</td><td>secondary power</td></tr>
        <tr><td>Q / E · strip</td><td>possess someone else</td></tr>
        <tr><td>Tab</td><td>spawn menu</td></tr>
        <tr><td>G</td><td>toggle the anti-gravity core</td></tr>
        <tr><td>R · \`</td><td>reset scene · debug draw</td></tr>
      </table>
      <div class="try">Try: as Will, click a crate to grab it, click again to throw. Hold Space to fly up with it.
      Then press G. Then find the power cell (Gwen can hijack lockers; Zach and Nurse Spex can spot it).</div>`;
  }

  private buildMenu() {
    const m = $('menu');
    m.innerHTML = `<h2>Spawn</h2><p>Drops in just ahead of whoever you're possessing. Tab or Esc closes. Max ${ACTOR_CAP} characters, ${PROP_CAP} props.</p>`;
    const roles: [string, string][] = [['hero', 'Heroes'], ['sidekick', 'Sidekicks'], ['villain', 'Villains'], ['faculty', 'Faculty']];
    for (const [role, title] of roles) {
      m.appendChild(el('h4', '', title));
      const grid = el('div', 'grid');
      for (const d of ROSTER.filter((r) => r.role === role)) {
        const b = el('button', 'spawn', `
          <div class="n"><span class="dot" style="background:${d.color}"></span>${d.name}</div>
          <div class="d">${d.blurb}</div>
          <div class="p">${slotsFor(d).map((s, i) => `${i ? 'K' : 'J'}: ${s.name}`).join(' · ')}</div>`);
        b.addEventListener('click', () => { this.hooks.spawnDef(d); (b as HTMLButtonElement).blur(); });
        grid.appendChild(b);
      }
      m.appendChild(grid);
    }
    m.appendChild(el('h4', '', 'Props'));
    const grid = el('div', 'grid');
    for (const p of SPAWNABLE_PROPS) {
      const b = el('button', 'spawn', `<div class="n">${p.label}</div><div class="d">${p.note}</div>`);
      b.addEventListener('click', () => { this.hooks.spawnProp(p.type); (b as HTMLButtonElement).blur(); });
      grid.appendChild(b);
    }
    m.appendChild(grid);
  }

  update(w: World, debug: boolean, dt: number) {
    this.helpTimer += dt;
    if (this.helpTimer > 20 && !$('help').classList.contains('hidden') && this.btn.help.dataset.auto !== 'done') {
      this.btn.help.dataset.auto = 'done';
      this.toggleHelp(false);
    }
    this.btn.core.classList.toggle('on', w.core.mode !== 'off');
    this.btn.core.innerHTML = `<kbd>G</kbd>Core: ${w.core.mode === 'off' ? 'offline' : w.core.mode === 'over' ? 'overcharged' : 'online'}`;
    this.btn.rowdy.classList.toggle('on', w.rowdy);
    this.btn.debug.classList.toggle('on', debug);

    const g = w.engine.gravity;
    $('stats').innerHTML = `characters <b>${w.actors.length}</b>/${ACTOR_CAP} · props <b>${w.props.length}</b>/${PROP_CAP} · gravity <b>${Math.hypot(g.x, g.y).toFixed(2)}g</b>`;

    // Spawn strip
    const sig = w.actors.map((a) => `${a.id}:${a.dead ? 'd' : ''}${a.owner ? 'c' : ''}`).join(',') + '|' + (w.possessed?.id ?? '');
    if (sig !== this.stripSig) {
      this.stripSig = sig;
      const strip = $('strip');
      strip.innerHTML = '';
      for (const a of w.actors) {
        const c = el('div', 'card' + (a === w.possessed ? ' on' : ''), `
          <div class="bar" style="background:${a.def.color}"></div>
          <div class="n">${a.def.name}</div>
          <div class="r">${a.def.role}${a.owner ? ' · clone' : ''}${a.dead ? ' · respawning' : ''}</div>
          <span class="x" title="Despawn">✕</span>`);
        c.title = `${a.def.name}: ${a.def.blurb}`;
        c.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).classList.contains('x')) this.hooks.despawn(a);
          else this.hooks.possess(a);
        });
        c.addEventListener('contextmenu', (e) => { e.preventDefault(); this.hooks.despawn(a); });
        strip.appendChild(c);
      }
      const add = el('div', 'card add', '+ Spawn<br><small>Tab</small>');
      add.addEventListener('click', () => this.toggleMenu(true));
      strip.appendChild(add);
      strip.querySelector('.card.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    // Possessed panel
    const me = w.possessed;
    const slotSig = me ? `${me.id}` : 'none';
    const box = $('slots');
    if (slotSig !== this.slotSig) {
      this.slotSig = slotSig;
      this.cdEls = [];
      if (!me) {
        box.innerHTML = '<div class="blurb">Nobody possessed. Press Q/E or click the strip.</div>';
        this.statusEl = null;
      } else {
        const slots = slotsFor(me.def);
        const traits = traitsFor(me.def);
        box.innerHTML = `
          <div class="who"><span class="swatch" style="background:${me.def.color}"></span>${me.def.name}<span class="role">${me.def.role}</span></div>
          <div class="blurb">${me.def.blurb}</div>
          <div class="row">${['J', 'K'].map((k, i) => {
            const s = slots[i];
            return s
              ? `<div class="slot"><span class="key">${k}</span><div class="name">${s.name}</div><div class="sub">${i ? 'right click' : 'left click'} · ${s.cooldown}s</div><div class="cd" style="transform:scaleX(0)"></div></div>`
              : `<div class="slot empty"><span class="key">${k}</span><div class="name">—</div></div>`;
          }).join('')}</div>
          ${traits.length ? `<div class="passives">${traits.map((t) => `<span class="passive">${t}</span>`).join('')}</div>` : ''}
          <div class="status"></div>`;
        box.querySelectorAll<HTMLElement>('.cd').forEach((e) => this.cdEls.push(e));
        this.statusEl = box.querySelector('.status');
      }
    }
    if (me) {
      const slots = slotsFor(me.def);
      this.cdEls.forEach((e, i) => {
        const s = slots[i];
        const f = s && s.cooldown > 0 ? Math.min(1, me.cd[i] / s.cooldown) : 0;
        e.style.transform = `scaleX(${f})`;
      });
      if (this.statusEl) {
        const st: string[] = [];
        if (me.dead) st.push('fell off campus, respawning…');
        if (me.form !== 'normal') st.push(`form: ${me.form}`);
        if (me.babyT > 0) st.push(`babified ${me.babyT.toFixed(1)}s (no powers)`);
        if (me.frozenT > 0) st.push(`frozen ${me.frozenT.toFixed(1)}s`);
        if (me.burnT > 0) st.push('on fire!');
        if (me.dazeT > 0) st.push('dazed');
        if (me.heldBy) st.push(`held by ${me.heldBy.def.name}`);
        if (me.holding) st.push('holding something: click to throw');
        if (me.owner) st.push(`clone of ${me.owner.def.name}`);
        this.statusEl.textContent = st.join(' · ');
      }
    }
  }
}
