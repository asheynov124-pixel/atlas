/**
 * OWNER: ui-panels.
 * Saves panel ('saves') — save slots with thumbnails (a small JPEG of the current view), quick save into the slot
 * you are playing, "Save as" with your own name, load (with a confirm when a city is open), overwrite, delete
 * (confirm), export as a .cosmo file (navigator.share with a File on iOS, download elsewhere) and import from a file.
 * Works from the main menu (load / import / export / delete only).
 */
import { effect } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { bus } from '../../core/events';
import { deleteSave, exportSave, importSave, listSaves, writeSave, type SaveMeta } from '../../core/save';
import { game } from '../../game/instance';
import { Button, Chip, EmptyState, Icon, IconButton, Spinner, TextInput } from '../core';
import { closePanel, nextPaint, uiSound } from '../core/env';
import { fmtCompact, fmtGameDays, timeAgo } from '../core/format';
import { confirmDialog, notify, ui } from '../store';
import { safe } from './common';

/** The slot the current game was loaded from / last saved to. */
let currentSlot = 'auto';
bus.on('game:loaded', ({ slot }) => (currentSlot = slot));
bus.on('game:saved', ({ slot }) => {
  if (slot !== 'auto' || currentSlot === 'auto') currentSlot = slot;
});
// a fresh game (always started from the main menu) plays in the autosave slot until saved elsewhere
effect(() => {
  if (ui.screen.value === 'menu') currentSlot = 'auto';
});

/** A small JPEG of the current view for save thumbnails (never throws). */
export async function captureThumb(w = 192, h = 128): Promise<string | undefined> {
  try {
    const view = game.activeView;
    if (!view) return undefined;
    const blob = await game.engine.capture(view, 0.5);
    if (!blob) return undefined;
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) return undefined;
    const s = Math.max(w / bmp.width, h / bmp.height);
    const dw = bmp.width * s, dh = bmp.height * s;
    g.drawImage(bmp, (w - dw) / 2, (h - dh) / 2, dw, dh);
    bmp.close?.();
    return c.toDataURL('image/jpeg', 0.72);
  } catch (e) {
    console.warn('[saves] thumbnail skipped', e);
    return undefined;
  }
}

async function saveTo(slot: string, name: string): Promise<boolean> {
  if (!game.planet) return false;
  try {
    const f = game.snapshot(slot);
    f.meta.name = name || f.meta.name;
    f.meta.thumb = await captureThumb();
    await writeSave(f);
    bus.emit('game:saved', { slot });
    currentSlot = slot;
    return true;
  } catch (e) {
    console.error('[saves] save failed', e);
    notify({ title: 'Save failed', body: String((e as Error)?.message ?? e), kind: 'bad', icon: 'alert' });
    return false;
  }
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'city'
  );
}

async function share(meta: SaveMeta): Promise<void> {
  const blob = await exportSave(meta.slot);
  if (!blob) {
    notify({ title: 'Nothing to export', kind: 'warn', icon: 'alert' });
    return;
  }
  const name = `${slug(meta.name)}.cosmo`;
  const file = new File([blob], name, { type: 'application/octet-stream' });
  try {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: meta.name, text: `${meta.name} — a Cosmopolis city` });
      return;
    }
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  notify({ title: 'City exported', body: name, kind: 'good', icon: 'download' });
}

function SaveRow({ s, inGame, busy, onLoad, onOverwrite, onDelete, onShare }: { s: SaveMeta; inGame: boolean; busy: boolean; onLoad: () => void; onOverwrite: () => void; onDelete: () => void; onShare: () => void }) {
  const current = inGame && s.slot === currentSlot;
  return (
    <article class={'up-save' + (current ? ' is-current' : '')}>
      <button type="button" class="up-save-main" onClick={onLoad} disabled={busy} aria-label={`Load ${s.name}`}>
        <span class="up-save-thumb">{s.thumb ? <img src={s.thumb} alt="" loading="lazy" /> : <Icon name={s.mode === 'sandbox' ? 'sparkles' : 'planet'} size={24} />}</span>
        <span class="up-save-text">
          <span class="up-save-name">
            <span class="ellipsis">{s.name}</span>
            {s.slot === 'auto' && (
              <Chip size="sm" tone="info">
                Auto
              </Chip>
            )}
            {current && (
              <Chip size="sm" tone="accent">
                Playing
              </Chip>
            )}
          </span>
          <span class="up-save-meta num ellipsis">
            {s.cityName ? `${s.cityName}, ` : ''}{s.planetName || 'Unknown world'} · {fmtCompact(s.population)} citizens
          </span>
          <span class="up-save-meta num ellipsis">
            {s.mode === 'sandbox' ? 'Sandbox' : 'Career'} · {fmtGameDays(s.day)} · saved {timeAgo(s.savedAt)}
          </span>
        </span>
      </button>
      <div class="up-save-actions">
        {inGame && <IconButton icon="save" label={`Overwrite ${s.name}`} size="sm" variant="ghost" disabled={busy} onClick={onOverwrite} />}
        <IconButton icon="share" label={`Export ${s.name}`} size="sm" variant="ghost" disabled={busy} onClick={onShare} />
        <IconButton icon="trash" label={`Delete ${s.name}`} size="sm" variant="ghost" disabled={busy} onClick={onDelete} />
      </div>
    </article>
  );
}

