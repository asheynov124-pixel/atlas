// @vitest-environment node
// One live tab at a time, with real BroadcastChannels standing in for browser tabs.
import { afterEach, describe, expect, it } from 'vitest';
import { createGuard, type GuardOptions } from '../state/tabGuard';
import type { PageHandoff } from '../import/bookmarklet';

const open: BroadcastChannel[] = [];
let seq = 0;
afterEach(() => {
  for (const c of open.splice(0)) c.close();
});

function tab(name: string, opts: Partial<GuardOptions> = {}) {
  const log = { roles: [] as string[], pages: [] as PageHandoff[], released: 0, adopted: 0 };
  const channel = new BroadcastChannel(name);
  open.push(channel);
  const g = createGuard({
    channel: channel as unknown as GuardOptions['channel'],
    probeMs: 40,
    onRole: (r, why) => log.roles.push(why ? `${r}:${why}` : r),
    onPage: (p) => log.pages.push(p),
    release: async () => void log.released++,
    adopt: async () => void log.adopted++,
    ...opts,
  });
  return { g, log, channel };
}

const page: PageHandoff = { page: 'https://site.example/g/1', title: 'Set', html: '<html></html>' };

describe('tab guard', () => {
  it('the first tab goes live; one opened later stands by', async () => {
    const name = `tabs-${seq++}`;
    const a = tab(name);
    expect(await a.g.settled()).toBe('active');
    const b = tab(name);
    expect(await b.g.settled()).toBe('standby');
    expect(b.log.roles).toEqual(['standby:duplicate']);
  });

  it('a standby tab hands pages to the live one', async () => {
    const name = `tabs-${seq++}`;
    const a = tab(name);
    await a.g.settled();
    const b = tab(name);
    await b.g.settled();
    expect(await b.g.forward(page)).toBe(true);
    expect(a.log.pages).toEqual([page]);
  });

  it('Use it here: the live tab saves and steps aside before the new one takes over', async () => {
    const name = `tabs-${seq++}`;
    const a = tab(name);
    await a.g.settled();
    const b = tab(name);
    await b.g.settled();
    await b.g.takeOver();
    expect(a.log.released).toBe(1);
    expect(a.log.roles.at(-1)).toBe('standby:moved');
    expect(b.log.adopted).toBe(1);
    expect(b.log.roles.at(-1)).toBe('active');
    // The new live tab now answers for itself.
    const c = tab(name);
    expect(await c.g.settled()).toBe('standby');
  });

  it('taking over still works when the live tab has gone', async () => {
    const name = `tabs-${seq++}`;
    const a = tab(name);
    await a.g.settled();
    const b = tab(name);
    await b.g.settled();
    a.channel.close();
    expect(await b.g.forward(page)).toBe(false);
    await b.g.takeOver();
    expect(b.g.role()).toBe('active');
  });

  it('two tabs starting together: exactly one goes live', async () => {
    const name = `tabs-${seq++}`;
    const a = tab(name);
    const b = tab(name);
    const roles = [await a.g.settled(), await b.g.settled()].sort();
    expect(roles).toEqual(['active', 'standby']);
  });

  it('a tab returning to the front yields if another went live while it was frozen', async () => {
    const name = `tabs-${seq++}`;
    const a = tab(name);
    await a.g.settled();
    // Frozen: a background tab on a phone hears nothing, so a new tab finds no one.
    const handler = a.channel.onmessage;
    a.channel.onmessage = null;
    const b = tab(name);
    expect(await b.g.settled()).toBe('active');
    a.channel.onmessage = handler;
    a.g.recheck();
    await new Promise((r) => setTimeout(r, 60));
    expect(a.g.role()).toBe('standby');
    expect(a.log.roles.at(-1)).toBe('standby:duplicate');
    expect(b.g.role()).toBe('active');
  });

  it('without BroadcastChannel, a tab is simply live', async () => {
    const g = createGuard({ channel: null, onRole: () => undefined, onPage: () => undefined, release: async () => undefined, adopt: async () => undefined });
    expect(await g.settled()).toBe('active');
  });
});
