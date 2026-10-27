/** The top bar holds context, not actions: who you are, which feed, where you are in it. */
import { APP } from '../app/config';
import { useUI } from '../state/ui';
import { IconChevron, IconSearch, IconSliders, IconSparkle } from '../ui/Icons';

export function TopBar({ label, position, hidden, onFeed }: { label: string; position: string; hidden: boolean; onFeed: (delta: 1 | -1) => void }) {
  const setTab = useUI((s) => s.setTab);
  const openSheet = useUI((s) => s.openSheet);
  return (
    <header className={`pathbar${hidden ? ' pathbar--hidden' : ''}`} data-no-gesture>
      <button type="button" className="profile-badge" aria-label={`Profile: ${APP.profileName}`} onClick={() => setTab('you')}>
        <span className="profile-badge__avatar" aria-hidden="true">
          {APP.profileName.slice(0, 1)}
        </span>
        <span className="profile-badge__name">{APP.profileName}</span>
      </button>
      <div className="pathbar__path">
        <button type="button" className="pathbar__arrow" aria-label="Previous feed" onClick={() => onFeed(-1)}>
          <IconChevron dir="left" size={18} />
        </button>
        <button type="button" className="pathbar__chip" aria-label={`Feed: ${label}, ${position}. Switch feed`} onClick={() => openSheet({ kind: 'feeds' })}>
          <IconSparkle size={16} className="pathbar__icon" />
          <span className="pathbar__label">{label}</span>
          <span className="pathbar__pos">{position}</span>
        </button>
        <button type="button" className="pathbar__arrow" aria-label="Next feed" onClick={() => onFeed(1)}>
          <IconChevron dir="right" size={18} />
        </button>
      </div>
      <div className="pathbar__actions">
        <button type="button" className="icon-btn" aria-label="Search" onClick={() => setTab('search')}>
          <IconSearch />
        </button>
        <button type="button" className="icon-btn" aria-label="How swiping works" onClick={() => openSheet({ kind: 'gestures' })}>
          <IconSliders />
        </button>
      </div>
    </header>
  );
}
