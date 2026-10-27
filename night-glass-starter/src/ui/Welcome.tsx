/** First run: a full-screen gate that names the app and teaches the four swipes. */
import { APP } from '../app/config';
import { VERBS, VERB_ORDER } from '../app/verbs';
import { useStore } from '../state/store';
import { Mark } from './common';

export function Welcome() {
  const finish = useStore((s) => s.finishOnboarding);
  return (
    <div className="gate" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="gate__card">
        <Mark />
        <h1 id="welcome-title">{APP.name}</h1>
        <p>{APP.tagline}</p>
        <ul className="chips chips--center" aria-label="How to swipe">
          {VERB_ORDER.map((v) => (
            <li key={v} className={`chip chip--${v}`} data-verb={v}>
              <span className="chip__body">
                {VERBS[v].swipe} · {VERBS[v].label}
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn--primary btn--block" onClick={finish}>
          Get started
        </button>
      </div>
    </div>
  );
}
