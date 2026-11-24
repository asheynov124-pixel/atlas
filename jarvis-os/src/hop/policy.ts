/**
 * Hop policy — spoiler / watermark gate for knowledge nodes.
 * Ported for Jarvis OS Mark I (no Expo / zustand store coupling).
 */

export type HopKind = 'none' | 'watermark' | 'look-cone' | 'room-bound';
export type HopStatus = 'safe' | 'sealed' | 'extra' | 'unborn';

export interface HopRecord {
  first?: number;
  spoil?: number;
  assigned?: boolean;
  title?: string;
}

export interface HopClock {
  min: number;
  max: number;
  default: number;
  unit: string;
}

export const HOP_KIND: HopKind = 'watermark';
export const HOP_CLOCK: HopClock = { min: 1, max: 12, default: 4, unit: 'depth' };

export function hopStatus(record: HopRecord | undefined, clock: number): HopStatus {
  if (!record || HOP_KIND === 'none') return 'safe';
  if (HOP_KIND === 'watermark') {
    const first = record.first ?? 0;
    const spoil = record.spoil ?? first;
    if (first > clock) return 'unborn';
    if (spoil > clock) return 'sealed';
    return 'safe';
  }
  if ((HOP_KIND === 'look-cone' || HOP_KIND === 'room-bound') && record.assigned === false) {
    return 'extra';
  }
  return 'safe';
}

export function isUnborn(record: HopRecord | undefined, clock: number): boolean {
  return hopStatus(record, clock) === 'unborn';
}

export function canOpenDirectly(record: HopRecord | undefined, clock: number): boolean {
  return hopStatus(record, clock) === 'safe';
}

export interface HopCopy {
  title: string;
  body: string;
  stay: string;
  openExtra?: string;
  stepPast?: string;
}

export function hopCopy(status: HopStatus, rec: HopRecord = {}, clock: number): HopCopy {
  const unit = HOP_CLOCK.unit;
  const title = rec.title ?? 'This';
  if (status === 'unborn') {
    return {
      title: 'Not yet on the frontier',
      body: `${title} first opens after ${unit} ${clock}. Jarvis will surface it when you are ready.`,
      stay: 'Stay',
    };
  }
  if (status === 'extra') {
    return {
      title: 'Outside this bound',
      body: `${title} is not in the current focus cone.`,
      stay: 'Stay',
      openExtra: 'Open as Extra',
    };
  }
  return {
    title: 'Past your watermark',
    body: `${title} continues after ${unit} ${clock}. Step past only if you want the frontier moved.`,
    stay: 'Stay',
    openExtra: 'Open as Extra',
    stepPast: 'Step past and move watermark',
  };
}
