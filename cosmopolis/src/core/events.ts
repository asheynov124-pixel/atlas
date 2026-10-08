/**
 * Typed global event bus. Producers emit, renderers/sim/UI subscribe. CONTRACT — append new events only.
 */
import type { Planet } from '../world/planet';
import type { Notification, NewsItem, Selection, ViewKind } from './types';

export interface GameEvents {
  /** A planet became the active planet (renderers rebuild). */
  'planet:loaded': { planet: Planet };
  /** Active planet is about to be unloaded. */
  'planet:unloading': { planet: Planet };
  /** Terrain changed (elevation / biome / feature) on these tiles. */
  'tiles:terrain': { tiles: number[] };
  /** Zone painting changed on these tiles. */
  'tiles:zone': { tiles: number[] };
  /** Road or road links changed on these tiles (includes neighbours whose links changed). */
  'tiles:road': { tiles: number[] };
  /** District assignment changed. */
  'tiles:district': { tiles: number[] };
  /** Per-tile flags changed (burning, flooded, goo...). */
  'tiles:flags': { tiles: number[] };
  /** Global sea level changed (planet.seaOffset). */
  'planet:sea': { seaOffset: number };
  'building:added': { id: number };
  'building:removed': { id: number; defId: string; tiles: number[]; cause: RemoveCause };
  /** Level / variant / state / tint / name changed. */
  'building:updated': { id: number; what: 'level' | 'state' | 'tint' | 'name' | 'variant' | 'style' };
  'prop:added': { id: number };
  'prop:removed': { id: number };
  'orbital:added': { id: number };
  'orbital:removed': { id: number };
  'selection:changed': { selection: Selection };
  'tool:changed': { toolId: string | null };
  'view:changed': { view: ViewKind };
  'lens:changed': { lensId: string | null };
  'notify': Notification;
  'news': NewsItem;
  'milestone:reached': { goalId: string };
  'unlock': { kind: 'tier' | 'item' | 'planet' | 'system' | 'galaxy' | 'tech'; id: string };
  'disaster:start': { powerId: string; tile?: number };
  'disaster:end': { powerId: string };
  /** Sim finished a month (economy tick). */
  'sim:month': { day: number };
  'sim:day': { day: number };
  'game:saved': { slot: string };
  'game:loaded': { slot: string };
  'catalog:changed': {};
  'settings:changed': {};
  'quality:changed': { tier: number };
  'photo:capture': {};
}

export type RemoveCause = 'bulldoze' | 'disaster' | 'abandon' | 'replace' | 'terraform' | 'upgrade' | 'undo';

type Handler<T> = (payload: T) => void;

export class EventBus {
  private map = new Map<keyof GameEvents, Set<Handler<any>>>();
  /** cached handler arrays (rebuilt only when subscriptions change) */
  private snap = new Map<keyof GameEvents, Handler<any>[]>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.map.get(type);
    if (!set) this.map.set(type, (set = new Set()));
    set.add(fn);
    this.snap.delete(type);
    return () => {
      if (set!.delete(fn)) this.snap.delete(type);
    };
  }

  once<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    const off = this.on(type, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    // handlers are snapshotted once per subscription change (not per emit), so emitting allocates nothing and
    // handlers added / removed while emitting take effect from the next emit
    let list = this.snap.get(type);
    if (!list) {
      const set = this.map.get(type);
      if (!set || !set.size) return;
      list = [...set];
      this.snap.set(type, list);
    }
    for (let i = 0; i < list.length; i++) {
      try {
        list[i](payload);
      } catch (err) {
        console.error(`[bus] handler for "${String(type)}" threw`, err);
      }
    }
  }
}

/** The single global bus. */
export const bus = new EventBus();
