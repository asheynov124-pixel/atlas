import { describe, it, expect } from 'vitest';
import { decodeSaveFile, importSave, readSave, unwrapSaveJson, wrapSaveJson, SAVE_WRAPPER_FORMAT, type SaveFile } from '../src/core/save';

const sample = (): SaveFile =>
  ({
    v: 1,
    meta: { slot: 'slot-test', name: 'Wrapper Town', mode: 'sandbox', planetName: 'Terra', population: 1234, day: 42, savedAt: 1_700_000_000_000, cityName: 'Wrapper Town' },
    empire: { name: 'Wrapper Town', money: 5000, planets: {} } as unknown as SaveFile['empire'],
  }) as SaveFile;

async function gzipBlob(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return await new Response(stream).blob();
}

describe('save JSON wrapper (artifact downloads accept .json, not .cosmo)', () => {
  it('round-trips arbitrary .cosmo bytes', async () => {
    const bytes = new Uint8Array(70_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7919 + (i >> 3)) & 255;
    const wrapped = await wrapSaveJson(new Blob([bytes]));
    expect(wrapped.type).toBe('application/json');
    const text = await wrapped.text();
    const o = JSON.parse(text);
    expect(o.format).toBe(SAVE_WRAPPER_FORMAT);
    expect(o.v).toBe(1);
    expect(typeof o.data).toBe('string');
    const back = unwrapSaveJson(text)!;
    expect(back).not.toBeNull();
    expect(back.length).toBe(bytes.length);
    expect(Array.from(back.subarray(0, 64))).toEqual(Array.from(bytes.subarray(0, 64)));
    expect(back.every((b, i) => b === bytes[i])).toBe(true);
  });

  it('decodes a wrapped .cosmo, a bare .cosmo and plain JSON to the same save; rejects junk', async () => {
    const f = sample();
    const cosmo = await gzipBlob(JSON.stringify(f));
    const wrapped = await wrapSaveJson(cosmo);
    expect(await decodeSaveFile(wrapped)).toEqual(f);
    expect(await decodeSaveFile(cosmo)).toEqual(f);
    expect(await decodeSaveFile(new Blob([JSON.stringify(f)]))).toEqual(f);
    expect(unwrapSaveJson('{"format":"something-else","data":"AA=="}')).toBeNull();
    expect(unwrapSaveJson('not json')).toBeNull();
    await expect(decodeSaveFile(new Blob([JSON.stringify({ format: SAVE_WRAPPER_FORMAT, v: 1, data: btoa('{"hello":1}') })]))).rejects.toThrow();
  });

  it('imports a wrapped export into a new slot', async () => {
    const f = sample();
    const wrapped = await wrapSaveJson(await gzipBlob(JSON.stringify(f)));
    const imported = await importSave(wrapped);
    expect(imported.meta.slot.startsWith('import-')).toBe(true);
    expect(imported.meta.name).toBe('Wrapper Town');
    const stored = await readSave(imported.meta.slot);
    expect(stored?.meta.population).toBe(1234);
  });
});
