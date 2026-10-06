/**
 * OWNER: ui-core.
 * Shell actions shared by the dock, keyboard shortcuts, tool bar and inspector: open/close build categories,
 * select items & tools (with the ui-core tool mapping), the "More" menu and the item detail sheet.
 */
import { signal } from '@preact/signals';
import type { ItemDef } from '../../../content/catalog';
import type { Category } from '../../../core/types';
import { game } from '../../../game/instance';
import { ui, notify, type ToolState } from '../../store';
import { setSelection, uiSound } from '../env';
import { BUILD_TABS, dockFor, isUnlocked, lockReason, toolFor } from './buildModel';

/** last Build tab the player looked at */
export const lastBuildTab = signal<Category>('power');
/** the More menu sheet */
export const moreOpen = signal(false);
/** item shown in the detail sheet (long-press / ⓘ) */
export const detailItem = signal<ItemDef | null>(null);
/** category the current tool came from (tap the tool bar thumbnail to reopen) */
export const toolOrigin = signal<Category | null>(null);
/** status tray (top bar) */
export const trayOpen = signal(false);

export function openCategory(cat: Category): void {
  if ((BUILD_TABS as string[]).includes(cat)) lastBuildTab.value = cat;
  if (ui.selection.value) setSelection(null);
  moreOpen.value = false;
  ui.category.value = cat;
}

export function closeSheet(): void {
  ui.category.value = null;
}

/** Dock button behaviour: open, switch, or close the sheet that belongs to `dock`. */
export function toggleDock(dock: 'roads' | 'zones' | 'decor' | 'build'): void {
  const cur = dockFor(ui.category.value);
  if (cur === dock) {
    closeSheet();
    return;
  }
  openCategory(dock === 'build' ? lastBuildTab.value : dock);
}

export function selectTool(state: ToolState | null): void {
  try {
    game.tools.select(state);
  } catch (e) {
    console.error('[ui] tool select failed', e);
  }
  // keep ui.tool in sync even if the tool manager is mid-rewrite
  if (ui.tool.value?.id !== state?.id || ui.tool.value?.itemId !== state?.itemId) ui.tool.value = state;
}

export function cancelTool(): void {
  try {
    if (typeof game.tools.cancel === 'function') game.tools.cancel();
    else game.tools.select(null);
  } catch (e) {
    console.error('[ui] tool cancel failed', e);
  }
  ui.tool.value = null;
  toolOrigin.value = null;
}

/** Toggle a bare tool (terraform / bulldoze / paint…). */
export function toggleTool(id: string, label: string): void {
  if (ui.tool.value?.id === id && !ui.tool.value.itemId) {
    uiSound('close');
    cancelTool();
    return;
  }
  closeSheet();
  if (ui.selection.value) setSelection(null);
  toolOrigin.value = null;
  uiSound('toggle');
  selectTool({ id, label });
}

/** Pick an item from a build sheet. Locked items explain themselves instead. */
export function selectItem(def: ItemDef): void {
  if (!isUnlocked(def)) {
    uiSound('error');
    notify({ title: `${def.name} is locked`, body: lockReason(def) ?? 'Keep growing to unlock it.', kind: 'warn', icon: 'lock' });
    return;
  }
  uiSound('click');
  toolOrigin.value = def.category;
  closeSheet();
  if (ui.selection.value) setSelection(null);
  selectTool(toolFor(def));
}
