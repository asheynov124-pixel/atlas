/**
 * OWNER: god.
 * God overlays (always mounted): screen flash, apocalypse dread vignette, cinematic event title cards, the
 * natural-disaster warning with countdown, the Rewind Time offer (Rewind / Accept fate) and the reverse-time
 * transition that covers the world swap. Banners and warnings hide in photo mode; flashes respect reduce motion.
 */
import { useEffect, useState } from 'preact/hooks';
import { game } from '../../game/instance';
import { settings } from '../../core/settings';
import { ui } from '../../ui/store';
import { Button, Icon, IconOrEmoji, uiSound } from '../../ui/core';
import { godUi } from '../state';

function Flash() {
  const f = godUi.flash.value;
  if (!f) return null;
  const strength = settings.value.reduceMotion ? f.strength * 0.4 : f.strength;
  return (
    <div
      key={f.key}
      class="gd-flash"
      style={{ background: f.color, '--gd-o': String(strength), animationDuration: `${f.duration}s` } as never}
      onAnimationEnd={() => {
        if (godUi.flash.value?.key === f.key) godUi.flash.value = null;
      }}
    />
  );
}

function Dread() {
  const d = godUi.dread.value;
  if (d <= 0.01) return null;
  return <div class="gd-dread" style={{ opacity: String(Math.min(1, d)) }} />;
}

function Banner() {
  const b = godUi.banner.value;
  useEffect(() => {
    if (!b) return;
    const id = setTimeout(() => {
      if (godUi.banner.value?.key === b.key) godUi.banner.value = null;
    }, b.duration * 1000 + 100);
    return () => clearTimeout(id);
  }, [b?.key]);
  if (!b || ui.photo.value || ui.chromeHidden.value) return null;
  return (
    <div key={b.key} class="gd-banner" style={{ '--gd-c': b.color, animationDuration: `${b.duration}s` } as never} role="status" aria-live="polite">
      <span class="gd-banner-icon">
        <IconOrEmoji value={b.icon} size={26} />
      </span>
      <span class="gd-banner-title">{b.title}</span>
      <span class="gd-banner-rule" />
      {b.subtitle && <span class="gd-banner-sub">{b.subtitle}</span>}
    </div>
  );
}

function Warning() {
  const w = godUi.warning.value;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!w) return;
    const id = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [w?.key]);
  if (!w || ui.photo.value || ui.chromeHidden.value || ui.view.value !== 'planet') return null;
  const left = Math.max(0, Math.ceil((w.at - performance.now()) / 1000));
  const paused = game.clock.speed === 0;
  return (
    <div class="gd-warning pe" role="alert">
      <span class="gd-warning-icon">
        <IconOrEmoji value={w.icon} size={22} />
      </span>
      <span class="gd-warning-text">
        <b>{w.title}</b>
        <span>{w.body}</span>
      </span>
      <span class="gd-warning-count num" aria-label={`${left} seconds`}>
        {paused ? 'II' : `T−${left}`}
      </span>
      {w.tile !== undefined && (
        <button
          type="button"
          class="gd-warning-go"
          aria-label="Show me where"
          onClick={() => {
            uiSound('click');
            void game.camera.flyTo(w.tile!, { distance: 40 });
          }}
        >
          <Icon name="locate" size={18} />
        </button>
      )}
    </div>
  );
}

function RewindOffer() {
  const r = godUi.rewind.value;
  if (!r || godUi.rewinding.value || ui.view.value !== 'planet') return null;
  return (
    <div key={r.key} class={'gd-rewind pe' + (r.planetEnding ? ' is-end' : '')} role="dialog" aria-label="Rewind time?">
      <div class="gd-rewind-head">
        <span class="gd-rewind-icon">
          <Icon name="hourglass" size={24} />
        </span>
        <span class="gd-rewind-titles">
          <b>{r.planetEnding ? 'This world has ended' : 'Rewind time?'}</b>
          <span class="gd-rewind-what">{r.name}</span>
        </span>
      </div>
      <p class="gd-rewind-body">{r.body}</p>
      <div class="gd-rewind-actions">
        <Button variant="ghost" onClick={() => game.god.chrono.accept()} sound="close">
          Accept fate
        </Button>
        <Button variant="primary" icon="rewind" onClick={() => void game.god.chrono.rewind()} sound={false}>
          Rewind time
        </Button>
      </div>
    </div>
  );
}

function Rewinding() {
  if (!godUi.rewinding.value) return null;
  return (
    <div class="gd-rewinding" aria-live="assertive">
      <div class="gd-rw-lines" />
      <div class="gd-rw-center">
        <span class="gd-rw-clock">
          <Icon name="clock" size={64} stroke={1.4} />
        </span>
        <span class="gd-rw-text">
          <Icon name="rewind" size={22} /> REWINDING TIME
        </span>
      </div>
    </div>
  );
}

function ActivePills() {
  const act = godUi.active.value;
  if (!act.length || ui.panel.value || ui.photo.value || ui.chromeHidden.value || ui.view.value !== 'planet' || godUi.warning.value) return null;
  return (
    <div class="gd-pills">
      {act.slice(0, 3).map((a) => (
        <span key={a.key} class="gd-pill">
          <IconOrEmoji value={a.icon} size={15} />
          <span class="ellipsis">{a.name}</span>
          {a.progress >= 0 && (
            <span class="gd-pill-bar">
              <i style={{ transform: `scaleX(${Math.max(0.02, Math.min(1, a.progress))})` }} />
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

export function GodOverlay() {
  if (ui.screen.value !== 'game') return null;
  return (
    <>
      <Dread />
      <Flash />
      <ActivePills />
      <Banner />
      <Warning />
      <RewindOffer />
      <Rewinding />
    </>
  );
}
