/**
 * Hop policy — the one idea Atlas did not have.
 *
 * Wikipedia-shaped corpora leave every link freely openable (`hop: 'none'`).
 * Continuity / Nightglass / Provenance gate opens:
 *   watermark  — first > clock → unborn; spoil > clock → sealed
 *   look-cone  — assigned === false → extra
 *   room-bound — assigned === false → extra
 *
 * Enforcement lives in useOpenRecord + PeekSheet. Search hides unborn names.
 * Baseline (`hop: 'none'`) never depends on this module being "on".
 */
import { manifest } from '../manifest';
import type { KnowledgeRecord } from '../data/types';
import { useHops } from '../state/hops';

export type HopKind = 'none' | 'watermark' | 'look-cone' | 'room-bound';
export type HopStatus = 'safe' | 'sealed' | 'extra' | 'unborn';

export function hopKind(): HopKind {
  return manifest.hop ?? 'none';
}

export function hopStatus(
  record: Pick<KnowledgeRecord, 'first' | 'spoil' | 'assigned'> | undefined,
  clock = useHops.getState().clock,
): HopStatus {
  const kind = hopKind();
  if (!record || kind === 'none') return 'safe';
  if (kind === 'watermark') {
    const first = record.first ?? 0;
    const spoil = record.spoil ?? first;
    if (first > clock) return 'unborn';
    if (spoil > clock) return 'sealed';
    return 'safe';
  }
  if ((kind === 'look-cone' || kind === 'room-bound') && record.assigned === false) return 'extra';
  return 'safe';
}

export function isUnborn(
  record: Pick<KnowledgeRecord, 'first' | 'spoil' | 'assigned'> | undefined,
  clock?: number,
): boolean {
  return hopStatus(record, clock) === 'unborn';
}

export function canOpenDirectly(
  record: Pick<KnowledgeRecord, 'first' | 'spoil' | 'assigned'> | undefined,
  clock?: number,
): boolean {
  return hopStatus(record, clock) === 'safe';
}

export interface HopCopy {
  title: string;
  body: string;
  stay: string;
  openExtra?: string;
  stepPast?: string;
}

function fill(template: string, rec: { title?: string; spoil?: number }, clock: number): string {
  return template
    .replaceAll('{title}', rec.title ?? 'This')
    .replaceAll('{clock}', String(clock))
    .replaceAll('{spoil}', String(rec.spoil ?? clock))
    .replaceAll('{unit}', manifest.hopClock?.unit ?? 'book');
}

/** Copy for the confirm sheet. Defaults match Spine's Odyssey demo. */
export function hopCopy(
  status: HopStatus,
  rec: { title?: string; spoil?: number } = {},
  clock = useHops.getState().clock,
): HopCopy {
  const labels = manifest.hopCopy;
  if (status === 'unborn') {
    return {
      title: labels?.unbornTitle ?? 'This has not happened yet',
      body: fill(labels?.unbornBody ?? '{title} first appears after {unit} {clock}.', rec, clock),
      stay: labels?.stay ?? 'Stay',
    };
  }
  if (status === 'extra') {
    return {
      title: labels?.extraTitle ?? 'This is outside this floor',
      body: fill(labels?.extraBody ?? '{title} is not in the current bound.', rec, clock),
      stay: labels?.stay ?? 'Stay',
      openExtra: labels?.openExtra ?? 'Open as Extra',
    };
  }
  return {
    title: labels?.sealedTitle ?? 'This is after your watermark',
    body: fill(labels?.sealedBody ?? '{title} continues after {unit} {clock}.', rec, clock),
    stay: labels?.stay ?? 'Stay',
    openExtra: labels?.openExtra ?? 'Open as Extra',
    stepPast: labels?.stepPast ?? 'Step past and move watermark',
  };
}

/** Avoid PeekSheet ↔ useOpenRecord circular imports. PeekProvider registers the opener. */
let peekHandler: ((id: string) => void) | null = null;

export function registerPeekHandler(fn: (id: string) => void) {
  peekHandler = fn;
}

export function requestPeek(id: string) {
  peekHandler?.(id);
}
