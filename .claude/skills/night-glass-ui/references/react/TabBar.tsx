// Reference implementation from PH Discovery (src/components/TabBar.tsx).
// Its imports point at that app's stores and modules: keep the structure and class names, rewire the data.

import { useUI, type Tab } from '../state/ui';
import { IconFeed, IconGrid, IconSearch, IconUser } from './Icons';
import { haptic } from '../gestures/haptics';

const TABS: { id: Tab; label: string; Icon: typeof IconFeed }[] = [
  { id: 'feed', label: 'Feed', Icon: IconFeed },
  { id: 'search', label: 'Search', Icon: IconSearch },
  { id: 'library', label: 'Library', Icon: IconGrid },
  { id: 'you', label: 'You', Icon: IconUser },
];

export function TabBar() {
  const tab = useUI((s) => s.tab);
  const setTab = useUI((s) => s.setTab);
  const hidden = useUI((s) => s.overlayHidden && s.tab === 'feed');
  return (
    <nav className={`tabbar${tab === 'feed' ? ' tabbar--over' : ''}${hidden ? ' tabbar--hidden' : ''}`} aria-label="Main" data-no-gesture>
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`tabbar__item${tab === id ? ' tabbar__item--on' : ''}`}
          aria-current={tab === id ? 'page' : undefined}
          onClick={() => {
            if (tab !== id) haptic('selection');
            setTab(id);
          }}
        >
          <Icon size={23} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
