import { useEffect } from 'react';
import { useStore } from './state/store';
import { useUI } from './state/ui';
import { useTaxonomy } from './state/taxonomy';
import { mockSource, remember } from './data/api';
import { FeedView } from './views/feed/FeedView';
import { SearchView } from './views/SearchView';
import { LibraryView } from './views/LibraryView';
import { YouView } from './views/YouView';
import { TabBar } from './components/TabBar';
import { Toasts } from './components/Toasts';
import { SheetHost } from './components/sheets/SheetHost';
import { AgeGate, LockScreen, Splash } from './components/Gates';

export function App() {
  const hydrated = useStore((s) => s.hydrated);
  const ageOk = useStore((s) => !!s.settings.ageConfirmedAt);
  const tab = useUI((s) => s.tab);
  const locked = useUI((s) => s.locked);
  const tx = useTaxonomy((s) => s.tx);
  const txError = useTaxonomy((s) => s.error);

  useEffect(() => {
    void useTaxonomy.getState().load();
  }, []);

  // After hydration: apply mock config, warm caches from the snapshot store, arm the lock.
  useEffect(() => {
    if (!hydrated) return;
    const s = useStore.getState();
    mockSource.configure(s.settings.mock);
    remember(Object.values(s.content));
    if (s.settings.pinHash) useUI.getState().setLocked(true);
  }, [hydrated]);

  // Re-lock after time away.
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      const { pinHash, lockAfterMin } = useStore.getState().settings;
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (pinHash && hiddenAt && Date.now() - hiddenAt >= lockAfterMin * 60000) useUI.getState().setLocked(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // iOS Safari: block pinch-zoom so two-finger swipes reach the feed.
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', prevent);
    return () => document.removeEventListener('gesturestart', prevent);
  }, []);

  useEffect(() => {
    const onHash = () => {
      const h = location.hash.replace('#/', '');
      if (['feed', 'search', 'library', 'you'].includes(h) && h !== useUI.getState().tab) useUI.getState().setTab(h as never);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (!hydrated || !tx) return <Splash error={txError} onRetry={() => void useTaxonomy.getState().load()} />;
  if (!ageOk) return <AgeGate />;
  if (locked) return <LockScreen />;

  return (
    <div className="app" data-tab={tab}>
      <main className="app__main">
        <div className={`view view--feed${tab === 'feed' ? '' : ' view--hidden'}`}>
          <FeedView />
        </div>
        {tab === 'search' && (
          <div className="view">
            <SearchView />
          </div>
        )}
        {tab === 'library' && (
          <div className="view">
            <LibraryView />
          </div>
        )}
        {tab === 'you' && (
          <div className="view">
            <YouView />
          </div>
        )}
      </main>
      <TabBar />
      <SheetHost />
      <Toasts />
    </div>
  );
}
