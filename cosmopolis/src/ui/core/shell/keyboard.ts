/**
 * OWNER: ui-core.
 * Desktop keyboard shortcuts for the UI (camera / speed / undo keys belong to the InputController):
 *   Esc  close the top-most sheet / panel / inspector (then the InputController cancels tools)
 *   B build · T roads · Z zones · N nature · L terraform · X / Delete bulldoze · M star map · G god powers
 *   H hide / show the interface · I city status · Ctrl/Cmd+S save · ? keyboard help (panel "help" if registered)
 * Ignored while typing in a field.
 */
import { game } from '../../../game/instance';
import { panels } from '../../registry';
import { notify, ui } from '../../store';
import { call, closeTopLayer, layerCount, openPanel, uiSound } from '../env';
import { moreOpen, toggleDock, toggleTool, trayOpen } from './actions';

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

export function installKeyboard(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || typing(e)) return;
    const inGame = ui.screen.value === 'game';
    // Esc closes UI layers first; only when nothing is open does it fall through to the tools
    if (e.key === 'Escape') {
      if (ui.chromeHidden.value && inGame) {
        ui.chromeHidden.value = false;
        call(game.camera, 'stopTour');
        e.stopPropagation();
        return;
      }
      if (layerCount() > 0 && closeTopLayer()) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 's' && inGame) {
        e.preventDefault();
        e.stopPropagation();
        void game.save('auto').then((ok) => ok && notify({ title: 'Game saved', kind: 'good', icon: 'save' }));
      }
      return;
    }
    if (e.altKey || !inGame || ui.view.value === 'studio') return;
    const k = e.key.toLowerCase();
    const planetView = ui.view.value === 'planet';
    let handled = true;
    switch (k) {
      case 'b':
        if (planetView) toggleDock('build');
        break;
      case 't':
        if (planetView) toggleDock('roads');
        break;
      case 'z':
        if (planetView) toggleDock('zones');
        break;
      case 'n':
        if (planetView) toggleDock('decor');
        break;
      case 'l':
        if (planetView) toggleTool('terraform', 'Terraform');
        break;
      case 'x':
      case 'delete':
        if (planetView) toggleTool('bulldoze', 'Bulldoze');
        break;
      case 'm':
        uiSound('whoosh');
        call(game.cosmos, 'openView', 'system');
        break;
      case 'g':
        if (ui.panel.value === 'god') ui.panel.value = null;
        else openPanel('god');
        break;
      case 'h':
        ui.chromeHidden.value = !ui.chromeHidden.value;
        uiSound('toggle');
        break;
      case 'i':
        trayOpen.value = !trayOpen.value;
        break;
      case '?':
      case 'f1':
        if (panels.has('help')) openPanel('help');
        else moreOpen.value = !moreOpen.value;
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
}
