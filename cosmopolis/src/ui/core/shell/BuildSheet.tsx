/**
 * OWNER: ui-core.
 * BuildSheet — the item browser. Roads / Zones / Nature open their own category; Build shows category tabs
 * (power … orbital, My Designs). Items are grouped by `group` into cards: 3D thumbnail, name, cost, key stat
 * chips, lock state + reason, affordability. Tap = select the tool; long-press or ⓘ = the detail sheet.
 */
import { useMemo, useRef } from 'preact/hooks';
import { getItem, type ItemDef } from '../../../content/catalog';
import type { Category } from '../../../core/types';
import { game } from '../../../game/instance';
import { Icon } from '../../icons';
import { ui } from '../../store';
import { Button } from '../Button';
import { Tabs } from '../controls';
import { Chip, EmptyState, SectionHeader } from '../display';
import { useLongPress, uiSound, viewport } from '../env';
import { fmtCompact, fmtMoney } from '../format';
import { Sheet } from '../Sheet';
import { closeSheet, detailItem, openCategory, selectItem } from './actions';
import { BUILD_TABS, CATEGORY_META, dockFor, effectRows, footprintLabel, groupItems, isUnlocked, itemsFor, keyStats, lockReason, SERVICE_ICON } from './buildModel';
import { ItemArt } from './ItemArt';

function costLabel(def: ItemDef): string {
  return def.cost <= 0 ? 'Free' : fmtMoney(def.cost, true);
}

/** Treasury readout in the sheet header (own component so the item grid doesn't re-render with money). */
function Wallet() {
  return (
    <span class="bs-wallet num" title="Treasury">
      <Icon name="money" size={14} />
      {fmtMoney(ui.money.value, true)}
    </span>
  );
}

function ItemCard({ def, sandbox }: { def: ItemDef; sandbox: boolean }) {
  const unlocked = isUnlocked(def);
  const afford = sandbox || ui.money.value >= def.cost;
  const lp = useLongPress(
    () => selectItem(def),
    () => {
      uiSound('open');
      detailItem.value = def;
    },
  );
  const stats = keyStats(def, 2);
  const active = ui.tool.value?.itemId === def.id;
  const reason = unlocked ? null : lockReason(def);
  return (
    <div class={'bs-card' + (unlocked ? '' : ' is-locked') + (afford ? '' : ' is-poor') + (active ? ' is-active' : '')}>
      <button type="button" class="bs-card-main" aria-label={`${def.name}${unlocked ? '' : ' (locked)'}`} {...lp}>
        <span class="bs-thumb">
          <ItemArt def={def} size={84} />
        </span>
        <span class="bs-name">{def.name}</span>
        <span class={'bs-cost num' + (afford ? '' : ' bad')}>{costLabel(def)}</span>
        {unlocked ? (
          stats.length > 0 && (
            <span class="bs-chips">
              {stats.map((s) => (
                <span key={s.label} class={'bs-chip tone-' + s.tone} title={s.label}>
                  <Icon name={s.icon} size={11} />
                  {s.text}
                </span>
              ))}
            </span>
          )
        ) : (
          <span class="bs-lock">
            <Icon name="lock" size={11} />
            <span class="ellipsis">{reason ?? 'Locked'}</span>
          </span>
        )}
      </button>
      <button
        type="button"
        class="bs-info"
        aria-label={`About ${def.name}`}
        onClick={() => {
          uiSound('open');
          detailItem.value = def;
        }}
      >
        <Icon name="info" size={15} />
      </button>
    </div>
  );
}

function StudioCard() {
  return (
    <div class="bs-card bs-new">
      <button
        type="button"
        class="bs-card-main"
        onClick={() => {
          uiSound('open');
          closeSheet();
          try {
            game.studio.open();
          } catch (e) {
            console.error('[ui] studio open failed', e);
          }
        }}
      >
        <span class="bs-thumb bs-new-thumb">
          <Icon name="plus" size={30} />
        </span>
        <span class="bs-name">New design</span>
        <span class="bs-cost">Architect Studio</span>
      </button>
    </div>
  );
}

