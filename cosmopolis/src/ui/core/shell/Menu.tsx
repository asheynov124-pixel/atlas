/**
 * OWNER: ui-core.
 * MainMenu — COSMOPOLIS wordmark over the cinematic backdrop; Continue (latest save meta), New Career, Sandbox,
 * Load (panel "saves" when registered, else a built-in save list), Settings (panel "settings"), Credits.
 */
import { useEffect, useState } from 'preact/hooks';
import { deleteSave, listSaves, type SaveMeta } from '../../../core/save';
import type { GameMode } from '../../../core/types';
import { game } from '../../../game/instance';
import { Icon } from '../../icons';
import { panels } from '../../registry';
import { confirmDialog, notify, ui } from '../../store';
import { Button, IconButton } from '../Button';
import { EmptyState } from '../display';
import { nextPaint, openPanel, uiSound, unlockAudio } from '../env';
import { fmtCompact, fmtGameDays, timeAgo } from '../format';
import { Modal } from '../Modal';
import { ALL_WORLDS, NewGameModal, PORTRAIT } from './NewGame';
import { MenuBackdrop } from './Backdrop';
import { warmPortraits } from './art';

async function loadSlot(meta: SaveMeta): Promise<void> {
  unlockAudio();
  uiSound('warp');
  ui.loading.value = `Loading ${meta.name}…`;
  await nextPaint();
  try {
    const ok = await game.load(meta.slot);
    if (!ok) notify({ title: 'Save not found', body: meta.name, kind: 'bad', icon: 'alert' });
  } catch (e) {
    console.error('[ui] load failed', e);
    notify({ title: 'Could not load that save', body: String((e as Error)?.message ?? e), kind: 'bad', icon: 'alert' });
  } finally {
    ui.loading.value = null;
  }
}

function SaveRow({ s, onLoad, onDelete }: { s: SaveMeta; onLoad: () => void; onDelete?: () => void }) {
  return (
    <div class="mm-save">
      <button type="button" class="mm-save-main" onClick={onLoad}>
        <span class="mm-save-thumb">{s.thumb ? <img src={s.thumb} alt="" /> : <Icon name={s.mode === 'sandbox' ? 'sparkles' : 'planet'} size={22} />}</span>
        <span class="mm-save-text">
          <span class="mm-save-name ellipsis">{s.name}</span>
          <span class="mm-save-meta num ellipsis">
            {s.cityName ? `${s.cityName}, ` : ''}{s.planetName || 'Unknown world'} · {fmtCompact(s.population)} pop · {fmtGameDays(s.day)}
          </span>
        </span>
        <span class="mm-save-when">{timeAgo(s.savedAt)}</span>
      </button>
      {onDelete && <IconButton icon="trash" label="Delete save" size="sm" variant="ghost" onClick={onDelete} />}
    </div>
  );
}

