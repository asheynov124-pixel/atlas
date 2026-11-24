import { hopCopy, hopStatus } from '../hop/policy';
import { nodeById } from '../data/corpus';
import { useSession } from '../state/session';

export function PeekSheet() {
  const peekId = useSession((s) => s.peekId);
  const clock = useSession((s) => s.clock);
  const closePeek = useSession((s) => s.closePeek);
  const confirmPeek = useSession((s) => s.confirmPeek);

  if (!peekId) return null;
  const node = nodeById(peekId);
  if (!node) return null;

  const status = hopStatus(node, clock);
  const copy = hopCopy(status, node, clock);

  return (
    <div className="peek-backdrop" role="presentation" onClick={closePeek}>
      <div
        className="peek-sheet"
        role="dialog"
        aria-labelledby="peek-title"
        onClick={(e) => e.stopPropagation()}
      >
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
      </div>
    </div>
  );
}
