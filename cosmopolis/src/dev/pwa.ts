/** Service worker registration (offline + iOS home-screen install). Skipped in dev, single-file builds and sandboxed frames. */
declare const __SINGLE_FILE__: boolean;

export function registerServiceWorker(): void {
  try {
    if (import.meta.env.DEV || __SINGLE_FILE__) return;
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
    if (window.self !== window.top) return;
    void navigator.serviceWorker.register('./sw.js').catch(() => {});
  } catch {
    /* ignore */
  }
}
