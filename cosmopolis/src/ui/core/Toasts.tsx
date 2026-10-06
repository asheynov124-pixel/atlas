/**
 * OWNER: ui-core.
 * ToastStack — renders `ui.toasts` (posted with `notify()` from ui/store) as glass pills under the top bar.
 * Auto-dismiss (longer for warnings / milestones), swipe up or tap to dismiss; toasts with a `tile` fly the
 * camera there when tapped.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Notification } from '../../core/types';
import { game } from '../../game/instance';
import { IconOrEmoji, hasIcon } from '../icons';
import { dismissToast, ui } from '../store';
import { uiSound } from './env';

const KIND_ICON: Record<string, string> = { info: 'info', good: 'check', warn: 'alert', bad: 'alert', milestone: 'trophy' };
const KIND_MS: Record<string, number> = { info: 4200, good: 4200, warn: 6000, bad: 6500, milestone: 7000 };

function Toast({ t, depth }: { t: Notification; depth: number }) {
  const [leaving, setLeaving] = useState(false);
  const [dy, setDy] = useState(0);
  const drag = useRef<{ id: number; y0: number; moved: boolean } | null>(null);
  const leave = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => dismissToast(t.id), 220);
  };
  useEffect(() => {
    const ms = KIND_MS[t.kind ?? 'info'] ?? 4500;
    const timer = setTimeout(leave, ms);
    return () => clearTimeout(timer);
  }, []);
  const onTap = () => {
    if (t.tile !== undefined && t.tile >= 0 && game?.camera && game.planet) {
      try {
        void game.camera.flyTo(t.tile, { distance: 16, tilt: 0.85 });
      } catch {
        /* camera optional */
      }
      uiSound('whoosh');
    } else uiSound('tap');
    leave();
  };
  const icon = t.icon && (hasIcon(t.icon) || t.icon.length <= 4) ? t.icon : KIND_ICON[t.kind ?? 'info'];
  return (
    <div
      class={`cz-toast glass-strong pe kind-${t.kind ?? 'info'}${leaving ? ' is-leaving' : ''}${dy ? ' is-dragging' : ''}${depth > 0 ? ' is-behind' : ''}`}
      style={dy ? { transform: `translateY(${dy}px)`, opacity: Math.max(0, 1 + dy / 80) } : depth > 0 ? ({ '--depth': depth } as Record<string, number>) : undefined}
      aria-hidden={depth > 0 ? 'true' : undefined}
      role="status"
      onPointerDown={(e) => {
        drag.current = { id: e.pointerId, y0: e.clientY, moved: false };
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const y = Math.min(0, e.clientY - d.y0);
        if (Math.abs(y) > 4) d.moved = true;
        setDy(y);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d || d.id !== e.pointerId) return;
        if (dy < -28) leave();
        else if (!d.moved) onTap();
        setDy(0);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDy(0);
      }}
    >
      <span class="cz-toast-icon">
        <IconOrEmoji value={icon} size={18} />
      </span>
      <span class="cz-toast-text grow">
        <span class="cz-toast-title">{t.title}</span>
        {t.body && <span class="cz-toast-body">{t.body}</span>}
      </span>
      {t.tile !== undefined && t.tile >= 0 && <span class="cz-toast-go" aria-hidden="true">›</span>}
    </div>
  );
}

/**
 * Notification deck: the newest toast in front, up to two older ones peeking behind it (iOS-style), so a burst
 * of news never buries the city. Dismissing the front card brings the next one forward.
 */
export function ToastStack() {
  const list = ui.toasts.value.slice(-3);
  const n = list.length;
  return (
    <div class="cz-toasts" aria-live="polite">
      {list.map((t, i) => (
        <Toast key={t.id} t={t} depth={n - 1 - i} />
      ))}
    </div>
  );
}
