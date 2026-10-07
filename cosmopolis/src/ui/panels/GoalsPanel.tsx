/**
 * OWNER: ui-panels.
 * Goals panel ('goals') — career progress at a glance. Hero: the current tier with a ring toward the next one and
 * achievement count. Sections:
 *   Active        the goals Progression publishes to ui.goals (next milestone, colony grants, 3 side goals)
 *   Milestones    the tier ladder Outpost → Galactic Civilisation as a timeline: population target, signature goal,
 *                 what each tier opens and its reward (career only)
 *   Achievements  every side goal by category (cosmos getAllGoals), secret ones masked until earned
 */
import { useState } from 'preact/hooks';
import { CATEGORY_INFO, TIERS } from '../../cosmos/goals';
import type { ExtGoalView } from '../../cosmos/Progression';
import { game } from '../../game/instance';
import { Chip, EmptyState, Icon, IconOrEmoji, ProgressBar, SectionHeader, Segmented } from '../core';
import { fmtCompact } from '../core/format';
import { ui, type GoalView } from '../store';
import { Ring, isSandbox, safe, useLive } from './common';

type Tab = 'active' | 'ladder' | 'all';
const memo = { tab: 'active' as Tab, cat: 'all' };

function allGoals(): ExtGoalView[] {
  return safe(() => {
    const pr = game.progression as unknown as { getAllGoals?: () => ExtGoalView[] };
    return typeof pr?.getAllGoals === 'function' ? pr.getAllGoals() : [];
  }, []);
}

function totalPop(): number {
  return safe(() => game.progression.totalPop(), ui.population.value);
}

function GoalCard({ g, ext }: { g: GoalView; ext?: ExtGoalView }) {
  const icon = ext?.icon ?? (g.id.startsWith('tier:') ? 'crown' : g.id.startsWith('grant') || g.id.includes('colony') ? 'planet' : 'goal');
  return (
    <section class={'up-card up-goal' + (g.done ? ' is-done' : '') + (ext?.major || g.id.startsWith('tier:') ? ' is-major' : '')}>
      <div class="up-goal-head">
        <span class="up-goal-icon">
          <IconOrEmoji value={g.done ? 'check' : icon} size={20} />
        </span>
        <div class="grow">
          <div class="up-goal-title">{g.title}</div>
          <div class="up-goal-desc">{g.description}</div>
        </div>
      </div>
      <ProgressBar value={g.done ? 1 : g.progress} tone={g.done ? 'good' : 'money'} label={g.done ? 'Complete' : 'Progress'} valueText={g.label ?? `${Math.round(g.progress * 100)}%`} height={7} animated={!g.done} />
      {g.reward && (
        <div class="up-goal-reward">
          <Icon name="sparkles" size={13} /> {g.reward}
        </div>
      )}
    </section>
  );
}

function Active({ all }: { all: ExtGoalView[] }) {
  const goals = ui.goals.value;
  const byId = new Map(all.map((g) => [g.id, g]));
  if (!goals.length) return <EmptyState icon="goal" title="No active goals" body={isSandbox() ? 'Sandbox has no milestones — but achievements still count. Check the Achievements tab.' : 'New goals appear as your city grows.'} />;
  return (
    <div class="up-goal-list">
      {goals.map((g) => (
        <GoalCard key={g.id} g={g} ext={byId.get(g.id)} />
      ))}
    </div>
  );
}

