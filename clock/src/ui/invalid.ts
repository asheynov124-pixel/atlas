const linkError = (el: HTMLElement, shown: boolean) => {
  const errorId = el.dataset.error;
  if (!errorId) return;
  const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter((id) => id && id !== errorId);
  if (shown) ids.push(errorId);
  if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
  else el.removeAttribute('aria-describedby');
};

export function installInvalidSync() {
  const flagged = new WeakSet<Element>();
  const sync = (el: EventTarget | null) => {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return;
    const invalid = el.matches(':user-invalid');
    if (invalid) {
      el.setAttribute('aria-invalid', 'true');
      linkError(el, true);
      flagged.add(el);
      return;
    }
    if (flagged.has(el) || el.getAttribute('aria-invalid') !== 'true') {
      if (el.getAttribute('aria-invalid') === 'true' && !flagged.has(el)) return;
      el.setAttribute('aria-invalid', 'false');
      linkError(el, false);
      flagged.delete(el);
    }
  };
  document.querySelectorAll('input, select, textarea').forEach((el) => sync(el));
  document.addEventListener('blur', (event) => sync(event.target), true);
  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target instanceof Element && target.hasAttribute('aria-invalid')) sync(target);
  });
  document.addEventListener('invalid', (event) => sync(event.target), true);
}
