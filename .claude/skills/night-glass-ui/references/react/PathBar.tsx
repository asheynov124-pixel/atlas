// Reference implementation from PH Discovery (src/views/feed/PathBar.tsx).
// Its imports point at that app's stores and modules: keep the structure and class names, rewire the data.

/** Top bar: profile, active path (with switch arrows), search, filters. */
import { useStore, activePath, activeData } from '../../state/store';
import { useUI } from '../../state/ui';
import { switchPath } from '../../state/feed';
import { PATH_KINDS } from '../../engine/paths';
import { countActive, mergeFilters } from '../../engine/filters';
import { IconChevron, IconSearch, IconSliders } from '../../components/Icons';
import { ProfileBadge } from '../../components/common';
import { haptic } from '../../gestures/haptics';

export function PathBar() {
  const path = useStore(activePath);
  const count = useStore((s) => activeData(s).paths.length);
  const filterCount = useStore((s) => countActive(mergeFilters(activeData(s).filters, activePath(s).filters)));
  const openSheet = useUI((s) => s.openSheet);
  const setTab = useUI((s) => s.setTab);
  const hidden = useUI((s) => s.overlayHidden);
  const info = PATH_KINDS[path.seed.kind];

  return (
    <div className={`pathbar${hidden ? ' pathbar--hidden' : ''}`} data-no-gesture>
      <ProfileBadge onClick={() => openSheet({ kind: 'profiles' })} />
      <div className="pathbar__path">
        <button type="button" className="pathbar__arrow" aria-label="Previous path" disabled={count < 2} onClick={() => { haptic('selection'); switchPath(-1); }}>
          <IconChevron dir="left" size={16} />
        </button>
        <button type="button" className="pathbar__chip" onClick={() => openSheet({ kind: 'paths' })} aria-label={`Path: ${path.label}. Open path switcher`}>
          <span className="pathbar__icon">{info.icon}</span>
          <span className="pathbar__label">{path.label}</span>
          <span className="pathbar__pos">
            {Math.min(path.index + 1, path.queue.length)}/{path.exhausted ? path.queue.length : '∞'}
          </span>
        </button>
        <button type="button" className="pathbar__arrow" aria-label="Next path" disabled={count < 2} onClick={() => { haptic('selection'); switchPath(1); }}>
          <IconChevron dir="right" size={16} />
        </button>
      </div>
      <div className="pathbar__actions">
        <button type="button" className="icon-btn" aria-label="Search" onClick={() => setTab('search')}>
          <IconSearch size={20} />
        </button>
        <button type="button" className="icon-btn" aria-label="Filters" onClick={() => openSheet({ kind: 'filters', scope: 'path' })}>
          <IconSliders size={20} />
          {filterCount > 0 && <span className="badge">{filterCount}</span>}
        </button>
      </div>
    </div>
  );
}
