/**
 * OWNER: ui-panels.
 * Photo mode overlay ('photo') — active while ui.photo is true (P key, the camera rail button, &photo=1).
 * Hides every other piece of chrome (ui.chromeHidden) and shows a minimal floating toolbar:
 *   Filters   colour-grade presets (PostFX GRADE_PRESETS) as swatch chips
 *   Adjust    exposure, bloom, saturation, contrast, vignette, tilt-shift, grain, chromatic aberration, temperature
 *   Time      local time-of-day scrubber (switches the sun to the "cycle" mode and freezes time) + golden-hour presets
 *   Camera    field of view, map labels, cinematic tour (game.camera.startTour)
 *   Shutter   game.engine.capture(view, 2) → flash + camera sound + 'photo:capture' → a postcard with Share (iOS share
 *             sheet with a File) and Save (download)
 * Leaving restores the post-processing params, day/night mode, clock speed, FOV and chrome exactly as they were;
 * the last look is remembered for the next photo session. Esc / P / the close button exit.
 */
import { effect } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { bus } from '../../core/events';
import { setSettings, settings, type DayNightMode } from '../../core/settings';
import { game } from '../../game/instance';
import { DEFAULT_POST, GRADE_PRESETS, type PostParams } from '../../render/post/PostFX';
import { Icon, Slider } from '../core';
import { uiSound, viewport } from '../core/env';
import { notify, ui } from '../store';
import { safe } from './common';
import { photoLabels } from './state';

type Tray = 'filters' | 'adjust' | 'time' | 'camera' | null;

interface Snapshot {
  post: PostParams;
  dayNight: DayNightMode;
  speed: number;
  timeOfDay: number;
  fov: number;
  chrome: boolean;
}

let snap: Snapshot | null = null;
/** the look of the last photo session (re-applied next time) */
let lastLook: PostParams | null = null;
let lastFov = 50;
let touringInPhoto = false;
let dayNightTouched = false;

const post = (): PostParams | null => safe(() => game.engine.post.params, null);
const cam = () => safe(() => game.activeView?.camera ?? null, null);

function enter(): void {
  const p = post();
  const c = cam();
  snap = {
    post: p ? { ...p } : { ...DEFAULT_POST },
    dayNight: settings.value.dayNight,
    speed: safe(() => game.clock.speed, 1),
    timeOfDay: safe(() => game.clock.timeOfDay, 0.3),
    fov: c?.fov ?? 50,
    chrome: ui.chromeHidden.value,
  };
  dayNightTouched = false;
  touringInPhoto = false;
  ui.panel.value = null;
  ui.category.value = null;
  ui.selection.value = null;
  ui.chromeHidden.value = true;
  if (p && lastLook) Object.assign(p, lastLook);
  if (c && Math.abs(lastFov - c.fov) > 0.1 && game.activeView === game.planetView) {
    c.fov = lastFov;
    c.updateProjectionMatrix();
  }
}

function exit(): void {
  const s = snap;
  snap = null;
  if (!s) return;
  const p = post();
  if (p) {
    lastLook = { ...p };
    Object.assign(p, s.post);
  }
  const c = cam();
  if (c) {
    lastFov = c.fov;
    c.fov = s.fov;
    c.updateProjectionMatrix();
  }
  if (touringInPhoto) safe(() => game.camera.stopTour(), undefined);
  touringInPhoto = false;
  if (dayNightTouched) {
    setSettings({ dayNight: s.dayNight });
    if (s.dayNight === 'cycle') safe(() => (game.clock.timeOfDay = s.timeOfDay), 0);
  }
  safe(() => game.clock.setSpeed(s.speed), undefined);
  ui.speed.value = s.speed;
  ui.chromeHidden.value = s.chrome;
}