function Ladder({ all }: { all: ExtGoalView[] }) {
  const tier = ui.tier.value;
  const pop = totalPop();
  const views = new Map(all.filter((g) => g.kind === 'tier').map((g) => [g.tier ?? -1, g]));
  return (
    <ol class="up-ladder">
      {TIERS.map((t) => {
        const done = tier >= t.tier;
        const current = t.tier === tier + 1;
        const v = views.get(t.tier);
        const state = done ? 'is-done' : current ? 'is-current' : 'is-locked';
        const progress = done ? 1 : current ? v?.progress ?? Math.min(1, pop / Math.max(1, t.pop)) : 0;
        return (
          <li key={t.tier} class={'up-rung ' + state}>
            <span class="up-rung-node">{done ? <Icon name="check" size={14} stroke={3} /> : <span class="num">{t.tier}</span>}</span>
            <div class="up-rung-body">
              <div class="up-rung-head">
                <span class="up-rung-name">{t.name}</span>
                <span class="num up-rung-pop">{t.pop ? `${fmtCompact(t.pop)} citizens` : 'Start'}</span>
              </div>
              <div class="up-rung-blurb">{t.blurb}</div>
              {current && <ProgressBar value={progress} tone="money" valueText={v?.label ?? `${fmtCompact(pop)} / ${fmtCompact(t.pop)}`} height={6} animated />}
              {(current || !done) && t.signature && (
                <div class="up-rung-sig">
                  <IconOrEmoji value={t.signature.icon} size={13} /> Also: <b>{t.signature.title}</b> — {t.signature.description}
                </div>
              )}
              <div class="up-rung-opens">
                <Icon name="unlock" size={12} /> {t.opens}
              </div>
              {v?.reward && !done && <div class="up-goal-reward">{v.reward}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Achievements({ all }: { all: ExtGoalView[] }) {
  const [cat, setCat] = useState(memo.cat);
  const list = all.filter((g) => g.kind === 'goal');
  const cats = Object.entries(CATEGORY_INFO) as [string, { name: string; icon: string }][];
  const shown = list.filter((g) => cat === 'all' || (cat === 'done' ? g.done : g.category === cat)).sort((a, b) => Number(b.done) - Number(a.done) || b.progress - a.progress);
  const pick = (c: string) => {
    memo.cat = c;
    setCat(c);
  };
  return (
    <div class="up-stack-v">
      <div class="up-chiprow scroll-x up-nowrap">
        <Chip selected={cat === 'all'} onClick={() => pick('all')} icon="grid">
          All
        </Chip>
        <Chip selected={cat === 'done'} onClick={() => pick('done')} icon="trophy" tone="money">
          Earned {list.filter((g) => g.done).length}
        </Chip>
        {cats.map(([id, c]) => {
          const n = list.filter((g) => g.category === id);
          if (!n.length) return null;
          return (
            <Chip key={id} selected={cat === id} onClick={() => pick(id)} icon={c.icon}>
              {c.name} {n.filter((g) => g.done).length}/{n.length}
            </Chip>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <EmptyState icon="trophy" title="Nothing here yet" body="Achievements unlock as you build, explore — and occasionally destroy." />
      ) : (
        <div class="up-badges">
          {shown.map((g) => {
            const hidden = g.secret && !g.done;
            return (
              <div key={g.id} class={'up-badge' + (g.done ? ' is-done' : '') + (hidden ? ' is-secret' : '')}>
                <Ring value={g.done ? 1 : g.progress} size={52} stroke={4} color={g.done ? 'var(--gold)' : 'var(--accent)'}>
                  <IconOrEmoji value={hidden ? 'lock' : g.icon} size={20} />
                </Ring>
                <div class="up-badge-text">
                  <div class="up-badge-title">{hidden ? 'Secret achievement' : g.title}</div>
                  <div class="up-badge-desc">{hidden ? 'Keep playing. Or keep breaking things.' : g.description}</div>
                  {!hidden && (
                    <div class="up-badge-meta num">
                      {g.done ? <span class="good">Earned</span> : <span>{g.label ?? `${Math.round(g.progress * 100)}%`}</span>}
                      {g.reward && <span class="money"> · {g.reward}</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GoalsPanel() {
  useLive(1000);
  const sandbox = isSandbox();
  const [tab, setTab] = useState<Tab>(sandbox && memo.tab === 'ladder' ? 'all' : memo.tab);
  const all = allGoals();
  const ach = all.filter((g) => g.kind === 'goal');
  const earned = ach.filter((g) => g.done).length;
  const tier = ui.tier.value;
  const next = TIERS[tier + 1];
  const pop = totalPop();
  const from = TIERS[tier]?.pop ?? 0;
  const prog = next ? Math.max(0, Math.min(1, (pop - from) / Math.max(1, next.pop - from))) : 1;
  const go = (t: Tab) => {
    memo.tab = t;
    setTab(t);
  };
  return (
    <div class="up-root up-goals">
      <div class="up-hero up-goals-hero">
        <Ring value={sandbox ? earned / Math.max(1, ach.length) : prog} size={78} stroke={7} color="var(--gold)">
          <Icon name={sandbox ? 'trophy' : 'crown'} size={26} />
        </Ring>
        <div class="grow">
          <div class="up-kicker">{sandbox ? 'Sandbox achievements' : `Tier ${tier}`}</div>
          <div class="up-goals-tier">{sandbox ? `${earned} of ${ach.length} earned` : TIERS[tier]?.name ?? safe(() => game.progression.tierName(tier), '')}</div>
          <div class="dim up-goals-next">
            {sandbox ? 'Everything is unlocked. Achievements still count.' : next ? `Next: ${next.name} at ${fmtCompact(next.pop)} citizens` : 'You have reached the top of the ladder. The universe salutes you.'}
          </div>
        </div>
        {!sandbox && (
          <div class="up-tax-right">
            <div class="up-big num">
              {earned}
              <span class="up-unit">/{ach.length}</span>
            </div>
            <div class="dim">achievements</div>
          </div>
        )}
      </div>
      <Segmented
        block
        sound="tap"
        value={tab}
        onChange={go}
        ariaLabel="Goal sections"
        options={
          sandbox
            ? [
                { value: 'active', label: 'Active' },
                { value: 'all', label: 'Achievements' },
              ]
            : [
                { value: 'active', label: 'Active' },
                { value: 'ladder', label: 'Milestones' },
                { value: 'all', label: 'Achievements' },
              ]
        }
      />
      {tab === 'active' ? <Active all={all} /> : tab === 'ladder' && !sandbox ? <Ladder all={all} /> : <Achievements all={all} />}
      {tab === 'active' && !sandbox && next && (
        <>
          <SectionHeader title="Up next" icon="crown" subtitle={TIERS[tier + 1]?.opens} />
        </>
      )}
    </div>
  );
}
