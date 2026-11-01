/**
 * npm run import-photos
 *
 * Reads content/photos/<chapter-slug>/*.{jpg,jpeg,png,webp,heic,heif},
 * converts HEIC, writes 800 / 1600 / 2800 px WebP variants (never larger
 * than the original) plus an untouched copy of the original into
 * public/photos/<chapter-slug>/, and writes src/content/photos.manifest.json.
 *
 * At runtime the app fills each chapter's empty image slots in filename
 * order, once per photo. Chapter slugs: cover and front matter use "front";
 * the rest are prologue, approach, vault, kitchen, bath-archer, small-bath,
 * rest, below, outside, palette, epilogue.
 */
import sharp from 'sharp';
import heicConvert from 'heic-convert';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const SRC = 'content/photos';
const OUT = 'public/photos';
const MANIFEST = 'src/content/photos.manifest.json';
const VARIANTS = [800, 1600, 2800];
const EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif', '.tif', '.tiff']);

interface Photo {
  id: string;
  name: string;
  width: number;
  height: number;
  mime: string;
  original: string;
  variants: { w: number; url: string }[];
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'photo';
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const newer = (out: string, src: string) => existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs;

async function main() {
  if (!existsSync(SRC)) {
    console.log(`Nothing to import: ${SRC} does not exist. Make content/photos/<chapter-slug>/ and drop photos in.`);
    return;
  }
  const chapters: Record<string, Photo[]> = {};
  const slugs = readdirSync(SRC, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(natural);
  let count = 0;
  for (const slug of slugs) {
    const dir = join(SRC, slug);
    const files = readdirSync(dir).filter((f) => EXTS.has(extname(f).toLowerCase()) && !f.startsWith('.')).sort(natural);
    if (files.length === 0) continue;
    const outDir = join(OUT, slug);
    mkdirSync(outDir, { recursive: true });
    chapters[slug] = [];
    for (const file of files) {
      const src = join(dir, file);
      const ext = extname(file).toLowerCase();
      const base = slugify(basename(file, ext));
      const isHeic = ext === '.heic' || ext === '.heif';

      // keep the original untouched
      const originalOut = join(outDir, `${base}${ext}`);
      if (!newer(originalOut, src)) copyFileSync(src, originalOut);

      let input: Buffer = readFileSync(src);
      if (isHeic) {
        input = Buffer.from(await heicConvert({ buffer: input, format: 'JPEG', quality: 0.92 }));
      }
      const image = sharp(input).rotate();
      const meta = await image.metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      const variants: { w: number; url: string }[] = [];
      const widths = VARIANTS.filter((w) => w < width);
      if (widths.length === 0 || width <= Math.max(...VARIANTS)) widths.push(Math.min(width, 2800));
      for (const w of [...new Set(widths)].sort((a, b) => a - b)) {
        const out = join(outDir, `${base}-${w}.webp`);
        if (!newer(out, src)) await sharp(input).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 84 }).toFile(out);
        variants.push({ w, url: `/photos/${slug}/${base}-${w}.webp` });
      }
      chapters[slug].push({
        id: `static:${slug}/${base}`,
        name: basename(file, ext),
        width,
        height,
        mime: isHeic ? 'image/jpeg' : meta.format ? `image/${meta.format}` : 'image/jpeg',
        original: `/photos/${slug}/${base}${ext}`,
        variants,
      });
      count += 1;
      console.log(`${slug}/${file} → ${variants.map((v) => v.w).join('/')} px`);
    }
  }
  writeFileSync(MANIFEST, JSON.stringify({ generatedAt: new Date().toISOString(), chapters }, null, 2) + '\n');
  console.log(`\n${count} photos in ${Object.keys(chapters).length} chapters. Manifest: ${MANIFEST}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
