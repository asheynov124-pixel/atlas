/**
 * The app's end of the bookmarklet handoff. A tab opened as `#phd-handoff` tells its
 * opener it's ready, takes one page snapshot from that window only, acknowledges it,
 * and queues it for Import. The queue waits until the app is past the age gate and the
 * lock. If this tab isn't the live one, the page goes to the live tab instead.
 * A snapshot only ever fills the import preview: nothing is imported until you press
 * Import, and the safety gate runs as for any other source.
 */
import { HANDOFF_HASH, parseHandoff, type PageHandoff } from './bookmarklet';
import { forwardPage, settledRole, takeOver } from '../state/tabs';

export type Arrival = { kind: 'page'; page: PageHandoff } | { kind: 'missed' };

const queue: Arrival[] = [];
let consumer: ((a: Arrival) => void) | null = null;

export function queueArrival(a: Arrival) {
  if (consumer) consumer(a);
  else queue.push(a);
}

export const queuePage = (page: PageHandoff) => queueArrival({ kind: 'page', page });

/** Deliver queued arrivals now and later ones as they land, until the returned stop. */
export function consumeArrivals(fn: (a: Arrival) => void): () => void {
  consumer = fn;
  for (const a of queue.splice(0)) fn(a);
  return () => {
    if (consumer === fn) consumer = null;
  };
}

type HandoffWindow = Pick<Window, 'location' | 'history' | 'opener' | 'addEventListener' | 'removeEventListener'>;

/** Call once at startup, before routing reads the hash. True if this tab was opened for a handoff. */
export function startHandoffListener(win: HandoffWindow = window, waitMs = 15000): boolean {
  if (win.location.hash !== HANDOFF_HASH) return false;
  win.history.replaceState(win.history.state, '', win.location.pathname + win.location.search);
  const opener = win.opener as Window | null;
  if (!opener) {
    // The site cut the link between tabs (or the tab was reopened from history).
    queueArrival({ kind: 'missed' });
    return true;
  }
  let got = false;
  const onMessage = (e: MessageEvent) => {
    if (e.source !== opener) return;
    const page = parseHandoff(e.data);
    if (!page) return;
    got = true;
    win.removeEventListener('message', onMessage);
    try {
      opener.postMessage({ type: 'phd-received' }, e.origin);
    } catch {
      /* the page went away; we have what we need */
    }
    void route(page);
  };
  win.addEventListener('message', onMessage);
  try {
    // No data in this one, so any origin may hear it.
    opener.postMessage({ type: 'phd-ready' }, '*');
  } catch {
    /* opener gone */
  }
  setTimeout(() => {
    if (got) return;
    win.removeEventListener('message', onMessage);
    queueArrival({ kind: 'missed' });
  }, waitMs);
  return true;
}

async function route(page: PageHandoff) {
  if ((await settledRole()) === 'standby') {
    if (await forwardPage(page)) return; // the live tab has it; this tab says so
    await takeOver(); // nobody answered: this tab becomes the live one
  }
  queuePage(page);
}
