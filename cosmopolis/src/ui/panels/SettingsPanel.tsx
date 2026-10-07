/**
 * OWNER: ui-panels.
 * Settings panel ('settings', side drawer / tall sheet) — every core/settings field, grouped:
 *   Graphics (quality auto/low/medium/high/ultra with the live render tier, bloom, shadows, clouds, labels, build grid,
 *   FPS meter) · Day & night · Sound (master / music / effects, mute) · Controls (camera sensitivity, invert) ·
 *   Gameplay (autosave + interval, random disasters, tutorial hints, Hypernet popups) · Sandbox rules (sim.rules) ·
 *   Interface (UI scale, reduce motion) · Install on iPhone (Share → Add to Home Screen) · Storage · About · Reset.
 * Works from the main menu too (no game loaded).
 */
import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_SETTINGS, setSettings, settings, type DayNightMode, type QualitySetting, type Settings } from '../../core/settings';
import { game } from '../../game/instance';
import { Engine, TIER_NAMES } from '../../render/Engine';
import type { SandboxRules } from '../../sim/Simulation';
import { Button, Icon, SectionHeader, Segmented, Slider, Toggle } from '../core';
import { openPanel, viewport } from '../core/env';
import { confirmDialog, notify, ui } from '../store';
import { safe, useLive } from './common';

const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => setSettings({ [k]: v } as Partial<Settings>);
const pct = (v: number) => `${Math.round(v * 100)}%`;

