import { describe, it, expect, vi, afterEach } from 'vitest';

type Mod = typeof import('../src/core/download');

/** Fresh module (the capability lookup is memoised per page load) with a fake artifact runtime installed. */
async function withRuntime(use: ((name: string) => Promise<unknown>) | null): Promise<Mod> {
  vi.resetModules();
  const g = globalThis as { claude?: unknown };
  if (use) g.claude = { use };
  else delete g.claude;
  return await import('../src/core/download');
}

afterEach(() => {
  delete (globalThis as { claude?: unknown }).claude;
});

describe('offerFile in the claude.ai artifact viewer', () => {
  it('saves through the downloads capability', async () => {
    const saved: { filename: string; size: number }[] = [];
    const m = await withRuntime(async (name) => (name === 'downloads' ? { save: async (r: { filename: string; data: Blob }) => (saved.push({ filename: r.filename, size: r.data.size }), { status: 'saved' }) } : null));
    expect(m.inArtifactViewer()).toBe(true);
    m.prepareDownloads();
    const notify = vi.fn();
    expect(await m.offerFile('city.json', new Blob(['{}']), { notify })).toBe('saved');
    expect(saved).toEqual([{ filename: 'city.json', size: 2 }]);
    expect(notify).not.toHaveBeenCalled();
  });

  it('is silent when the player declines, and toasts other rejections', async () => {
    let code = 'declined';
    const m = await withRuntime(async () => ({ save: async () => Promise.reject({ code }) }));
    const notify = vi.fn();
    expect(await m.offerFile('a.png', new Blob(['x']), { notify })).toBe('declined');
    expect(notify).not.toHaveBeenCalled();
    code = 'too_large';
    expect(await m.offerFile('a.png', new Blob(['x']), { notify })).toBe('unavailable');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0].title).toMatch(/too large/i);
  });

  it('gives up on a runtime that never answers (unavailable + toast), without hanging', async () => {
    vi.useFakeTimers();
    try {
      const m = await withRuntime(() => new Promise(() => {}));
      const notify = vi.fn();
      const p = m.offerFile('a.png', new Blob(['x']), { notify });
      await vi.advanceTimersByTimeAsync(1600);
      expect(await p).toBe('unavailable');
      expect(notify).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves null when the capability is not granted', async () => {
    const m = await withRuntime(async () => null);
    expect(await m.prepareDownloads()).toBeNull();
    const notify = vi.fn();
    expect(await m.offerFile('a.png', new Blob(['x']), { notify })).toBe('unavailable');
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('outside the viewer there is no runtime', async () => {
    const m = await withRuntime(null);
    expect(m.inArtifactViewer()).toBe(false);
    expect(await m.prepareDownloads()).toBeNull();
  });
});
