import { useSyncExternalStore } from 'react';
import type { LayoutMode } from './context';

// A spread needs pages at least ~400 px wide for 16 px+ body type and a landscape-ish
// window. Anything narrower (phones, iPad portrait) reads one page at a time.

const forced = (): LayoutMode | null => {
  const q = new URLSearchParams(location.search).get('layout');
  return q === 'phone' || q === 'spread' ? q : null;
};

function compute(): LayoutMode {
  const f = forced();
  if (f) return f;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pageWidth = Math.min((w - 72) / 2, (h - 100) * 0.75);
  return pageWidth >= 400 && w >= h * 0.95 ? 'spread' : 'phone';
}

let current: LayoutMode = typeof window === 'undefined' ? 'spread' : compute();
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    const next = compute();
    if (next !== current) {
      current = next;
      listeners.forEach((l) => l());
    }
  });
}

export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
