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

/** Set by the hosted-demo build (vite.demo.config.ts). */
const EMBEDDED = import.meta.env.VITE_EMBED === '1';

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

  // After hydration: apply mock config and warm caches from the snapshot store.
  // (The app lock is armed during hydration itself, before anything paints.)
  useEffect(() => {
    if (!hydrated) return;
    const s = useStore.getState();
    mockSource.configure(s.settings.mock);
    remember(Object.values(s.content));
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

  // System back (Android gesture nav, iOS Safari edge swipe) closes the top
  // layer instead of leaving the app: keep one in-app history entry and
  // re-arm it after each handled back.
  useEffect(() => {
    // Inside the hosted demo frame, pushing history would trap the host page's back button.
    if (EMBEDDED) return;
    const arm = () => history.pushState({ phd: true }, '', location.hash || '#/feed');
    if (!(history.state as { phd?: boolean } | null)?.phd) arm();
    const onPop = () => {
      const ui = useUI.getState();
      if (ui.locked) return;
      if (ui.capture) ui.setCapture(null);
      else if (ui.sheets.length) ui.closeSheet();
      else if (ui.tab !== 'feed') ui.setTab('feed');
      else return; // nothing open: the next back leaves, as expected
      arm();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
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
