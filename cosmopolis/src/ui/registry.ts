/**
 * UI composition registry (FOUNDATION, CONTRACT). Feature modules register their own panels / overlays at import time,
 * the App shell renders them generically:
 *   - panels: opened by id via `ui.panel.value = id` (one at a time)
 *   - overlays: always mounted, each decides its own visibility from signals (photo mode, cosmos HUD, studio, labels…)
 *   - hudButtons: small round buttons the shell places in the side rails (lenses, cosmos map, photo, god…)
 */
import type { ComponentType } from 'preact';

export interface PanelDef {
  id: string;
  title: string;
  icon?: string;
  component: ComponentType<{ onClose: () => void }>;
  /** presentation: bottom sheet (default), centered modal, side drawer, or full screen */
  kind?: 'sheet' | 'modal' | 'side' | 'full';
  /** listed in the main "More" menu */
  menu?: boolean;
  order?: number;
}

export interface OverlayDef {
  id: string;
  component: ComponentType;
  /** z-order among overlays */
  order?: number;
}

export interface HudButtonDef {
  id: string;
  icon: string;
  label: string;
  rail: 'left' | 'right';
  order?: number;
  onClick: () => void;
  /** reactive: return true when the button should look active */
  active?: () => boolean;
  /** reactive: return false to hide */
  visible?: () => boolean;
  badge?: () => number | string | null;
}

export const panels = new Map<string, PanelDef>();
export const overlays: OverlayDef[] = [];
export const hudButtons: HudButtonDef[] = [];

export function registerPanel(def: PanelDef): void {
  panels.set(def.id, def);
}
export function registerOverlay(def: OverlayDef): void {
  const i = overlays.findIndex((o) => o.id === def.id);
  if (i >= 0) overlays[i] = def;
  else overlays.push(def);
  overlays.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
export function registerHudButton(def: HudButtonDef): void {
  const i = hudButtons.findIndex((b) => b.id === def.id);
  if (i >= 0) hudButtons[i] = def;
  else hudButtons.push(def);
  hudButtons.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