function SavesModal({ open, onClose, saves, refresh }: { open: boolean; onClose: () => void; saves: SaveMeta[]; refresh: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Load game" icon="load" size="md">
      {saves.length === 0 ? (
        <EmptyState icon="folder" title="No saves yet" body="Your cities are saved automatically while you play." />
      ) : (
        <div class="mm-saves">
          {saves.map((s) => (
            <SaveRow
              key={s.slot}
              s={s}
              onLoad={() => {
                onClose();
                void loadSlot(s);
              }}
              onDelete={async () => {
                const ok = await confirmDialog({ title: `Delete “${s.name}”?`, body: 'This save will be gone forever — like a city hit by vacuum decay.', okLabel: 'Delete', danger: true });
                if (!ok) return;
                await deleteSave(s.slot);
                refresh();
              }}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}

function CreditsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rows: [string, string][] = [
    ['Planet forging', 'Hex-sphere geometry, terrain & weather'],
    ['City simulation', 'Demand, growth, budgets and very opinionated citizens'],
    ['Architecture', 'Hundreds of procedural buildings in eight styles'],
    ['Cosmos', 'Star systems, galaxies and the long road between them'],
    ['God powers', 'Tornadoes, meteors, black holes — use responsibly'],
    ['Sound', 'Every note and explosion synthesised live'],
    ['Interface', 'Glass, light and a great many hexagons'],
  ];
  return (
    <Modal open={open} onClose={onClose} title="Credits" icon="heart" size="md" centered>
      <div class="mm-credits">
        <div class="mm-credits-logo grad-text">COSMOPOLIS</div>
        <p class="mm-credits-lead">Built by a small crew of specialists who really, really like cities — and space.</p>
        {rows.map(([k, v]) => (
          <div class="mm-credit" key={k}>
            <span class="mm-credit-k">{k}</span>
            <span class="mm-credit-v">{v}</span>
          </div>
        ))}
        <p class="mm-credits-foot">No external assets were harmed: every mesh, texture, sound and icon is generated in your browser.</p>
      </div>
    </Modal>
  );
}

export function MainMenu() {
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [ng, setNg] = useState<GameMode | null>(null);
  const [mode, setMode] = useState<GameMode>('career');
  const [showSaves, setShowSaves] = useState(false);
  const [credits, setCredits] = useState(false);
  const refresh = () => {
    listSaves()
      .then(setSaves)
      .catch(() => setSaves([]));
  };
  useEffect(() => {
    refresh();
    try {
      game.audio?.setMood?.('menu');
    } catch {
      /* optional */
    }
    // warm the new-game planet portraits in the background
    let stop: (() => void) | null = null;
    const t = setTimeout(() => (stop = warmPortraits(ALL_WORLDS, PORTRAIT, () => {}, 140)), 1500);
    return () => {
      clearTimeout(t);
      stop?.();
    };
  }, []);
  const latest = saves[0];
  const openNew = (m: GameMode) => {
    unlockAudio();
    setMode(m);
    setNg(m);
  };
  const hasSavesPanel = panels.has('saves');
  const hasSettings = panels.has('settings');

  return (
    <div class="mm-root">
      <MenuBackdrop />
      <div class="mm-content">
        <header class="mm-brand">
          <div class="mm-logo" aria-label="Cosmopolis">
            <span class="mm-logo-word">COSMOPOLIS</span>
          </div>
          <div class="mm-tag">Build worlds. Bend stars.</div>
        </header>
        <nav class="mm-actions" aria-label="Main menu">
          {latest && (
            <button type="button" class="mm-continue pe" onClick={() => void loadSlot(latest)}>
              <span class="mm-continue-icon">
                <Icon name="play" size={22} />
              </span>
              <span class="mm-continue-text">
                <span class="mm-continue-k">Continue</span>
                <span class="mm-continue-name ellipsis">{latest.name}</span>
                <span class="mm-continue-meta num ellipsis">
                  {latest.cityName ? `${latest.cityName}, ` : ''}{latest.planetName || 'Unknown world'} · {fmtCompact(latest.population)} citizens · {timeAgo(latest.savedAt)}
                </span>
              </span>
              <Icon name="chevronRight" size={20} class="mm-continue-chev" />
            </button>
          )}
          <div class="mm-modes">
            <button type="button" class="mm-mode pe" onClick={() => (uiSound('click'), openNew('career'))}>
              <span class="mm-mode-icon tone-career">
                <Icon name="trophy" size={22} />
              </span>
              <span class="mm-mode-title">New Career</span>
              <span class="mm-mode-sub">Outpost to galactic empire</span>
            </button>
            <button type="button" class="mm-mode pe" onClick={() => (uiSound('click'), openNew('sandbox'))}>
              <span class="mm-mode-icon tone-sandbox">
                <Icon name="sparkles" size={22} />
              </span>
              <span class="mm-mode-title">Sandbox</span>
              <span class="mm-mode-sub">No limits. Every power.</span>
            </button>
          </div>
          <div class="mm-small">
            <Button
              variant="glass"
              icon="load"
              onClick={() => {
                unlockAudio();
                if (hasSavesPanel) openPanel('saves');
                else {
                  refresh();
                  setShowSaves(true);
                }
              }}
            >
              Load
            </Button>
            {hasSettings && (
              <Button variant="glass" icon="settings" onClick={() => openPanel('settings')}>
                Settings
              </Button>
            )}
            <Button variant="glass" icon="heart" onClick={() => setCredits(true)}>
              Credits
            </Button>
          </div>
        </nav>
        <footer class="mm-foot">v1.0 · Best with headphones</footer>
      </div>
      <NewGameModal open={ng !== null} mode={mode} onMode={setMode} onClose={() => setNg(null)} />
      <SavesModal open={showSaves} onClose={() => setShowSaves(false)} saves={saves} refresh={refresh} />
      <CreditsModal open={credits} onClose={() => setCredits(false)} />
    </div>
  );
}
