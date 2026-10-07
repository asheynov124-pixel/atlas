/**
 * OWNER: studio.
 * Save tab — name (with a name generator), emoji icon, function (decides the gameplay stats), description, a live
 * preview of the derived stats / cost / upkeep, and Save · Save as copy · Share code.
 */
import { useMemo, useState } from 'preact/hooks';
import { game } from '../../game/instance';
import { Button, Icon, IconButton, SectionHeader, TextInput, fmtMoney, notify, uiSound } from '../../ui/core';
import { TRI_BUDGET } from '../builder';
import { FN_IDS, type DesignSpec } from '../model';
import { studioUi } from '../state';
import { deriveStats, flavorFor, fnDef, FUNCTIONS, generateName, measure } from '../stats';
import { fmtMetres, fmtFloors } from './common';

const ICONS = ['🏙️', '🏢', '🏠', '🏡', '🏬', '🏨', '🏛️', '🕌', '⛩️', '🛕', '🗼', '🗽', '🏰', '🛸', '🚀', '🫧', '💎', '🌿', '🌺', '🌳', '⚡', '🔭', '🧪', '🌀', '🌃', '❄️', '🔴', '🎡', '🎭', '✨'];

export function SaveTab({ draft, onSave }: { draft: DesignSpec; onSave: () => void }) {
  const st = game.studio;
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1000));
  // stats are derived from geometry — recompute only when the design really changes
  const stats = useMemo(() => {
    const m = measure(draft);
    return { m, d: deriveStats(draft, m) };
  }, [draft]);
  const sandbox = game.empire?.sandbox;
  const over = stats.m.triangles > TRI_BUDGET;
  const editing = !!studioUi.editingId.value;

  return (
    <div class="st-tab st-save">
      <SectionHeader title="Name & icon" icon="tag" />
      <div class="st-namerow">
        <TextInput value={draft.name} onChange={(v) => st.setMeta({ name: v })} placeholder="Name your building" maxLength={40} icon="pencil" />
        <IconButton
          icon="dice"
          label="Suggest a name"
          onClick={() => {
            const s = seed + 1 + Math.floor(Math.random() * 97);
            setSeed(s);
            st.setMeta({ name: generateName(draft, s) });
          }}
        />
      </div>
      <div class="st-emojis" role="radiogroup" aria-label="Icon">
        {ICONS.map((e) => (
          <button key={e} type="button" role="radio" aria-checked={draft.icon === e} class={'st-emoji' + (draft.icon === e ? ' is-active' : '')} onClick={() => (uiSound('tap'), st.setMeta({ icon: e }))}>
            {e}
          </button>
        ))}
      </div>

      <SectionHeader title="Function" icon="sparkles" subtitle="Decides what it does for your city" />
      <div class="st-fns" role="radiogroup" aria-label="Function">
        {FN_IDS.map((id) => {
          const f = fnDef(id);
          const on = draft.fn === id;
          return (
            <button key={id} type="button" role="radio" aria-checked={on} class={'st-fn' + (on ? ' is-active' : '')} onClick={() => (uiSound('toggle'), st.setMeta({ fn: id }))}>
              <span class="st-fn-icon">
                <Icon name={f.icon} size={20} />
              </span>
              <span class="st-fn-label">{f.label}</span>
              <span class="st-fn-blurb">{f.blurb}</span>
            </button>
          );
        })}
      </div>

      <SectionHeader title="What it does" icon="chart" subtitle={`${fnDef(draft.fn).label} · ${fmtMetres(stats.m.height)} · ${fmtFloors(stats.m.height)}`} />
      <div class="st-stats">
        {stats.d.rows.map((r) => (
          <div key={r.label} class={'st-stat tone-' + r.tone}>
            <Icon name={r.icon} size={16} />
            <span class="st-stat-l">{r.label}</span>
            <span class="st-stat-v num">{r.value}</span>
          </div>
        ))}
        {stats.d.coverage.map((c) => (
          <div key={c.service} class="st-stat tone-neutral">
            <Icon name="target" size={16} />
            <span class="st-stat-l" style={{ textTransform: 'capitalize' }}>
              {c.service} coverage
            </span>
            <span class="st-stat-v num">{c.radius} tiles</span>
          </div>
        ))}
      </div>
      <div class="st-costs">
        <div class="st-cost">
          <span class="st-cost-k">Build cost</span>
          <span class="st-cost-v num">{sandbox ? 'Free' : fmtMoney(stats.d.cost)}</span>
        </div>
        <div class="st-cost">
          <span class="st-cost-k">Upkeep</span>
          <span class="st-cost-v num">{sandbox ? '—' : fmtMoney(stats.d.upkeep) + '/mo'}</span>
        </div>
        <div class="st-cost">
          <span class="st-cost-k">Detail</span>
          <span class={'st-cost-v num' + (over ? ' bad' : '')}>
            {stats.m.triangles.toLocaleString()} / {TRI_BUDGET.toLocaleString()}
          </span>
        </div>
      </div>
      <p class="st-note">
        {stats.d.roadNeeded ? 'Needs a road next to it. ' : 'No road needed — place it anywhere. '}
        <em>“{flavorFor(draft)}”</em>
      </p>

      <SectionHeader title="Description" icon="edit" />
      <textarea
        class="st-desc"
        rows={3}
        maxLength={220}
        placeholder="What makes it special? Shown in the build menu."
        value={draft.description}
        onInput={(e) => st.setMeta({ description: (e.currentTarget as HTMLTextAreaElement).value })}
        onKeyDown={(e) => e.stopPropagation()}
      />

      <div class="st-save-actions">
        {over && (
          <Button block variant="secondary" icon="sparkles" onClick={() => st.optimise()}>
            Optimise detail to fit
          </Button>
        )}
        <Button block size="lg" variant="primary" icon="save" disabled={over} onClick={onSave}>
          {editing ? 'Save changes' : 'Save design'}
        </Button>
        <div class="st-save-row">
          {editing && (
            <Button
              variant="secondary"
              icon="copy"
              onClick={() => {
                const c = st.duplicateDesign();
                if (c) st.open(c.id, { tab: 'save' });
              }}
            >
              Save as copy
            </Button>
          )}
          <Button
            variant="secondary"
            icon="share"
            onClick={() => {
              const code = st.exportCode();
              const done = (ok: boolean) =>
                notify(ok ? { title: 'Share code copied', body: `${draft.icon} ${draft.name}`, kind: 'good', icon: 'copy' } : { title: 'Couldn’t reach the clipboard', body: 'Open My designs › ⋯ › Share code to copy it by hand.', kind: 'warn', icon: 'copy' });
              try {
                void navigator.clipboard.writeText(code).then(
                  () => done(true),
                  () => done(false),
                );
              } catch {
                done(false);
              }
            }}
          >
            Copy share code
          </Button>
        </div>
      </div>
    </div>
  );
}
