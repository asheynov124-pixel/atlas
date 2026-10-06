/**
 * Test / debug hooks (FOUNDATION). Exposes window.__cosmo for the headless screenshot runner and URL params:
 *   ?autostart=sandbox|career   start a game immediately            &seed=123   &planet=<PlanetTypeId>
 *   &demo=city|metropolis|none   auto-build a demo city               &view=orbit|close|horizon|street
 *   &time=0..1                   time of day (freezes cycle speed 0)  &daynight=cycle|day|night|golden
 *   &speed=0..4                  &lens=<lensId>                       &ui=0 hide chrome
 *   &select=<tile>               &tool=<toolId>&item=<itemId>         &quality=low|medium|high|ultra
 *   &showroom=<category|all|prefix:x>  lay out items along roads    &style=<StyleId>  &level=1..5
 * Modules may read their own params (e.g. &god=meteor, &cosmos=galaxy, &studio=1, &panel=budget).
 */
import { setSettings, type DayNightMode, type QualitySetting } from '../core/settings';
import type { PlanetTypeId } from '../core/types';
import type { Game } from '../game/Game';
import { ui } from '../ui/store';
import { buildDemoCity } from './demoCity';
import { showroom, type ShowroomOptions } from './showroom';
import type { Category, StyleId } from '../core/types';

declare global {
  interface Window {
    __cosmo: {
      game: Game;
      ready: boolean;
      debugInfo: () => Record<string, unknown>;
      demo: (kind?: string) => unknown;
      showroom: (o?: ShowroomOptions) => unknown;
      params: URLSearchParams;
      step: (seconds: number, fps?: number) => void;
    };
  }
}

export function installDebug(game: Game): void {
  const params = new URLSearchParams(location.search);
  window.__cosmo = {
    game,
    ready: false,
    params,
    debugInfo: () => game.debugInfo(),
    demo: (kind = 'city') => buildDemoCity(game, kind),
    showroom: (o?: ShowroomOptions) => showroom(game, o),
    /** advance game logic (and render) deterministically */
    step: (seconds: number, fps = 30) => {
      const n = Math.max(1, Math.round(seconds * fps));
      for (let i = 0; i < n; i++) game.step(1 / fps);
    },
  };
  const q = params.get('quality') as QualitySetting | null;
  if (q) setSettings({ quality: q });
  const dn = params.get('daynight') as DayNightMode | null;
  if (dn) setSettings({ dayNight: dn });
  const start = async () => {
    const auto = params.get('autostart');
    if (auto === 'career' || auto === 'sandbox') {
      game.newGame(auto, {
        seed: params.has('seed') ? Number(params.get('seed')) : 12345,
        planetType: (params.get('planet') as PlanetTypeId) || undefined,
      });
      const style = params.get('style') as StyleId | null;
      if (style && game.planet) game.planet.city.style = style;
      const demo = params.get('demo');
      if (demo && demo !== 'none') buildDemoCity(game, demo);
      const room = params.get('showroom');
      if (room) {
        const r = showroom(game, {
          category: room.startsWith('prefix:') ? undefined : (room as Category | 'all'),
          prefix: room.startsWith('prefix:') ? room.slice(7) : undefined,
          style: style ?? undefined,
          level: params.has('level') ? Number(params.get('level')) : undefined,
        });
        console.info('[showroom]', JSON.stringify(r));
      }
      if (params.has('time')) {
        game.clock.timeOfDay = Number(params.get('time'));
        game.clock.setSpeed(0);
      }
      if (params.has('speed')) game.clock.setSpeed(Number(params.get('speed')));
      const view = params.get('view');
      const cam = game.camera;
      const R = game.planet!.radius;
      if (view === 'orbit') {
        cam.flyTo(cam.target, { distance: R * 1.7, tilt: 0.2 });
      } else if (view === 'close') {
        cam.flyTo(cam.target, { distance: 18, tilt: 0.85 });
      } else if (view === 'horizon') {
        cam.flyTo(cam.target, { distance: 9, tilt: 1.3 });
      } else if (view === 'street') {
        cam.flyTo(cam.target, { distance: 3.5, tilt: 1.42 });
      }
      cam.snap?.();
      if (params.get('lens')) ui.lens.value = params.get('lens');
      if (params.get('ui') === '0') ui.chromeHidden.value = true;
      if (params.has('select')) ui.selection.value = { kind: 'tile', tile: Number(params.get('select')) };
      if (params.get('tool')) game.tools.select({ id: params.get('tool')!, itemId: params.get('item') ?? undefined });
      // let a few frames render
      for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    window.__cosmo.ready = true;
  };
  const wait = () => (game.ready ? void start() : setTimeout(wait, 30));
  wait();
}
