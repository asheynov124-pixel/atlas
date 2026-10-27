// @vitest-environment jsdom
// A tab that isn't the live one writes nothing; what it queued is written once it is.
import { describe, expect, it } from 'vitest';
import { flushStorage, holdWrites, idbPersistStorage } from '../state/storage';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stored = () => JSON.parse(localStorage.getItem('hold-test') ?? 'null')?.state?.n;

describe('held writes', () => {
  it('wait while held, are written on release, and can be discarded', async () => {
    const st = idbPersistStorage<{ n: number }>();
    holdWrites(true);
    st.setItem('hold-test', { state: { n: 1 }, version: 0 });
    await flushStorage();
    await wait(500);
    expect(stored()).toBeUndefined();
    holdWrites(false);
    await wait(550);
    expect(stored()).toBe(1);
    holdWrites(true);
    st.setItem('hold-test', { state: { n: 2 }, version: 0 });
    holdWrites(true, { discard: true });
    holdWrites(false);
    await wait(550);
    expect(stored()).toBe(1);
  });
});
