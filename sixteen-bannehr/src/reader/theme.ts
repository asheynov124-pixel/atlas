import { useEffect, useSyncExternalStore } from 'react';
import { usePrefs } from '../store/prefs';
import { useBook } from '../store/book';
import type { ThemeColors } from '../model/types';

const dark = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

// A host page (the claude.ai viewer) may set data-theme="dark" | "light" on the root to
// pass on the reader's own choice; that wins over the operating system's setting.
function hostDark(): boolean {
  const host = typeof document !== 'undefined' ? document.documentElement.dataset.theme : undefined;
  if (host === 'dark') return true;
  if (host === 'light') return false;
  return !!dark?.matches;
}

function useSystemDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      dark?.addEventListener('change', cb);
      const watch = new MutationObserver(cb);
      watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      return () => {
        dark?.removeEventListener('change', cb);
        watch.disconnect();
      };
    },
    hostDark,
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
    root.dataset.bookTheme = night ? 'night' : 'day';
    for (const [k, v] of Object.entries(colors)) root.style.setProperty(`--${k}`, v);
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', night ? colors.paper : theme.day.sage);
  }, [night, theme]);
}
