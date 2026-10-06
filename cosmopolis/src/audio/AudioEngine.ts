/**
 * OWNER: audio agent.
 * AudioEngine — 100% procedural Web Audio: adaptive generative ambient music (moods per view / time of day /
 * disaster tension), synthesized SFX for every SfxName, positional-ish loops (wind, fire, rain…), ducking,
 * iOS unlock on first gesture, respects settings volumes / mute and page visibility.
 * (Foundation stub: silent.)
 *
 * CONTRACT: unlock(), sfx(name, opts?), loop(name, opts?) → LoopHandle, setMood(mood), update(dt)
 */
import type { Game } from '../game/Game';
import type { System } from '../game/System';
import type { LoopName, MusicMood, SfxName } from '../core/types';

export interface SfxOpts {
  volume?: number;
  /** playback-rate multiplier */
  pitch?: number;
  /** −1..1 */
  pan?: number;
}

export interface LoopHandle {
  setVolume(v: number): void;
  stop(fadeSeconds?: number): void;
}

export class AudioEngine implements System {
  unlocked = false;
  mood: MusicMood = 'menu';
  constructor(private game: Game) {}

  init(): void {}
  unlock(): void {
    this.unlocked = true;
  }
  sfx(_name: SfxName, _opts?: SfxOpts): void {}
  loop(_name: LoopName, _opts?: SfxOpts): LoopHandle {
    return { setVolume() {}, stop() {} };
  }
  setMood(m: MusicMood): void {
    this.mood = m;
  }
}
