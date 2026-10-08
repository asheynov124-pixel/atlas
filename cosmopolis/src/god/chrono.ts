/**
 * OWNER: god.
 * Chrono — time insurance for god powers.
 *   snapshot()   before a destructive power the planet is serialised (deep JSON copy, so live sim state can't
 *                drift) together with the camera pose. Powers fired in quick succession share one snapshot (a
 *                "catastrophe session"), so a whole storm of disasters rewinds in one go.
 *   offer()      after a catastrophe (or a planet-ending power) the Rewind banner appears: Rewind restores the
 *                snapshot behind a reverse-time transition; Accept fate keeps the scarred — but always playable —
 *                world. Minor disasters can still be rewound from the God panel for a while.
 *   reload()     swaps the active planet for a PlanetSave in place (unload → restore → enter), keeping the
 *                camera where it was. Also used by powers that change the planet's spec (terraform, moons).
 */
import { Vector3 } from 'three';
import type { Game } from '../game/Game';
import type { PlanetSave } from '../world/planet';
import { notify, pushNews } from '../ui/store';
import { godUi, nextKey, screenFlash } from './state';

interface Snap {
  save: PlanetSave;
  planetId: string;
  names: string[];
  at: number;
  lastActivity: number;
  money: number;
  /** camera pose when the catastrophe began (the rewind glides back to it) */
  pose: { target: Vector3; distance: number; heading: number; tilt: number } | null;
}

/** A session ends when nothing has happened for this long (ms). */
const SESSION_GAP = 25_000;
/** Snapshots expire after (ms). */
const SNAP_TTL = 10 * 60_000;

export class Chrono {
  private snap: Snap | null = null;
  private busy = false;

  constructor(private game: Game) {}

  get available(): boolean {
    return !!this.snap && this.snap.planetId === this.game.planet?.spec.id;
  }

  /** Take (or extend) the catastrophe snapshot before a destructive power. */
  snapshot(name: string, activeEffects: number): void {
    const p = this.game.planet;
    if (!p) return;
    const now = performance.now();
    const s = this.snap;
    const fresh = !s || s.planetId !== p.spec.id || (activeEffects === 0 && now - s.lastActivity > SESSION_GAP) || now - s.at > SNAP_TTL;
    if (fresh) {
      try {
        const t0 = performance.now();
        const save = JSON.parse(JSON.stringify(p.serialize())) as PlanetSave;
        const cam = this.game.camera;
        const pose = cam ? { target: cam.target.clone() as Vector3, distance: cam.distance, heading: cam.heading, tilt: cam.tilt } : null;
        this.snap = { save, planetId: p.spec.id, names: [name], at: now, lastActivity: now, money: this.game.empire.s.money, pose };
        if (performance.now() - t0 > 60) console.info(`[god] chrono snapshot took ${(performance.now() - t0).toFixed(0)} ms`);
      } catch (e) {
        console.error('[god] snapshot failed', e);
        this.snap = null;
      }
    } else if (s) {
      s.lastActivity = now;
      if (!s.names.includes(name)) s.names.push(name);
    }
    this.publish();
  }

  /** Mark activity (keeps the session open while effects run). */
  touch(): void {
    if (this.snap) this.snap.lastActivity = performance.now();
  }

  label(): string {
    const n = this.snap?.names ?? [];
    if (n.length <= 2) return n.join(' & ');
    return `${n[0]}, ${n[1]} & ${n.length - 2} more`;
  }

  /** Show the Rewind banner. */
  offer(planetEnding: boolean, body?: string): void {
    if (!this.available) return;
    godUi.rewind.value = {
      key: nextKey(),
      name: this.label(),
      planetEnding,
      body: body ?? (planetEnding ? 'Your world did not survive. Time, however, is negotiable.' : 'The city is scarred. You could pretend this never happened…'),
    };
  }

