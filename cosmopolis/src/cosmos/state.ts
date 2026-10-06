/**
 * OWNER: cosmos.
 * Reactive cosmos UI state (Preact signals) shared by the Cosmos system and the cosmos HUD / panels, plus a tiny
 * DOM-effects host (the warp flash) that the system drives directly without re-rendering components.
 */
import { signal } from '@preact/signals';

export type CosmosLevel = 'system' | 'galaxy' | 'universe';

export interface CosmosSelection {
  kind: 'planet' | 'star' | 'system' | 'galaxy';
  id: string;
}

export const cx = {
  /** active cosmos level (null while on a planet surface) */
  level: signal<CosmosLevel | null>(null),
  galaxyId: signal(''),
  systemId: signal(''),
  selected: signal<CosmosSelection | null>(null),
  /** a camera transition is running (CTA buttons wait) */
  busy: signal(false),
  /** bumped whenever unlocks / colonies change so cards re-evaluate */
  version: signal(0),
  /** warp in progress: destination name + kind of jump */
  warping: signal<{ name: string; kind: 'local' | 'interstellar' | 'intergalactic'; distance: string } | null>(null),
};

/** DOM effect elements registered by the cosmos overlay (driven per frame without Preact renders). */
export const fxHost: { flash: HTMLElement | null } = { flash: null };

export function setFlash(v: number, color = '#ffffff'): void {
  const el = fxHost.flash;
  if (!el) return;
  el.style.opacity = String(Math.max(0, Math.min(1, v)));
  el.style.background = color;
}