/** Wire photo mode to ui.photo (module level: works even before the overlay mounts). */
let wasOn = false;
effect(() => {
  const on = ui.photo.value;
  if (on === wasOn) return;
  wasOn = on;
  try {
    if (on) enter();
    else exit();
  } catch (e) {
    console.error('[photo] toggle failed', e);
  }
});
// Esc (shell keyboard) un-hides the chrome: treat that as "leave photo mode" — unless a tour just ended
effect(() => {
  const hidden = ui.chromeHidden.value;
  if (!ui.photo.value || hidden) return;
  if (touringInPhoto) {
    touringInPhoto = false;
    ui.chromeHidden.value = true;
  } else ui.photo.value = false;
});
// leaving the game ends photo mode
effect(() => {
  if (ui.screen.value !== 'game' && ui.photo.value) ui.photo.value = false;
});

// ───────────────────────────────────────────── time of day helpers

/** Longitude (radians) of the camera's look point — the sun is overhead there when timeOfDay·2π equals it. */
function lookLongitude(): number {
  const t = safe(() => game.camera.target, null);
  return t ? Math.atan2(t.z, t.x) : 0;
}

function localHour(): number {
  const a = safe(() => game.clock.timeOfDay, 0.3) * Math.PI * 2;
  const h = (((a - lookLongitude()) / (Math.PI * 2) + 0.5) % 1 + 1) % 1;
  return h * 24;
}

function setLocalHour(h: number): void {
  if (settings.value.dayNight !== 'cycle') {
    dayNightTouched = true;
    setSettings({ dayNight: 'cycle' });
  }
  safe(() => game.clock.setSpeed(0), undefined);
  ui.speed.value = 0;
  const a = lookLongitude() + (h / 24 - 0.5) * Math.PI * 2;
  safe(() => (game.clock.timeOfDay = (((a / (Math.PI * 2)) % 1) + 1) % 1), 0);
}

function fmtHour(h: number): string {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

const TIME_PRESETS = [
  { h: 5.9, label: 'Dawn', icon: 'sunrise' },
  { h: 9, label: 'Morning', icon: 'sun' },
  { h: 12, label: 'Noon', icon: 'sun' },
  { h: 17.4, label: 'Golden', icon: 'sunrise' },
  { h: 19.2, label: 'Dusk', icon: 'moon' },
  { h: 23, label: 'Night', icon: 'moon' },
];

const SWATCH: Record<string, string> = {
  none: 'linear-gradient(135deg,#4fa3ff,#5fd38a)',
  cinematic: 'linear-gradient(135deg,#0f6a7a,#ff9a4a)',
  golden: 'linear-gradient(135deg,#ffb347,#ff7a3d)',
  arctic: 'linear-gradient(135deg,#bfe8ff,#5f9fd8)',
  dream: 'linear-gradient(135deg,#ffd1f0,#b8c6ff)',
  vapor: 'linear-gradient(135deg,#ff6ad5,#26e4ff)',
  neon: 'linear-gradient(135deg,#6a00ff,#00f0ff)',
  retro: 'linear-gradient(135deg,#d9b38c,#6f8f7a)',
  noir: 'linear-gradient(135deg,#f2f2f2,#141414)',
  sepia: 'linear-gradient(135deg,#e8c99a,#6b4a2a)',
  bleach: 'linear-gradient(135deg,#c9d0cf,#5a6462)',
  technicolor: 'linear-gradient(135deg,#ff2d55,#ffd60a,#30d158)',
  alien: 'linear-gradient(135deg,#7dff6a,#b04dff)',
};

// ───────────────────────────────────────────── capture

interface Shot {
  url: string;
  blob: Blob;
  name: string;
}

async function capture(): Promise<Shot | null> {
  const view = game.activeView;
  if (!view) return null;
  const e = game.engine;
  const longest = Math.max(e.width, e.height) * e.pixelRatio;
  const scale = Math.max(1, Math.min(2, 4096 / Math.max(1, longest)));
  const blob = await e.capture(view, scale);
  if (!blob) return null;
  const city = (ui.cityName.value || 'cosmopolis').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return { url: URL.createObjectURL(blob), blob, name: `${city}-${ui.day.value}.png` };
}

async function shareShot(s: Shot): Promise<void> {
  const file = new File([s.blob], s.name, { type: 'image/png' });
  try {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: ui.cityName.value, text: `${ui.cityName.value} — built in Cosmopolis` });
      return;
    }
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return;
  }
  downloadShot(s);
}

