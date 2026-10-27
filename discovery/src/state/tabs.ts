/** The app's single live tab: the tab guard wired to persistence and the store. */
import { create } from 'zustand';
import { createGuard, type Guard, type StandbyReason, type TabRole } from './tabGuard';
import { flushStorage, holdWrites } from './storage';
import { useStore } from './store';
import type { PageHandoff } from '../import/bookmarklet';

export const useTabRole = create<{ role: TabRole; reason?: StandbyReason }>(() => ({ role: 'probing' }));

let guard: Guard | null = null;

function openChannel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('ph-discovery-tabs');
  } catch {
    return null; // sandboxed frames can refuse it: then this tab is simply live
  }
}

/** Start once, before the user can change anything. Writes wait until this tab is live. */
export function startTabs(onPage: (page: PageHandoff) => void) {
  if (guard) return;
  holdWrites(true);
  guard = createGuard({
    channel: openChannel(),
    onRole: (role, reason) => {
      if (role === 'active') holdWrites(false);
      else if (role === 'standby') holdWrites(true, { discard: true });
      useTabRole.setState({ role, reason });
    },
    onPage,
    release: async () => {
      await flushStorage();
      holdWrites(true, { discard: true });
    },
    adopt: async () => {
      await Promise.resolve(useStore.persist.rehydrate());
      holdWrites(false);
    },
  });
  if (typeof document !== 'undefined')
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') guard?.recheck();
    });
}

/** Without a guard (tests, or before start) a tab counts as live. */
export const settledRole = (): Promise<TabRole> => guard?.settled() ?? Promise.resolve('active');

export const takeOver = (): Promise<void> => guard?.takeOver() ?? Promise.resolve();

export async function forwardPage(page: PageHandoff): Promise<boolean> {
  const ok = (await guard?.forward(page)) ?? false;
  if (ok) useTabRole.setState({ reason: 'forwarded' });
  return ok;
}
