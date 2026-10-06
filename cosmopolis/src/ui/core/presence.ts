/**
 * OWNER: ui-core.
 * usePresence — keep an element mounted while its exit animation plays.
 *   const { mounted, shown } = usePresence(open, 320);
 *   mounted → render it; shown → apply the "in" state.
 * Entrances are CSS keyframe animations on the `.is-shown` state (no frame-timing dependency, so they start on
 * the very first paint even when the main thread is busy); exits are CSS transitions back to the resting state.
 */
import { useEffect, useState } from 'preact/hooks';
import { reduceMotion } from './env';

export function usePresence(open: boolean, exitMs = 300): { mounted: boolean; shown: boolean } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), reduceMotion() ? 0 : exitMs);
    return () => clearTimeout(t);
  }, [open]);
  return { mounted: mounted || open, shown: open };
}
