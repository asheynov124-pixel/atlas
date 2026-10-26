import { useEffect, useSyncExternalStore } from 'react';
import { usePrefs } from '../store/prefs';
import { useBook } from '../store/book';
import type { ThemeColors } from '../model/types';

const dark = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function useSystemDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      dark?.addEventListener('change', cb);
      return () => dark?.removeEventListener('change', cb);
    },
    () => !!dark?.matches,
  );
}

export function useNightTheme(): boolean {
  const choice = usePrefs((s) => s.theme);
  const system = useSystemDark();
  return choice === 'night' || (choice === 'auto' && system);
}

/** Write the book's theme (its data) onto the document as custom properties. */
export function useApplyTheme() {
  const night = useNightTheme();
  const theme = useBook().theme;
  useEffect(() => {
    const colors: ThemeColors = night ? theme.night : theme.day;
    const root = document.documentElement;
    root.dataset.theme = night ? 'night' : 'day';
    for (const [k, v] of Object.entries(colors)) root.style.setProperty(`--${k}`, v);
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', night ? colors.paper : theme.day.sage);
  }, [night, theme]);
}
