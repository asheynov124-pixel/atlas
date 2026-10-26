import { create } from 'zustand';
import { IN_ARTIFACT, rememberPlace, rememberedPlace } from '../platform';

// Where the reader is. The spread id lives in the URL (#/p/<id>) so a reload keeps the
// place and Contents entries are real links.

export type Route = { name: 'book'; spreadId: string | null } | { name: 'specimen' };

function parse(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  if (h === 'specimen') return { name: 'specimen' };
  const m = h.match(/^p\/(.+)$/);
  return { name: 'book', spreadId: m ? decodeURIComponent(m[1]) : null };
}

function initialRoute(): Route {
  const route = parse(typeof location === 'undefined' ? '' : location.hash);
  if (route.name === 'book' && !route.spreadId) return { name: 'book', spreadId: rememberedPlace() };
  return route;
}

interface NavState {
  route: Route;
  /** +1 turning forward, -1 back, 0 a jump (contents, reload). */
  dir: 1 | -1 | 0;
  go: (spreadId: string, dir?: 1 | -1 | 0) => void;
}

export const useNav = create<NavState>()((set) => ({
  route: initialRoute(),
  dir: 0,
  go: (spreadId, dir = 0) => {
    const hash = `#/p/${encodeURIComponent(spreadId)}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
    rememberPlace(spreadId);
    set({ route: { name: 'book', spreadId }, dir });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    useNav.setState({ route: parse(location.hash), dir: 0 });
  });
  // The artifact viewer frames the page; follow our own #/p/… links in place rather
  // than trusting the frame to treat them as in-page navigation.
  if (IN_ARTIFACT) {
    document.addEventListener(
      'click',
      (e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = (e.target as Element | null)?.closest?.('a[href^="#/"]');
        if (!a) return;
        e.preventDefault();
        const route = parse(a.getAttribute('href') ?? '');
        if (route.name === 'book' && route.spreadId) useNav.getState().go(route.spreadId, 0);
        else {
          history.replaceState(null, '', a.getAttribute('href'));
          useNav.setState({ route, dir: 0 });
        }
      },
      true,
    );
  }
}

export function hrefFor(spreadId: string): string {
  return `#/p/${encodeURIComponent(spreadId)}`;
}
