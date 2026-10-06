/**
 * OWNER: cosmos.
 * ResearchPanel — the full-screen tech tree ('research' panel). Five branches of technologies bought with empire
 * research points: a column per branch on wide screens, branch tabs on phones. Each node shows its effects, the
 * items it unlocks early, prerequisites (tap to jump), a cost / progress bar and a single clear action. The header
 * shows the research balance, the monthly rate, the tree's completion and every bonus currently active.
 */
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { game } from '../../game/instance';
import { ui } from '../../ui/store';
import { Icon } from '../../ui/icons';
import { Button } from '../../ui/core/Button';
import { Tabs } from '../../ui/core/controls';
import { uiSound, viewport } from '../../ui/core/env';
import { fmtCompact, fmtInt } from '../../ui/core/format';
import { BRANCHES, EFFECT_LABELS, TECHS, TECH_MAP, effectText, type TechBranch, type TechDef } from '../techs';
import { cx } from '../state';

const branchSig = signal<TechBranch>('infra');
const BY_BRANCH = new Map<TechBranch, TechDef[]>(BRANCHES.map((b) => [b.id, TECHS.filter((t) => t.branch === b.id).sort((x, y) => x.tier - y.tier || x.cost - y.cost)]));

type TechState = 'done' | 'available' | 'expensive' | 'locked';

function stateOf(id: string): TechState {
  try {
    return game.progression.techState(id);
  } catch {
    return 'locked';
  }
}

function TechNode({ t, color, flash, onJump }: { t: TechDef; color: string; flash: boolean; onJump: (id: string) => void }) {
  const st = stateOf(t.id);
  const prog = game.progression;
  const have = Math.floor(game.empire.s.research);
  const missing = t.requires.filter((r) => !prog.isResearched(r));
  const tierLocked = t.tier > game.empire.s.tier;
  const sandbox = game.empire.sandbox;
  let action;
  if (st === 'done')
    action = (
      <span class="rs-done">
        <Icon name="check" size={15} stroke={2.4} /> {sandbox ? 'Active' : 'Researched'}
      </span>
    );
  else if (st === 'available')
    action = (
      <Button variant="primary" size="md" icon="research" sound={false} onClick={() => prog.research(t.id)}>
        Research · <span class="num">{fmtInt(t.cost)}</span>
      </Button>
    );
  else if (st === 'expensive')
    action = (
      <div class="rs-saving">
        <div class="rs-saving-bar" aria-hidden="true">
          <i style={{ width: `${Math.min(100, (have / t.cost) * 100).toFixed(1)}%` }} />
        </div>
        <span class="num">
          {fmtCompact(have)} / {fmtCompact(t.cost)}
        </span>
      </div>
    );
  else
    action = (
      <span class="rs-locked">
        <Icon name="lock" size={14} /> {tierLocked ? `Reach ${prog.tierName(t.tier)}` : 'Research prerequisites first'}
      </span>
    );
  return (
    <article id={'tech-' + t.id} class={`rs-node is-${st}${flash ? ' is-flash' : ''}`} style={{ '--bc': color } as Record<string, string>}>
      <span class="rs-port" aria-hidden="true" />
      <header class="rs-node-head">
        <span class="rs-node-icon">
          <Icon name={t.icon} size={20} />
        </span>
        <div class="rs-node-titles">
          <h3 class="rs-node-name">{t.name}</h3>
          <span class="rs-node-meta">
            <span class="rs-tier">{prog.tierName(t.tier)}</span>
            {st !== 'done' && (
              <span class="rs-cost num">
                <Icon name="research" size={12} />
                {fmtInt(t.cost)}
              </span>
            )}
          </span>
        </div>
      </header>
      <p class="rs-node-desc">{t.description}</p>
      <div class="rs-effects">
        {t.effects.map((e) => {
          const fx = effectText(e);
          const info = EFFECT_LABELS[e.key];
          const good = info ? (info.good === 'lower' ? e.value < 1 : e.value > (ADD.has(e.key) ? 0 : 1)) : true;
          return (
            <span class={'rs-fx' + (good ? ' is-good' : '')} key={e.key}>
              <Icon name={fx.icon} size={12} />
              {fx.text}
            </span>
          );
        })}
        {t.unlocks && (
          <span class="rs-fx is-unlock">
            <Icon name="unlock" size={12} />
            {t.unlocks.label}
          </span>
        )}
      </div>
      {missing.length > 0 && st !== 'done' && (
        <div class="rs-needs">
          <span class="rs-needs-l">Needs</span>
          {missing.map((m) => (
            <button type="button" class="rs-need" key={m} onClick={() => onJump(m)}>
              {TECH_MAP.get(m)?.name ?? m}
              <Icon name="chevronRight" size={12} />
            </button>
          ))}
        </div>
      )}
      <p class="rs-flavor">“{t.flavor}”</p>
      <footer class="rs-node-foot">{action}</footer>
    </article>
  );
}

const ADD = new Set(['happiness', 'landValue', 'health', 'incomePer1k', 'demandR', 'demandC', 'demandI', 'demandO', 'researchDividend', 'taxDividend', 'upkeepRebate', 'tourismIncome', 'tradeIncome']);

