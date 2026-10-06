/**
 * OWNER: ui-core.
 * Side rails — round glass buttons registered by feature modules (ui/registry hudButtons) plus built-ins:
 * map (cosmos system view), god powers (panel "god"), undo / redo (game.commands). When a rail has more
 * buttons than fit, it collapses into a "more" toggle so the city stays visible.
 */
import { useState } from 'preact/hooks';
import { game } from '../../../game/instance';
import { Icon, IconOrEmoji } from '../../icons';
import { hudButtons, type HudButtonDef } from '../../registry';
import { notify, ui } from '../../store';
import { call, openPanel, uiSound, viewport } from '../env';

function safe<T>(fn: (() => T) | undefined, fallback: T): T {
  if (!fn) return fallback;
  try {
    return fn();
  } catch {
    return fallback;
  }
}

const BUILTIN: HudButtonDef[] = [
  {
    id: 'core.map',
    icon: 'starSystem',
    label: 'Star map',
    rail: 'right',
    order: -20,
    onClick: () => {
      if (call(game.cosmos, 'openView', 'system') === undefined && typeof game.cosmos?.openView !== 'function') notify({ title: 'Star map unavailable', kind: 'warn', icon: 'map' });
    },
    active: () => ui.view.value !== 'planet',
  },
  {
    id: 'core.god',
    icon: 'god',
    label: 'God powers',
    rail: 'right',
    order: -10,
    onClick: () => {
      if (ui.panel.value === 'god') ui.panel.value = null;
      else if (!openPanel('god')) notify({ title: 'The gods are resting', body: 'God powers will be available shortly.', kind: 'info', icon: 'god' });
    },
    active: () => ui.panel.value === 'god' || ui.tool.value?.id === 'god',
  },
];

function RailButton({ b }: { b: HudButtonDef }) {
  const active = safe(b.active, false);
  const badge = safe(b.badge, null);
  return (
    <button
      type="button"
      class={'rl-btn' + (active ? ' is-active' : '')}
      aria-label={b.label}
      aria-pressed={active}
      title={b.label}
      onClick={() => {
        uiSound('click');
        try {
          b.onClick();
        } catch (e) {
          console.error('[ui] hud button failed', b.id, e);
        }
      }}
    >
      <IconOrEmoji value={b.icon} size={21} />
      {badge !== null && badge !== undefined && badge !== 0 && badge !== '' && <span class="cz-badge cz-badge-float num">{badge}</span>}
    </button>
  );
}

function Rail({ side, buttons, extra }: { side: 'left' | 'right'; buttons: HudButtonDef[]; extra?: preact.ComponentChildren }) {
  const [expanded, setExpanded] = useState(false);
  const vp = viewport.value;
  // room between the top bar and the dock (≈ 56 px per button)
  const room = Math.max(2, Math.floor((vp.h - (vp.landscapePhone ? 130 : 220)) / 56));
  const max = Math.min(room, vp.phone ? 5 : 8);
  const overflow = buttons.length > max;
  const shown = overflow && !expanded ? buttons.slice(0, max - 1) : buttons;
  const hiddenActive = overflow && !expanded && buttons.slice(max - 1).some((b) => safe(b.active, false));
  return (
    <div class={`rl-rail rl-${side}`}>
      {shown.map((b) => (
        <RailButton key={b.id} b={b} />
      ))}
      {overflow && (
        <button type="button" class={'rl-btn rl-more' + (expanded ? ' is-open' : '') + (hiddenActive ? ' is-active' : '')} aria-label={expanded ? 'Fewer' : 'More tools'} aria-expanded={expanded} onClick={() => (uiSound('toggle'), setExpanded(!expanded))}>
          <Icon name={expanded ? 'chevronUp' : 'more'} size={20} />
        </button>
      )}
      {extra}
    </div>
  );
}

export function Rails() {
  void ui.catalogVersion.value; // re-render when modules register more buttons late
  const visible = (b: HudButtonDef) => safe(b.visible, true);
  const left = hudButtons.filter((b) => b.rail === 'left' && visible(b));
  const right = [...BUILTIN, ...hudButtons.filter((b) => b.rail === 'right' && visible(b))].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const canUndo = ui.canUndo.value;
  const canRedo = ui.canRedo.value;
  const undoRedo =
    canUndo || canRedo ? (
      <div class="rl-undo">
        <button type="button" class="rl-btn rl-small" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => (uiSound('click'), call(game.commands, 'undo'))}>
          <Icon name="undo" size={19} />
        </button>
        {canRedo && (
          <button type="button" class="rl-btn rl-small" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" onClick={() => (uiSound('click'), call(game.commands, 'redo'))}>
            <Icon name="redo" size={19} />
          </button>
        )}
      </div>
    ) : null;
  return (
    <>
      {left.length > 0 && <Rail side="left" buttons={left} />}
      <Rail side="right" buttons={right} extra={undoRedo} />
    </>
  );
}
