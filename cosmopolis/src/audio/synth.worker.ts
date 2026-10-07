/**
 * OWNER: audio.
 * Synth worker — renders noise textures, instrument samples and the reverb impulse response off the main thread
 * (pure functions from dsp.ts / samples.ts) and transfers the Float32Arrays back, so warming up the audio never
 * costs a frame. Protocol: SynthRequest in, SynthResult out (see synth.ts).
 */
import { impulseData, noiseData } from './dsp';
import { renderData } from './samples';
import type { SynthRequest, SynthResult } from './synth';

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<SynthRequest>) => void) | null;
  postMessage(msg: SynthResult, transfer: Transferable[]): void;
};

scope.onmessage = (e) => {
  const r = e.data;
  try {
    if (r.kind === 'noise') {
      const d = noiseData(r.name, r.sr);
      scope.postMessage({ id: r.id, chans: [d], sr: r.sr }, [d.buffer]);
    } else if (r.kind === 'sample') {
      const s = renderData(r.inst, r.midi);
      scope.postMessage({ id: r.id, chans: [s.data], sr: s.sr, f0: s.f0 }, [s.data.buffer]);
    } else {
      const c = impulseData(r.seconds, r.sr, r.opts);
      scope.postMessage({ id: r.id, chans: c, sr: r.sr }, c.map((x) => x.buffer));
    }
  } catch (err) {
    scope.postMessage({ id: r.id, chans: [], sr: 0, error: String(err) }, []);
  }
};
