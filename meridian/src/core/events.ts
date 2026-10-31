import type { EventName, KernelEvent } from './types.js';
import { nowIso } from './types.js';

export type Listener = (e: KernelEvent) => void;

/** Typed event stream shared by every kernel service; the API fans it out as SSE. */
export class EventStream {
  private listeners = new Set<Listener>();
  readonly history: KernelEvent[] = [];

  emit(event: EventName, payload: Record<string, unknown>, run_id?: string): KernelEvent {
    const e: KernelEvent = { event, at: nowIso(), payload, ...(run_id ? { run_id } : {}) };
    this.history.push(e);
    for (const l of this.listeners) l(e);
    return e;
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  forRun(run_id: string): KernelEvent[] {
    return this.history.filter((e) => e.run_id === run_id);
  }
}