  /** Keep the consequences. */
  accept(): void {
    const name = this.label();
    godUi.rewind.value = null;
    this.snap = null;
    this.publish();
    if (name) pushNews({ author: 'Planetary Archive', handle: '@archive', icon: '📜', text: `Historians confirm: the ${name} really happened. A memorial committee has been formed. It meets in the rubble.` });
  }

  /** Restore the snapshot behind a reverse-time transition. Resolves when the world is back. */
  async rewind(): Promise<boolean> {
    if (!this.available || this.busy || !this.snap) return false;
    this.busy = true;
    const snap = this.snap;
    godUi.rewind.value = null;
    godUi.rewinding.value = true;
    try {
      this.game.audio?.sfx?.('rewind', { volume: 1 });
    } catch {
      /* audio optional */
    }
    await wait(1100);
    try {
      this.game.god.stopAll(true);
      this.reload(snap.save);
      // planet-ending powers pull the camera far out: glide back to where the player was watching from
      const pose = snap.pose;
      if (pose) {
        try {
          void this.game.camera.flyTo(pose.target, { distance: pose.distance, heading: pose.heading, tilt: pose.tilt, duration: 1.6 });
        } catch {
          /* camera optional */
        }
      }
      if (!this.game.empire.sandbox) this.game.empire.s.money = Math.max(this.game.empire.s.money, snap.money);
      try {
        this.game.empire.bump('cosmos.power.rewind');
      } catch {
        /* counters optional */
      }
      screenFlash('#cfe8ff', 0.7, 0.9);
      notify({ title: 'Time rewound', body: `The ${snap.names.join(' & ')} never happened. Probably.`, kind: 'good', icon: 'rewind' });
      pushNews({ author: 'Chrono Bureau', handle: '@chronobureau', icon: '⏪', text: `Reminder: anyone who remembers the ${snap.names[0].toLowerCase()} is asked not to mention it. It did not happen. #TimeLord` });
    } catch (e) {
      console.error('[god] rewind failed', e);
      notify({ title: 'Rewind failed', body: 'The timeline resisted. Your world stays as it is.', kind: 'bad', icon: 'alert' });
    }
    this.snap = null;
    this.publish();
    await wait(650);
    godUi.rewinding.value = false;
    this.busy = false;
    return true;
  }

  /** Swap the active planet for `save` in place, keeping the camera pose. */
  reload(save: PlanetSave): void {
    const g = this.game;
    const cam = g.camera;
    const pose = { target: cam.target.clone() as Vector3, distance: cam.distance, heading: cam.heading, tilt: cam.tilt };
    g.unloadPlanet();
    g.empire.s.planets[save.spec.id] = save;
    g.enterPlanet(save.spec);
    try {
      void cam.flyTo(pose.target, { distance: pose.distance, heading: pose.heading, tilt: pose.tilt, duration: 0.01 });
      cam.snap();
    } catch {
      /* camera optional */
    }
  }

  /**
   * Rebuild the active planet's view from its current state (after a power changed its spec: terraform, new
   * moons, rings, a dead star…), keeping the camera pose.
   */
  refresh(): void {
    const g = this.game;
    const p = g.planet;
    if (!p) return;
    const cam = g.camera;
    const pose = { target: cam.target.clone() as Vector3, distance: cam.distance, heading: cam.heading, tilt: cam.tilt };
    g.enterPlanet(p.spec);
    try {
      void cam.flyTo(pose.target, { distance: pose.distance, heading: pose.heading, tilt: pose.tilt, duration: 0.01 });
      cam.snap();
    } catch {
      /* camera optional */
    }
  }

  /** Forget everything (planet changed / new game). */
  clear(): void {
    this.snap = null;
    godUi.rewind.value = null;
    this.publish();
  }

  /** Expire old snapshots. */
  update(): void {
    if (this.snap && performance.now() - this.snap.at > SNAP_TTL && !godUi.rewind.value) this.clear();
  }

  private publish(): void {
    godUi.snapshot.value = this.available && this.snap ? { name: this.label(), at: this.snap.at } : null;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
