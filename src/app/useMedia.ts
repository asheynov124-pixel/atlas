import { useEffect, useState } from 'react';

export const DESKTOP_QUERY = '(min-width: 820px) and (min-aspect-ratio: 1/1)';

export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

export const useIsDesktop = () => useMedia(DESKTOP_QUERY);
export const usePrefersReducedMotion = () => useMedia('(prefers-reduced-motion: reduce)');
