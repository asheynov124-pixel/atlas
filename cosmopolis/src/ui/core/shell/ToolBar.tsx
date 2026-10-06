/**
 * OWNER: ui-core.
 * ToolBar — floating pill above the dock while a tool is active: the tool / item (tap to reopen its menu),
 * generic rendering of `ui.toolOptions` (choice chips or segmented, toggles, sliders, buttons →
 * game.tools.setOption), the live cost preview and a cancel button; `ui.hint` floats above it.
 */
import { getItem } from '../../../content/catalog';
import { game } from '../../../game/instance';
import { Icon, IconOrEmoji } from '../../icons';
import { ui, type ToolOption } from '../../store';
import { Segmented, Slider } from '../controls';
import { uiSound } from '../env';
import { fmtMoney } from '../format';
import { usePresence } from '../presence';
import { cancelTool, openCategory, toolOrigin } from './actions';
import { ItemArt } from './ItemArt';

const TOOL_META: Record<string, { icon: string; label: string; sub: string }> = {
  select: { icon: 'select', label: 'Select', sub: 'Tap anything to inspect it' },
  plop: { icon: 'build', label: 'Build', sub: 'Tap to place' },
  road: { icon: 'roads', label: 'Roads', sub: 'Drag to draw' },
  zone: { icon: 'zones', label: 'Zoning', sub: 'Drag to paint lots' },
  bulldoze: { icon: 'bulldoze', label: 'Bulldoze', sub: 'Tap or drag to clear' },
  terraform: { icon: 'terraform', label: 'Terraform', sub: 'Drag to sculpt the land' },
  district: { icon: 'district', label: 'Districts', sub: 'Drag to paint a district' },
  paint: { icon: 'paint', label: 'Paint', sub: 'Tap a building to recolour' },
  decor: { icon: 'nature', label: 'Decorate', sub: 'Tap to plant' },
  orbit: { icon: 'orbital', label: 'Orbit', sub: 'Tap to launch' },
  god: { icon: 'god', label: 'God power', sub: 'Choose your target' },
};

function setOption(o: ToolOption, value: string | number | boolean): void {
  try {
    game.tools.setOption(o.id, value);
  } catch (e) {
    console.error('[ui] setOption failed', o.id, e);
  }
  // reflect immediately unless the tool manager already published a fresh list
  const cur = ui.toolOptions.value;
  const i = cur.findIndex((x) => x.id === o.id);
  if (i >= 0 && cur[i].value !== value && o.type !== 'button') {
    const next = cur.slice();
    next[i] = { ...cur[i], value };
    ui.toolOptions.value = next;
  }
}

function OptionView({ o }: { o: ToolOption }) {
  if (o.type === 'choice' && o.choices?.length) {
    const short = o.choices.length <= 4 && o.choices.every((c) => (c.label?.length ?? 0) <= 9);
    if (short)
      return (
        <div class="tl-opt">
          <Segmented
            size="sm"
            value={o.value as string | number}
            onChange={(v) => setOption(o, v)}
            ariaLabel={o.label}
            options={o.choices.map((c) => ({ value: c.value, label: c.icon && c.label.length > 6 ? undefined : c.label, icon: c.icon, title: c.label }))}
          />
        </div>
      );
    return (
      <div class="tl-opt tl-choices" role="radiogroup" aria-label={o.label}>
        {o.choices.map((c) => {
          const on = c.value === o.value;
          return (
            <button key={String(c.value)} type="button" role="radio" aria-checked={on} class={'tl-choice' + (on ? ' is-active' : '')} title={c.label} onClick={() => (uiSound('tap'), setOption(o, c.value))}>
              {c.icon && <IconOrEmoji value={c.icon} size={16} />}
              <span>{c.label}</span>
            </button>
          );
        })}
      </div>
    );
  }
  if (o.type === 'toggle') {
    const on = !!o.value;
    return (
      <button type="button" class={'tl-toggle' + (on ? ' is-active' : '')} aria-pressed={on} onClick={() => (uiSound('toggle'), setOption(o, !on))} title={o.label}>
        {o.icon && <IconOrEmoji value={o.icon} size={16} />}
        <span>{o.label}</span>
      </button>
    );
  }
  if (o.type === 'slider') {
    const v = typeof o.value === 'number' ? o.value : o.min ?? 0;
    return (
      <div class="tl-opt tl-slider">
        <Slider value={v} min={o.min ?? 0} max={o.max ?? 1} step={o.step} onChange={(x) => setOption(o, x)} label={o.label} icon={o.icon && o.icon.length > 3 ? o.icon : undefined} format={(x) => (Number.isInteger(x) ? String(x) : x.toFixed(1))} />
      </div>
    );
  }
  return (
    <button type="button" class="tl-action" onClick={() => (uiSound('click'), setOption(o, true))} title={o.label}>
      {o.icon && <IconOrEmoji value={o.icon} size={16} />}
      <span>{o.label}</span>
    </button>
  );
}

export function ToolBar() {
  const live = ui.tool.value;
  const visible = !!live && ui.view.value === 'planet' && !ui.category.value;
  const { mounted, shown } = usePresence(visible, 260);
  if (!mounted || !live) return null;
  const t = live;
  const def = t.itemId ? getItem(t.itemId) : undefined;
  const meta = TOOL_META[t.id] ?? { icon: 'cursorClick', label: t.label ?? t.id, sub: 'Tap the planet' };
  const opts = ui.toolOptions.value;
  const cost = ui.costPreview.value;
  const hint = ui.hint.value;
  const origin = toolOrigin.value;
  const sandbox = ui.mode.value === 'sandbox';
  return (
    <div class={'tl-root' + (shown ? ' is-shown' : '')}>
      {hint && (
        <div class="tl-hint" key={hint}>
          {hint}
        </div>
      )}
      <div class={'tl-bar glass-strong pe' + (t.id === 'bulldoze' ? ' is-danger' : t.id === 'god' ? ' is-god' : '')}>
        <button
          type="button"
          class="tl-item"
          disabled={!origin}
          aria-label={origin ? `Change ${t.label ?? meta.label}` : t.label ?? meta.label}
          onClick={() => {
            if (!origin) return;
            uiSound('open');
            openCategory(origin);
          }}
        >
          <span class="tl-thumb">{def ? <ItemArt def={def} size={40} /> : <Icon name={meta.icon} size={20} />}</span>
          <span class="tl-item-text">
            <span class="tl-item-label ellipsis">{t.label ?? def?.name ?? meta.label}</span>
            {cost ? (
              <span class={'tl-cost num' + (cost.ok ? '' : ' bad')}>{cost.ok ? (cost.cost > 0 ? (sandbox ? 'Free in sandbox' : fmtMoney(cost.cost)) : 'Free') : cost.reason ?? 'Not here'}</span>
            ) : def && def.cost > 0 ? (
              <span class="tl-cost num">{fmtMoney(def.cost)}</span>
            ) : (
              <span class="tl-cost dim">{meta.sub}</span>
            )}
          </span>
          {origin && <Icon name="chevronUp" size={14} class="tl-reopen" />}
        </button>
        {opts.length > 0 && (
          <div class="tl-opts scroll-x">
            {opts.map((o) => (
              <OptionView key={o.id} o={o} />
            ))}
          </div>
        )}
        <button type="button" class="tl-close" aria-label="Cancel tool" title="Cancel (Esc)" onClick={() => (uiSound('close'), cancelTool())}>
          <Icon name="close" size={19} />
        </button>
      </div>
    </div>
  );
}