function Column({ b, flash, onJump, showHead }: { b: (typeof BRANCHES)[number]; flash: string | null; onJump: (id: string) => void; showHead: boolean }) {
  const list = BY_BRANCH.get(b.id) ?? [];
  const done = list.filter((t) => stateOf(t.id) === 'done').length;
  return (
    <section class="rs-col" style={{ '--bc': b.color } as Record<string, string>} aria-label={b.name}>
      {showHead && (
        <header class="rs-col-head">
          <span class="rs-col-icon">
            <Icon name={b.icon} size={18} />
          </span>
          <div class="rs-col-titles">
            <h2>{b.name}</h2>
            <span class="num">
              {done}/{list.length} researched
            </span>
          </div>
        </header>
      )}
      <p class="rs-col-blurb">{b.blurb}</p>
      <div class="rs-chain">
        {list.map((t) => (
          <TechNode key={t.id} t={t} color={b.color} flash={flash === t.id} onJump={onJump} />
        ))}
      </div>
    </section>
  );
}

function activeBonuses(): { key: string; text: string; icon: string }[] {
  const out: { key: string; text: string; icon: string }[] = [];
  const prog = game.progression;
  for (const key of Object.keys(EFFECT_LABELS)) {
    const add = ADD.has(key);
    const v = add ? prog.techAdd(key) : prog.techBonus(key);
    if (add ? Math.abs(v) < 1e-6 : Math.abs(v - 1) < 1e-6) continue;
    const fx = effectText({ key, value: v });
    out.push({ key, text: fx.text, icon: fx.icon });
  }
  return out;
}

export function ResearchPanel(_p: { onClose: () => void }) {
  void ui.research.value;
  void ui.tier.value;
  void cx.version.value;
  const [tick, setTick] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const vp = viewport.value;
  const wide = vp.w >= 1000 && !vp.landscapePhone;
  const prog = game.progression;
  const sandbox = game.empire.sandbox;
  const researched = prog.researchedCount();
  const total = TECHS.length;
  const rate = Math.round(ui.stats.value.researchRate ?? 0);
  const div = prog.lastDividend();
  const bonuses = activeBonuses();
  void tick;

  // refresh when a tech is bought (the progression emits 'unlock' → cx.version via Cosmos) and every few seconds
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 2000);
    return () => clearInterval(t);
  }, []);

  const jump = (id: string) => {
    const t = TECH_MAP.get(id);
    if (!t) return;
    uiSound('tap');
    if (!wide) branchSig.value = t.branch;
    setFlash(id);
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 1600);
    requestAnimationFrame(() => document.getElementById('tech-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }));
  };

  const tabs = BRANCHES.map((b) => {
    const avail = (BY_BRANCH.get(b.id) ?? []).filter((t) => stateOf(t.id) === 'available').length;
    return { id: b.id, label: b.name, icon: b.icon, badge: avail || undefined };
  });
  const branch = BRANCHES.find((b) => b.id === branchSig.value) ?? BRANCHES[0];

  return (
    <div class={'rs-root' + (wide ? ' is-wide' : '')}>
      <div class="rs-bg" aria-hidden="true" />
      <div class="rs-scroll">
      <header class="rs-head">
        <div class="rs-kicker">
          <Icon name="research" size={14} /> Research &amp; Development
        </div>
        <h1 class="rs-title">Technology</h1>
        <div class="rs-stats">
          <div class="rs-stat is-hero">
            <span class="rs-stat-v num grad-text">{fmtInt(Math.floor(game.empire.s.research))}</span>
            <span class="rs-stat-l">research points</span>
          </div>
          <div class="rs-stat">
            <span class="rs-stat-v num">+{fmtCompact(rate)}</span>
            <span class="rs-stat-l">per month</span>
          </div>
          <div class="rs-stat is-ring">
            <span class="rs-ring" style={{ '--p': `${Math.round((researched / total) * 360)}deg` } as Record<string, string>}>
              <span class="num">{researched}</span>
            </span>
            <span class="rs-stat-l">of {total} techs</span>
          </div>
        </div>
        {sandbox ? (
          <p class="rs-note">
            <Icon name="sparkles" size={14} class="rs-note-icon" />
            Sandbox: every technology is already active. Go wild.
          </p>
        ) : (
          <p class="rs-note">
            <Icon name="info" size={14} class="rs-note-icon" />
            Universities, labs and observatories earn research every month.
            {div && (div.money > 0 || div.research > 0) ? (
              <span>
                {' '}
                Last month’s tech dividends: {div.money > 0 && <b class="num">+₡{fmtCompact(div.money)}</b>}
                {div.money > 0 && div.research > 0 && ' · '}
                {div.research > 0 && <b class="num">+{fmtCompact(div.research)} research</b>}
              </span>
            ) : null}
          </p>
        )}
        {bonuses.length > 0 && (
          <div class="rs-bonuses scroll-x" aria-label="Active bonuses">
            {bonuses.map((b) => (
              <span class="rs-bonus" key={b.key}>
                <Icon name={b.icon} size={13} />
                {b.text}
              </span>
            ))}
          </div>
        )}
        {!wide && <Tabs tabs={tabs} value={branch.id} onChange={(id) => (branchSig.value = id)} class="rs-tabs" ariaLabel="Branches" />}
      </header>
      <div class={'rs-tree' + (wide ? ' scroll-x' : ' scroll-y')} ref={scroller}>
        {wide ? BRANCHES.map((b) => <Column key={b.id} b={b} flash={flash} onJump={jump} showHead />) : <Column key={branch.id} b={branch} flash={flash} onJump={jump} showHead={false} />}
      </div>
      </div>
    </div>
  );
}
