type Mode = 'off' | 'prelude' | 'ring' | 'preview';

class Score {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: AudioNode[] = [];
  private timer: number | null = null;
  private previewTimer: number | null = null;
  private mode: Mode = 'off';
  private soundId = 'bell';

  private context(): AudioContext | null {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!this.ctx) {
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.0001;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private clearVoices() {
    for (const voice of this.voices) {
      try {
        if (voice instanceof OscillatorNode) voice.stop();
        voice.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.voices = [];
  }

  private clearTimers() {
    if (this.timer != null) window.clearInterval(this.timer);
    if (this.previewTimer != null) window.clearTimeout(this.previewTimer);
    this.timer = null;
    this.previewTimer = null;
  }

  stop() {
    this.clearTimers();
    this.clearVoices();
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.03);
    this.mode = 'off';
  }

  releaseAlarm() {
    if (this.mode === 'ring' || this.mode === 'prelude') this.stop();
  }

  setLevel(level: number) {
    if (!this.master || !this.ctx || this.mode === 'off') return;
    const value = Math.min(1, Math.max(0.0001, level));
    this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.08);
  }

  private hit(soundId: string, volume: number) {
    const ctx = this.context();
    if (!ctx) return;
    const now = ctx.currentTime;
    const level = Math.max(0.0001, volume);
    if (soundId === 'bell') {
      for (const freq of [523.25, 659.25, 783.99, 1046.5]) this.tone(ctx, freq, now, 1.5, level * 0.18, 'sine');
      return;
    }
    if (soundId === 'pulse') {
      this.tone(ctx, 98, now, 0.18, level * 0.35, 'square');
      return;
    }
    if (soundId === 'strike') {
      this.tone(ctx, 330, now, 0.9, level * 0.28, 'triangle');
      return;
    }
    this.tone(ctx, 440, now, 0.7, level * 0.3, 'sine');
    this.tone(ctx, 444, now, 0.7, level * 0.18, 'sine');
  }

  private tone(
    ctx: AudioContext,
    freq: number,
    when: number,
    duration: number,
    peak: number,
    type: OscillatorType,
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + duration + 0.05);
    this.voices.push(osc, gain);
  }

  private bed(soundId: string) {
    const ctx = this.context();
    if (!ctx || !this.master) return;
    const freq = soundId === 'pulse' ? 110 : soundId === 'bell' ? 392 : soundId === 'strike' ? 262 : 220;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(this.master);
    osc.start();
    this.voices.push(osc);
  }

  prelude(soundId: string, volume: number) {
    if (this.mode === 'prelude' && this.soundId === soundId) return;
    this.stop();
    if (!this.context()) return;
    this.mode = 'prelude';
    this.soundId = soundId;
    this.bed(soundId);
    this.setLevel(volume * 0.04);
    this.timer = window.setInterval(() => this.hit(soundId, volume * 0.35), 4000);
  }

  ring(soundId: string, volume: number) {
    if (this.mode === 'ring' && this.soundId === soundId) {
      this.setLevel(volume);
      return;
    }
    this.stop();
    if (!this.context()) return;
    this.mode = 'ring';
    this.soundId = soundId;
    this.setLevel(volume);
    this.bed(soundId);
    const gap = soundId === 'pulse' ? 800 : 1600;
    this.hit(soundId, volume);
    this.timer = window.setInterval(() => this.hit(soundId, volume), gap);
  }

  preview(soundId: string, volume: number) {
    if (this.mode === 'ring' || this.mode === 'prelude') return;
    this.stop();
    const ctx = this.context();
    if (!ctx || !this.master) return;
    this.mode = 'preview';
    this.soundId = soundId;
    this.bed(soundId);
    const start = ctx.currentTime;
    this.master.gain.cancelScheduledValues(start);
    this.master.gain.setValueAtTime(0.0001, start);
    this.master.gain.linearRampToValueAtTime(Math.max(volume, 0.0001), start + 12);
    [0, 4, 8, 12].forEach((second) => {
      window.setTimeout(() => {
        if (this.mode === 'preview') this.hit(soundId, volume);
      }, second * 1000);
    });
    this.previewTimer = window.setTimeout(() => {
      if (this.mode === 'preview') this.stop();
    }, 15_000);
  }

  chime() {
    if (this.mode === 'ring' || this.mode === 'prelude') return;
    this.context();
    this.hit('strike', 0.55);
  }
}

export const score = new Score();