function downloadShot(s: Shot): void {
  const a = document.createElement('a');
  a.href = s.url;
  a.download = s.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  notify({ title: 'Photo saved', body: s.name, kind: 'good', icon: 'photo' });
}

// ───────────────────────────────────────────── UI

function AdjustTray({ p, bump }: { p: PostParams; bump: () => void }) {
  const sl = (k: keyof PostParams, label: string, icon: string, min: number, max: number, step: number, fmt: (v: number) => string, tick?: number) => (
    <Slider
      key={k}
      icon={icon}
      label={label}
      value={p[k] as number}
      min={min}
      max={max}
      step={step}
      format={fmt}
      ticks={tick !== undefined ? [tick] : undefined}
      onChange={(v) => {
        (p[k] as number) = v;
        bump();
      }}
    />
  );
  const pc = (v: number) => `${Math.round(v * 100)}%`;
  const sg = (v: number) => (v > 0 ? '+' : '') + v.toFixed(2);
  return (
    <div class="ph-adjust">
      {sl('exposure', 'Exposure', 'sun', 0.3, 2.5, 0.01, (v) => v.toFixed(2), 1)}
      {sl('bloom', 'Bloom', 'sparkles', 0, 2, 0.01, pc, DEFAULT_POST.bloom)}
      {sl('saturation', 'Saturation', 'palette', 0, 2, 0.01, pc, 1)}
      {sl('contrast', 'Contrast', 'sliders', 0.5, 1.6, 0.01, pc, 1)}
      {sl('temperature', 'Temperature', 'temperature', -1, 1, 0.01, sg, 0)}
      {sl('vignette', 'Vignette', 'target', 0, 1, 0.01, pc)}
      {sl('tiltShift', 'Tilt-shift', 'layers', 0, 1, 0.01, pc)}
      {sl('grain', 'Film grain', 'grid', 0, 1, 0.01, pc)}
      {sl('chromatic', 'Chromatic', 'eye', 0, 1, 0.01, pc)}
      <button
        type="button"
        class="ph-reset"
        onClick={() => {
          const g = p.grade;
          Object.assign(p, DEFAULT_POST, { grade: g });
          uiSound('toggle');
          bump();
        }}
      >
        <Icon name="refresh" size={15} /> Reset adjustments
      </button>
    </div>
  );
}

function FiltersTray({ p, bump }: { p: PostParams; bump: () => void }) {
  return (
    <div class="ph-filters scroll-x">
      {GRADE_PRESETS.map((g) => (
        <button
          key={g.id}
          type="button"
          class={'ph-filter' + (p.grade === g.id ? ' is-active' : '')}
          title={g.description}
          aria-pressed={p.grade === g.id}
          onClick={() => {
            p.grade = g.id;
            uiSound('tap');
            bump();
          }}
        >
          <span class="ph-filter-swatch" style={{ background: SWATCH[g.id] ?? 'linear-gradient(135deg,#5ef0ff,#a77bff)' }}>
            <span>{g.icon}</span>
          </span>
          <span class="ph-filter-label">{g.label}</span>
        </button>
      ))}
    </div>
  );
}

