/**
 * OWNER: ui-core.
 * Icons — Cosmopolis' custom inline SVG icon set (24×24 grid, 1.75 px round strokes, currentColor).
 *
 *   <Icon name="power" />                 20 px, inherits colour
 *   <Icon name="power" size={16} />
 *   <IconOrEmoji value={def.icon} />      renders an icon if `value` is a known icon name, else the text (emoji)
 *   hasIcon('power') → boolean            ICON_NAMES → every available name
 *
 * Groups: categories (roads, zones, build, power, water, services, education, leisure, transit, industry,
 * landmarks, orbital, decor, custom, terraform, bulldoze, god, more), tools, stats, actions, media/speeds,
 * navigation, cosmos, disasters. Feature modules may use any of them by name (e.g. registry HudButtonDef.icon).
 */
import type { JSX } from 'preact';

const dot = (x: number, y: number, r = 1.15) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;

/** Gear outline generated from polar samples (n teeth). */
function gear(cx: number, cy: number, rOuter: number, rInner: number, teeth: number): string {
  const pts: string[] = [];
  const steps = teeth * 4;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const phase = i % 4;
    const r = phase === 0 || phase === 1 ? rOuter : rInner;
    // pull the tooth flanks in slightly for a trapezoid profile
    const da = phase === 0 ? 0.06 : phase === 1 ? -0.06 : phase === 2 ? 0.05 : -0.05;
    pts.push(`${(cx + Math.cos(a + da) * r).toFixed(2)} ${(cy + Math.sin(a + da) * r).toFixed(2)}`);
  }
  return `<path d="M${pts.join('L')}Z"/>`;
}

/** Sun rays around a circle. */
function rays(cx: number, cy: number, r0: number, r1: number, n: number, offset = 0): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + offset;
    d += `M${(cx + Math.cos(a) * r0).toFixed(2)} ${(cy + Math.sin(a) * r0).toFixed(2)}L${(cx + Math.cos(a) * r1).toFixed(2)} ${(cy + Math.sin(a) * r1).toFixed(2)}`;
  }
  return `<path d="${d}"/>`;
}