function isStandalone(): boolean {
  try {
    return matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

function isIOS(): boolean {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
}

/** Little illustration of the iOS share glyph. */
function ShareGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" class="up-share-glyph">
      <path d="M8 9H6.5A1.5 1.5 0 0 0 5 10.5v9A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 17.5 9H16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M12 14V3M8.5 6.5 12 3l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

function InstallCard() {
  if (isStandalone()) return null;
  const ios = isIOS();
  return (
    <section class="up-card up-install">
      <div class="up-install-head">
        <span class="up-install-icon">
          <Icon name="planet" size={24} />
        </span>
        <div>
          <div class="up-install-title">Put Cosmopolis on your Home Screen</div>
          <div class="dim up-install-sub">Full screen, no browser bars, plays offline — like a real app.</div>
        </div>
      </div>
      <ol class="up-install-steps">
        <li>
          <span class="up-step-n">1</span>
          {ios ? (
            <span>
              Tap <b>Share</b> <ShareGlyph /> in Safari’s toolbar
            </span>
          ) : (
            <span>
              Open your browser’s menu <Icon name="more" size={16} />
            </span>
          )}
        </li>
        <li>
          <span class="up-step-n">2</span>
          <span>
            Choose <b>{ios ? 'Add to Home Screen' : 'Install app'}</b> <Icon name="plus" size={15} />
          </span>
        </li>
        <li>
          <span class="up-step-n">3</span>
          <span>
            Tap <b>Add</b> — then launch it from your Home Screen
          </span>
        </li>
      </ol>
    </section>
  );
}

function Storage() {
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => {
    let alive = true;
    try {
      void navigator.storage
        ?.estimate?.()
        .then((e) => alive && setEst({ usage: e.usage ?? 0, quota: e.quota ?? 0 }))
        .catch(() => {});
    } catch {
      /* unsupported */
    }
    return () => {
      alive = false;
    };
  }, []);
  const mb = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(1)} MB`);
  return (
    <section class="up-card up-storage">
      <Icon name="folder" size={20} class="accent" />
      <div class="grow">
        <div class="up-storage-title">Saved cities</div>
        <div class="dim up-storage-sub">{est ? `${mb(est.usage)} used of ${mb(est.quota)} available` : 'Stored on this device'}</div>
      </div>
      <Button size="sm" variant="glass" iconRight="chevronRight" onClick={() => openPanel('saves')}>
        Saves
      </Button>
    </section>
  );
}

function SandboxRulesCard() {
  const s = safe(() => game.sim, null);
  const [, bump] = useState(0);
  if (!s || ui.mode.value !== 'sandbox' || ui.screen.value !== 'game') return null;
  const rules: { id: keyof SandboxRules; label: string; desc: string; icon: string }[] = [
    { id: 'freeUtilities', label: 'Free utilities', desc: 'Every building has power, water, air and pickup.', icon: 'plug' },
    { id: 'noAbandon', label: 'Nobody ever leaves', desc: 'Buildings never get abandoned or collapse.', icon: 'home' },
    { id: 'fastGrowth', label: 'Instant growth', desc: 'Construction is instant and growth runs ×3.', icon: 'fastForward' },
    { id: 'maxDemand', label: 'Infinite demand', desc: 'Every zone always wants more.', icon: 'trendUp' },
  ];
  return (
    <>
      <SectionHeader title="Sandbox rules" icon="sparkles" subtitle="Bend the simulation to your will" />
      <section class="up-card up-settings-group">
        {rules.map((r) => (
          <Toggle
            key={r.id}
            icon={r.icon}
            label={r.label}
            description={r.desc}
            checked={!!s.rules[r.id]}
            onChange={(v) => {
              s.setRule(r.id, v);
              bump((x) => x + 1);
            }}
          />
        ))}
      </section>
    </>
  );
}

export function SettingsPanel() {
  useLive(1500);
  const s = settings.value;
  const inGame = ui.screen.value === 'game';
  const tier = safe(() => game.engine.tier, 1);
  const mobile = safe(() => game.engine.mobile, true);
  const vp = viewport.value;
  const setQuality = (q: QualitySetting) => {
    setSettings({ quality: q });
    if (q === 'auto') safe(() => game.engine.setQuality(Engine.tierFor('auto', mobile)), undefined);
  };
  const reset = async () => {
    const ok = await confirmDialog({ title: 'Reset every setting?', body: 'Graphics, sound, controls and interface go back to factory defaults. Your cities are not touched.', okLabel: 'Reset', danger: true });
    if (!ok) return;
    setSettings({ ...DEFAULT_SETTINGS });
    notify({ title: 'Settings reset', body: 'Fresh out of the box.', kind: 'info', icon: 'refresh' });
  };
  return (
    <div class="up-root up-settings">
      <SectionHeader title="Graphics" icon="sparkles" subtitle={`Rendering at ${TIER_NAMES[tier] ?? 'Medium'} quality${inGame && ui.fps.value ? ` · ${ui.fps.value} fps` : ''}`} />
      <section class="up-card up-settings-group">
        <Segmented
          block
          size="sm"
          value={s.quality}
          onChange={setQuality}
          ariaLabel="Graphics quality"
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Med' },
            { value: 'high', label: 'High' },
            { value: 'ultra', label: 'Ultra' },
          ]}
        />
        <p class="up-settings-note">{s.quality === 'auto' ? 'Auto adapts to keep things silky — recommended on iPhone.' : s.quality === 'ultra' ? 'Ultra: every photon, every reflection. Your battery has been warned.' : 'Fixed quality. Auto usually gives the smoothest ride.'}</p>
        <Toggle icon="sun" label="Bloom" description="Glowing windows, neon and lava" checked={s.bloom} onChange={set('bloom')} />
        <Toggle icon="building" label="Shadows" description="Soft sun shadows (Medium and up)" checked={s.shadows} onChange={set('shadows')} />
        <Toggle icon="cloud" label="Clouds" description="Weather drifting over the planet" checked={s.clouds} onChange={set('clouds')} />
        <Toggle icon="tag" label="Labels" description="District and landmark names on the map" checked={s.labels} onChange={set('labels')} />
        <Toggle icon="grid" label="Build grid" description="Hex outlines while building" checked={s.grid} onChange={set('grid')} />
        <Toggle icon="chart" label="Show FPS" description="Frame-rate meter in the corner" checked={s.showFps} onChange={set('showFps')} />
      </section>

      <SectionHeader title="Day & night" icon="sunrise" />
      <section class="up-card up-settings-group">
        <Segmented<DayNightMode>
          block
          size="sm"
          value={s.dayNight}
          onChange={set('dayNight')}
          ariaLabel="Day and night"
          options={[
            { value: 'cycle', label: 'Cycle', icon: 'refresh' },
            { value: 'day', label: 'Day', icon: 'sun' },
            { value: 'golden', label: 'Golden', icon: 'sunrise' },
            { value: 'night', label: 'Night', icon: 'moon' },
          ]}
        />
        <p class="up-settings-note">{s.dayNight === 'cycle' ? 'The sun rises and sets with game time.' : s.dayNight === 'golden' ? 'Eternal golden hour. Photographers rejoice.' : s.dayNight === 'night' ? 'Perpetual night — the city lights never sleep.' : 'Always noon wherever you look.'}</p>
      </section>

      <SectionHeader title="Sound" icon="volume" />
      <section class="up-card up-settings-group">
        <Slider icon="volume" label="Master" value={s.masterVolume} min={0} max={1} step={0.05} format={pct} onChange={set('masterVolume')} disabled={s.muted} />
        <Slider icon="sparkles" label="Music" value={s.musicVolume} min={0} max={1} step={0.05} format={pct} onChange={set('musicVolume')} disabled={s.muted} />
        <Slider icon="bell" label="Effects" value={s.sfxVolume} min={0} max={1} step={0.05} format={pct} onChange={set('sfxVolume')} disabled={s.muted} />
        <Toggle icon="mute" label="Mute everything" checked={s.muted} onChange={set('muted')} />
      </section>

      <SectionHeader title="Controls" icon="navigate" />
      <section class="up-card up-settings-group">
        <Slider icon="navigate" label="Camera sensitivity" value={s.cameraSensitivity} min={0.4} max={2} step={0.05} ticks={[1]} format={(v) => `${v.toFixed(2)}×`} onChange={set('cameraSensitivity')} />
        <Toggle icon="rotate" label="Invert rotation" description={vp.touch ? 'Twist and two-finger drags turn the other way' : 'Right-drag turns the other way'} checked={s.invertRotate} onChange={set('invertRotate')} />
      </section>

      <SectionHeader title="Gameplay" icon="play" />
      <section class="up-card up-settings-group">
        <Toggle icon="save" label="Autosave" description="Quietly saves your city as you play" checked={s.autosave} onChange={set('autosave')} />
        <div class={'up-settings-row' + (s.autosave ? '' : ' is-disabled')}>
          <span class="up-settings-row-label">Every</span>
          <Segmented
            size="sm"
            value={s.autosaveMinutes}
            onChange={set('autosaveMinutes')}
            ariaLabel="Autosave interval"
            options={[
              { value: 1, label: '1 min' },
              { value: 3, label: '3 min' },
              { value: 5, label: '5 min' },
              { value: 10, label: '10 min' },
            ]}
          />
        </div>
        <Toggle icon="tornado" label="Random disasters" description="Career only. Rare, telegraphed, survivable. Usually." checked={s.randomDisasters} onChange={set('randomDisasters')} />
        <Toggle icon="help" label="Tutorial hints" description="Coach marks for your first city" checked={s.tutorial} onChange={set('tutorial')} />
        <Toggle icon="news" label="Hypernet popups" description="Citizens’ posts float in while you build" checked={s.chirps} onChange={set('chirps')} />
      </section>

      <SandboxRulesCard />

      <SectionHeader title="Interface" icon="sliders" />
      <section class="up-card up-settings-group">
        <div class="up-settings-row">
          <span class="up-settings-row-label">UI size</span>
          <Segmented
            size="sm"
            value={[0.9, 1, 1.15, 1.3].reduce((a, b) => (Math.abs(b - s.uiScale) < Math.abs(a - s.uiScale) ? b : a), 1)}
            onChange={set('uiScale')}
            ariaLabel="Interface size"
            options={[
              { value: 0.9, label: 'S' },
              { value: 1, label: 'M' },
              { value: 1.15, label: 'L' },
              { value: 1.3, label: 'XL' },
            ]}
          />
        </div>
        <Toggle icon="eyeOff" label="Reduce motion" description="Calmer animations, gentler camera shakes" checked={s.reduceMotion} onChange={set('reduceMotion')} />
      </section>

      <InstallCard />
      <Storage />

      <SectionHeader title="About" icon="info" />
      <section class="up-card up-about">
        <div class="up-about-logo grad-text">COSMOPOLIS</div>
        <div class="dim">Version 1.0 · Build worlds. Bend stars.</div>
        <p class="up-about-body">Every mesh, texture, sound and icon is generated live in your browser — no downloads, no assets, no loading screens worth mentioning.</p>
        <div class="up-about-grid num">
          <span>Renderer</span>
          <b>{TIER_NAMES[tier]} tier</b>
          <span>Screen</span>
          <b>
            {vp.w}×{vp.h} @{Math.round((window.devicePixelRatio || 1) * 10) / 10}x
          </b>
          <span>Input</span>
          <b>{vp.touch ? 'Touch' : 'Mouse & keyboard'}</b>
        </div>
      </section>

      <Button variant="danger" icon="refresh" block onClick={() => void reset()}>
        Reset all settings
      </Button>
    </div>
  );
}