export function BuildSheet() {
  const raw = ui.category.value;
  const dock = dockFor(raw);
  const open = !!dock && ui.view.value === 'planet' && !ui.chromeHidden.value;
  const last = useRef<Category>('power');
  if (dock) last.current = raw as Category;
  const cat = last.current;
  const isBuild = (BUILD_TABS as string[]).includes(cat);
  const sandbox = ui.mode.value === 'sandbox';
  const version = ui.catalogVersion.value;
  const tier = ui.tier.value;
  const items = useMemo(() => itemsFor(cat), [cat, version, tier, open]);
  const groups = useMemo(() => groupItems(items), [items]);
  const vp = viewport.value;
  const meta = CATEGORY_META[cat];

  const tabs = isBuild
    ? BUILD_TABS.map((c) => ({ id: c, label: CATEGORY_META[c].label, icon: CATEGORY_META[c].icon }))
    : null;

  return (
    <Sheet
      open={open}
      onClose={closeSheet}
      title={isBuild ? 'Build' : meta.label}
      icon={isBuild ? 'build' : meta.icon}
      subtitle={meta.blurb}
      backdrop={false}
      snaps={vp.wide ? [0.62, 0.94] : [0.5, 0.9]}
      class="bs-sheet"
      sound
      toolbar={tabs ? <Tabs tabs={tabs} value={cat} onChange={(c) => openCategory(c as Category)} ariaLabel="Build categories" /> : undefined}
      actions={!sandbox ? <Wallet /> : undefined}
    >
      {cat === 'custom' && <div class="bs-grid bs-grid-top">{<StudioCard />}</div>}
      {items.length === 0 && cat !== 'custom' && <EmptyState icon={meta.icon} title="Nothing to build here yet" body="New blueprints arrive as your civilisation grows." />}
      {items.length === 0 && cat === 'custom' && (
        <EmptyState icon="custom" title="No designs yet" body="Compose your own skyscrapers, domes and spires in the Architect Studio — they will appear right here." />
      )}
      {groups.map((g) => (
        <section key={g.group} class="bs-group">
          {(groups.length > 1 || g.group !== 'General') && <SectionHeader title={g.group} subtitle={undefined} action={<span class="bs-count num">{g.items.length}</span>} />}
          <div class="bs-grid">
            {g.items.map((d) => (
              <ItemCard key={d.id} def={d} sandbox={sandbox} />
            ))}
          </div>
        </section>
      ))}
    </Sheet>
  );
}