function TimeTray({ bump }: { bump: () => void }) {
  const planet = ui.view.value === 'planet';
  if (!planet) return <div class="ph-note">Time of day works on planet views.</div>;
  const h = localHour();
  const paused = safe(() => game.clock.speed === 0, true);
  return (
    <div class="ph-time">
      <Slider
        icon={h > 6 && h < 18.5 ? 'sun' : 'moon'}
        label="Local time"
        value={h}
        min={0}
        max={24}
        step={0.05}
        format={fmtHour}
        ticks={[6, 12, 18]}
        onChange={(v) => {
          setLocalHour(v);
          bump();
        }}
      />
      <div class="ph-chips">
        {TIME_PRESETS.map((t) => (
          <button
            key={t.label}
            type="button"
            class={'ph-chip' + (Math.abs(h - t.h) < 0.3 ? ' is-active' : '')}
            onClick={() => {
              setLocalHour(t.h);
              uiSound('tap');
              bump();
            }}
          >
            <Icon name={t.icon} size={14} /> {t.label}
          </button>
        ))}
        <button
          type="button"
          class="ph-chip"
          onClick={() => {
            const s = paused ? 1 : 0;
            safe(() => game.clock.setSpeed(s), undefined);
            ui.speed.value = s;
            if (s && settings.value.dayNight !== 'cycle') {
              dayNightTouched = true;
              setSettings({ dayNight: 'cycle' });
            }
            uiSound('toggle');
            bump();
          }}
        >
          <Icon name={paused ? 'play' : 'pause'} size={14} /> {paused ? 'Let time run' : 'Freeze time'}
        </button>
      </div>
    </div>
  );
}

function CameraTray({ bump, startTour }: { bump: () => void; startTour: () => void }) {
  const c = cam();
  return (
    <div class="ph-camera">
      {c && (
        <Slider
          icon="camera"
          label="Field of view"
          value={c.fov}
          min={18}
          max={95}
          step={1}
          ticks={[50]}
          format={(v) => `${Math.round(v)}°`}
          onChange={(v) => {
            c.fov = v;
            c.updateProjectionMatrix();
            bump();
          }}
        />
      )}
      <div class="ph-chips">
        <button
          type="button"
          class={'ph-chip' + (photoLabels.value ? ' is-active' : '')}
          onClick={() => {
            photoLabels.value = !photoLabels.value;
            uiSound('toggle');
          }}
        >
          <Icon name="tag" size={14} /> Labels {photoLabels.value ? 'on' : 'off'}
        </button>
        {ui.view.value === 'planet' && typeof game.camera?.startTour === 'function' && (
          <button type="button" class="ph-chip is-hero" onClick={startTour}>
            <Icon name="play" size={14} /> Cinematic tour
          </button>
        )}
      </div>
    </div>
  );
}

