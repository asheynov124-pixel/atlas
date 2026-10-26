import { create } from 'zustand';
import { usePrefs } from '../store/prefs';
import { AUTHORS, type Author } from '../model/types';

const usePrompt = create<{ resolve: ((a: Author) => void) | null }>()(() => ({ resolve: null }));

/** Who is acting on this device; asks once, the first time it matters. */
export function requireWho(): Promise<Author> {
  const who = usePrefs.getState().who;
  if (who) return Promise.resolve(who);
  return new Promise((resolve) => usePrompt.setState({ resolve }));
}

export function WhoPrompt() {
  const resolve = usePrompt((s) => s.resolve);
  if (!resolve) return null;
  const pick = (a: Author) => {
    usePrefs.getState().setWho(a);
    usePrompt.setState({ resolve: null });
    resolve(a);
  };
  return (
    <div className="who" role="dialog" aria-modal="true" aria-labelledby="who-title">
      <div className="who__card">
        <p className="sc who__kicker">One question, once</p>
        <h2 id="who-title" className="who__title">Who is holding the pen?</h2>
        <p className="who__text">Notes and favourites are signed. This device will remember.</p>
        <div className="who__choices">
          {(Object.keys(AUTHORS) as Author[]).map((a) => (
            <button key={a} type="button" className="who__choice" data-author={a} onClick={() => pick(a)} autoFocus={a === 'sonny'}>
              {AUTHORS[a].name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