// ───────────────────────────────────────────── detail sheet
export function ItemDetail() {
  const live = detailItem.value;
  const last = useRef<ItemDef | null>(live);
  if (live) last.current = live;
  const def = last.current ? getItem(last.current.id) ?? last.current : null;
  const close = () => (detailItem.value = null);
  const sandbox = ui.mode.value === 'sandbox';
  if (!def) return null;
  const unlocked = isUnlocked(def);
  const afford = sandbox || ui.money.value >= def.cost;
  const reason = unlocked ? null : lockReason(def);
  const effects = effectRows(def);
  const req: string[] = [];
  if (def.requires?.coastal) req.push('Must touch the coast');
  if (def.requires?.feature?.length) req.push('Must sit on a special terrain feature');
  if (def.requires?.minElevation !== undefined) req.push(`Elevation ≥ ${def.requires.minElevation}`);
  if (def.requires?.road ?? (def.placement === 'surface' && def.category !== 'decor' && !def.zone && !def.road)) req.push('Needs road access');
  if (def.placement === 'water') req.push('Built on water');
  if (def.placement === 'orbit') req.push('Placed in orbit');
  if (def.unique) req.push('Only one per planet');
  if (def.planetTypes?.length) req.push(`Planets: ${def.planetTypes.join(', ')}`);
  let tierName = `Tier ${def.tier}`;
  try {
    tierName = game.progression.tierName(def.tier);
  } catch {
    /* default */
  }
  return (
    <Sheet
      open={!!live}
      onClose={close}
      title={def.name}
      icon={CATEGORY_META[def.category]?.icon ?? 'build'}
      subtitle={`${def.group ?? CATEGORY_META[def.category]?.label ?? ''}`}
      snaps={[0.72, 0.94]}
      maxWidth={560}
      class="id-sheet"
      footer={
        <div class="id-foot">
          <div class="id-foot-cost">
            <span class="id-foot-k">Cost</span>
            <span class={'id-foot-v num' + (afford ? '' : ' bad')}>{def.cost > 0 ? fmtMoney(def.cost) : 'Free'}</span>
          </div>
          <Button
            variant="primary"
            size="lg"
            icon={unlocked ? 'build' : 'lock'}
            disabled={!unlocked}
            onClick={() => {
              close();
              selectItem(def);
            }}
            sound={false}
          >
            {unlocked ? (afford ? 'Build' : 'Build anyway') : 'Locked'}
          </Button>
        </div>
      }
    >
      <div class="id-hero">
        <div class="id-art">
          <ItemArt def={def} size={180} large />
        </div>
        <div class="id-chips">
          <Chip size="sm" icon="crown" tone={unlocked ? 'violet' : 'warn'}>
            {tierName}
          </Chip>
          <Chip size="sm" icon="zones">
            {footprintLabel(def.footprint)}
          </Chip>
          {def.unique && (
            <Chip size="sm" icon="star" tone="money">
              Unique
            </Chip>
          )}
          {def.styleable && (
            <Chip size="sm" icon="palette" tone="info">
              Styleable
            </Chip>
          )}
        </div>
      </div>
      {!unlocked && (
        <div class="id-locked">
          <Icon name="lock" size={16} />
          <span>{reason ?? 'Not unlocked yet'}</span>
        </div>
      )}
      <p class="id-desc">{def.description}</p>
      {def.flavor && <p class="id-flavor">“{def.flavor}”</p>}
      <div class="id-stats">
        <div class="id-stat">
          <span class="id-stat-k">Build cost</span>
          <span class="id-stat-v num">{def.cost > 0 ? fmtMoney(def.cost) : 'Free'}</span>
        </div>
        <div class="id-stat">
          <span class="id-stat-k">Upkeep</span>
          <span class="id-stat-v num">{def.upkeep > 0 ? fmtMoney(def.upkeep) + '/mo' : '—'}</span>
        </div>
        {def.road && (
          <div class="id-stat">
            <span class="id-stat-k">Capacity · speed</span>
            <span class="id-stat-v num">
              {def.road.capacity} · {def.road.speed}
            </span>
          </div>
        )}
      </div>
      {effects.length > 0 && (
        <>
          <SectionHeader title="Effects" icon="sparkles" />
          <div class="id-effects">
            {effects.map((r) => (
              <div key={r.label} class={'id-effect tone-' + r.tone}>
                <Icon name={r.icon} size={15} />
                <span class="id-effect-l">{r.label}</span>
                <span class="id-effect-v num">{r.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {def.coverage && def.coverage.length > 0 && (
        <>
          <SectionHeader title="Service coverage" icon="target" />
          <div class="id-effects">
            {def.coverage.map((c) => (
              <div key={c.service} class="id-effect tone-neutral">
                <Icon name={SERVICE_ICON[c.service] ?? 'target'} size={15} />
                <span class="id-effect-l" style={{ textTransform: 'capitalize' }}>
                  {c.service}
                </span>
                <span class="id-effect-v num">
                  {c.radius} tiles{c.capacity ? ` · ${fmtCompact(c.capacity)}` : ''}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      {req.length > 0 && (
        <>
          <SectionHeader title="Requirements" icon="check" />
          <ul class="id-req">
            {req.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </>
      )}
      {def.tags && def.tags.length > 0 && (
        <div class="id-tags">
          {def.tags.slice(0, 8).map((t) => (
            <Chip key={t} size="sm">
              #{t}
            </Chip>
          ))}
        </div>
      )}
    </Sheet>
  );
}
