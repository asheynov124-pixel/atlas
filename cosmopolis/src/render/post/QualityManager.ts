/**
 * OWNER: space-post.
 * QualityManager — adaptive quality for settings.quality === 'auto'.
 * Measures real frame intervals (an EMA that ignores hitches > 250 ms and backgrounded tabs) and proposes a tier:
 *   • step DOWN when the smoothed rate stays under 48 fps for ~3 s
 *   • step UP when it stays above 58 fps for ~10 s — but never back into a tier we just fled: each downgrade blocks
 *     that tier for 60 s, doubling every time it happens again (no ping-pong)
 *   • bounded per device: phones/tablets max tier 2 (High), desktops 3 (Ultra); a 4 s cooldown after every change
 *     lets shaders compile before we judge again
 * Manual settings pin the tier. Disabled under automation (navigator.webdriver) so headless screenshots stay
 * deterministic — `&autoquality=1` forces it on for testing.
 */
import type { QualitySetting } from '../../core/settings';

const DOWN_FPS = 48;
const UP_FPS = 58;
const DOWN_AFTER = 3;
const UP_AFTER = 10;
const COOLDOWN = 4;

export class QualityManager {
  /** smoothed frame time (ms) */
  frameMs = 16.7;
  private last = 0;
  private lowFor = 0;
  private highFor = 0;
  private cooldown = COOLDOWN;
  private clock = 0;
  private blockedUntil = [0, 0, 0, 0];
  private penalty = [1, 1, 1, 1];
  readonly allowed: boolean;

  constructor() {
    let forced = false;
    try {
      forced = new URLSearchParams(location.search).get('autoquality') === '1';
    } catch {
      /* no location (tests) */
    }
    const automated = typeof navigator !== 'undefined' && (navigator as Navigator & { webdriver?: boolean }).webdriver === true;
    this.allowed = forced || !automated;
  }

  /** smoothed frames per second */
  get fps(): number {
    return 1000 / Math.max(1, this.frameMs);
  }

  /** Feed one frame; returns a new tier to switch to, or null. */
  sample(now: number, tier: number, setting: QualitySetting, mobile: boolean): number | null {
    const prev = this.last;
    this.last = now;
    if (!prev) return null;
    const dtMs = now - prev;
    if (setting !== 'auto' || !this.allowed) {
      this.lowFor = this.highFor = 0;
      this.cooldown = COOLDOWN;
      return null;
    }
    const maxTier = mobile ? 2 : 3;
    if (tier > maxTier) return this.changed(maxTier);
    if (dtMs <= 0 || dtMs > 250) return null;
    const dt = dtMs / 1000;
    this.clock += dt;
    this.frameMs += (dtMs - this.frameMs) * 0.06;
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      return null;
    }
    const fps = this.fps;
    if (fps < DOWN_FPS) {
      this.lowFor += dt;
      this.highFor = 0;
    } else if (fps > UP_FPS) {
      this.highFor += dt;
      this.lowFor = Math.max(0, this.lowFor - dt);
    } else {
      this.lowFor = Math.max(0, this.lowFor - dt * 0.5);
      this.highFor = 0;
    }
    if (this.lowFor > DOWN_AFTER && tier > 0) {
      this.blockedUntil[tier] = this.clock + 60 * this.penalty[tier];
      this.penalty[tier] = Math.min(32, this.penalty[tier] * 2);
      return this.changed(tier - 1);
    }
    if (this.highFor > UP_AFTER && tier < maxTier && this.clock >= this.blockedUntil[tier + 1]) return this.changed(tier + 1);
    return null;
  }

  private changed(tier: number): number {
    this.lowFor = this.highFor = 0;
    this.cooldown = COOLDOWN;
    this.frameMs = 1000 / 54;
    return tier;
  }
}
