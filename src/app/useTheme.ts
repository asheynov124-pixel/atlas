import { useEffect } from 'react';
import type { Theme } from '@/book/types';
import { useUiStore } from '@/state/uiStore';

/** Push the book's theme into CSS custom properties, and the day/night choice onto <html>. */
export function useApplyTheme(theme: Theme) {
  const name = useUiStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = name;
    const night = name === 'night';
    root.style.setProperty('--paper', night ? theme.night.paper : theme.paper);
    root.style.setProperty('--ink', night ? theme.night.ink : theme.ink);
    root.style.setProperty('--muted', night ? theme.night.muted : theme.muted);
    root.style.setProperty('--hairline', night ? theme.night.hairline : theme.hairline);
    root.style.setProperty('--sage', theme.sage);
    root.style.setProperty('--olive', theme.olive);
    root.style.setProperty('--oak', theme.oak);
    root.style.setProperty('--clay', theme.clay);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', night ? theme.night.paper : theme.paper));
  }, [theme, name]);
}
