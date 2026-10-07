/**
 * OWNER: audio.
 * SynthClient — main-thread side of the synth worker (synth.worker.ts, bundled inline so the single-file build
 * works too). Requests are answered with transferred Float32Arrays. If the worker cannot start or crashes, `ok`
 * turns false, pending callbacks receive an error and the engine falls back to amortised main-thread synthesis.
 */
import SynthWorker from './synth.worker?worker&inline';
import type { ImpulseOpts, NoiseKind } from './dsp';
import type { InstName } from './samples';

export type SynthRequest =
  | { id: number; kind: 'noise'; name: NoiseKind; sr: number }
  | { id: number; kind: 'sample'; inst: InstName; midi: number }
  | { id: number; kind: 'impulse'; seconds: number; sr: number; opts: ImpulseOpts };

export interface SynthResult {
  id: number;
  chans: Float32Array<ArrayBuffer>[];
  sr: number;
  f0?: number;
  error?: string;
}

type Body = SynthRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

export class SynthClient {
  private w: Worker | null = null;
  private next = 1;
  private cbs = new Map<number, (r: SynthResult) => void>();
  ok = false;
  /** requests answered (debug) */
  served = 0;

  constructor() {
    try {
      const w = new SynthWorker();
      w.onmessage = (e: MessageEvent<SynthResult>) => {
        const cb = this.cbs.get(e.data.id);
        if (!cb) return;
        this.cbs.delete(e.data.id);
        this.served++;
        try {
          cb(e.data);
        } catch (err) {
          console.error('[audio] synth callback failed', err);
        }
      };
      w.onerror = (e) => {
        e.preventDefault?.();
        this.fail();
      };
      this.w = w;
      this.ok = true;
    } catch {
      this.w = null;
      this.ok = false;
    }
  }

  get pending(): number {
    return this.cbs.size;
  }

  request(body: Body, cb: (r: SynthResult) => void): void {
    if (!this.w || !this.ok) {
      cb({ id: 0, chans: [], sr: 0, error: 'worker unavailable' });
      return;
    }
    const id = this.next++;
    this.cbs.set(id, cb);
    try {
      this.w.postMessage({ ...body, id } as SynthRequest);
    } catch {
      this.cbs.delete(id);
      cb({ id, chans: [], sr: 0, error: 'post failed' });
    }
  }

  private fail(): void {
    this.ok = false;
    const cbs = [...this.cbs.entries()];
    this.cbs.clear();
    for (const [id, cb] of cbs) {
      try {
        cb({ id, chans: [], sr: 0, error: 'worker error' });
      } catch {
        /* ignore */
      }
    }
    this.dispose();
  }

  dispose(): void {
    try {
      this.w?.terminate();
    } catch {
      /* ignore */
    }
    this.w = null;
    this.ok = false;
  }
}
