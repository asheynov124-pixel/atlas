/**
 * OWNER: tools.
 * Keyboard shortcuts (desktop) and the gesture cheat-sheet (touch), exported for the help panel, plus the key
 * handler installed by the InputController.
 *
 * ui-core's shell handles its menu keys first (capture phase: B build · T roads · Z zones · N nature · L terraform ·
 * X/Delete bulldoze · M star map · G god powers · H hide UI · I status · ? help · Ctrl+S save) and marks them
 * handled; this handler only acts on keys nobody handled yet:
 *   camera   W A S D / arrows pan · Q E rotate · R F tilt · + − zoom · . back to the city · C cinematic tour
 *   time     Space pause · 1–4 speed · 0 pause
 *   tools    Esc cancel (in-progress → tool → selection) · R / Shift+R rotate placement · [ ] brush size
 *   edit     Ctrl/Cmd+Z undo · Shift+Ctrl/Cmd+Z or Ctrl+Y redo
 *   view     P photo mode · V / Shift+V cycle data lenses · O build grid
 * Movement keys use physical key codes so AZERTY / Dvorak players get the same layout.
 */
import type { Game } from '../game/Game';
import { setSettings, settings } from '../core/settings';
import { notify, ui } from '../ui/store';

export interface ShortcutDef {
  keys: string[];
  label: string;
  group: 'Camera' | 'Time' | 'Build' | 'Edit' | 'View';
}

export interface GestureDef {
  gesture: string;
  label: string;
  icon: string;
}

/** Every desktop shortcut in the game (this module + ui-core's shell keys). */
export const SHORTCUTS: ShortcutDef[] = [
  { keys: ['W', 'A', 'S', 'D'], label: 'Pan (or drag / arrow keys)', group: 'Camera' },
  { keys: ['Q', 'E'], label: 'Rotate (or right-drag)', group: 'Camera' },
  { keys: ['R', 'F'], label: 'Tilt (or right-drag)', group: 'Camera' },
  { keys: ['+', '−'], label: 'Zoom (or scroll wheel)', group: 'Camera' },
  { keys: ['Double-click'], label: 'Zoom in there', group: 'Camera' },
  { keys: ['.'], label: 'Back to the city', group: 'Camera' },
  { keys: ['C'], label: 'Cinematic tour', group: 'Camera' },
  { keys: ['Shift'], label: 'Hold to move faster', group: 'Camera' },
  { keys: ['Space'], label: 'Pause / resume', group: 'Time' },
  { keys: ['1', '2', '3', '4'], label: 'Game speed', group: 'Time' },
  { keys: ['B'], label: 'Build menu', group: 'Build' },
  { keys: ['T'], label: 'Roads', group: 'Build' },
  { keys: ['Z'], label: 'Zones', group: 'Build' },
  { keys: ['N'], label: 'Nature & decor', group: 'Build' },
  { keys: ['L'], label: 'Terraform', group: 'Build' },
  { keys: ['X'], label: 'Bulldoze', group: 'Build' },
  { keys: ['R'], label: 'Rotate building (while placing)', group: 'Build' },
  { keys: ['[', ']'], label: 'Brush size', group: 'Build' },
  { keys: ['Esc'], label: 'Cancel / close', group: 'Build' },
  { keys: ['Ctrl', 'Z'], label: 'Undo', group: 'Edit' },
  { keys: ['Ctrl', 'Shift', 'Z'], label: 'Redo (also Ctrl+Y)', group: 'Edit' },
  { keys: ['Ctrl', 'S'], label: 'Save', group: 'Edit' },
  { keys: ['H'], label: 'Hide the interface', group: 'View' },
  { keys: ['P'], label: 'Photo mode', group: 'View' },
  { keys: ['V'], label: 'Cycle data lenses (Shift+V back)', group: 'View' },
  { keys: ['O'], label: 'Build grid on / off', group: 'View' },
  { keys: ['M'], label: 'Star map', group: 'View' },
  { keys: ['G'], label: 'God powers', group: 'View' },
  { keys: ['I'], label: 'City status', group: 'View' },
  { keys: ['?'], label: 'Help', group: 'View' },
];

/** Touch gestures (phones & tablets). */
export const GESTURES: GestureDef[] = [
  { gesture: 'Drag', label: 'Grab the ground and move around — fling to glide', icon: 'navigate' },
  { gesture: 'Pinch', label: 'Zoom toward your fingers', icon: 'search' },
  { gesture: 'Twist', label: 'Rotate the view', icon: 'rotate' },
  { gesture: 'Two fingers up / down', label: 'Tilt toward the skyline', icon: 'arrowUp' },
  { gesture: 'Double-tap', label: 'Zoom in', icon: 'plus' },
  { gesture: 'Two-finger tap', label: 'Zoom out', icon: 'minus' },
  { gesture: 'Double-tap, hold & slide', label: 'One-handed zoom', icon: 'expand' },
  { gesture: 'Long-press a building', label: 'Pick it up, slide, lift to set it down', icon: 'target' },
  { gesture: 'Long-press while placing', label: 'Fine-tune big buildings before they land', icon: 'build' },
  { gesture: 'Drawing tools', label: 'One finger draws, two fingers move the camera', icon: 'brush' },
  { gesture: 'Roads', label: 'Drag, or tap the start then tap the end (keeps chaining)', icon: 'roads' },
];

