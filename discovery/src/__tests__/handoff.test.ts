// @vitest-environment jsdom
// The app's end of the handoff: one page, from the opener only, acknowledged, queued.
import { describe, expect, it, vi } from 'vitest';
import { consumeArrivals, startHandoffListener, type Arrival } from '../import/handoff';

function fakeWindow(hash: string, opener: { postMessage: ReturnType<typeof vi.fn> } | null) {
  const listeners = new Set<(e: MessageEvent) => void>();
  const win = {
    location: { hash, pathname: '/discovery/', search: '' },
    history: { state: null, replaceState: vi.fn() },
    opener,
    addEventListener: (_: string, fn: (e: MessageEvent) => void) => void listeners.add(fn),
    removeEventListener: (_: string, fn: (e: MessageEvent) => void) => void listeners.delete(fn),
  };
  const emit = (source: unknown, data: unknown, origin = 'https://site.example') => {
    for (const fn of [...listeners]) fn({ source, data, origin } as unknown as MessageEvent);
  };
  return { win: win as unknown as Window, emit, listeners };
}

const payload = { type: 'phd-import', v: 1, page: 'https://site.example/g/1', title: 'Set', html: '<html><body><img src="/a.jpg"></body></html>' };
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('handoff listener', () => {
  it('ignores an ordinary start', () => {
    const opener = { postMessage: vi.fn() };
    expect(startHandoffListener(fakeWindow('#/feed', opener).win)).toBe(false);
    expect(opener.postMessage).not.toHaveBeenCalled();
  });

  it('takes one page from its opener, acknowledges it, and queues it for Import', async () => {
    const opener = { postMessage: vi.fn() };
    const { win, emit, listeners } = fakeWindow('#phd-handoff', opener);
    const got: Arrival[] = [];
    const stop = consumeArrivals((a) => got.push(a));
    expect(startHandoffListener(win, 60_000)).toBe(true);
    expect(win.history.replaceState).toHaveBeenCalledWith(null, '', '/discovery/'); // routing never sees the marker
    expect(opener.postMessage).toHaveBeenCalledWith({ type: 'phd-ready' }, '*');
    emit({ postMessage: vi.fn() }, payload); // not the opener
    emit(opener, { ...payload, type: 'nope' }); // not a snapshot
    expect(listeners.size).toBe(1);
    emit(opener, payload);
    expect(opener.postMessage).toHaveBeenLastCalledWith({ type: 'phd-received' }, 'https://site.example');
    expect(listeners.size).toBe(0);
    await settle();
    expect(got).toEqual([{ kind: 'page', page: { page: payload.page, title: 'Set', html: payload.html } }]);
    stop();
  });

  it('says nothing arrived when the site cut the link between tabs', () => {
    const got: Arrival[] = [];
    const stop = consumeArrivals((a) => got.push(a));
    startHandoffListener(fakeWindow('#phd-handoff', null).win);
    expect(got).toEqual([{ kind: 'missed' }]);
    stop();
  });

  it('gives up after a while, and holds arrivals until the app is ready for them', async () => {
    const { win } = fakeWindow('#phd-handoff', { postMessage: vi.fn() });
    startHandoffListener(win, 10);
    await new Promise((r) => setTimeout(r, 30));
    const got: Arrival[] = [];
    consumeArrivals((a) => got.push(a))();
    expect(got).toEqual([{ kind: 'missed' }]);
  });
});
