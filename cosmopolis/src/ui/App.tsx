/**
 * OWNER: ui-core.
 * App — the shell: loading overlay, main menu & new-game flow, in-game HUD (top bar, rails, dock, tool bar,
 * build sheet with 3D thumbnails, inspector), registered panels & overlays, toasts, confirm dialog, milestone
 * celebrations, FPS meter and desktop keyboard shortcuts. The component kit lives in ui/core (see its index).
 *
 * Test hook: window.__cosmoUI = { openCategory(cat), closeSheet(), showDetail(itemId), celebrate(title?),
 *   select(sel), more(open), tray(open) } — used by the screenshot scripts.
 */
import { effect } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { getItem } from '../content/catalog';
import { bus } from '../core/events';
import { settings } from '../core/settings';
import type { Category, Selection } from '../core/types';
import { game } from '../game/instance';
import { overlays } from './registry';
import { ui } from './store';
import { ConfirmHost, ToastStack } from './core';
import { setSelection } from './core/env';
import { closeSheet, detailItem, moreOpen, openCategory, trayOpen } from './core/shell/actions';
import { CelebrationHost, celebrateForTest, installCelebrations } from './core/shell/Celebration';
import { FpsMeter, Hud } from './core/shell/Hud';
import { installKeyboard } from './core/shell/keyboard';
import { LoadingOverlay } from './core/shell/Loading';
import { MainMenu } from './core/shell/Menu';
import { installNewItems } from './core/shell/newItems';
import { PanelHost } from './core/shell/PanelHost';
import './core/shell/menu.css';
import './core/shell/hud.css';

declare global {
  interface Window {
    __cosmoUI?: {
      openCategory: (cat: Category) => void;
      closeSheet: () => void;
      showDetail: (itemId: string) => void;
      celebrate: (title?: string) => void;
      select: (sel: Selection) => void;
      more: (open: boolean) => void;
      tray: (open: boolean) => void;
    };
  }
}

/** Root-level attributes: reduce motion, glass quality, UI scale. */
function useRootAttributes(): void {
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const s = settings.value;
      if (s.reduceMotion) root.setAttribute('data-reduce-motion', '');
      else root.removeAttribute('data-reduce-motion');
      let tier = 2;
      try {
        tier = game?.engine?.tier ?? 2;
      } catch {
        /* default */
      }
      if (tier <= 0) root.setAttribute('data-glass', 'solid');
      else root.removeAttribute('data-glass');
    };
    const stop = effect(() => {
      void settings.value;
      apply();
    });
    const off = bus.on('quality:changed', apply);
    // the catalog grows while modules register; bump the UI version so menus re-filter
    const offs = [
      bus.on('catalog:changed', () => ui.catalogVersion.value++),
      bus.on('unlock', () => ui.catalogVersion.value++),
      bus.on('planet:loaded', () => ui.catalogVersion.value++),
    ];
    return () => {
      stop();
      off();
      offs.forEach((o) => o());
    };
  }, []);
}

function useTestHooks(): void {
  useEffect(() => {
    window.__cosmoUI = {
      openCategory: (cat) => openCategory(cat),
      closeSheet,
      showDetail: (id) => {
        const d = getItem(id);
        if (d) detailItem.value = d;
      },
      celebrate: (title) => celebrateForTest(title),
      select: (sel) => setSelection(sel),
      more: (open) => (moreOpen.value = open),
      tray: (open) => (trayOpen.value = open),
    };
    return () => {
      delete window.__cosmoUI;
    };
  }, []);
}

export function App() {
  useRootAttributes();
  useTestHooks();
  useEffect(() => {
    const offKeys = installKeyboard();
    const offCelebrate = installCelebrations();
    const offNew = installNewItems();
    return () => {
      offKeys();
      offCelebrate();
      offNew();
    };
  }, []);
  const screen = ui.screen.value;
  const scale = settings.value.uiScale || 1;
  const scaled = Math.abs(scale - 1) > 0.01;
  const style = scaled ? { zoom: String(scale), width: `calc(100vw / ${scale})`, height: `calc(100dvh / ${scale})` } : undefined;
  return (
    <div class={'app' + (screen === 'menu' ? ' on-menu' : '') + (scaled ? ' scaled' : '')} style={style}>
      {screen === 'menu' && <MainMenu />}
      {screen === 'game' && <Hud />}
      {overlays.map((o) => (
        <o.component key={o.id} />
      ))}
      <PanelHost />
      <CelebrationHost />
      <ToastStack />
      <ConfirmHost />
      <FpsMeter />
      <LoadingOverlay />
    </div>
  );
}