/** Physical keys held right now (KeyboardEvent.code). */
export const held = new Set<string>();

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t || !t.tagName) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

function onButton(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'BUTTON' || t.getAttribute?.('role') === 'button');
}

const MOVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract']);

export interface ShortcutHost {
  /** Esc: cancel the innermost thing in progress */
  escape(): void;
}

/** Install the keyboard handler; returns an uninstaller. */
export function installShortcuts(game: Game, host: ShortcutHost): () => void {
  const down = (e: KeyboardEvent) => {
    if (typing(e)) return;
    const inGame = ui.screen.value === 'game';
    if (!inGame) return;
    const planet = ui.view.value === 'planet';
    const k = e.key;
    const lower = k.length === 1 ? k.toLowerCase() : k;
    // undo / redo (ui-core leaves Ctrl combos other than S to us)
    if (e.ctrlKey || e.metaKey) {
      if (e.defaultPrevented || e.altKey) return;
      if (lower === 'z' || e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) game.commands.redo();
        else game.commands.undo();
      } else if (lower === 'y' || e.code === 'KeyY') {
        e.preventDefault();
        game.commands.redo();
      }
      return;
    }
    if (e.defaultPrevented || e.altKey) return;
    if (k === 'Escape') {
      host.escape();
      return;
    }
    if (ui.view.value === 'studio') return;
    // tool rotation steals R while placing
    const rotatable = planet && game.tools.rotatable;
    if ((e.code === 'KeyR' || lower === 'r') && rotatable) {
      e.preventDefault();
      if (!e.repeat) game.tools.rotate(e.shiftKey ? -1 : 1);
      return;
    }
    if (MOVE_CODES.has(e.code) && planet) {
      held.add(e.code);
      if (e.code.startsWith('Arrow')) e.preventDefault();
      return;
    }
    let handled = true;
    switch (lower) {
      case ' ':
        if (onButton(e)) return;
        game.clock.togglePause();
        sound(game, game.clock.speed === 0 ? 'close' : 'open');
        break;
      case '0':
        game.clock.setSpeed(0);
        break;
      case '1':
      case '2':
      case '3':
      case '4':
        game.clock.setSpeed(Number(lower));
        sound(game, 'tap');
        break;
      case '[':
        if (planet) game.tools.brush(-1);
        break;
      case ']':
        if (planet) game.tools.brush(1);
        break;
      case 'p':
        ui.photo.value = !ui.photo.value;
        if (ui.photo.value) sound(game, 'camera');
        break;
      case 'v':
        cycleLens(game, e.shiftKey ? -1 : 1);
        break;
      case 'o': {
        const on = !settings.value.grid;
        setSettings({ grid: on });
        notify({ title: on ? 'Build grid on' : 'Build grid off', kind: 'info', icon: 'grid' });
        break;
      }
      case 'c':
        if (!planet) return;
        if (game.camera.touring) game.camera.stopTour();
        else {
          ui.chromeHidden.value = true;
          game.camera.startTour();
        }
        break;
      case '.':
        if (planet) game.tools.home();
        break;
      // fallbacks when the shell did not claim these keys
      case 'h':
        ui.chromeHidden.value = !ui.chromeHidden.value;
        break;
      case 'b':
        if (planet) game.tools.select(ui.tool.value?.id === 'bulldoze' ? null : { id: 'bulldoze', label: 'Bulldoze' });
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  };
  const up = (e: KeyboardEvent) => {
    held.delete(e.code);
  };
  const blur = () => held.clear();
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    held.clear();
  };
}

function sound(game: Game, name: 'open' | 'close' | 'tap' | 'camera' | 'toggle'): void {
  try {
    if (typeof game.audio?.sfx === 'function') game.audio.sfx(name);
  } catch {
    /* optional */
  }
}

/** Next / previous data lens (none → first … last → none). */
export function cycleLens(game: Game, dir: number): void {
  const lenses = (game.sim as unknown as { lenses?: { id: string; name: string }[] }).lenses ?? [];
  if (!lenses.length) return;
  const cur = ui.lens.value;
  let i = lenses.findIndex((l) => l.id === cur);
  i = i < 0 ? (dir > 0 ? 0 : lenses.length - 1) : i + dir;
  const next = i < 0 || i >= lenses.length ? null : lenses[i];
  ui.lens.value = next ? next.id : null;
  notify({ title: next ? next.name : 'Lenses off', body: next ? 'V for the next lens · Shift+V back' : undefined, kind: 'info', icon: 'lens' });
}
