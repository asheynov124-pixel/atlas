/** Best-effort haptics, behind the user's setting. Phones without vibration just skip it. */
import { useStore } from '../state/store';

const PATTERN = { light: 8, success: [10, 40, 14], warning: [20, 60, 20] } as const;

export function haptic(kind: keyof typeof PATTERN = 'light') {
  try {
    if (!useStore.getState().settings.haptics) return;
    navigator.vibrate?.(PATTERN[kind] as number | number[]);
  } catch {
    /* haptics are optional */
  }
}