export function SavesPanel() {
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inGame = ui.screen.value === 'game' && !!safe(() => game.planet, null);
  const refresh = () =>
    listSaves()
      .then(setSaves)
      .catch(() => setSaves([]));
  useEffect(() => {
    void refresh();
    const off = bus.on('game:saved', () => void refresh());
    return off;
  }, []);
  useEffect(() => {
    if (inGame && !name) setName(`${ui.cityName.value || 'My city'} — ${fmtGameDays(ui.day.value)}`);
  }, [inGame]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      void refresh();
    }
  };
  const quickSave = () =>
    run(async () => {
      const slot = currentSlot;
      const existing = saves?.find((x) => x.slot === slot);
      const ok = await saveTo(slot, existing?.name ?? (slot === 'auto' ? safe(() => game.empire.s.name, 'Autosave') : ui.cityName.value));
      if (ok) {
        uiSound('chime');
        notify({ title: 'Game saved', body: `${ui.cityName.value} is safe in the archives.`, kind: 'good', icon: 'save' });
      }
    });
  const saveAs = () =>
    run(async () => {
      const n = name.trim() || ui.cityName.value || 'My city';
      const ok = await saveTo('slot-' + Date.now().toString(36), n);
      if (ok) {
        uiSound('chime');
        notify({ title: 'New save created', body: n, kind: 'good', icon: 'save' });
      }
    });
  const load = (s: SaveMeta) =>
    run(async () => {
      if (inGame) {
        const ok = await confirmDialog({ title: `Load “${s.name}”?`, body: 'Anything since your last save will be lost to the void.', okLabel: 'Load' });
        if (!ok) return;
      }
      closePanel();
      uiSound('warp');
      ui.loading.value = `Loading ${s.name}…`;
      await nextPaint();
      try {
        const ok = await game.load(s.slot);
        if (!ok) notify({ title: 'Save not found', body: s.name, kind: 'bad', icon: 'alert' });
      } catch (e) {
        console.error('[saves] load failed', e);
        notify({ title: 'Could not load that save', body: String((e as Error)?.message ?? e), kind: 'bad', icon: 'alert' });
      } finally {
        ui.loading.value = null;
      }
    });
  const overwrite = (s: SaveMeta) =>
    run(async () => {
      const ok = await confirmDialog({ title: `Overwrite “${s.name}”?`, body: 'The old version will be replaced with your current city.', okLabel: 'Overwrite' });
      if (!ok) return;
      if (await saveTo(s.slot, s.name)) notify({ title: 'Saved over ' + s.name, kind: 'good', icon: 'save' });
    });
  const del = (s: SaveMeta) =>
    run(async () => {
      const ok = await confirmDialog({ title: `Delete “${s.name}”?`, body: 'This save will be gone forever — like a city hit by vacuum decay.', okLabel: 'Delete', danger: true });
      if (!ok) return;
      await deleteSave(s.slot);
      uiSound('demolish');
    });
  const doImport = (f: File | undefined) =>
    run(async () => {
      if (!f) return;
      try {
        const file = await importSave(f);
        notify({ title: 'City imported', body: file.meta.name, kind: 'good', icon: 'upload' });
      } catch (e) {
        notify({ title: 'That file is not a Cosmopolis city', body: String((e as Error)?.message ?? e), kind: 'bad', icon: 'alert' });
      }
    });

  return (
    <div class="up-root up-saves">
      {inGame && (
        <section class="up-card up-save-new">
          <div class="up-save-new-row">
            <Button variant="primary" icon="save" onClick={() => void quickSave()} loading={busy} class="up-quicksave">
              Save
            </Button>
            <span class="dim up-save-new-hint">{currentSlot === 'auto' ? 'to the autosave slot' : 'over the slot you are playing'}</span>
          </div>
          <TextInput label="Save as a new slot" value={name} onChange={setName} onSubmit={() => void saveAs()} maxLength={48} placeholder="Name this save" trailing={<IconButton icon="plus" label="Create save" size="sm" variant="primary" disabled={busy} onClick={() => void saveAs()} />} />
        </section>
      )}
      <div class="up-save-tools">
        <span class="up-kicker">{saves ? `${saves.length} save${saves.length === 1 ? '' : 's'}` : 'Loading…'}</span>
        <Button size="sm" variant="glass" icon="upload" onClick={() => fileRef.current?.click()} disabled={busy}>
          Import
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".cosmo,.json,application/json,application/gzip,application/octet-stream"
          class="sr-only"
          onChange={(e) => {
            const el = e.currentTarget as HTMLInputElement;
            void doImport(el.files?.[0]);
            el.value = '';
          }}
        />
      </div>
      {saves === null ? (
        <div class="up-center">
          <Spinner size={24} />
        </div>
      ) : saves.length === 0 ? (
        <EmptyState icon="folder" title="No saves yet" body={inGame ? 'Your city autosaves while you play — or tap Save above.' : 'Start a city and it will appear here.'} />
      ) : (
        <div class="up-save-list">
          {saves.map((s) => (
            <SaveRow key={s.slot} s={s} inGame={inGame} busy={busy} onLoad={() => void load(s)} onOverwrite={() => void overwrite(s)} onDelete={() => void del(s)} onShare={() => void run(() => share(s))} />
          ))}
        </div>
      )}
    </div>
  );
}
