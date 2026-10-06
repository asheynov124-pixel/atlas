/**
 * OWNER: tools.
 * Tool — base class for every ToolManager tool. A tool receives picks (PickResult = tile + exact world point) from
 * the InputController via the ToolManager and turns them into previews (ghosts, highlights, ribbons, reticles,
 * cost / hint / tag) and Commands.
 *
 *   drawing      true → one-finger drags belong to the tool (camera needs two fingers / right mouse)
 *   rotatable    true → R / Shift+R rotate (the camera's R-tilt key yields)
 *   placing      true → double-tap is a second placement, not a zoom
 *   enter(state) / exit()                  lifecycle (exit must clear every preview it made)
 *   options() / setOption(id, value)       ui.toolOptions descriptors (rendered generically by ui-core)
 *   hover(hit)                             desktop hover, touch press, or screen-centre preview
 *   tap(hit, info)                         a click / tap that did not move
 *   longPress(hit, info) → boolean         true = the tool takes over the following drag ('hold')
 *   down / move / up (hit, info)           drag strokes (only when `drawing`, or after longPress → true)
 *   cancelStroke()                         a second finger landed / pointer cancelled: roll back the stroke
 *   escape() → boolean                     Esc / ✕: drop in-progress state (true) or let the manager deselect
 *   rotate(dir) / brush(delta) / update(dt)
 */
import type { ToolOption, ToolState } from '../ui/store';
import type { PickResult } from '../world/geo';
import type { ToolManager } from './ToolManager';
import type { Game } from '../game/Game';

export interface PointerInfo {
  touch: boolean;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  button: number;
}

export abstract class Tool {
  abstract readonly id: string;
  /** ToolState that activated this tool */
  state: ToolState | null = null;

  constructor(readonly mgr: ToolManager) {}

  get game(): Game {
    return this.mgr.game;
  }

  get drawing(): boolean {
    return false;
  }
  get rotatable(): boolean {
    return false;
  }
  get placing(): boolean {
    return false;
  }
  /** show the crisp build grid while active */
  get wantsGrid(): boolean {
    return true;
  }

  enter(state: ToolState): void {
    this.state = state;
  }
  exit(): void {}
  options(): ToolOption[] {
    return [];
  }
  setOption(_id: string, _value: unknown): void {}
  hover(_hit: PickResult | null): void {}
  tap(_hit: PickResult | null, _info: PointerInfo): void {}
  longPress(_hit: PickResult | null, _info: PointerInfo): boolean {
    return false;
  }
  down(_hit: PickResult | null, _info: PointerInfo): void {}
  move(_hit: PickResult | null, _info: PointerInfo): void {}
  up(_hit: PickResult | null, _info: PointerInfo): void {}
  cancelStroke(): void {}
  escape(): boolean {
    return false;
  }
  rotate(_dir: number): void {}
  brush(_delta: number): void {}
  update(_dt: number): void {}
  /** initial hint text */
  hint(): string | null {
    return null;
  }
}

/** Brush sizes as footprint-like choices. */
export const BRUSH_CHOICES = [
  { value: 0, label: 'S', icon: 'brush' },
  { value: 1, label: 'M', icon: 'brush' },
  { value: 2, label: 'L', icon: 'brush' },
  { value: 3, label: 'XL', icon: 'brush' },
];
