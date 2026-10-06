/**
 * OWNER: ui-core.
 * usePresence — keep an element mounted while its exit animation plays.
 *   const { mounted, shown } = usePresence(open, 320);
 *   mounted → render it; shown → apply the "in" state (CSS transitions do the rest).
 */
import { useEffect, useState } from 'preact/hooks';
import { reduceMotion } from './env';

export function usePresence(open: boolean, exitMs = 300): { mounted: boolean; shown: boolean } {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let raf1 = 0, raf2 = 0;
    let t: ReturnType<typeof setTimeout> | undefined;
    if (open) {
      setMounted(true);
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setShown(true));
      });
    } else {
      setShown(false);
      t = setTimeout(() => setMounted(false), reduceMotion() ? 0 : exitMs);
    }
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (t) clearTimeout(t);
    };
  }, [open]);
  return { mounted: mounted || open, shown: shown && open };
}
