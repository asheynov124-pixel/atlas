/**
 * OWNER: audio.
 * MusicEngine — owns the active mood player and any players still fading out. `play(mood)` crossfades (each player
 * keeps composing during its fade so the texture never collapses), `pump(now)` schedules every player up to a
 * lookahead horizon. At most three players exist at once; the oldest is cut quickly if a fourth arrives.
 * Works with an OfflineAudioContext too: `pump(0, seconds)` schedules a whole render ahead of time.
 */
import type { MusicMood } from '../core/types';
import { createMood } from './moods';
import type { MoodPlayer, MusicEnv } from './player';

export const LOOKAHEAD = 0.35;

export class MusicEngine {
  players: MoodPlayer[] = [];
  current: MoodPlayer | null = null;
  private seed = (Date.now() & 0xffff) + 1;

  constructor(private env: MusicEnv) {}

  get mood(): MusicMood | null {
    return this.current?.mood ?? null;
  }

  play(mood: MusicMood, now: number, fadeIn = 3, fadeOut = 3.5): MoodPlayer {
    if (this.current && this.current.mood === mood && this.current.stopAt === Infinity) return this.current;
    for (const p of this.players) p.fadeOut(now, fadeOut);
    // cap concurrent players
    const live = this.players.filter((p) => p.stopAt > now);
    if (live.length >= 3) live[0].fadeOut(now, 0.25);
    const p = createMood(mood, this.env, this.seed++ * 7919);
    p.start(now + 0.06, fadeIn);
    this.players.push(p);
    this.current = p;
    this.env.setDelay((p.delayBeats * 60) / p.bpm, p.delayFeedback, now);
    return p;
  }

  stop(now: number, fade = 2): void {
    for (const p of this.players) p.fadeOut(now, fade);
    this.current = null;
  }

  pump(now: number, horizon = now + LOOKAHEAD): void {
    for (const p of this.players) p.pump(horizon, now);
    // drop players whose fade finished (keep 8 s for tails to ring out)
    for (let i = this.players.length - 1; i >= 0; i--) {
      const p = this.players[i];
      if (p !== this.current && now > p.stopAt + 8) {
        p.dispose();
        this.players.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const p of this.players) p.dispose();
    this.players = [];
    this.current = null;
  }
}
