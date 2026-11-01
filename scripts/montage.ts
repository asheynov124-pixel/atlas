/** Tile a folder of screenshots into review sheets: npx tsx scripts/montage.ts screenshots/sheet [cols] [tileWidth] */
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'screenshots/sheet';
const cols = Number(process.argv[3] ?? 3);
const tileW = Number(process.argv[4] ?? 480);
const files = readdirSync(dir).filter((f) => /^\d+\.png$/.test(f)).sort();
const perSheet = cols * 4;
for (let s = 0; s * perSheet < files.length; s++) {
  const batch = files.slice(s * perSheet, (s + 1) * perSheet);
  const metas = await Promise.all(batch.map((f) => sharp(join(dir, f)).metadata()));
  const ratio = (metas[0].height ?? 900) / (metas[0].width ?? 1440);
  const tileH = Math.round(tileW * ratio);
  const rows = Math.ceil(batch.length / cols);
  const tiles = await Promise.all(
    batch.map(async (f, i) => ({
      input: await sharp(join(dir, f)).resize(tileW, tileH).png().toBuffer(),
      left: (i % cols) * (tileW + 8) + 8,
      top: Math.floor(i / cols) * (tileH + 8) + 8,
    })),
  );
  const out = join(dir, `montage-${s}.png`);
  await sharp({ create: { width: cols * (tileW + 8) + 8, height: rows * (tileH + 8) + 8, channels: 3, background: '#555' } })
    .composite(tiles)
    .png()
    .toFile(out);
  console.log('wrote', out, batch[0], '→', batch[batch.length - 1]);
}
