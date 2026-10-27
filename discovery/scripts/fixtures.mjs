// Offline fixtures for the import e2e: a CORS-enabled gallery page, a page that
// refuses cross-origin reads, and generated PNG "photos". Served via page.route.
import { deflateSync } from 'node:zlib';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** A soft two-tone gradient "photo" so screenshots show distinct images. */
export function makePng(w, h, hue) {
  const hsl = (hh, s, l) => {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + hh / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  };
  const top = hsl(hue, 0.65, 0.62);
  const bottom = hsl((hue + 70) % 360, 0.7, 0.22);
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    const t = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const glow = Math.max(0, 1 - Math.hypot(x / w - 0.5, y / h - 0.42) * 2.4) * 60;
      const i = y * (w * 3 + 1) + 1 + x * 3;
      for (let c = 0; c < 3; c++) raw[i + c] = Math.min(255, Math.round(top[c] * (1 - t) + bottom[c] * t + glow));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export const GALLERY_URL = 'https://gallery.test/sets/pier-sunset/';
export const LOCKED_URL = 'https://locked.test/album/42';

export const GALLERY_HTML = `<!doctype html><html><head>
<title>Pier at sunset</title>
<meta property="og:title" content="Pier at sunset">
<meta property="og:image" content="https://cdn.gallery.test/pier/full/001.png">
<script type="application/ld+json">{"@type":"ImageObject","contentUrl":"https://cdn.gallery.test/pier/ld-boardwalk.png","name":"Boardwalk lights","width":1200,"height":1600}</script>
</head><body>
<header><img src="/static/logo.png" alt="logo" width="120" height="40"></header>
<main class="gallery">
  <a href="https://cdn.gallery.test/pier/full/001.png"><img src="https://cdn.gallery.test/pier/thumbs/001.png" alt="Golden hour"></a>
  <a href="https://cdn.gallery.test/pier/full/002.png"><img src="https://cdn.gallery.test/pier/thumbs/002.png" alt="Gulls over the water"></a>
  <a href="https://cdn.gallery.test/pier/full/003.png"><img src="https://cdn.gallery.test/pier/thumbs/003.png"></a>
  <a href="https://cdn.gallery.test/pier/full/004.png"><img src="https://cdn.gallery.test/pier/thumbs/004.png"></a>
  <img data-src="https://cdn.gallery.test/pier/lazy-lamps.png" alt="Lamp posts">
  <img src="https://cdn.gallery.test/pier/pixel.gif" width="1" height="1">
  <a class="next" href="/sets/pier-sunset/page/2/">Next ›</a>
</main>
<aside class="ad-slot"><img src="https://ads.trafficjunky.net/b/1.jpg" width="300" height="250"></aside>
</body></html>`;

/** Install routes. Only the gallery page allows cross-origin reads. Returns live request counts. */
export async function installImportFixtures(page) {
  const hits = { gallery: 0 };
  const images = new Map();
  const png = (key, hue, w = 600, h = 900) => {
    if (!images.has(key)) images.set(key, makePng(w, h, hue));
    return images.get(key);
  };
  await page.route('https://gallery.test/**', (route) => {
    hits.gallery++;
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: { 'access-control-allow-origin': '*' }, body: GALLERY_HTML });
  });
  // A site that refuses cross-origin reads. Intercepted responses skip the browser's CORS
  // check, so this fails the request the way a CORS refusal looks to the page: an opaque TypeError.
  await page.route('https://locked.test/**', (route) => route.abort('failed'));
  await page.route(/https:\/\/(cdn\.gallery\.test|img\.example\.test)\/.*/, (route) => {
    const url = route.request().url();
    if (/\.mp4$/.test(url)) return route.fulfill({ status: 404, body: '' });
    const hue = [...url].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 11);
    const thumb = url.includes('/thumbs/');
    return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: png(url, hue, thumb ? 120 : 600, thumb ? 180 : 900) });
  });
  await page.route(/trafficjunky/, (route) => route.abort());
  return { hits };
}
