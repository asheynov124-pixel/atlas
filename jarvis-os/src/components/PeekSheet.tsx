import { useEffect, useRef } from 'react';
import { hopCopy, hopStatus } from '../hop/policy';
import { nodeById } from '../data/corpus';
import { useSession } from '../state/session';

export function PeekSheet() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const peekId = useSession((s) => s.peekId);
  const clock = useSession((s) => s.clock);
  const closePeek = useSession((s) => s.closePeek);
  const confirmPeek = useSession((s) => s.confirmPeek);

  const node = peekId ? nodeById(peekId) : undefined;
  const status = node ? hopStatus(node, clock) : null;
  const copy = node && status ? hopCopy(status, node, clock) : null;

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (peekId && node && copy) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [peekId, node, copy]);

  return (
    <dialog
      ref={dialogRef}
      className="peek-sheet"
      aria-labelledby="peek-title"
      onCancel={(e) => {
        e.preventDefault();
        closePeek();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) closePeek();
      }}
    >
      {copy && status && (
        <>
          <p className="peek-kicker">{status}</p>
          <h2 id="peek-title">{copy.title}</h2>
          <p>{copy.body}</p>
          <div className="peek-actions">
            <button type="button" className="btn ghost" onClick={() => confirmPeek('stay')}>
              {copy.stay}
            </button>
            {copy.openExtra && status !== 'unborn' && (
              <button type="button" className="btn" onClick={() => confirmPeek('extra')}>
                {copy.openExtra}
              </button>
            )}
            {copy.stepPast && status === 'sealed' && (
              <button type="button" className="btn primary" onClick={() => confirmPeek('stepPast')}>
                {copy.stepPast}
              </button>
            )}
          </div>
        </>
      )}
    </dialog>
  );
}
