/**
 * OWNER: god.
 * Targeting fallback — only used if the tools module has no 'god' tool: the next tap on the 3D canvas (a short
 * press without much movement) picks a tile via game.input.pick and fires the power there. Esc / a second
 * panel tap cancels. The real targeting (reticle, drawn paths) lives in tools/god.ts.
 */
import { game } from '../../game/instance';
import { notify, ui } from '../../ui/store';
import type { GodPowerDef } from '../GodPowers';

let disarm: (() => void) | null = null;

export function armFallback(p: GodPowerDef): void {
  disarm?.();
  const canvas = game.engine?.canvas;
  if (!canvas) return;
  let down: { x: number; y: number; t: number } | null = null;
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 450;
    down = null;
    if (moved > 12 || !quick) return;
    const input = game.input as unknown as { pick?: (x: number, y: number) => { tile: number } | null };
    const hit = typeof input?.pick === 'function' ? input.pick(e.clientX, e.clientY) : null;
    if (!hit) return;
    cleanup();
    game.god.trigger(p.id, { tile: hit.tile });
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') cleanup();
  };
  const cleanup = () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
    if (ui.hint.value?.startsWith('Tap where')) ui.hint.value = null;
    disarm = null;
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
  disarm = cleanup;
  ui.hint.value = `Tap where ${p.name} should strike`;
  notify({ title: p.name, body: 'Tap the planet to unleash it.', kind: 'info', icon: p.icon });
}