/** Five-point star path. */
function star(cx: number, cy: number, R: number, r: number): string {
  const p: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? R : r;
    p.push(`${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return `M${p.join('L')}Z`;
}

const ICONS: Record<string, string> = {
  // ───────────────────────────── categories
  roads: '<path d="M9.2 3 5.5 21M14.8 3l3.7 18M12 4.5v2.2M12 10.4v2.6M12 16.8V20"/>',
  zones: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><path d="M17 13.5v7M13.5 17h7"/>',
  build: '<path d="M4.5 21h9M8 21V3.5M8 3.5 4 6.2h16l-4-2.7H8M17 6.2v5.3"/><rect x="15" y="11.5" width="4" height="3.6" rx=".9"/><path d="M8 9.5l3.2-3.3M8 14l3.2-3.3"/>',
  power: '<path d="M13.2 2.5 4.8 13.6h6.6l-1 7.9 8.8-11.4h-6.6z"/>',
  water: '<path d="M12 3.2c3.6 4.3 6.2 7.6 6.2 10.9a6.2 6.2 0 0 1-12.4 0C5.8 10.8 8.4 7.5 12 3.2z"/><path d="M9.2 14.6a2.9 2.9 0 0 0 2.6 2.7"/>',
  services: '<path d="M12 3 5 5.9v5.6c0 4.3 2.9 7.9 7 9.5 4.1-1.6 7-5.2 7-9.5V5.9z"/><path d="M12 8.8v6.4M8.8 12h6.4"/>',
  education: '<path d="M2.5 9.2 12 4.7l9.5 4.5-9.5 4.5z"/><path d="M6.5 11.1v4.6c1.8 1.5 3.6 2.2 5.5 2.2s3.7-.7 5.5-2.2v-4.6M21.5 9.2v5.3"/>',
  leisure: '<circle cx="12" cy="10" r="6.3"/><path d="M12 3.7v12.6M5.7 10h12.6M7.5 5.5l9 9M16.5 5.5l-9 9M8.4 21.2 12 12.2l3.6 9M6.5 21.2h11"/>',
  transit: '<rect x="5.5" y="3" width="13" height="13.5" rx="3.5"/><path d="M5.5 10h13M9 6.4h6M8.2 20.8l1.6-4.3M15.8 20.8l-1.6-4.3"/>' + dot(9, 13.3, 1) + dot(15, 13.3, 1),
  industry: '<path d="M3 20.5V10.2l5 3v-3l5 3v-3l5 3V3.5h3v17z"/><path d="M6.5 17h1.5M11 17h1.5M15.5 17H17"/>',
  landmarks: '<path d="M3 9.4 12 4l9 5.4M4.5 9.4h15M6.3 9.4V18M10.1 9.4V18M13.9 9.4V18M17.7 9.4V18M3.6 18h16.8M2.8 21h18.4"/>',
  orbital: '<path d="m9.6 7.2 7.2 7.2M7.4 9.4l7.2 7.2"/><path d="M9.6 7.2 12 4.8l7.2 7.2-2.4 2.4M7.4 9.4 4.8 12l7.2 7.2 2.6-2.6"/><path d="M9 15l-4.2 4.2M17.3 2.8a3.9 3.9 0 0 1 3.9 3.9"/>',
  decor: '<path d="M5.2 19.2C5 10.5 9.6 5.3 20 4.2c-.8 10.3-6 15.1-14.8 15z"/><path d="M5.2 19.2 13 11.4M9.4 15v-3.4M12 12.5h3.2"/>',
  nature: '<path d="M12 21v-6.5"/><path d="M12 14.5c-3.9 0-6.5-2.3-6.5-5.4 0-3.2 2.9-6.1 6.5-6.1s6.5 2.9 6.5 6.1c0 3.1-2.6 5.4-6.5 5.4z"/><path d="M12 14.5 9.5 12M12 12.3l2.2-2"/><path d="M8 21h8"/>',
  custom: '<circle cx="12" cy="5.6" r="2.1"/><path d="M11 7.5 5.5 20.5M13 7.5l5.5 13M7.6 15.6h8.8"/>',
  terraform: '<path d="M2.8 20 9.4 8.3l3.8 6.7 2.6-4.3 5.4 9.3z"/><path d="M7.4 11.9l2 1.4 1.5-1.6"/>',
  bulldoze: '<rect x="3" y="14.2" width="11" height="5.6" rx="2.8"/><path d="M5 14.2v-3.6h4.6l1.8 3.6M9.6 10.6V7.4H6.4M14 16.4h2.6l2-6.4H21v10h-2.4l-2-3.6"/>' + dot(5.8, 17, 0.9) + dot(11.2, 17, 0.9),
  god: '<path d="M7.2 16.4a4.4 4.4 0 1 1 1-8.7 5.6 5.6 0 0 1 10.6 1.8 3.5 3.5 0 0 1-.6 6.9"/><path d="M13.4 12.6l-2.8 4.4h3.4L11.6 21.5"/>',
  more: dot(5.5, 12, 1.5) + dot(12, 12, 1.5) + dot(18.5, 12, 1.5),
  district: '<path d="M12 2.8 20 7.4v9.2L12 21.2l-8-4.6V7.4z" stroke-dasharray="2.2 2.4"/><path d="M10 16.5V8l5 2.3-5 2.3"/>',

  // ───────────────────────────── tools
  select: '<path d="M5 3.5 19.2 10l-6.1 2.2L10.6 18.5z"/><path d="m13.1 12.2 5.3 6.3"/>',
  paint: '<rect x="3.5" y="3" width="13" height="5.2" rx="1.6"/><path d="M16.5 5.6h3V11h-8.1v3.6"/><rect x="9.6" y="14.6" width="3.6" height="6.6" rx="1.2"/>',
  brush: '<path d="M20.5 3.5 11 13"/><path d="M11 13c-2-.3-3.7.7-4.1 2.5-.4 1.9-1.4 3.6-3.4 4.5 3.3 1 7.3.6 8.8-1.6 1-1.5.9-3.6-1.3-5.4z"/>',
  eyedropper: '<path d="M14.5 5.5 18.5 9.5"/><path d="M16.2 3.8a2.4 2.4 0 0 1 3.4 3.4l-2.1 2.1-3.4-3.4z"/><path d="M15.8 8.2 7 17l-3 1 1-3 8.8-8.8"/>',
  rotate: '<path d="M20 11.5a8 8 0 1 1-2.6-5.9"/><path d="M20 3.5v5.2h-5.2"/>',
  raise: '<path d="M3 20.5h18M6 20.5l3.6-5.4h4.8l3.6 5.4"/><path d="M12 12V3.5M8.8 6.7 12 3.5l3.2 3.2"/>',
  lower: '<path d="M3 20.5h18M6 14.5h12"/><path d="M12 3.5V12M8.8 8.8 12 12l3.2-3.2"/>',
  flatten: '<path d="M3 17h18M5 20.5h14"/><path d="M5 12.5c2.3-4 4.7-4 7 0s4.7 4 7 0" stroke-dasharray="2 2.2"/>',
  smooth: '<path d="M3 17c3.5-6.5 6.5-6.5 9 0s5.5 6.5 9 0"/><path d="M3 9.5c3.5-3.2 6.5-3.2 9 0s5.5 3.2 9 0" opacity=".55"/>',
  level: '<path d="M3 12.5h18"/><rect x="5" y="8" width="14" height="9" rx="2.5"/><circle cx="12" cy="12.5" r="1.8"/>',
  stamp: '<path d="M9 3.5h6l-1 6.5h4.5a2 2 0 0 1 2 2V15h-17v-3a2 2 0 0 1 2-2H10z"/><path d="M5.5 20.5h13"/>',
  cursorClick: '<path d="M9 9.5l11 4.2-4.6 1.4-1.4 4.6z"/><path d="M5.2 5.2 3.5 3.5M9 3V1.5M3 9H1.5M5.2 12.8l-1.4 1.4M12.8 5.2l1.4-1.4"/>',
  lasso: '<path d="M7 16.5C4.4 15.3 3 13.5 3 11.5 3 7.4 7 4 12 4s9 3.4 9 7.5S17 19 12 19c-1 0-2-.1-2.9-.4"/><path d="M7 16.5c0 2.2 1.6 4 3.8 4"/><circle cx="8" cy="16.5" r="1.6"/>',

  // ───────────────────────────── stats
  population: '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20.2c.5-3.7 3-5.8 6.2-5.8s5.7 2.1 6.2 5.8"/><path d="M15.4 4.8a3.4 3.4 0 0 1 0 6.4M17.8 14.6c2 .7 3.2 2.6 3.5 5.6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.6-4.2 3.6-6.5 7.5-6.5s6.9 2.3 7.5 6.5"/>',
  money: '<circle cx="12" cy="12" r="9"/><path d="M15.2 8.6a4 4 0 1 0 0 6.8M11.4 6.2v11.6M13.6 6.4v11.2"/>',
  coin: '<ellipse cx="12" cy="7.5" rx="7.5" ry="3.5"/><path d="M4.5 7.5v4.5c0 1.9 3.4 3.5 7.5 3.5s7.5-1.6 7.5-3.5V7.5M4.5 12v4.5c0 1.9 3.4 3.5 7.5 3.5s7.5-1.6 7.5-3.5V12"/>',
  wallet: '<path d="M4 7.5V18a2.5 2.5 0 0 0 2.5 2.5H20V9.5H6.2A2.2 2.2 0 0 1 4 7.3 2.3 2.3 0 0 1 6.3 5H17v4.5"/>' + dot(16.2, 15, 1.2),
  income: '<path d="M3.5 17.5 9 12l3.6 3.6L20.5 7.6"/><path d="M15.2 7.5h5.3v5.3"/>',
  trendUp: '<path d="M3.5 17.5 9 12l3.6 3.6L20.5 7.6"/><path d="M15.2 7.5h5.3v5.3"/>',
  trendDown: '<path d="M3.5 6.5 9 12l3.6-3.6 7.9 8"/><path d="M15.2 16.5h5.3v-5.3"/>',
  trendFlat: '<path d="M3.5 12h15M15 8.5l3.5 3.5-3.5 3.5"/>',
  happiness: '<circle cx="12" cy="12" r="9"/><path d="M8.2 14.2c.9 1.5 2.2 2.3 3.8 2.3s2.9-.8 3.8-2.3"/>' + dot(9, 9.6) + dot(15, 9.6),
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.2 14.2c.9 1.5 2.2 2.3 3.8 2.3s2.9-.8 3.8-2.3"/>' + dot(9, 9.6) + dot(15, 9.6),
  meh: '<circle cx="12" cy="12" r="9"/><path d="M8.5 15h7"/>' + dot(9, 9.6) + dot(15, 9.6),
  frown: '<circle cx="12" cy="12" r="9"/><path d="M8.2 16.4c.9-1.5 2.2-2.3 3.8-2.3s2.9.8 3.8 2.3"/>' + dot(9, 9.6) + dot(15, 9.6),
  jobs: '<rect x="3" y="7.5" width="18" height="12.5" rx="2.5"/><path d="M8.5 7.5V5.6c0-.9.7-1.6 1.6-1.6h3.8c.9 0 1.6.7 1.6 1.6v1.9M3 12.8h18M10.5 12.8v1.8h3v-1.8"/>',
  housing: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.8 9.2v11.3h12.4V9.2"/><path d="M10 20.5v-5.6h4v5.6"/>',
  home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.8 9.2v11.3h12.4V9.2"/><path d="M10 20.5v-5.6h4v5.6"/>',
  research: '<path d="M9.5 3.5h5M10.5 3.5v5.6L5 18.3a1.6 1.6 0 0 0 1.4 2.3h11.2a1.6 1.6 0 0 0 1.4-2.3l-5.5-9.2V3.5"/><path d="M7.4 14.6h9.2"/>',
  pollution: '<path d="M6.5 18.5a4 4 0 0 1-.4-8 5.6 5.6 0 0 1 10.8-.9 4.5 4.5 0 0 1 .6 8.9z"/><path d="M8 21.5h3M13.5 21.5h3" opacity=".7"/><path d="M9.5 13.8h.01M13 12.5h.01M15 15h.01"/>',
  crime: '<path d="M12 3 5 5.9v5.6c0 4.3 2.9 7.9 7 9.5 4.1-1.6 7-5.2 7-9.5V5.9z"/><path d="' + star(12, 12, 4, 1.7) + '"/>',
  police: '<path d="M12 3 5 5.9v5.6c0 4.3 2.9 7.9 7 9.5 4.1-1.6 7-5.2 7-9.5V5.9z"/><path d="' + star(12, 12, 4, 1.7) + '"/>',
  fire: '<path d="M12 21.5c-3.9 0-6.8-2.7-6.8-6.4 0-3.3 2.2-5.5 3.6-7.4.3 1.7 1.1 2.9 2.2 3.4C10.7 7.6 12.3 4.6 15 2.5c-.3 3 1 5 2.4 6.9 1.1 1.5 1.8 3.3 1.8 5.4 0 3.9-3 6.7-7.2 6.7z"/><path d="M12 21.5c-1.7 0-2.8-1.2-2.8-2.8 0-1.6 1.2-2.6 2.2-3.8.2 1 .8 1.5 1.4 1.7.2-1 .7-1.8 1.4-2.4.3 1.1 1 1.9 1 3.6 0 2.2-1.4 3.7-3.2 3.7z"/>',
  health: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M12 7.5v9M7.5 12h9"/>',
  landValue: '<path d="M12 21s-6.5-6.2-6.5-11.1a6.5 6.5 0 1 1 13 0C18.5 14.8 12 21 12 21z"/><path d="M13.8 7.9a2.4 2.4 0 1 0 0 4.2M11 7v6"/>',
  traffic: '<path d="M5 16.5V12l1.8-4.4c.3-.7 1-1.1 1.7-1.1h7c.7 0 1.4.4 1.7 1.1L19 12v4.5"/><path d="M3.5 16.5h17M5 12h14M6.5 16.5V19M17.5 16.5V19"/>' + dot(8, 14.2, 0.9) + dot(16, 14.2, 0.9),
  car: '<path d="M5 16.5V12l1.8-4.4c.3-.7 1-1.1 1.7-1.1h7c.7 0 1.4.4 1.7 1.1L19 12v4.5"/><path d="M3.5 16.5h17M5 12h14M6.5 16.5V19M17.5 16.5V19"/>' + dot(8, 14.2, 0.9) + dot(16, 14.2, 0.9),
  tourism: '<path d="M4 8.5a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v7a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2z"/><path d="M14.5 6.5v11" stroke-dasharray="1.6 1.8"/><path d="M8 10.5h3.5M8 13.5h2.5"/>',
  oxygen: '<circle cx="9" cy="13" r="5.5"/><circle cx="17.2" cy="7" r="3.2"/><circle cx="18" cy="16.5" r="1.8"/>',
  garbage: '<path d="M7 7.5 12 3l5 4.5"/><path d="M8.2 8.8 10 12.3H6.4l-1.6 3 3 5h4M15.4 11.2 17 8l3 5-2 3.5"/><path d="M12.6 20.3h4.8l1.5-3"/>',
  recycle: '<path d="M7 7.5 12 3l5 4.5"/><path d="M8.2 8.8 10 12.3H6.4l-1.6 3 3 5h4M15.4 11.2 17 8l3 5-2 3.5"/><path d="M12.6 20.3h4.8l1.5-3"/>',
  data: '<path d="M2.5 9.5a13.8 13.8 0 0 1 19 0M5.6 12.8a9.3 9.3 0 0 1 12.8 0M8.7 16a4.8 4.8 0 0 1 6.6 0"/>' + dot(12, 19, 1.3),
  wifi: '<path d="M2.5 9.5a13.8 13.8 0 0 1 19 0M5.6 12.8a9.3 9.3 0 0 1 12.8 0M8.7 16a4.8 4.8 0 0 1 6.6 0"/>' + dot(12, 19, 1.3),
  noise: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4.3 4.3 0 0 1 0 6M18.2 6.3a8.2 8.2 0 0 1 0 11.4"/>',
  volume: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4.3 4.3 0 0 1 0 6M18.2 6.3a8.2 8.2 0 0 1 0 11.4"/>',
  mute: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  plug: '<path d="M9 3.5V8M15 3.5V8M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0z"/><path d="M12 17v3.5"/>',
  wind: '<path d="M3 9h11.5a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/>' + rays(12, 12, 6.8, 9.2, 8),
  moon: '<path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z"/>',
  sunrise: '<path d="M4 18.5h16M7 18.5a5 5 0 0 1 10 0"/>' + rays(12, 18.5, 7.4, 9.6, 5, Math.PI).replace('<path', '<path opacity=".9"') + '<path d="M2.5 21.5h19" opacity=".5"/>',
  temperature: '<path d="M14 14.6V5a2 2 0 0 0-4 0v9.6a4 4 0 1 0 4 0z"/><path d="M12 9v7"/>',
  gravity: '<circle cx="12" cy="6" r="2.6"/><path d="M12 8.6V19M8.5 15.5 12 19l3.5-3.5M5 21.5h14"/>',
  tier: '<path d="M3.5 17.5 5 7.5l4.5 4L12 5l2.5 6.5 4.5-4 1.5 10z"/><path d="M3.5 20.5h17"/>',
  crown: '<path d="M3.5 17.5 5 7.5l4.5 4L12 5l2.5 6.5 4.5-4 1.5 10z"/><path d="M3.5 20.5h17"/>',
  building: '<rect x="5" y="3" width="10" height="18" rx="1.5"/><path d="M15 9h3.5a.5.5 0 0 1 .5.5V21M3 21h18M8 7h1M11 7h1M8 10.5h1M11 10.5h1M8 14h1M11 14h1M8.6 21v-3h2.8v3"/>',
  office: '<rect x="5" y="3" width="10" height="18" rx="1.5"/><path d="M15 9h3.5a.5.5 0 0 1 .5.5V21M3 21h18M8 7h1M11 7h1M8 10.5h1M11 10.5h1M8 14h1M11 14h1M8.6 21v-3h2.8v3"/>',
  shop: '<path d="M4 9.5 5.5 4h13L20 9.5M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12v8.5h13V12M10 20.5v-4.5h4v4.5"/>',
  factory: '<path d="M3 20.5V10.2l5 3v-3l5 3v-3l5 3V3.5h3v17z"/><path d="M6.5 17h1.5M11 17h1.5M15.5 17H17"/>',
  park: '<path d="M12 21v-6.5"/><path d="M12 14.5c-3.9 0-6.5-2.3-6.5-5.4 0-3.2 2.9-6.1 6.5-6.1s6.5 2.9 6.5 6.1c0 3.1-2.6 5.4-6.5 5.4z"/><path d="M8 21h8"/>',
  tree: '<path d="M12 21v-4M12 3 6 11h3l-4 6h14l-4-6h3z"/>',
  flower: '<circle cx="12" cy="9" r="2.2"/><path d="M12 6.8c0-2.6 2.8-3.3 3.3-1.3.4 1.6-1.4 3.3-3.3 3.5M14.2 9c2.6 0 3.3 2.8 1.3 3.3-1.6.4-3.3-1.4-3.5-3.3M12 11.2c0 2.6-2.8 3.3-3.3 1.3-.4-1.6 1.4-3.3 3.3-3.5M9.8 9c-2.6 0-3.3-2.8-1.3-3.3 1.6-.4 3.3 1.4 3.5 3.3M12 11.5V21M12 17.5c-1.5-2.2-3.6-2.8-5.5-2.5.4 2.4 2.6 3.5 5.5 2.5zM12 19c1.3-2 3.2-2.5 5-2.2-.4 2.1-2.4 3.1-5 2.2z"/>',
  hospital: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M12 7.5v9M7.5 12h9"/>',
  school: '<path d="M2.5 9.2 12 4.7l9.5 4.5-9.5 4.5z"/><path d="M6.5 11.1v4.6c1.8 1.5 3.6 2.2 5.5 2.2s3.7-.7 5.5-2.2v-4.6M21.5 9.2v5.3"/>',
  book: '<path d="M12 6.5C10.2 5 7.8 4.5 4 4.5v14c3.8 0 6.2.5 8 2 1.8-1.5 4.2-2 8-2v-14c-3.8 0-6.2.5-8 2z"/><path d="M12 6.5v14"/>',
  spiritual: '<path d="M12 3c1.2 2.4 3.2 3.8 3.2 6.4A3.2 3.2 0 0 1 12 12.6a3.2 3.2 0 0 1-3.2-3.2C8.8 6.8 10.8 5.4 12 3z"/><path d="M5 21v-4.5a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3V21M3.5 21h17"/>',
  deathcare: '<path d="M7 21V9.5a5 5 0 0 1 10 0V21"/><path d="M12 9v6M9.5 11.5h5M4.5 21h15"/>',

  // ───────────────────────────── actions
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  check: '<path d="M4.5 12.5l5 5L19.5 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/>' + dot(12, 7.8, 1.2),
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.4 9.4a2.7 2.7 0 0 1 5.2 1c0 1.9-2.6 2.3-2.6 4"/>' + dot(12, 17.3, 1.2),
  alert: '<path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 9.5v4.8"/>' + dot(12, 17, 1.15),
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  sliders: '<path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1"/><circle cx="15" cy="6.5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  gear: gear(12, 12, 9.2, 7.2, 8) + '<circle cx="12" cy="12" r="3"/>',
  settings: gear(12, 12, 9.2, 7.2, 8) + '<circle cx="12" cy="12" r="3"/>',
  save: '<path d="M5 3.5h11.2L20 7.3V18a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18V4.5a1 1 0 0 1 1-1z"/><path d="M8 3.5v4.5h7V3.5M7.5 20.5v-5.8h9v5.8"/>',
  folder: '<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  load: '<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M12 10.5v5.5M9.5 13.5 12 16l2.5-2.5"/>',
  share: '<path d="M12 3.5v11.5M8 7.5l4-4 4 4M5.5 11.5v7a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-7"/>',
  download: '<path d="M12 3.5V15M7.5 10.5 12 15l4.5-4.5M4.5 17.5v1a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1"/>',
  upload: '<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8M4.5 17.5v1a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
  camera: '<path d="M3.5 8.5a2 2 0 0 1 2-2h2.3l1.7-2.5h5l1.7 2.5h2.3a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.6"/>',
  photo: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 15.5-4.8-4.8L6 19.5"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 12.6c.1 1 .9 1.9 2 1.9h6c1.1 0 1.9-.9 2-1.9L18 7M10 11v6M14 11v6"/>',
  edit: '<path d="M4 20h4.2L19.4 8.8a2.4 2.4 0 0 0 0-3.4l-.8-.8a2.4 2.4 0 0 0-3.4 0L4 15.8z"/><path d="m13.5 6.5 4 4"/>',
  pencil: '<path d="M4 20h4.2L19.4 8.8a2.4 2.4 0 0 0 0-3.4l-.8-.8a2.4 2.4 0 0 0-3.4 0L4 15.8z"/><path d="m13.5 6.5 4 4"/>',
  locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.4"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/>' + dot(12, 12, 1.5),
  follow: '<path d="M12 3 19.5 20.5 12 16.6 4.5 20.5z"/>',
  navigate: '<path d="M12 3 19.5 20.5 12 16.6 4.5 20.5z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3.2"/>',
  eyeOff: '<path d="M10 5.8c.6-.2 1.3-.3 2-.3 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.5 3.4M6.4 7.4A16.4 16.4 0 0 0 2.5 12S6 18.5 12 18.5c1.8 0 3.4-.6 4.7-1.4M9.8 9.8a3.2 3.2 0 0 0 4.4 4.4M3.5 3.5l17 17"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10.5" rx="2.6"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>' + dot(12, 15.6, 1.3),
  unlock: '<rect x="5" y="10.5" width="14" height="10.5" rx="2.6"/><path d="M8 10.5V7.8a4 4 0 0 1 7.7-1.6"/>' + dot(12, 15.6, 1.3),
  star: '<path d="' + star(12, 12.4, 9, 3.9) + '"/>',
  starFill: '<path d="' + star(12, 12.4, 9, 3.9) + '" fill="currentColor"/>',
  heart: '<path d="M12 20s-7.5-4.6-8.9-9.4C2.2 7.3 4.3 4.5 7.5 4.5c2 0 3.5 1.1 4.5 2.7 1-1.6 2.5-2.7 4.5-2.7 3.2 0 5.3 2.8 4.4 6.1C19.5 15.4 12 20 12 20z"/>',
  sparkles: '<path d="M10 3.5c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6z"/><path d="M17.5 14c.3 1.8 1.2 2.7 3 3-1.8.3-2.7 1.2-3 3-.3-1.8-1.2-2.7-3-3 1.8-.3 2.7-1.2 3-3z"/>',
  magic: '<path d="m4 20 11-11M13 7l1.5-1.5a1.4 1.4 0 0 1 2 0l2 2a1.4 1.4 0 0 1 0 2L17 11"/><path d="M6 4.5v3M4.5 6h3M18.5 14.5v3M17 16h3M11 2.5v2M10 3.5h2"/>',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/>' + dot(8.2, 8.2, 1.35) + dot(15.8, 8.2, 1.35) + dot(12, 12, 1.35) + dot(8.2, 15.8, 1.35) + dot(15.8, 15.8, 1.35),
  shuffle: '<path d="M3.5 7h3.3c1.6 0 3 .8 3.9 2.1l2.6 4c.9 1.3 2.3 2.1 3.9 2.1h3.3M3.5 15.2h3.3c.9 0 1.8-.3 2.5-.8M14.3 7.9c.7-.6 1.6-.9 2.5-.9h3.7M18 4.5 20.5 7 18 9.5M18 12.7l2.5 2.5-2.5 2.5"/>',
  refresh: '<path d="M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5M4 4v4.5h4.5M4 12.5a8 8 0 0 0 13.7 5.2L20 15.5M20 20v-4.5h-4.5"/>',
  undo: '<path d="M8.5 14.5 3.8 9.8l4.7-4.7"/><path d="M3.8 9.8h10.7a5.6 5.6 0 0 1 0 11.2H11"/>',
  redo: '<path d="m15.5 14.5 4.7-4.7-4.7-4.7"/><path d="M20.2 9.8H9.5a5.6 5.6 0 0 0 0 11.2H13"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m20.5 20.5-4.9-4.9"/>',
  filter: '<path d="M3.5 5h17l-6.5 7.8v5.7l-4 2v-7.7z"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/>',
  list: '<path d="M9 6h11.5M9 12h11.5M9 18h11.5"/>' + dot(4.5, 6, 1.25) + dot(4.5, 12, 1.25) + dot(4.5, 18, 1.25),
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  expand: '<path d="M14.5 3.5h6v6M9.5 20.5h-6v-6M20.5 3.5l-7 7M3.5 20.5l7-7"/>',
  collapse: '<path d="M14 4v6h6M10 20v-6H4M14 10l6.5-6.5M10 14l-6.5 6.5"/>',
  layers: '<path d="M12 3.5 21 8.3l-9 4.8-9-4.8z"/><path d="m3 12.4 9 4.8 9-4.8M3 16.4l9 4.8 9-4.8"/>',
  lens: '<path d="M12 3.5 21 8.3l-9 4.8-9-4.8z"/><path d="m3 12.4 9 4.8 9-4.8M3 16.4l9 4.8 9-4.8"/>',
  chart: '<path d="M3.5 20.5h17"/><rect x="5" y="11" width="3.4" height="6.5" rx="1"/><rect x="10.3" y="6.5" width="3.4" height="11" rx="1"/><rect x="15.6" y="3.5" width="3.4" height="14" rx="1"/>',
  stats: '<path d="M3.5 3.5v17h17"/><path d="m7 15 4-4.5 3 3L20 7"/>',
  pie: '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12z"/><path d="M15 3.8A8.5 8.5 0 0 1 20.2 9H15z"/>',
  budget: '<path d="M4 7.5V18a2.5 2.5 0 0 0 2.5 2.5H20V9.5H6.2A2.2 2.2 0 0 1 4 7.3 2.3 2.3 0 0 1 6.3 5H17v4.5"/>' + dot(16.2, 15, 1.2),
  policy: '<path d="M7 3.5h10.5a2 2 0 0 1 2 2v.5h-4v13.5a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2v-1.5h9"/><path d="M15.5 6V4.5M7 3.5a2 2 0 0 0-2 2V18M8.5 8.5h4M8.5 12h4"/>',
  scroll: '<path d="M7 3.5h10.5a2 2 0 0 1 2 2v.5h-4v13.5a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2v-1.5h9"/><path d="M15.5 6V4.5M7 3.5a2 2 0 0 0-2 2V18M8.5 8.5h4M8.5 12h4"/>',
  flag: '<path d="M5 21V4M5 4.5c2.5-1.5 5-1.5 7.5 0s5 1.5 7.5 0v9c-2.5 1.5-5 1.5-7.5 0s-5-1.5-7.5 0"/>',
  goal: '<path d="M5 21V4M5 4.5c2.5-1.5 5-1.5 7.5 0s5 1.5 7.5 0v9c-2.5 1.5-5 1.5-7.5 0s-5-1.5-7.5 0"/>',
  trophy: '<path d="M7.5 4h9v5.5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H4.5v1.2a3 3 0 0 0 3 3M16.5 6h3v1.2a3 3 0 0 1-3 3M12 14v3.5M8 20.5h8M9.5 17.5h5v3h-5z"/>',
  news: '<path d="M4 5.5h13v13a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z"/><path d="M17 9.5h3v9a2 2 0 0 1-4 0M7.5 9h6M7.5 12.5h6M7.5 16h4"/>',
  chat: '<path d="M4 6.5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-6l-4.5 4v-4H7a3 3 0 0 1-3-3z"/>' + dot(8.5, 10, 1.05) + dot(12, 10, 1.05) + dot(15.5, 10, 1.05),
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 9.5h.01M9.3 9.5h.01M12.6 9.5h.01M15.9 9.5h.01M18 9.5h.01M7.5 14.5h9"/>',
  power2: '<path d="M12 3v8.5"/><path d="M7.2 6.2a7.5 7.5 0 1 0 9.6 0"/>',
  exit: '<path d="M14.5 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3M10 16.5 5.5 12 10 7.5M5.5 12h10"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3.3-3.3a4 4 0 0 0-5.7-5.7l-1.1 1.1M14 10a4 4 0 0 0-5.7 0L5 13.3A4 4 0 0 0 10.7 19l1.1-1.1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.3 2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>' + dot(8, 14.2, 1.05) + dot(12, 14.2, 1.05) + dot(16, 14.2, 1.05),
  palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.3 0 2-.9 2-1.9 0-1.6-1.6-2 .3-3.1.9-.5 1.8-.5 3-.5 1.9 0 3.2-1.3 3.2-3.4C20.5 7 16.7 3.5 12 3.5z"/>' + dot(7.6, 11, 1.25) + dot(9.6, 7.3, 1.25) + dot(14, 6.8, 1.25) + dot(17, 10, 1.25),
  tag: '<path d="M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2a1.4 1.4 0 0 1 0 2l-6.8 6.8a1.4 1.4 0 0 1-2 0z"/>' + dot(8, 8, 1.4),

  // ───────────────────────────── media / speeds
  play: '<path d="M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11.6-7.2a.8.8 0 0 0 0-1.4L8.7 4.1a.8.8 0 0 0-1.2.7z"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1.3"/><rect x="14" y="4.5" width="4" height="15" rx="1.3"/>',
  speed1: '<path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.3-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z"/>',
  speed2: '<path d="M3 6v12a.7.7 0 0 0 1.1.6L12 13v5a.7.7 0 0 0 1.1.6l8.6-6a.7.7 0 0 0 0-1.2l-8.6-6A.7.7 0 0 0 12 6v5L4.1 5.4A.7.7 0 0 0 3 6z"/>',
  speed3: '<path d="M1.8 7v10l6.4-5zM8.8 7v10l6.4-5zM15.8 7v10l6.4-5z"/>',
  speed4: '<path d="M1.8 7v10l6.4-5zM8.8 7v10l6.4-5z"/><path d="M18.6 3.5 15.4 12.3h3.4L17 20.5l5.2-9.3h-3.5z"/>',
  fastForward: '<path d="M3 6v12a.7.7 0 0 0 1.1.6L12 13v5a.7.7 0 0 0 1.1.6l8.6-6a.7.7 0 0 0 0-1.2l-8.6-6A.7.7 0 0 0 12 6v5L4.1 5.4A.7.7 0 0 0 3 6z"/>',
  stop: '<rect x="5.5" y="5.5" width="13" height="13" rx="2.5"/>',
  record: '<circle cx="12" cy="12" r="7"/>',

  // ───────────────────────────── navigation
  chevronLeft: '<path d="M15 5.5 8.5 12l6.5 6.5"/>',
  chevronRight: '<path d="m9 5.5 6.5 6.5L9 18.5"/>',
  chevronUp: '<path d="M5.5 15 12 8.5l6.5 6.5"/>',
  chevronDown: '<path d="M5.5 9 12 15.5 18.5 9"/>',
  arrowLeft: '<path d="M19.5 12h-15M10.5 5.5 4 12l6.5 6.5"/>',
  arrowRight: '<path d="M4.5 12h15M13.5 5.5 20 12l-6.5 6.5"/>',
  arrowUp: '<path d="M12 19.5v-15M5.5 10.5 12 4l6.5 6.5"/>',
  arrowDown: '<path d="M12 4.5v15M5.5 13.5 12 20l6.5-6.5"/>',
  external: '<path d="M13.5 4.5h6v6M19.5 4.5 11 13M18.5 14v4a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2h4"/>',

  // ───────────────────────────── cosmos
  map: '<path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  planet: '<circle cx="12" cy="12" r="6.2"/><path d="M6.4 9.5C3.3 11 1.7 12.6 2.3 13.9c.9 1.9 6.1 1.3 11.6-1.3s9.3-6.2 8.4-8.1c-.5-1.1-2.5-1.3-5.3-.7"/>',
  galaxy: '<path d="M12 12c0-2 1.7-3.4 3.6-2.9 2.6.7 3.2 4 1.7 6.3-2.1 3.1-6.8 3.4-9.6 1C4.4 13.9 4.8 8.6 8 6c3.7-3 9.7-2.6 12.5 1.2"/><path d="M12 12c0 2-1.7 3.4-3.6 2.9-2.6-.7-3.2-4-1.7-6.3 2.1-3.1 6.8-3.4 9.6-1 3.3 2.5 2.9 7.8-.3 10.4-3.7 3-9.7 2.6-12.5-1.2"/>',
  universe: '<circle cx="12" cy="12" r="2.2"/><ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(-30 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(30 12 12)"/>' + dot(20, 5, 0.9) + dot(4.5, 19, 0.9),
  rocket: '<path d="M12.8 15.6 8.4 11.2C9.9 6.6 13.4 3.6 20.5 3.5c-.1 7.1-3.1 10.6-7.7 12.1z"/><path d="M8.4 11.2 4.8 10.5l2.8-3.3 3.6.4M12.8 15.6l.7 3.6 3.3-2.8-.4-3.6M6.8 14.5c-1.9.5-2.8 2.6-3 5.7 3.1-.2 5.2-1.1 5.7-3"/><circle cx="15.5" cy="8.5" r="1.6"/>',
  satellite: '<path d="m9.6 7.2 7.2 7.2M7.4 9.4l7.2 7.2"/><path d="M9.6 7.2 12 4.8l7.2 7.2-2.4 2.4M7.4 9.4 4.8 12l7.2 7.2 2.6-2.6"/><path d="M9 15l-4.2 4.2M17.3 2.8a3.9 3.9 0 0 1 3.9 3.9"/>',
  station: '<circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="12" r="8.6"/><path d="M12 3.4v6M12 14.6v6M3.4 12h6M14.6 12h6"/>',
  starSystem: '<circle cx="12" cy="12" r="2.8"/><circle cx="12" cy="12" r="6.2" stroke-dasharray="1.6 2.2"/><circle cx="12" cy="12" r="9.3" opacity=".6"/>' + dot(18.2, 12, 1.4) + dot(5.4, 6.8, 1.1),
  warp: '<path d="M3 12h4M17 12h4M5 7.5h5M14 16.5h5M8 3.5h4M12 20.5h4"/><circle cx="12" cy="12" r="2.2"/>',
  telescope: '<path d="m4 13.5 13-7.5 2 3.5-13 7.5z"/><path d="m14 7.8 1-1.7 3.5 2-1 1.7M10.5 15.5l2 5M8.5 15.5l-2 5M10 13.8v1.8"/>',
  alien: '<path d="M12 3.5c-4.4 0-7.5 3-7.5 7.1 0 4.6 4.2 9.9 7.5 9.9s7.5-5.3 7.5-9.9c0-4.1-3.1-7.1-7.5-7.1z"/><path d="M7.6 11.2c1.4 0 2.8 1 3 2.5-1.6.3-3-.6-3-2.5zM16.4 11.2c-1.4 0-2.8 1-3 2.5 1.6.3 3-.6 3-2.5z"/>',
  blackhole: '<circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/><ellipse cx="12" cy="12" rx="9.5" ry="3.4"/><path d="M5.2 8.6C6.7 5.8 9.2 4.4 12 4.4s5.3 1.4 6.8 4.2" opacity=".6"/>',
  comet: '<circle cx="16.5" cy="7.5" r="3.5"/><path d="M13.7 9.8 3.5 20.5M14.6 11.4 7.5 18.6M12 8.9 5.5 15.5"/>',

  // ───────────────────────────── disasters & god
  meteor: '<circle cx="15.5" cy="15.5" r="5"/><path d="M11.8 12 3.5 3.7M12.5 9.6 7 4.1M9.6 12.5 4.1 7"/>',
  tornado: '<path d="M3.5 4.5h17M5 8.5h14M7.5 12.5h10M10 16.5h6M12.5 20.5h2"/>',
  tsunami: '<path d="M2.5 17.5c2.2 0 2.9-1.6 4.8-1.6S10 17.5 12 17.5s2.7-1.6 4.7-1.6 2.6 1.6 4.8 1.6M2.5 21c2.2 0 2.9-1.6 4.8-1.6S10 21 12 21s2.7-1.6 4.7-1.6S19.3 21 21.5 21"/><path d="M3 13.5C3.5 7.5 8 4 13.5 4c3.9 0 6.9 2.3 7.6 5.6-2.6-1.8-6.4-1.2-7.4 1.7-.8 2.4 1 4 3.3 3.2"/>',
  quake: '<path d="M2.5 12h4l2-5 3 10 3-12 2.5 7h4.5"/>',
  volcano: '<path d="M2.5 20.5 8.5 10h7l6 10.5z"/><path d="M8.5 10c.5 1.5 1.6 2.3 3.5 2.3s3-.8 3.5-2.3M10 6.5 9 3.5M12 6V2.5M14 6.5l1-3"/>',
  lightning: '<path d="M13.2 2.5 4.8 13.6h6.6l-1 7.9 8.8-11.4h-6.6z"/>',
  snowflake: '<path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6M9.5 4l2.5 2.5L14.5 4M9.5 20l2.5-2.5 2.5 2.5M3.5 10.6l3.4-.9-.9-3.4M20.5 13.4l-3.4.9.9 3.4M6 17.7l.9-3.4-3.4-.9M18 6.3l-.9 3.4 3.4.9"/>',
  skull: '<path d="M12 3c-4.7 0-8 3.2-8 7.6 0 2.7 1.3 4.6 3.5 5.8v2.6a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5v-2.6c2.2-1.2 3.5-3.1 3.5-5.8C20 6.2 16.7 3 12 3z"/><circle cx="9" cy="11" r="1.8"/><circle cx="15" cy="11" r="1.8"/><path d="M10.5 21v-2M13.5 21v-2"/>',
  biohazard: '<circle cx="12" cy="12" r="2"/><path d="M12 3.5a4.5 4.5 0 0 0-2.2 8.4M12 3.5a4.5 4.5 0 0 1 2.2 8.4M5 17a4.5 4.5 0 0 0 8.4-1.4M5 17a4.5 4.5 0 0 1 3.8-7.6M19 17a4.5 4.5 0 0 1-8.4-1.4M19 17a4.5 4.5 0 0 0-3.8-7.6"/>',
  radiation: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.6"/><path d="M12 9.5V4a8 8 0 0 0-6.9 4l4.7 2.7M14.2 10.7 18.9 8A8 8 0 0 0 12 4M9.8 13.3l-4.7 2.7A8 8 0 0 0 12 20v-5.5M14.2 13.3l4.7 2.7A8 8 0 0 1 12 20"/>',
  monster: '<path d="M5 20.5v-8a7 7 0 0 1 14 0v8l-2.3-2-2.3 2-2.4-2-2.4 2-2.3-2z"/><path d="M5.5 8 3 4.5l4 1.6M18.5 8 21 4.5l-4 1.6"/>' + dot(9.5, 12, 1.3) + dot(14.5, 12, 1.3),
  rewind: '<path d="M21 6v12a.7.7 0 0 1-1.1.6L12 13v5a.7.7 0 0 1-1.1.6l-8.6-6a.7.7 0 0 1 0-1.2l8.6-6A.7.7 0 0 1 12 6v5l7.9-5.6A.7.7 0 0 1 21 6z"/>',
  hourglass: '<path d="M6 3.5h12M6 20.5h12M7.5 3.5c0 4 1.6 6 4.5 8.5-2.9 2.5-4.5 4.5-4.5 8.5M16.5 3.5c0 4-1.6 6-4.5 8.5 2.9 2.5 4.5 4.5 4.5 8.5"/>',
  explosion: '<path d="m12 2.8 1.9 5.3 5-2.6-2.3 5.1 5.3 1.5-5.2 2.2 2.7 4.9-5.3-1.9-.9 5.6-2.3-5.1-4.2 3.7.5-5.6-5.5-.3 4.5-3.2L4.6 5.2l5.2 2.4z"/>',
  wave: '<path d="M2.5 9c2.2 0 2.9-1.8 4.8-1.8S10 9 12 9s2.7-1.8 4.7-1.8S19.3 9 21.5 9M2.5 14c2.2 0 2.9-1.8 4.8-1.8S10 14 12 14s2.7-1.8 4.7-1.8 2.6 1.8 4.8 1.8M2.5 19c2.2 0 2.9-1.8 4.8-1.8S10 19 12 19s2.7-1.8 4.7-1.8 2.6 1.8 4.8 1.8"/>',
  rain: '<path d="M6.5 15a4 4 0 0 1-.4-8 5.6 5.6 0 0 1 10.8-.9 4.5 4.5 0 0 1 .6 8.9"/><path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5"/>',
  cloud: '<path d="M6.5 18.5a4 4 0 0 1-.4-8 5.6 5.6 0 0 1 10.8-.9 4.5 4.5 0 0 1 .6 8.9z"/>',
};

/** All icon names. */
export const ICON_NAMES: string[] = Object.keys(ICONS);

export function hasIcon(name: string | undefined | null): boolean {
  return !!name && Object.prototype.hasOwnProperty.call(ICONS, name);
}

export interface IconProps {
  name: string;
  /** px (default 20) */
  size?: number;
  class?: string;
  /** override stroke width */
  stroke?: number;
  style?: JSX.CSSProperties | string;
  title?: string;
}

/** Inline SVG icon. Unknown names render an empty square-ish placeholder outline (never throws). */
export function Icon({ name, size = 20, class: cls, stroke, style, title }: IconProps) {
  const body = ICONS[name] ?? '<rect x="5" y="5" width="14" height="14" rx="4" opacity=".4"/>';
  return (
    <svg
      class={'cz-icon' + (cls ? ' ' + cls : '')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={stroke ?? 1.75}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      aria-label={title}
      style={style}
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

/** Render an icon when `value` names one, otherwise treat it as text (emoji). */
export function IconOrEmoji({ value, size = 20, class: cls }: { value?: string | null; size?: number; class?: string }) {
  if (!value) return null;
  if (hasIcon(value)) return <Icon name={value} size={size} class={cls} />;
  return (
    <span class={'cz-emoji' + (cls ? ' ' + cls : '')} style={{ fontSize: Math.round(size * 0.9) + 'px', lineHeight: 1 }} aria-hidden="true">
      {value}
    </span>
  );
}
