// Reference implementation from PH Discovery (src/components/Toasts.tsx).
// Its imports point at that app's stores and modules: keep the structure and class names, rewire the data.

import { useEffect } from 'react';
import { useUI, type Toast } from '../state/ui';
import { IconUndo } from './Icons';

function ToastItem({ t }: { t: Toast }) {
  const drop = useUI((s) => s.dropToast);
  useEffect(() => {
    const timer = setTimeout(() => drop(t.id), t.ttl);
    return () => clearTimeout(timer);
  }, [t.id, t.ttl, drop]);
  return (
    <div className={`toast${t.tone ? ` toast--${t.tone}` : ''}`} role="status">
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
          {t.action.label === 'Undo' && <IconUndo size={14} />} {t.action.label}
        </button>
      )}
    </div>
  );
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const tab = useUI((s) => s.tab);
  const sheetOpen = useUI((s) => s.sheets.length > 0);
  return (
    <div className={`toasts${sheetOpen ? ' toasts--sheet' : tab === 'feed' ? ' toasts--feed' : ''}`} data-no-gesture aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  );
}
