/*
 * Siege Foundry — INPUT
 * =====================
 * Turns keyboard and mouse events into plain actions:
 *   { type: 'primary' }            Enter / Space (start, continue, restart)
 *   { type: 'buy', key }           1 = Faster Firing, 2 = Heavier Shot, or a card's button
 *   { type: 'restart' }            R on the result screen
 *   { type: 'start' | 'continue' } the matching on-screen buttons
 * Any element with data-action="..." (and optional data-key) dispatches on click.
 * Gameplay itself needs no input: the cannon fires on its own.
 */
(function (root) {
  'use strict';
  const SF = (root.SiegeFoundry = root.SiegeFoundry || {});

  function attachInput(doc, dispatch) {
    doc.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-action]');
      if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
      dispatch({ type: el.dataset.action, key: el.dataset.key });
    });

    doc.addEventListener('keydown', (ev) => {
      if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.repeat) return;
      const onButton = ev.target && ev.target.tagName === 'BUTTON';
      switch (ev.key) {
        case 'Enter':
        case ' ':
          // A focused button already gets a native click for these keys.
          if (onButton) return;
          ev.preventDefault();
          dispatch({ type: 'primary' });
          break;
        case '1':
          dispatch({ type: 'buy', key: 'rate' });
          break;
        case '2':
          dispatch({ type: 'buy', key: 'damage' });
          break;
        case 'r':
        case 'R':
          dispatch({ type: 'restart' });
          break;
      }
    });
  }

  SF.attachInput = attachInput;
})(typeof self !== 'undefined' ? self : this);
