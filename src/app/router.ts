import { useEffect, useState } from 'react';

export type Route =
  | { kind: 'spread'; id: string | null; index: number | null }
  | { kind: 'specimen' }
  | { kind: 'print' };

export function parseHash(hash: string = window.location.hash): Route {
  const h = hash.replace(/^#\/?/, '');
  if (h === 'specimen') return { kind: 'specimen' };
  if (h === 'print') return { kind: 'print' };
  const m = h.match(/^s\/([^/]+)/);
  if (m) return { kind: 'spread', id: decodeURIComponent(m[1]), index: null };
  const i = h.match(/^i\/(\d+)/);
  if (i) return { kind: 'spread', id: null, index: Number(i[1]) };
  return { kind: 'spread', id: null, index: null };
}

export function hashFor(route: Route): string {
  switch (route.kind) {
    case 'specimen':
      return '#/specimen';
    case 'print':
      return '#/print';
    case 'spread':
      if (route.id) return `#/s/${encodeURIComponent(route.id)}`;
      if (route.index != null) return `#/i/${route.index}`;
      return '#/';
  }
}

export function navigate(route: Route, replace = false) {
  const hash = hashFor(route);
  if (window.location.hash === hash) return;
  if (replace) {
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash());
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
