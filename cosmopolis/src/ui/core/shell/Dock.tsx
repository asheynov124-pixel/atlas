/**
 * OWNER: ui-core.
 * Dock — the six primary actions (Roads, Zones, Nature, Build, Terrain, Bulldoze) + More, as one glass bar at
 * the bottom. "Build" is the hero button in the middle. Plus the More menu: every registered panel with
 * `menu: true` and the session actions (save, settings, hide UI, main menu).
 */
import { game } from '../../../game/instance';
import { Icon, IconOrEmoji } from '../../icons';
import { panels } from '../../registry';
import { confirmDialog, notify, ui } from '../../store';
import { openPanel, uiSound, viewport } from '../env';
import { Sheet } from '../Sheet';
import { BUILD_TABS, dockFor } from './buildModel';
import { hasNewIn } from './newItems';
import { moreOpen, toggleDock, toggleTool } from './actions';

interface DockItem {
  id: string;
  /** categories whose new unlocks light this button's dot */
  cats?: readonly import('../../../core/types').Category[];
  label: string;
  icon: string;
  kbd: string;
  hero?: boolean;
  run: () => void;
  active: () => boolean;
}

const ITEMS: DockItem[] = [
  { id: 'roads', label: 'Roads', icon: 'roads', kbd: 'T', cats: ['roads'], run: () => toggleDock('roads'), active: () => dockFor(ui.category.value) === 'roads' || (!ui.category.value && ui.tool.value?.id === 'road') },
  { id: 'zones', label: 'Zones', icon: 'zones', kbd: 'Z', cats: ['zones'], run: () => toggleDock('zones'), active: () => dockFor(ui.category.value) === 'zones' || (!ui.category.value && ui.tool.value?.id === 'zone') },
  { id: 'decor', label: 'Nature', icon: 'nature', kbd: 'N', cats: ['decor'], run: () => toggleDock('decor'), active: () => dockFor(ui.category.value) === 'decor' || (!ui.category.value && ui.tool.value?.id === 'decor') },
  {
    id: 'build',
    label: 'Build',
    icon: 'build',
    kbd: 'B',
    hero: true,
    cats: BUILD_TABS,
    run: () => toggleDock('build'),
    active: () => dockFor(ui.category.value) === 'build' || (!ui.category.value && (ui.tool.value?.id === 'plop' || ui.tool.value?.id === 'orbit')),
  },
  { id: 'terraform', label: 'Terrain', icon: 'terraform', kbd: 'L', run: () => toggleTool('terraform', 'Terraform'), active: () => ui.tool.value?.id === 'terraform' },
  { id: 'bulldoze', label: 'Bulldoze', icon: 'bulldoze', kbd: 'X', run: () => toggleTool('bulldoze', 'Bulldoze'), active: () => ui.tool.value?.id === 'bulldoze' },
];

export const DOCK_ITEMS = ITEMS;

export function Dock() {
  const vp = viewport.value;
  const showKbd = !vp.touch;
  return (
    <nav class="dk-root" aria-label="Build tools">
      <div class="dk-bar glass-strong pe">
        {ITEMS.map((it) => {
          const on = it.active();
          return (
            <button
              key={it.id}
              type="button"
              class={'dk-btn' + (it.hero ? ' is-hero' : '') + (on ? ' is-active' : '') + (it.id === 'bulldoze' ? ' is-danger' : '')}
              aria-label={it.label}
              aria-pressed={on}
              title={showKbd ? `${it.label} (${it.kbd})` : it.label}
              onClick={it.run}
            >
              <span class="dk-face">
                <Icon name={it.icon} size={it.hero ? 24 : 22} />
                {it.cats && !on && hasNewIn(it.cats) && <span class="cz-badge is-dot tone-accent dk-dot" aria-label="new" />}
              </span>
              <span class="dk-label">{it.label}</span>
            </button>
          );
        })}
        <button type="button" class={'dk-btn' + (moreOpen.value ? ' is-active' : '')} aria-label="More" aria-expanded={moreOpen.value} title="More" onClick={() => (uiSound('click'), (moreOpen.value = !moreOpen.value))}>
          <span class="dk-face">
            <Icon name="menu" size={22} />
            {ui.unreadNews.value > 0 && panels.has('news') && <span class="cz-badge is-dot dk-dot" />}
          </span>
          <span class="dk-label">More</span>
        </button>
      </div>
    </nav>
  );
}

export function MoreMenu() {
  const open = moreOpen.value;
  const close = () => (moreOpen.value = false);
  void ui.catalogVersion.value;
  const list = [...panels.values()].filter((p) => p.menu).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const go = (id: string) => {
    close();
    openPanel(id);
  };
  const session: { id: string; icon: string; label: string; run: () => void; danger?: boolean }[] = [];
  if (!panels.has('saves'))
    session.push({
      id: 'save',
      icon: 'save',
      label: 'Save game',
      run: async () => {
        close();
        const ok = await game.save('auto');
        if (ok) notify({ title: 'Game saved', body: `${ui.cityName.value} is safe in the archives.`, kind: 'good', icon: 'save' });
      },
    });
  session.push({ id: 'hide', icon: 'eyeOff', label: 'Hide interface', run: () => (close(), (ui.chromeHidden.value = true)) });
  if (typeof game.camera?.startTour === 'function')
    session.push({
      id: 'tour',
      icon: 'camera',
      label: 'Cinematic tour',
      run: () => {
        close();
        ui.chromeHidden.value = true;
        try {
          game.camera.startTour();
        } catch {
          /* optional */
        }
      },
    });
  session.push({
    id: 'menu',
    icon: 'exit',
    label: 'Main menu',
    danger: true,
    run: async () => {
      close();
      const ok = await confirmDialog({ title: 'Return to the main menu?', body: 'Your city is saved automatically before you leave.', okLabel: 'Main menu' });
      if (!ok) return;
      ui.loading.value = 'Saving your city…';
      try {
        await game.quitToMenu();
      } finally {
        ui.loading.value = null;
      }
    },
  });
  return (
    <Sheet open={open} onClose={close} title="More" icon="menu" snaps={[0.62, 0.92]} class="mo-sheet" maxWidth={560}>
      {list.length > 0 && (
        <div class="mo-grid">
          {list.map((p) => {
            const badge = p.id === 'news' && ui.unreadNews.value > 0 ? ui.unreadNews.value : null;
            return (
              <button key={p.id} type="button" class="mo-tile" onClick={() => go(p.id)}>
                <span class="mo-tile-icon">
                  <IconOrEmoji value={p.icon ?? 'grid'} size={24} />
                  {badge && <span class="cz-badge cz-badge-float num">{badge > 99 ? '99+' : badge}</span>}
                </span>
                <span class="mo-tile-label">{p.title}</span>
              </button>
            );
          })}
        </div>
      )}
      <div class="mo-session">
        {session.map((s) => (
          <button key={s.id} type="button" class={'mo-row' + (s.danger ? ' is-danger' : '')} onClick={() => (uiSound('click'), s.run())}>
            <Icon name={s.icon} size={19} />
            <span>{s.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
