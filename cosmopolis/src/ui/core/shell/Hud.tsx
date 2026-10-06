/**
 * OWNER: ui-core.
 * Hud — the in-game chrome: top bar, side rails, dock, tool bar, inspector, build sheet, item details, More menu.
 * Adapts to the active view (only the top bar outside the planet view, nothing in the studio), photo mode and
 * `ui.chromeHidden` (everything hidden except a small restore button). Plus the optional FPS meter.
 */
import { settings } from '../../../core/settings';
import { game } from '../../../game/instance';
import { Icon } from '../../icons';
import { ui } from '../../store';
import { call, uiSound } from '../env';
import { BuildSheet, ItemDetail } from './BuildSheet';
import { Dock, MoreMenu } from './Dock';
import { Inspector } from './Inspector';
import { Rails } from './Rails';
import { ToolBar } from './ToolBar';
import { TopBar } from './TopBar';

export function FpsMeter() {
  if (!settings.value.showFps) return null;
  const fps = ui.fps.value;
  let calls = 0;
  try {
    calls = game.engine.renderer.info.render.calls;
  } catch {
    /* ignore */
  }
  return (
    <div class={'hud-fps num' + (fps < 30 ? ' bad' : fps < 50 ? ' warn' : '')} aria-hidden="true">
      <span>{fps}</span> fps
      {calls > 0 && <span class="hud-fps-calls"> · {calls} dc</span>}
    </div>
  );
}

function RestoreChrome() {
  return (
    <button
      type="button"
      class="hud-restore"
      aria-label="Show interface"
      title="Show interface (H)"
      onClick={() => {
        uiSound('toggle');
        call(game.camera, 'stopTour');
        ui.chromeHidden.value = false;
      }}
    >
      <Icon name="eye" size={20} />
    </button>
  );
}

export function Hud() {
  const view = ui.view.value;
  if (ui.photo.value || view === 'studio') return null;
  if (ui.chromeHidden.value) return <RestoreChrome />;
  const planet = view === 'planet';
  const inspecting = !!ui.selection.value && planet;
  return (
    <div class={'hud' + (inspecting ? ' is-inspecting' : '') + (ui.tool.value ? ' has-tool' : '') + (planet ? '' : ' off-planet')}>
      <TopBar />
      {planet && <Rails />}
      {planet && <ToolBar />}
      {planet && <Dock />}
      {planet && <Inspector />}
      <BuildSheet />
      <ItemDetail />
      <MoreMenu />
    </div>
  );
}
