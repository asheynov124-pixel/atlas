/**
 * OWNER: studio.
 * Design share codes — a compact, copy-pasteable string: `CSM1.` + base64url(UTF-8 JSON of a positional array).
 *   [name, description, icon, footprint, fnIndex, parts[[typeIndex, w, d, h, taper, twist, seg, n, s, x, y, z, ry,
 *    tilt, colour, accent, matIndex, stack]]]
 * Type / material / function tables are append-only so old codes keep decoding. Decoding validates and clamps
 * everything through normalizeDesign — a hand-edited code can never break the game.
 */
import { FN_IDS, normalizeDesign, type DesignSpec, type MatName, type PartType } from './model';

const PREFIX = 'CSM1.';

// append-only tables
const TYPES: PartType[] = [
  'plinth', 'podium', 'block', 'rounded', 'cylinder', 'tapered', 'twisted', 'setback', 'torus', 'sphere', 'pods', 'colonnade', 'vault', 'arch',
  'skybridge', 'obelisk', 'wedge', 'dome', 'onion', 'spire', 'pyramid', 'gable', 'pagoda', 'cone', 'crown', 'shell', 'antenna', 'halo', 'neon',
  'balcony', 'fins', 'billboard', 'hologram', 'flag', 'solar', 'turbine', 'dish', 'helipad', 'lattice', 'garden', 'tree', 'pool', 'crystal',
];
const MATS: MatName[] = ['plain', 'windows', 'smallWindows', 'glass', 'metal', 'glow', 'light', 'solar', 'holo', 'screen', 'foliage', 'water', 'lava'];

const r3 = (v: number) => Math.round(v * 1000) / 1000;

function toB64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(code: string): string {
  let b = code.replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  const s = atob(b);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeDesign(d: DesignSpec): string {
  const parts = d.parts.map((p) => [
    TYPES.indexOf(p.t),
    r3(p.w),
    r3(p.d),
    r3(p.h),
    r3(p.taper),
    r3(p.twist),
    p.seg,
    p.n,
    r3(p.s),
    r3(p.x),
    r3(p.y),
    r3(p.z),
    r3(p.ry),
    r3(p.tilt),
    p.c,
    p.c2,
    Math.max(0, MATS.indexOf(p.m)),
    p.stack ? 1 : 0,
  ]);
  const arr = [d.name, d.description, d.icon, d.footprint, FN_IDS.indexOf(d.fn), parts];
  return PREFIX + toB64Url(JSON.stringify(arr));
}

export type DecodeResult = { ok: true; design: DesignSpec } | { ok: false; error: string };

/** Decode a share code (tolerates whitespace, line breaks and surrounding text). */
export function decodeDesign(input: string): DecodeResult {
  const text = (input ?? '').replace(/\s+/g, '');
  const at = text.indexOf(PREFIX);
  if (at < 0) return { ok: false, error: 'That doesn’t look like a design code (they start with “CSM1.”).' };
  const body = text.slice(at + PREFIX.length).match(/^[A-Za-z0-9_-]+/)?.[0] ?? '';
  if (!body) return { ok: false, error: 'The code is empty.' };
  let arr: unknown;
  try {
    arr = JSON.parse(fromB64Url(body));
  } catch {
    return { ok: false, error: 'The code is damaged — was part of it cut off?' };
  }
  if (!Array.isArray(arr) || arr.length < 6 || !Array.isArray(arr[5])) return { ok: false, error: 'The code is from an unknown version.' };
  const [name, description, icon, footprint, fnIndex, rawParts] = arr as [unknown, unknown, unknown, unknown, unknown, unknown[]];
  const parts = rawParts
    .filter((q): q is number[] => Array.isArray(q) && q.length >= 18)
    .map((q) => ({
      t: TYPES[q[0]],
      w: q[1],
      d: q[2],
      h: q[3],
      taper: q[4],
      twist: q[5],
      seg: q[6],
      n: q[7],
      s: q[8],
      x: q[9],
      y: q[10],
      z: q[11],
      ry: q[12],
      tilt: q[13],
      c: q[14],
      c2: q[15],
      m: MATS[q[16]] ?? 'plain',
      stack: q[17] !== 0,
    }));
  const design = normalizeDesign({ name, description, icon, footprint, fn: FN_IDS[fnIndex as number] ?? 'landmark', parts });
  if (!design) return { ok: false, error: 'The code contains no parts.' };
  return { ok: true, design };
}
