/**
 * OWNER: ui-core.
 * Celebration — the milestone overlay. Listens to bus 'milestone:reached' (goal from ui.goals) and tier unlocks
 * ('unlock' kind 'tier'); queues them and shows one at a time: radiant trophy, title, reward chip, confetti burst
 * (canvas2D, ~3 s, skipped with reduce motion). Tap Continue (or anywhere after a beat) to dismiss.
 */
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { bus } from '../../../core/events';
import { game } from '../../../game/instance';
import { Icon } from '../../icons';
import { ui } from '../../store';
import { Button } from '../Button';
import { reduceMotion, uiSound, useLayer } from '../env';
import { usePresence } from '../presence';

interface Celebrate {
  key: string;
  kicker: string;
  title: string;
  body?: string;
  reward?: string;
  icon: string;
  tone: 'gold' | 'violet' | 'cyan';
}

const queue = signal<Celebrate[]>([]);

function push(c: Celebrate): void {
  if (queue.value.some((q) => q.key === c.key)) return;
  queue.value = [...queue.value, c].slice(-6);
}

let installed = false;
/** Subscribe to progression events (idempotent). */
export function installCelebrations(): () => void {
  if (installed) return () => {};
  installed = true;
  const offs = [
    bus.on('milestone:reached', ({ goalId }) => {
      const g = ui.goals.value.find((x) => x.id === goalId);
      push({
        key: 'goal:' + goalId,
        kicker: 'Milestone reached',
        title: g?.title ?? 'A new milestone!',
        body: g?.description,
        reward: g?.reward,
        icon: 'trophy',
        tone: 'gold',
      });
    }),
    bus.on('unlock', ({ kind, id }) => {
      if (kind === 'tier') {
        const t = Number(String(id).replace(/^tier:/, ''));
        let name = `Tier ${t}`;
        try {
          name = game.progression.tierName(t);
        } catch {
          /* default */
        }
        push({ key: 'tier:' + t, kicker: 'Your civilisation grew', title: name, body: 'New buildings, policies and powers are now available.', reward: 'New blueprints unlocked', icon: 'crown', tone: 'violet' });
      } else if (kind === 'galaxy' || kind === 'system') {
        push({ key: kind + ':' + id, kicker: kind === 'galaxy' ? 'New galaxy unlocked' : 'New star system unlocked', title: String(id), body: 'Open the star map to plot a course.', icon: kind === 'galaxy' ? 'galaxy' : 'starSystem', tone: 'cyan' });
      }
    }),
  ];
  return () => {
    installed = false;
    offs.forEach((o) => o());
  };
}

// ───────────────────────────────────────────── confetti
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  vr: number;
  w: number;
  h: number;
  c: string;
  life: number;
}
const COLORS = ['#5ef0ff', '#a77bff', '#ffd36b', '#ff7ad9', '#5ef2a0', '#ffffff'];

function Confetti({ run }: { run: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || reduceMotion()) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const bits: Bit[] = [];
    const n = Math.min(160, Math.round((W * H) / 6000));
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      bits.push({
        x: W / 2 + side * W * 0.08,
        y: H * 0.42,
        vx: side * (120 + Math.random() * 420) * (Math.random() < 0.3 ? -0.4 : 1),
        vy: -(380 + Math.random() * 520),
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 12,
        w: 5 + Math.random() * 6,
        h: 3 + Math.random() * 4,
        c: COLORS[i % COLORS.length],
        life: 2.6 + Math.random() * 1.2,
      });
    }
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, W, H);
      let alive = 0;
      for (const b of bits) {
        if (b.life <= 0) continue;
        b.life -= dt;
        b.vy += 900 * dt;
        b.vx *= 1 - 1.2 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.r += b.vr * dt;
        if (b.y > H + 20) continue;
        alive++;
        ctx.save();
        ctx.globalAlpha = Math.min(1, b.life * 1.5);
        ctx.translate(b.x, b.y);
        ctx.rotate(b.r);
        ctx.scale(1, Math.cos(b.r * 2.3));
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      }
      if (alive > 0) raf = requestAnimationFrame(step);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [run]);
  return <canvas class="ce-confetti" ref={ref} aria-hidden="true" />;
}

export function CelebrationHost() {
  const cur = queue.value[0] ?? null;
  const last = useRef<Celebrate | null>(cur);
  if (cur) last.current = cur;
  const { mounted, shown } = usePresence(!!cur, 360);
  const [ready, setReady] = useState(false);
  const dismiss = () => {
    if (!cur) return;
    uiSound('close');
    queue.value = queue.value.slice(1);
  };
  useLayer(!!cur, dismiss);
  useEffect(() => {
    if (!cur) return;
    setReady(false);
    uiSound(cur.tone === 'gold' ? 'milestone' : 'levelUp');
    const t = setTimeout(() => setReady(true), 900);
    return () => clearTimeout(t);
  }, [cur?.key]);
  if (!mounted || !last.current) return null;
  const c = last.current;
  return (
    <div class={`ce-root tone-${c.tone}` + (shown ? ' is-shown' : '')} onClick={() => ready && dismiss()} role="dialog" aria-label={c.kicker}>
      <div class="ce-scrim" />
      <Confetti run={c.key} />
      <div class="ce-card glass-strong pe" key={c.key} onClick={(e) => e.stopPropagation()}>
        <div class="ce-badge">
          <span class="ce-rays" />
          <span class="ce-ring" />
          <span class="ce-icon">
            <Icon name={c.icon} size={40} stroke={1.6} />
          </span>
        </div>
        <div class="ce-kicker">{c.kicker}</div>
        <h2 class="ce-title">{c.title}</h2>
        {c.body && <p class="ce-body">{c.body}</p>}
        {c.reward && (
          <div class="ce-reward">
            <Icon name="sparkles" size={16} />
            <span>{c.reward}</span>
          </div>
        )}
        <Button variant="primary" size="lg" block onClick={dismiss} sound={false}>
          {queue.value.length > 1 ? 'Next' : 'Continue'}
        </Button>
      </div>
    </div>
  );
}

/** Test hook: show a celebration without progression (used by the screenshot scripts). */
export function celebrateForTest(title = 'Settlement founded', reward = '+₡10,000 · Medium-density zoning'): void {
  push({ key: 'test:' + Date.now(), kicker: 'Milestone reached', title, body: 'Your outpost has grown into a real community.', reward, icon: 'trophy', tone: 'gold' });
}
