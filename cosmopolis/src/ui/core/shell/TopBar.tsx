/**
 * OWNER: ui-core.
 * TopBar — city name (→ panel "city"), population with trend, money with ±income/month (→ panel "budget"),
 * happiness, RCI(O) demand, date and speed controls. Collapses gracefully: on narrow phones only the essentials
 * show and tapping the stats opens the Status tray (date, speeds, demand, vitals, shortcuts).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { game } from '../../../game/instance';
import { Icon, IconOrEmoji } from '../../icons';
import { panels } from '../../registry';
import { ui } from '../../store';
import { Segmented } from '../controls';
import { BarMeter } from '../display';
import { openPanel, uiSound, useLayer, viewport } from '../env';
import { fmtCompact, fmtMoney, fmtSigned } from '../format';
import { usePresence } from '../presence';
import { trayOpen } from './actions';
import { tierProgress } from './newItems';
import { bus } from '../../../core/events';
import { ProgressBar } from '../display';

const SPEEDS = [
  { value: 0, icon: 'pause', title: 'Pause (Space)' },
  { value: 1, icon: 'speed1', title: 'Normal speed (1)' },
  { value: 2, icon: 'speed2', title: 'Fast (2)' },
  { value: 3, icon: 'speed3', title: 'Faster (3)' },
  { value: 4, icon: 'speed4', title: 'Ludicrous (4)' },
];

function tierName(t: number): string {
  try {
    return game.progression.tierName(t);
  } catch {
    return `Tier ${t}`;
  }
}

/** Population trend: compares against the value ~10 s ago. */
function usePopTrend(pop: number): number {
  const hist = useRef<{ t: number; v: number }[]>([]);
  const now = performance.now();
  const h = hist.current;
  if (!h.length || now - h[h.length - 1].t > 1000) {
    h.push({ t: now, v: pop });
    while (h.length > 12) h.shift();
  }
  const old = h[0]?.v ?? pop;
  return pop - old;
}

function setSpeed(s: number): void {
  try {
    game.clock.setSpeed(s);
    ui.speed.value = game.clock.speed;
  } catch {
    /* clock optional */
  }
}

const RCI = [
  { k: 'R' as const, color: 'var(--zone-r)', label: 'Residential' },
  { k: 'C' as const, color: 'var(--zone-c)', label: 'Commercial' },
  { k: 'I' as const, color: 'var(--zone-i)', label: 'Industrial' },
  { k: 'O' as const, color: 'var(--zone-o)', label: 'Office' },
];

function Demand({ compact }: { compact?: boolean }) {
  const d = ui.demand.value;
  return (
    <div class={'tb-rci' + (compact ? ' is-compact' : '')} title="Zone demand (R · C · I · O)">
      {RCI.map((z) => (
        <BarMeter key={z.k} value={d[z.k]} bipolar vertical color={z.color} label={z.k} length={compact ? 22 : 26} thickness={compact ? 5 : 6} title={`${z.label} demand ${Math.round(d[z.k] * 100)}%`} />
      ))}
    </div>
  );
}

/** The first unfinished goal (or the next tier) with its progress. */
function NextMilestone({ onClose }: { onClose: () => void }) {
  const goal = ui.goals.value.find((g) => !g.done);
  const tp = tierProgress();
  if (!goal && !tp) return null;
  const goGoals = panels.has('goals')
    ? () => {
        onClose();
        openPanel('goals');
      }
    : undefined;
  const body = goal ? (
    <ProgressBar value={goal.progress} label={goal.title} valueText={goal.label ?? `${Math.round(goal.progress * 100)}%`} tone="money" animated />
  ) : (
    <ProgressBar value={tp!.value} label={`Next: ${tierName(tp!.next)}`} valueText={`${fmtCompact(ui.population.value)} / ${fmtCompact(tp!.to)}`} tone="money" animated />
  );
  return goGoals ? (
    <button type="button" class="tb-milestone" onClick={goGoals}>
      <Icon name="trophy" size={18} class="tb-milestone-icon" />
      <div class="grow">{body}</div>
      <Icon name="chevronRight" size={16} class="dim" />
    </button>
  ) : (
    <div class="tb-milestone">
      <Icon name="trophy" size={18} class="tb-milestone-icon" />
      <div class="grow">{body}</div>
    </div>
  );
}

