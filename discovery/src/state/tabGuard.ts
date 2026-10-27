/**
 * One live tab at a time: the protocol, with no app wiring, so it can be tested with
 * two "tabs" in one process.
 *
 * Every tab saves its whole state on a short timer, so two open tabs would silently
 * overwrite each other's likes, saves, and imports. A tab that starts while another is
 * live stands by: it writes nothing and offers "Use it here", which asks the live tab to
 * save and step aside first. Pages sent by the bookmarklet to a standby tab are passed
 * on to the live one.
 */
import type { PageHandoff } from '../import/bookmarklet';

export type TabRole = 'probing' | 'active' | 'standby';
export type StandbyReason = 'duplicate' | 'moved' | 'forwarded';

type Msg =
  | { t: 'hello'; from: string }
  | { t: 'here'; from: string; to: string }
  | { t: 'probing'; from: string; to: string }
  | { t: 'take'; from: string }
  | { t: 'released'; from: string; to: string }
  | { t: 'page'; from: string; page: PageHandoff }
  | { t: 'page-ok'; from: string; to: string };

export interface ChannelLike {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent) => void) | null;
  close(): void;
}

export interface GuardOptions {
  channel: ChannelLike | null;
  /** How long a new tab listens for a live one before taking the role itself. */
  probeMs?: number;
  onRole: (role: TabRole, reason?: StandbyReason) => void;
  /** A page forwarded from a standby tab (only ever called on the live tab). */
  onPage: (page: PageHandoff) => void;
  /** On the live tab, before it steps aside: write everything, then hold writes. */
  release: () => Promise<void>;
  /** On a tab taking over: reload what the other tab wrote, then resume writes. */
  adopt: () => Promise<void>;
}

export interface Guard {
  role(): TabRole;
  /** Resolves once probing is over. */
  settled(): Promise<TabRole>;
  /** Make this tab the live one; the current live tab saves and stands by first. */
  takeOver(): Promise<void>;
  /** Hand a page to the live tab. False if no live tab answered. */
  forward(page: PageHandoff): Promise<boolean>;
  /**
   * Ask again whether another tab is live, and step aside if one is. For a tab coming
   * back to the front: phones freeze background tabs, and a frozen tab can't answer a
   * new one, so both may think they're live. The returning tab saved when it went to
   * the background, so it has nothing to lose by yielding.
   */
  recheck(): void;
  close(): void;
}

export function createGuard(o: GuardOptions): Guard {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let role: TabRole = 'probing';
  // Two tabs starting at the same moment can't answer each other: the later id yields.
  let yieldToPeer = false;
  let rechecking = false;
  const waiters: ((r: TabRole) => void)[] = [];
  let released: (() => void) | null = null;
  let pageOk: (() => void) | null = null;

  const become = (r: TabRole, why?: StandbyReason) => {
    role = r;
    o.onRole(r, why);
    if (r !== 'probing') for (const w of waiters.splice(0)) w(r);
  };
  const send = (m: Msg) => {
    try {
      o.channel?.postMessage(m);
    } catch {
      /* channel closed */
    }
  };

  if (o.channel) {
    o.channel.onmessage = (e) => {
      const m = e.data as Msg | null;
      if (!m || typeof m !== 'object' || m.from === id) return;
      switch (m.t) {
        case 'hello':
          if (role === 'active') send({ t: 'here', from: id, to: m.from });
          else if (role === 'probing') {
            // The peer may have started too late to hear our hello: tell it we're here too.
            send({ t: 'probing', from: id, to: m.from });
            if (m.from < id) yieldToPeer = true;
          }
          break;
        case 'probing':
          if (m.to === id && role === 'probing' && m.from < id) yieldToPeer = true;
          break;
        case 'here':
          if (m.to !== id) break;
          if (role === 'probing' || (role === 'active' && rechecking)) {
            rechecking = false;
            become('standby', 'duplicate');
          }
          break;
        case 'take':
          if (role !== 'active') break;
          role = 'standby'; // stop answering at once; the screen changes once saved
          void o.release().finally(() => {
            become('standby', 'moved');
            send({ t: 'released', from: id, to: m.from });
          });
          break;
        case 'released':
          if (m.to === id) released?.();
          break;
        case 'page':
          if (role !== 'active') break;
          o.onPage(m.page);
          send({ t: 'page-ok', from: id, to: m.from });
          break;
        case 'page-ok':
          if (m.to === id) pageOk?.();
          break;
      }
    };
    send({ t: 'hello', from: id });
    setTimeout(() => {
      if (role === 'probing') become(yieldToPeer ? 'standby' : 'active', yieldToPeer ? 'duplicate' : undefined);
    }, o.probeMs ?? 200);
  } else {
    queueMicrotask(() => become('active'));
  }

  return {
    role: () => role,
    settled: () => (role === 'probing' ? new Promise<TabRole>((r) => waiters.push(r)) : Promise.resolve(role)),
    async takeOver() {
      if (role === 'active') return;
      await new Promise<void>((resolve) => {
        // A closed live tab never answers; after a moment, go ahead.
        const t = setTimeout(resolve, 1200);
        released = () => {
          clearTimeout(t);
          resolve();
        };
        send({ t: 'take', from: id });
      });
      released = null;
      await o.adopt();
      become('active');
    },
    forward(page) {
      return new Promise<boolean>((resolve) => {
        const t = setTimeout(() => {
          pageOk = null;
          resolve(false);
        }, 1500);
        pageOk = () => {
          clearTimeout(t);
          pageOk = null;
          resolve(true);
        };
        send({ t: 'page', from: id, page });
      });
    },
    recheck() {
      if (role !== 'active' || !o.channel) return;
      rechecking = true;
      send({ t: 'hello', from: id });
      setTimeout(() => (rechecking = false), o.probeMs ?? 200);
    },
    close() {
      try {
        o.channel?.close();
      } catch {
        /* already closed */
      }
    },
  };
}