export function PhotoMode() {
  const on = ui.photo.value;
  const [tray, setTray] = useState<Tray>(null);
  const [hidden, setHidden] = useState(false);
  const [flash, setFlash] = useState(false);
  const [shot, setShot] = useState<Shot | null>(null);
  const [busy, setBusy] = useState(false);
  const [touring, setTouring] = useState(false);
  const [, setN] = useState(0);
  const bump = () => setN((x) => x + 1);
  const shotRef = useRef<Shot | null>(null);
  shotRef.current = shot;
  useEffect(() => {
    if (!on) {
      setTray(null);
      setHidden(false);
      setTouring(false);
    }
  }, [on]);
  // poll the tour so the toolbar returns when it ends
  useEffect(() => {
    if (!touring) return;
    const id = setInterval(() => {
      if (!safe(() => game.camera.touring, false)) setTouring(false);
    }, 400);
    return () => clearInterval(id);
  }, [touring]);
  useEffect(() => () => shotRef.current && URL.revokeObjectURL(shotRef.current.url), []);
  if (!on || ui.screen.value !== 'game') return null;
  const p = post();
  const close = () => {
    uiSound('close');
    ui.photo.value = false;
  };
  const startTour = () => {
    try {
      touringInPhoto = true;
      game.camera.startTour();
      setTouring(true);
      setTray(null);
      uiSound('whoosh');
    } catch (e) {
      touringInPhoto = false;
      console.warn('[photo] tour failed', e);
    }
  };
  const stopTour = () => {
    touringInPhoto = true; // the rig restores chrome on stop; keep photo mode
    safe(() => game.camera.stopTour(), undefined);
    setTouring(false);
  };
  const snapIt = async () => {
    if (busy) return;
    setBusy(true);
    setFlash(true);
    uiSound('camera');
    setTimeout(() => setFlash(false), 380);
    try {
      bus.emit('photo:capture', {});
      const s = await capture();
      if (s) {
        if (shot) URL.revokeObjectURL(shot.url);
        setShot(s);
        setTray(null);
      } else notify({ title: 'The shutter jammed', body: 'Try again in a moment.', kind: 'warn', icon: 'camera' });
    } catch (e) {
      console.error('[photo] capture failed', e);
      notify({ title: 'Could not take the photo', kind: 'bad', icon: 'camera' });
    } finally {
      setBusy(false);
    }
  };
  const tools: { id: Exclude<Tray, null>; icon: string; label: string }[] = [
    { id: 'filters', icon: 'palette', label: 'Filters' },
    { id: 'adjust', icon: 'sliders', label: 'Adjust' },
    { id: 'time', icon: 'sunrise', label: 'Time' },
    { id: 'camera', icon: 'camera', label: 'Camera' },
  ];
  const vp = viewport.value;
  return (
    <div class={'ph-root' + (vp.landscapePhone ? ' is-land' : '')}>
      {flash && <div class="ph-flash" aria-hidden="true" />}
      {touring ? (
        <button type="button" class="ph-stoptour pe" onClick={stopTour}>
          <Icon name="stop" size={16} /> Stop tour
        </button>
      ) : hidden ? (
        <button type="button" class="ph-show pe" aria-label="Show photo controls" onClick={() => (uiSound('toggle'), setHidden(false))}>
          <Icon name="eye" size={20} />
        </button>
      ) : (
        <>
          <div class="ph-top pe">
            <button type="button" class="ph-round" aria-label="Exit photo mode" onClick={close}>
              <Icon name="close" size={20} />
            </button>
            <span class="ph-badge">
              <Icon name="camera" size={14} /> Photo mode
            </span>
            <button type="button" class="ph-round" aria-label="Hide photo controls" onClick={() => (uiSound('toggle'), setHidden(true), setTray(null))}>
              <Icon name="eyeOff" size={19} />
            </button>
          </div>
          {tray && p && (
            <div class={'ph-tray glass-strong pe ph-tray-' + tray} role="dialog" aria-label={tray}>
              {tray === 'filters' && <FiltersTray p={p} bump={bump} />}
              {tray === 'adjust' && <AdjustTray p={p} bump={bump} />}
              {tray === 'time' && <TimeTray bump={bump} />}
              {tray === 'camera' && <CameraTray bump={bump} startTour={startTour} />}
            </div>
          )}
          <div class="ph-bar glass-strong pe" role="toolbar" aria-label="Photo tools">
            {tools.map((t) => (
              <button
                key={t.id}
                type="button"
                class={'ph-tool' + (tray === t.id ? ' is-active' : '')}
                aria-pressed={tray === t.id}
                onClick={() => {
                  uiSound('tap');
                  setTray(tray === t.id ? null : t.id);
                }}
              >
                <Icon name={t.icon} size={21} />
                <span>{t.label}</span>
              </button>
            ))}
            <button type="button" class={'ph-shutter' + (busy ? ' is-busy' : '')} aria-label="Take photo" onClick={() => void snapIt()} disabled={busy}>
              <span />
            </button>
          </div>
        </>
      )}
      {shot && !touring && (
        <div class="ph-postcard pe" role="dialog" aria-label="Your photo">
          <div class="ph-postcard-card">
            <img src={shot.url} alt={`Photo of ${ui.cityName.value}`} />
            <div class="ph-postcard-cap">
              <b>{ui.cityName.value}</b>
              <span class="dim">{ui.dateLabel.value}</span>
            </div>
            <div class="ph-postcard-actions">
              <button type="button" class="ph-pc-btn is-primary" onClick={() => void shareShot(shot)}>
                <Icon name="share" size={17} /> Share
              </button>
              <button type="button" class="ph-pc-btn" onClick={() => downloadShot(shot)}>
                <Icon name="download" size={17} /> Save
              </button>
              <button
                type="button"
                class="ph-pc-btn"
                aria-label="Close preview"
                onClick={() => {
                  URL.revokeObjectURL(shot.url);
                  setShot(null);
                }}
              >
                <Icon name="close" size={17} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
