import { FeedView } from './feed/FeedView';
import { useStore } from './state/store';
import { useUI } from './state/ui';
import { SheetHost } from './ui/SheetHost';
import { TabBar } from './ui/TabBar';
import { Toasts } from './ui/Toasts';
import { Welcome } from './ui/Welcome';
import { LibraryView } from './views/LibraryView';
import { SearchView } from './views/SearchView';
import { YouView } from './views/YouView';

export function App() {
  const tab = useUI((s) => s.tab);
  const onboarded = useStore((s) => s.onboarded);
  return (
    <div className="app" data-tab={tab}>
      <main className="app__main">
        {/* The feed stays mounted, so its position and drag state survive tab switches. */}
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
      {!onboarded && <Welcome />}
    </div>
  );
}
