import { COLOR_WORDS, PAINTS } from '../data/palette';

export function normalizeHex(s: string): string | null {
  const m = s.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h.toLowerCase()}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? '#888888';
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Approximate light reflectance value from a hex. */
export function lrv(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) * 100);
}

export function hexToHsl(hex: string): [number, number, number] {
  const [r0, g0, b0] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r0, g0, b0), min = Math.min(r0, g0, b0);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r0: h = (g0 - b0) / d + (g0 < b0 ? 6 : 0); break;
      case g0: h = (b0 - r0) / d + 2; break;
      default: h = (r0 - g0) / d + 4;
    }
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100, lig = l / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = lig - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Describe the undertone of any hex in Alder's vocabulary. */
export function undertone(hex: string): string {
  const [h, s] = hexToHsl(hex);
  if (s < 4) return 'neutral';
  if (h < 15 || h >= 345) return 'red';
  if (h < 30) return 'red-orange';
  if (h < 45) return 'orange';
  if (h < 60) return 'yellow';
  if (h < 90) return 'yellow-green';
  if (h < 160) return 'green';
  if (h < 200) return 'blue-green';
  if (h < 250) return 'blue';
  if (h < 290) return 'violet';
  if (h < 345) return 'pink';
  return 'neutral';
}

export function isWarm(hex: string): boolean {
  const [h, s] = hexToHsl(hex);
  if (s < 4) return true;
  return h < 75 || h >= 320;
}

/** Shift a color toward warm or cool light. warmth 0..100 */
export function litHex(hex: string, warmth: number, intensity = 1): string {
  const [r, g, b] = hexToRgb(hex);
  const t = (warmth - 50) / 50; // -1 cool .. +1 warm
  const k = 0.12 * intensity;
  return rgbToHex(r * (1 + k * t), g * (1 + k * t * 0.35), b * (1 - k * t));
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export function darken(hex: string, amt: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, Math.max(0, l - amt));
}

export function textOn(hex: string): string {
  return lrv(hex) > 45 ? '#12100e' : '#f6f1ea';
}

function wordMatch(text: string, w: string) {
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${esc}(?:\\s|$)`).test(text);
}

export function namedColor(text: string): string | null {
  const t = text.toLowerCase().trim();
  if (COLOR_WORDS[t]) return COLOR_WORDS[t];
  const p = PAINTS.find((x) => x.name.toLowerCase() === t || x.id === t);
  if (p) return p.hex;
  const key = Object.keys(COLOR_WORDS).filter((k) => wordMatch(t, k)).sort((a, b) => b.length - a.length || t.indexOf(a) - t.indexOf(b))[0];
  return key ? COLOR_WORDS[key] : null;
}

export function hashColor(text: string): string {
  let h = 0;
  const s = text.toLowerCase();
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) >>> 0;
  return hslToHex(h % 360, 24 + (h % 10), 54 + (h % 12));
}

/** Nearest Alder paint to a hex. */
export function nearestPaint(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  let best = PAINTS[0], bd = Infinity;
  for (const p of PAINTS) {
    const [r2, g2, b2] = hexToRgb(p.hex);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

/** Build a five-step palette from one wall color: trim, ceiling, dark, accent, cloth. */
export function harmonize(hex: string) {
  const [h, s, l] = hexToHsl(hex);
  return {
    trim: hslToHex(h, Math.max(0, s - 10), Math.min(96, l + 8)),
    ceiling: hslToHex(h, Math.max(0, s - 12), Math.min(97, l + 10)),
    dark: hslToHex(h, Math.min(40, s + 4), 20),
    accent: hslToHex((h + 20) % 360, Math.min(60, s + 25), 45),
    cloth: hslToHex(h, Math.max(0, s - 6), Math.min(92, l + 2)),
  };
}
