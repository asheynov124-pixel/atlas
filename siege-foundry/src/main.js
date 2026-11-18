/*
 * Siege Foundry — MAIN (glue)
 * ===========================
 * Owns the current run and the frame loop. Each frame:
 *   1. advance the simulation in fixed 1/60 s steps (only during a wave),
 *   2. hand the simulation's events to the renderer and UI,
 *   3. redraw the canvas and HUD.
 * Player actions arrive from input.js and are applied through sim.js.
 *
 * URL options (for testing and reproducing a run):
 *   ?seed=123   fixed spawn randomness (restart reuses the same seed)
 *   ?speed=4    simulation speed multiplier, 0.25-20 (default 1)
 */
(function (root) {
  'use strict';
  const SF = root.SiegeFoundry;
  const { sim, CONFIG } = SF;

  const params = new URLSearchParams(root.location.search);
  const fixedSeed = params.has('seed') ? Number(params.get('seed')) >>> 0 : null;
  const speed = Math.min(20, Math.max(0.25, Number(params.get('speed')) || 1));

  const canvas = document.getElementById('field');
  const renderer = SF.createRenderer(canvas, CONFIG);
  const ui = SF.createUI(document, CONFIG, sim, renderer.paintIcon);

  let run = sim.createRun(CONFIG, fixedSeed);
  let shownState = null;

  function dispatch(action) {
    let result = { ok: false };
    switch (action.type) {
      case 'primary':
        if (run.state === 'start') return dispatch({ type: 'start' });
        if (run.state === 'intermission') return dispatch({ type: 'continue' });
        if (run.state === 'win' || run.state === 'loss') return dispatch({ type: 'restart' });
        return result;
      case 'start':
        result = sim.startRun(run);
        break;
      case 'continue':
        result = sim.continueRun(run);
        break;
      case 'buy':
        result = sim.buyUpgrade(run, action.key);
        if (result.ok) ui.refreshIntermission(run);
        else if (run.state === 'intermission') ui.announce(reasonText(result));
        break;
      case 'restart': {
        result = sim.restartRun(run, fixedSeed);
        if (result.ok) {
          run = result.run;
          renderer.reset();
          shownState = null;
        }
        break;
      }
    }
    flush();
    return result;
  }

  function reasonText(r) {
    switch (r.reason) {
      case 'insufficient':
        return `Not enough ${CONFIG.economy.currencyName}: short ${r.shortfall}.`;
      case 'one-per-intermission':
      case 'purchased':
        return 'Only one upgrade per intermission.';
      case 'maxed':
        return 'That upgrade is fully upgraded.';
      default:
        return '';
    }
  }

  function flush() {
    if (run.events.length) {
      renderer.ingest(run.events);
      ui.ingest(run.events);
      run.events.length = 0;
    }
    if (run.state !== shownState) {
      shownState = run.state;
      ui.showState(run);
    }
  }

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const realDt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (run.state === 'wave') {
      acc += realDt * speed;
      let steps = 0;
      while (acc >= sim.FIXED_DT && run.state === 'wave' && steps < 1200) {
        sim.step(run, sim.FIXED_DT);
        acc -= sim.FIXED_DT;
        steps++;
      }
    } else acc = 0;
    flush();
    renderer.draw(run, realDt);
    ui.updateHud(run);
    root.requestAnimationFrame(frame);
  }

  let resizeTimer = null;
  root.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderer.resize, 80);
  });

  SF.attachInput(document, dispatch);
  flush();
  root.requestAnimationFrame(frame);

  // Read-only handle for automated browser checks.
  SF.app = {
    get run() {
      return run;
    },
    dispatch,
    speed,
  };
})(typeof self !== 'undefined' ? self : this);
