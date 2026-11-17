let sentinel: WakeLockSentinel | null = null;
let wanted = false;

export function wakeSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

export async function setWakeLock(on: boolean): Promise<'held' | 'idle' | 'unsupported' | 'denied'> {
  wanted = on;
  if (!wakeSupported()) return 'unsupported';
  if (!on) {
    try {
      await sentinel?.release();
    } catch {
      /* already released */
    }
    sentinel = null;
    return 'idle';
  }
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
      if (wanted && document.visibilityState === 'visible') void setWakeLock(true);
    });
    return 'held';
  } catch {
    return 'denied';
  }
}

export function wakeWanted(): boolean {
  return wanted;
}
