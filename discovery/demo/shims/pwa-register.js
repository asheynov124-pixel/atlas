// Demo build only: the hosted demo runs inside a sandboxed frame without service workers.
export function registerSW() {
  return () => Promise.resolve();
}