function StatusTray({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { mounted, shown } = usePresence(open, 260);
  useLayer(open, onClose);
  if (!mounted) return null;
  const st = ui.stats.value;
  const vit: { icon: string; label: string; value: string; tone?: string }[] = [
    { icon: 'jobs', label: 'Jobs', value: fmtCompact(st.jobs ?? 0) },
    { icon: 'user', label: 'Unemployment', value: `${Math.round(st.unemployment ?? 0)}%`, tone: (st.unemployment ?? 0) > 12 ? 'bad' : '' },
    { icon: 'power', label: 'Power', value: `${Math.round(st.powerSupply ?? 0)}%`, tone: (st.powerSupply ?? 100) < 100 ? 'warn' : '' },
    { icon: 'water', label: 'Water', value: `${Math.round(st.waterSupply ?? 0)}%`, tone: (st.waterSupply ?? 100) < 100 ? 'warn' : '' },
    { icon: 'research', label: 'Research', value: fmtCompact(ui.research.value) },
    { icon: 'landValue', label: 'Land value', value: `${Math.round(st.landValue ?? 0)}` },
  ];
  const links = ['budget', 'stats', 'goals', 'policies'].filter((id) => panels.has(id));
  return (
    <div class={'tb-tray-root' + (shown ? ' is-shown' : '')}>
      <div class="tb-tray-scrim pe" onClick={onClose} />
      <div class="tb-tray glass-strong pe" role="dialog" aria-label="City status">
        <div class="tb-tray-head">
          <div>
            <div class="tb-tray-date num">{ui.dateLabel.value}</div>
            <div class="tb-tray-sub">
              {ui.cityName.value} · {tierName(ui.tier.value)}
            </div>
          </div>
          <Segmented size="sm" value={ui.speed.value} onChange={setSpeed} options={SPEEDS} ariaLabel="Game speed" sound="tap" />
        </div>
        <NextMilestone onClose={onClose} />
        <div class="tb-tray-rci">
          {RCI.map((z) => {
            const v = ui.demand.value[z.k];
            return (
              <div class="tb-tray-rci-row" key={z.k}>
                <span class="tb-tray-rci-k" style={{ color: z.color }}>
                  {z.k}
                </span>
                <span class="tb-tray-rci-l">{z.label}</span>
                <BarMeter value={v} bipolar color={z.color} length={120} thickness={6} />
                <span class="tb-tray-rci-v num">{v > 0.05 ? 'High' : v < -0.05 ? 'Low' : 'Even'}</span>
              </div>
            );
          })}
        </div>
        <div class="tb-tray-vitals">
          {vit.map((v) => (
            <div class={'tb-vital ' + (v.tone ?? '')} key={v.label}>
              <Icon name={v.icon} size={16} />
              <span class="tb-vital-l">{v.label}</span>
              <span class="tb-vital-v num">{v.value}</span>
            </div>
          ))}
        </div>
        {links.length > 0 && (
          <div class="tb-tray-links">
            {links.map((id) => {
              const p = panels.get(id)!;
              return (
                <button
                  key={id}
                  type="button"
                  class="tb-tray-link"
                  onClick={() => {
                    onClose();
                    openPanel(id);
                  }}
                >
                  <IconOrEmoji value={p.icon ?? 'grid'} size={16} />
                  {p.title}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function TopBar() {
  const vp = viewport.value;
  const tray = trayOpen.value;
  const setTray = (v: boolean) => (trayOpen.value = v);
  const pop = ui.population.value;
  const trend = usePopTrend(pop);
  const money = ui.money.value;
  const income = ui.income.value;
  const happy = ui.happiness.value;
  const speed = ui.speed.value;
  const sandbox = ui.mode.value === 'sandbox';
  const narrow = vp.w < 600 && !vp.landscapePhone;
  const moneyFlash = useRef(money);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    const prev = moneyFlash.current;
    moneyFlash.current = money;
    if (sandbox || Math.abs(money - prev) < 1) return;
    setFlash(money > prev ? 'up' : 'down');
    const t = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(t);
  }, [money]);

  const tp = tierProgress();
  const ring = tp ? tp.value : null;
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = bus.on('game:saved', () => {
      setSaved(true);
      clearTimeout(t);
      t = setTimeout(() => setSaved(false), 2200);
    });
    return () => {
      off();
      clearTimeout(t);
    };
  }, []);
  const happyIcon = happy >= 65 ? 'smile' : happy >= 40 ? 'meh' : 'frown';
  const happyTone = happy >= 65 ? 'good' : happy >= 40 ? 'warn' : 'bad';
  const cityClick = () => (panels.has('city') ? openPanel('city') : (uiSound('tap'), setTray(!tray)));

  return (
    <>
    <div class="tb-root">
      <button type="button" class={'tb-city glass pe' + (narrow ? ' is-compact' : '')} onClick={cityClick} aria-label={`City: ${ui.cityName.value}`} title={ui.cityName.value}>
        <span class="tb-city-badge" style={ring !== null ? ({ '--ring': `${Math.round(ring * 360)}deg` } as Record<string, string>) : undefined}>
          {ring !== null && <span class="tb-ring" aria-hidden="true" />}
          <Icon name={sandbox ? 'sparkles' : 'crown'} size={16} />
        </span>
        {!narrow && (
          <span class="tb-city-text">
            <span class="tb-city-name ellipsis">{ui.cityName.value || 'New City'}</span>
            <span class="tb-city-sub ellipsis">{sandbox ? 'Sandbox' : tierName(ui.tier.value)}</span>
          </span>
        )}
      </button>

      <button type="button" class="tb-stats glass pe" onClick={() => (uiSound('tap'), setTray(!tray))} aria-label="City status" aria-expanded={tray}>
        <span class="tb-stat" title="Population">
          <Icon name="population" size={15} class="tb-stat-icon" />
          <span class="tb-stat-col">
            <span class="tb-stat-v num">{fmtCompact(pop)}</span>
            <span class={'tb-stat-s num ' + (trend > 0 ? 'good' : trend < 0 ? 'bad' : '')}>{trend > 0 ? '▲ ' + fmtCompact(trend) : trend < 0 ? '▼ ' + fmtCompact(-trend) : 'citizens'}</span>
          </span>
        </span>
        <span class="tb-sep" />
        <span
          class={'tb-stat tb-money' + (flash ? ' flash-' + flash : '')}
          title="Treasury"
          onClick={(e) => {
            if (panels.has('budget')) {
              e.stopPropagation();
              openPanel('budget');
            }
          }}
        >
          <Icon name="money" size={15} class="tb-stat-icon money" />
          <span class="tb-stat-col">
            <span class="tb-stat-v num">{sandbox ? '∞' : fmtMoney(money, true).replace('₡', '')}</span>
            <span class={'tb-stat-s num ' + (sandbox ? '' : income > 0 ? 'good' : income < 0 ? 'bad' : '')}>{sandbox ? 'sandbox' : fmtSigned(income) + '/mo'}</span>
          </span>
        </span>
        <span class="tb-sep" />
        <span class={'tb-stat tb-happy ' + happyTone} title="Happiness">
          <Icon name={happyIcon} size={15} class="tb-stat-icon" />
          <span class="tb-stat-col">
            <span class="tb-stat-v num">{happy}%</span>
            <span class="tb-stat-s">{narrow ? 'mood' : 'happy'}</span>
          </span>
        </span>
        {!narrow && (
          <>
            <span class="tb-sep" />
            <Demand compact={vp.landscapePhone} />
            <span class="tb-sep" />
            <span class="tb-date num">{ui.dateLabel.value}</span>
          </>
        )}
        <Icon name="chevronDown" size={14} class={'tb-chev' + (tray ? ' is-open' : '')} />
      </button>

      {narrow ? (
        <div class="tb-time glass pe">
          <button
            type="button"
            class={'tb-time-btn' + (speed === 0 ? ' is-paused' : '')}
            aria-label={speed === 0 ? 'Resume' : 'Pause'}
            onClick={() => {
              uiSound('toggle');
              try {
                game.clock.togglePause();
                ui.speed.value = game.clock.speed;
              } catch {
                /* ignore */
              }
            }}
          >
            <Icon name={speed === 0 ? 'play' : 'pause'} size={17} />
          </button>
          <button
            type="button"
            class="tb-time-btn tb-speed-cycle num"
            aria-label="Change speed"
            onClick={() => {
              uiSound('tap');
              if (speed === 0) setSpeed(game.clock.lastSpeed || 1);
              else setSpeed(speed >= 4 ? 1 : speed + 1);
            }}
          >
            {speed === 0 ? '‖' : `${speed}×`}
          </button>
        </div>
      ) : (
        <div class="tb-time glass pe is-wide">
          <Segmented size="sm" value={speed} onChange={setSpeed} options={SPEEDS} ariaLabel="Game speed" sound="tap" />
        </div>
      )}
      {saved && (
        <span class="tb-saved" role="status">
          <Icon name="check" size={13} stroke={2.4} />
          Saved
        </span>
      )}
    </div>
    <StatusTray open={tray} onClose={() => setTray(false)} />
    </>
  );
}
