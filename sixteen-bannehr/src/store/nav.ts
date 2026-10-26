import { create } from 'zustand';

// Where the reader is. The spread id lives in the URL (#/p/<id>) so a reload keeps the
// place and Contents entries are real links.

export type Route = { name: 'book'; spreadId: string | null } | { name: 'specimen' };

function parse(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  if (h === 'specimen') return { name: 'specimen' };
  const m = h.match(/^p\/(.+)$/);
  return { name: 'book', spreadId: m ? decodeURIComponent(m[1]) : null };
}

interface NavState {
  route: Route;
  /** +1 turning forward, -1 back, 0 a jump (contents, reload). */
  dir: 1 | -1 | 0;
  go: (spreadId: string, dir?: 1 | -1 | 0) => void;
}

export const useNav = create<NavState>()((set) => ({
  route: parse(typeof location === 'undefined' ? '' : location.hash),
  dir: 0,
  go: (spreadId, dir = 0) => {
    const hash = `#/p/${encodeURIComponent(spreadId)}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
    set({ route: { name: 'book', spreadId }, dir });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    useNav.setState({ route: parse(location.hash), dir: 0 });
  });
}

export function hrefFor(spreadId: string): string {
  return `#/p/${encodeURIComponent(spreadId)}`;
}
