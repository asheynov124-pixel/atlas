/** Age gate, app lock, and the boot splash. */
import { useState } from 'react';
import { useStore } from '../state/store';
import { useUI } from '../state/ui';
import { sha256 } from '../lib/crypto';
import { haptic } from '../gestures/haptics';
import { IconLock } from './Icons';

export function Splash({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  return (
    <div className="splash">
      <div className="splash__mark">◆</div>
      {error ? (
        <>
          <p>Couldn’t start: {error}</p>
          <button className="btn btn--primary" onClick={onRetry}>
            Retry
          </button>
        </>
      ) : (
        <div className="splash__bar" />
      )}
    </div>
  );
}

export function AgeGate() {
  const setSettings = useStore((s) => s.setSettings);
  return (
    <div className="gate" role="dialog" aria-labelledby="gate-title">
      <div className="gate__card">
        <div className="gate__mark">18+</div>
        <h1 id="gate-title">Adults only</h1>
        <p>
          This app is for discovering adult content. Continue only if you are at least 18 years old, or the age of majority where you live, and viewing adult material is legal for
          you.
        </p>
        <p className="muted small">This prototype runs entirely on fictional mock data stored on this device.</p>
        <button className="btn btn--primary btn--block" onClick={() => setSettings({ ageConfirmedAt: Date.now() })}>
          I’m 18 or older — enter
        </button>
        <button className="btn btn--ghost btn--block" onClick={() => (window.location.href = 'about:blank')}>
          Leave
        </button>
      </div>
    </div>
  );
}

export function LockScreen() {
  const pinHash = useStore((s) => s.settings.pinHash);
  const wipe = useStore((s) => s.wipeEverything);
  const setLocked = useUI((s) => s.setLocked);
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const [forgot, setForgot] = useState(false);

  const press = async (digit: string) => {
    haptic('selection');
    const next = (pin + digit).slice(0, 8);
    setPin(next);
    if (next.length >= 4 && (await sha256(next)) === pinHash) {
      haptic('success');
      setLocked(false);
    } else if (next.length === 8) {
      haptic('warning');
      setShake(true);
      setTimeout(() => {
        setShake(false);
        setPin('');
      }, 400);
    }
  };

  return (
    <div className="lock" role="dialog" aria-label="App locked">
      <IconLock size={28} />
      <h1>Locked</h1>
      <div className={`lock__dots${shake ? ' lock__dots--shake' : ''}`} aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <div className="lock__pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) =>
          k === '' ? (
            <span key={i} />
          ) : (
            <button key={i} type="button" onClick={() => (k === '⌫' ? setPin((p) => p.slice(0, -1)) : void press(k))} aria-label={k === '⌫' ? 'Delete' : k}>
              {k}
            </button>
          ),
        )}
      </div>
      {forgot ? (
        <div className="lock__forgot">
          <p>The PIN can’t be recovered. You can erase all data on this device and start fresh.</p>
          <button
            className="btn btn--danger"
            onClick={() => {
              wipe();
              setLocked(false);
            }}
          >
            Erase everything
          </button>
          <button className="btn btn--ghost" onClick={() => setForgot(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="link" onClick={() => setForgot(true)}>
          Forgot PIN?
        </button>
      )}
    </div>
  );
}
