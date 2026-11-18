// Artwork: each item's cover is drawn as inline SVG from a motif and a palette.
// No <defs>, ids or gradients: the same SVG can appear twice on the page (card and
// detail view) without id clashes, and it scales cleanly from thumbnail to hero.

const W = 400;
const H = 500;

/** Small seeded random generator, so every cover is the same on every visit. */
function seeded(text) {
  let seed = 2166136261;
  for (const char of text) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return function next() {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (value) => Math.round(value * 10) / 10;

const MOTIFS = {
  // Night Ferry: a half-sunk moon, its reflection, and a lit ferry on the horizon.
  horizon([sky, sea, moon, light], random) {
    let out = '';
    for (let i = 0; i < 14; i += 1) {
      out += `<circle cx="${n(random() * W)}" cy="${n(random() * 220)}" r="${n(0.8 + random() * 1.2)}" fill="${light}" opacity="${n(0.3 + random() * 0.5)}"/>`;
    }
    out += `<circle cx="262" cy="262" r="84" fill="${moon}"/>`;
    out += `<rect y="270" width="${W}" height="${H - 270}" fill="${sea}"/>`;
    for (let i = 0; i < 10; i += 1) {
      const width = 168 - i * 14;
      out += `<rect x="${n(262 - width / 2)}" y="${290 + i * 19}" width="${width}" height="3" fill="${moon}" opacity="${n(0.8 - i * 0.07)}"/>`;
    }
    out += `<path d="M62 262h120l-12 11H74z" fill="#071318"/>`;
    out += `<rect x="88" y="247" width="62" height="15" fill="#071318"/>`;
    out += `<path d="M118 247v-22" stroke="#071318" stroke-width="3"/>`;
    for (let i = 0; i < 6; i += 1) {
      out += `<rect x="${93 + i * 9.5}" y="251" width="5" height="5" fill="${light}"/>`;
    }
    return out;
  },

  // The Long Exposure: star trails wheeling round a point above a dark ridge.
  startrails([, trail, ground], random) {
    let out = '';
    for (let i = 0; i < 28; i += 1) {
      const length = 8 + random() * 26;
      out += `<circle cx="328" cy="64" r="${28 + i * 16.5}" fill="none" stroke="${trail}" stroke-width="1.4" opacity="${n(0.2 + random() * 0.65)}" pathLength="100" stroke-dasharray="${n(length)} ${n(100 - length)}" stroke-dashoffset="${n(random() * 100)}"/>`;
    }
    out += `<path d="M0 500V402l58-16 64 10 70-26 68 18 72-12 68 16v108z" fill="${ground}"/>`;
    out += `<circle cx="192" cy="366" r="2.6" fill="${trail}"/>`;
    return out;
  },

  // Orchid House: one magenta bloom seen through the frame of a glasshouse.
  glasshouse([, frame, bloom, floor]) {
    let out = `<rect y="420" width="${W}" height="80" fill="${floor}"/>`;
    out += `<circle cx="256" cy="304" r="72" fill="${bloom}"/>`;
    out += `<ellipse cx="150" cy="392" rx="54" ry="13" fill="${frame}" opacity="0.85" transform="rotate(-24 150 392)"/>`;
    out += `<ellipse cx="236" cy="404" rx="46" ry="11" fill="${frame}" opacity="0.7" transform="rotate(16 236 404)"/>`;
    out += `<path d="M60 420V170a140 140 0 0 1 280 0v250" fill="none" stroke="${frame}" stroke-width="7"/>`;
    out += `<path d="M130 420V49M200 420V30M270 420V49M60 240h280M60 330h280" fill="none" stroke="${frame}" stroke-width="3"/>`;
    return out;
  },

  // Nightjar: a crescent moon, a loose flock, and long grass.
  crescent([bg, moon, grass], random) {
    let out = `<circle cx="270" cy="150" r="82" fill="${moon}"/>`;
    out += `<circle cx="302" cy="128" r="74" fill="${bg}"/>`;
    const birds = [
      [128, 262, 2.4], [92, 196, 1.1], [176, 214, 1.3], [214, 172, 0.9],
      [60, 250, 0.8], [248, 236, 0.7], [150, 150, 0.7],
    ];
    for (const [x, y, s] of birds) {
      out += `<path d="M${x - 11 * s} ${y - 4 * s}q${5.5 * s} -5 ${11 * s} ${4 * s}q${5.5 * s} -9 ${11 * s} -4" fill="none" stroke="${moon}" stroke-width="${n(1.4 + s)}" stroke-linecap="round"/>`;
    }
    out += `<rect y="468" width="${W}" height="32" fill="${grass}"/>`;
    for (let x = 4; x < W; x += 9) {
      const top = 372 + random() * 92;
      out += `<path d="M${x} 500V${n(top)}" stroke="${grass}" stroke-width="4"/>`;
    }
    return out;
  },

  // Salt & Iron: a ledger, a slab of rust, a bar of iron and a grain of salt.
  blocks([, rust, ink, light]) {
    let out = '';
    for (let i = 0; i < 4; i += 1) out += `<path d="M40 ${58 + i * 13}h${170 - i * 30}" stroke="${ink}" stroke-width="2"/>`;
    out += `<rect x="40" y="200" width="232" height="260" fill="${rust}"/>`;
    out += `<circle cx="272" cy="200" r="58" fill="${light}"/>`;
    out += `<rect x="40" y="168" width="320" height="18" fill="${ink}"/>`;
    out += `<rect x="292" y="384" width="68" height="68" fill="${ink}"/>`;
    return out;
  },

  // The Quiet Engine: three interlocking gears and one small light.
  gears([, line, spark]) {
    const gear = (cx, cy, r, teeth, opacity) =>
      `<g opacity="${opacity}" fill="none" stroke="${line}">` +
      `<circle cx="${cx}" cy="${cy}" r="${r + 7}" stroke-width="12" pathLength="${teeth * 2}" stroke-dasharray="1 1"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${r}" stroke-width="2.5"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${n(r * 0.3)}" stroke-width="2.5"/></g>`;
    let out = gear(168, 304, 104, 26, 0.95);
    out += gear(306, 160, 62, 16, 0.75);
    out += gear(322, 404, 40, 10, 0.55);
    out += `<circle cx="306" cy="160" r="8" fill="${spark}"/>`;
    return out;
  },

  // Night Swim: rings spreading over still water under a small moon.
  ripples([, ring, moon]) {
    let out = `<circle cx="104" cy="104" r="15" fill="${moon}"/>`;
    for (let i = 1; i <= 18; i += 1) {
      out += `<ellipse cx="214" cy="348" rx="${i * 23}" ry="${n(i * 9.5)}" fill="none" stroke="${ring}" stroke-width="1.6" opacity="${n(0.95 - i * 0.05)}"/>`;
    }
    out += `<ellipse cx="214" cy="348" rx="7" ry="3" fill="${moon}"/>`;
    return out;
  },

  // Paper Satellites: a planet with three tilted orbits and their satellites.
  orbits([, ink, planet]) {
    const rings = [
      [176, 58, -24, 0.6],
      [150, 98, 18, 2.5],
      [120, 40, 64, 4.1],
    ];
    let out = `<circle cx="200" cy="250" r="44" fill="${planet}"/>`;
    for (const [rx, ry, rot, t] of rings) {
      out += `<ellipse cx="200" cy="250" rx="${rx}" ry="${ry}" fill="none" stroke="${ink}" stroke-width="1.5" transform="rotate(${rot} 200 250)"/>`;
      const a = (rot * Math.PI) / 180;
      const x = rx * Math.cos(t);
      const y = ry * Math.sin(t);
      out += `<circle cx="${n(200 + x * Math.cos(a) - y * Math.sin(a))}" cy="${n(250 + x * Math.sin(a) + y * Math.cos(a))}" r="6" fill="${ink}"/>`;
    }
    out += `<circle cx="84" cy="96" r="4" fill="${planet}"/>`;
    return out;
  },

  // Velvet Static: soft sine lines that swell in the middle and settle at the edges.
  waves([, line]) {
    let out = '';
    for (let i = 0; i < 16; i += 1) {
      const y0 = 108 + i * 20;
      const amplitude = 5 + 24 * Math.sin((Math.PI * i) / 15);
      const frequency = 0.034 + 0.005 * (i % 3);
      let d = '';
      for (let x = -8; x <= W + 8; x += 8) {
        const envelope = Math.sin((Math.PI * Math.min(Math.max(x, 0), W)) / W) ** 2;
        const y = y0 + amplitude * envelope * Math.sin(x * frequency + i * 0.7);
        d += `${d ? 'L' : 'M'}${x} ${n(y)}`;
      }
      out += `<path d="${d}" fill="none" stroke="${line}" stroke-width="2" opacity="${n(0.35 + 0.65 * Math.sin((Math.PI * (i + 0.5)) / 16))}"/>`;
    }
    return out;
  },

  // Lanternfall: three mountain ranges and one lantern lighting its own trail.
  mountains([, back, mid, front, lantern], random) {
    let out = '';
    for (let i = 0; i < 18; i += 1) {
      out += `<circle cx="${n(random() * W)}" cy="${n(20 + random() * 170)}" r="1.2" fill="${lantern}" opacity="${n(0.25 + random() * 0.4)}"/>`;
    }
    out += `<path d="M0 330l70-110 70 80 70-110 80 100 60-60 50 50v220H0z" fill="${back}"/>`;
    out += `<path d="M0 390l90-90 80 70 80-80 80 70 70-40v180H0z" fill="${mid}"/>`;
    out += `<path d="M232 352l-34 30 22 22-40 30" fill="none" stroke="${lantern}" stroke-width="2" stroke-dasharray="3 7" opacity="0.6"/>`;
    out += `<path d="M0 450l120-70 80 50 100-60 100 70v60H0z" fill="${front}"/>`;
    out += `<circle cx="232" cy="352" r="48" fill="${lantern}" opacity="0.1"/>`;
    out += `<circle cx="232" cy="352" r="26" fill="${lantern}" opacity="0.18"/>`;
    out += `<circle cx="232" cy="352" r="7" fill="${lantern}"/>`;
    return out;
  },

  // Tilewright: Truchet tiles, each turned one way or the other.
  truchet([, line], random) {
    const size = 80;
    const r = size / 2;
    let d = '';
    for (let y = 0; y < H; y += size) {
      for (let x = 0; x < W; x += size) {
        d += random() < 0.5
          ? `M${x + r} ${y}A${r} ${r} 0 0 1 ${x} ${y + r}M${x + size - r} ${y + size}A${r} ${r} 0 0 1 ${x + size} ${y + size - r}`
          : `M${x + size} ${y + r}A${r} ${r} 0 0 1 ${x + size - r} ${y}M${x} ${y + size - r}A${r} ${r} 0 0 1 ${x + r} ${y + size}`;
      }
    }
    return `<path d="${d}" fill="none" stroke="${line}" stroke-width="11"/>`;
  },

  // Orchard Nine: rows of trees in a planting grid, nine of them bearing fruit.
  dots([, tree, apple]) {
    const ripe = new Set(['1,1', '4,1', '2,3', '5,3', '0,4', '3,5', '1,6', '4,6', '2,7']);
    let out = '';
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 7; col += 1) {
        const cx = 34 + col * 62 + (row % 2) * 31;
        const cy = 44 + row * 60;
        out += `<circle cx="${cx}" cy="${cy}" r="19" fill="${ripe.has(`${col},${row}`) ? apple : tree}"/>`;
      }
    }
    return out;
  },
};

/** Returns the SVG markup for an item's cover. Decorative: hidden from assistive tech. */
export function artworkSVG(item) {
  const { motif, colors } = item.art;
  const draw = MOTIFS[motif];
  if (!draw) throw new Error(`Unknown artwork motif: ${motif}`);
  return (
    `<svg class="art" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">` +
    `<rect width="${W}" height="${H}" fill="${colors[0]}"/>${draw(colors, seeded(item.id))}</svg>`
  );
}
