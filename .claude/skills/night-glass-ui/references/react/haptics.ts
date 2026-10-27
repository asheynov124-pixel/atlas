// Reference implementation from PH Discovery (src/gestures/haptics.ts).
// Its imports point at that app's stores and modules: keep the structure and class names, rewire the data.

/**
 * Haptics. Android/Chromium: Vibration API. iOS Safari has no Vibration API,
 * but since iOS 18 toggling an `<input type="checkbox" switch>` produces the
 * system selection haptic — so we click a hidden one, inside the user gesture.
 */
import { useStore } from '../state/store';

export type HapticKind = 'light' | 'selection' | 'success' | 'warning' | 'heavy';

const PATTERN: Record<HapticKind, number | number[]> = {
  light: 8,
  selection: 5,
  success: [10, 40, 14],
  warning: [16, 50, 16],
  heavy: 24,
};

let iosLabel: HTMLLabelElement | null = null;

function iosTick() {
  if (typeof document === 'undefined') return;
  if (!iosLabel) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.id = 'haptic-switch';
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    const label = document.createElement('label');
    label.htmlFor = input.id;
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    label.appendChild(input);
    document.body.appendChild(label);
    iosLabel = label;
  }
  iosLabel.click();
}

export function haptic(kind: HapticKind = 'light') {
  try {
    if (!useStore.getState().settings.haptics) return;
  } catch {
    return;
  }
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(PATTERN[kind]);
      return;
    }
    iosTick();
    if (kind === 'success' || kind === 'warning') setTimeout(iosTick, 70);
  } catch {
    /* haptics are best-effort */
  }
}
