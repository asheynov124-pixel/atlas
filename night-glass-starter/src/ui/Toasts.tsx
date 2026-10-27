/** Toasts: under the top bar on the feed, above the tab bar elsewhere, at the top while a sheet is open. */
import { useEffect, useRef } from 'react';
import { useUI } from '../state/ui';
import { IconUndo } from './Icons';

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const drop = useUI((s) => s.dropToast);
  const onFeed = useUI((s) => s.tab === 'feed');
  const sheetOpen = useUI((s) => s.sheets.length > 0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    for (const t of toasts) if (!timers.current.has(t.id)) timers.current.set(t.id, setTimeout(() => drop(t.id), t.ttl));
    for (const [id, timer] of timers.current)
      if (!toasts.some((t) => t.id === id)) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
  }, [toasts, drop]);

  return (
    <div className={`toasts${sheetOpen ? ' toasts--sheet' : onFeed ? ' toasts--feed' : ''}`} role="status" aria-live="polite" data-no-gesture>
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone ?? 'info'}`}>
          <span>{t.text}</span>
          {t.action && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                t.action!.run();
                drop(t.id);
              }}
            >
              <IconUndo size={15} /> {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
