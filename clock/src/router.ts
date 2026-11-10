import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'now' }
  | { name: 'alarms' }
  | { name: 'alarm'; id: string }
  | { name: 'sleep' }
  | { name: 'timer' }
  | { name: 'stopwatch' }
  | { name: 'world' };

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { name: 'now' };
  if (path === '/alarms') return { name: 'alarms' };
  if (path === '/sleep') return { name: 'sleep' };
  if (path === '/timer') return { name: 'timer' };
  if (path === '/stopwatch') return { name: 'stopwatch' };
  if (path === '/world') return { name: 'world' };
  if (path.startsWith('/alarms/')) {
    const id = decodeURIComponent(path.slice('/alarms/'.length));
    if (id) return { name: 'alarm', id };
  }
  return { name: 'now' };
}

const listeners = new Set<() => void>();
let cachedPath = '';
let cached: Route = { name: 'now' };

function snapshot(): Route {
  const path = location.pathname;
  if (path !== cachedPath) {
    cachedPath = path;
    cached = parseRoute(path);
  }
  return cached;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onPop = () => {
    cachedPath = '';
    listener();
  };
  window.addEventListener('popstate', onPop);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', onPop);
  };
}

export function go(path: string) {
  if (location.pathname !== path) history.pushState(null, '', path);
  cachedPath = '';
  listeners.forEach((listener) => listener());
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
