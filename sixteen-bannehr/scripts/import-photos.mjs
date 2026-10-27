#!/usr/bin/env node
// npm run import-photos
//
// Reads content/photos/<chapter-slug>/*.{jpg,jpeg,png,heic,heif,webp,tif,tiff}, converts
// HEIC, turns each photo upright from its EXIF, and writes 800 / 1600 / 2800 px WebP
// variants (never larger than the original, which is left untouched) to
// public/photos/<chapter-slug>/. It then writes src/storage/bundled-photos.json; the next
// time the book opens, each chapter's empty image places fill with its photos in
// filename order: spread images first, then gallery items.
//
// Options: --dry-run (report only), --force (rebuild every variant),
//          --src, --out, --manifest (other folders; used by the tests).

import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const SRC = arg('src', join(root, 'content/photos'));
const OUT = arg('out', join(root, 'public/photos'));
const MANIFEST = arg('manifest', join(root, 'src/storage/bundled-photos.json'));
const DRY = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const WIDTHS = [800, 1600, 2800];
const PHOTO = /\.(jpe?g|png|heic|heif|webp|tiff?)$/i;

// The chapter folders the seed book knows. Chapters added in the app have their own slug,
// shown in the Contents (Edit mode) and in README.md.
const KNOWN = ['cover', 'prologue', 'approach', 'vault', 'kitchen', 'archer-bath', 'small-bath', 'rest', 'below', 'outside', 'palette', 'epilogue'];

const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function slugify(name) {
  return (
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'photo'
  );
}

async function upright(file) {
  let input = await readFile(file);
  if (/\.(heic|heif)$/i.test(file)) {
    // Sharp's prebuilt binaries cannot decode HEIC; heic-convert can.
    const { default: convert } = await import('heic-convert');
    input = Buffer.from(await convert({ buffer: input, format: 'JPEG', quality: 0.94 }));
  }
  const { data, info } = await sharp(input, { failOn: 'none' }).rotate().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function newer(a, b) {
  try {
    return (await stat(a)).mtimeMs > (await stat(b)).mtimeMs;
  } catch {
    return true;
  }
}

async function main() {
  if (!existsSync(SRC)) {
    console.log(`No ${relative(root, SRC)} folder. Create it with one folder per chapter:\n  ${KNOWN.join(', ')}`);
    return;
  }
  const chapters = (await readdir(SRC, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort(natural.compare);
  const manifest = { version: 1, generatedAt: new Date().toISOString(), photos: {} };
  const keep = new Set();
  let made = 0;
  let total = 0;

  for (const chapter of chapters) {
    if (!KNOWN.includes(chapter)) console.warn(`  ! "${chapter}" is not a chapter in the seed book; it will only fill a chapter you gave that slug.`);
    const list = [];
    // Photos directly in the chapter folder fill its pages first, then its options; photos in
    // an items/ folder go only to options and materials (gallery renders, samples, products);
    // photos in an essay/ folder go only to the small pictures beside its essays.
    for (const [sub, target] of [['', 'any'], ['items', 'items'], ['essay', 'essay']]) {
      const dir = join(SRC, chapter, sub);
      if (!existsSync(dir)) continue;
      const files = (await readdir(dir)).filter((f) => PHOTO.test(f) && !f.startsWith('.')).sort(natural.compare);
      const outDir = join(OUT, chapter, sub);
      const used = new Set();
      for (const file of files) {
        const src = join(dir, file);
        const base = slugify(basename(file, extname(file)));
        let name = base;
        for (let i = 2; used.has(name); i++) name = `${base}-${i}`;
        used.add(name);
        const id = `bundled:${chapter}/${sub ? `${sub}/` : ''}${name}`;
        try {
          let photo;
          let variants;
          // Reuse last run's copies when they exist and the original has not changed since.
          const prev = FORCE ? null : previous?.photos?.[chapter]?.find((p) => p.id === id);
          const outs = prev ? prev.variants.map((w) => join(outDir, `${name}-${w}.webp`)) : [];
          const cached = !!prev && outs.every((o) => existsSync(o)) && !(await newer(src, outs[0]));
          if (cached) {
            photo = { width: prev.width, height: prev.height };
            variants = prev.variants;
          } else {
            photo = await upright(src);
            variants = WIDTHS.filter((w) => w < photo.width);
            // Below the largest size, keep a copy at the photo's own width too, so a phone's
            // 1125-pixel photo is not served at 800. Never enlarged.
            if (photo.width <= WIDTHS.at(-1)) variants.push(photo.width);
            if (!DRY) {
              await mkdir(outDir, { recursive: true });
              for (const w of variants) {
                await sharp(photo.data).resize({ width: w, withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toFile(join(outDir, `${name}-${w}.webp`));
                made++;
              }
            }
          }
          variants.forEach((w) => keep.add(join(outDir, `${name}-${w}.webp`)));
          list.push({ id, chapter, name, width: photo.width, height: photo.height, variants, ...(target !== 'any' ? { target } : {}) });
          total++;
        } catch (e) {
          console.warn(`  ! Skipped ${chapter}/${sub ? `${sub}/` : ''}${file}: ${e.message}`);
        }
      }
    }
    if (!list.length) continue;
    manifest.photos[chapter] = list;
    const items = list.filter((p) => p.target === 'items').length;
    const essays = list.filter((p) => p.target === 'essay').length;
    const notes = [items && `${items} for options`, essays && `${essays} beside essays`].filter(Boolean).join(', ');
    console.log(`  ${chapter.padEnd(12)} ${String(list.length).padStart(3)} photo${list.length === 1 ? '' : 's'}${notes ? ` (${notes})` : ''}`);
  }

  if (DRY) {
    console.log(`\nDry run: ${total} photos found; nothing written.`);
    return;
  }

  // Remove variants of photos that are no longer in content/photos.
  async function prune(dir) {
    for (const f of await readdir(dir)) {
      const path = join(dir, f);
      if ((await stat(path)).isDirectory()) await prune(path);
      else if (!keep.has(path)) await rm(path);
    }
  }
  if (existsSync(OUT)) await prune(OUT);
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\n${total} photos ready (${made} new web copies). The book places them the next time it opens.`);
}

let previous = null;
try {
  previous = JSON.parse(await readFile(MANIFEST, 'utf8'));
} catch {
  /* first run */
}
console.log(`Importing photos from ${relative(root, SRC) || SRC}`);
await main();
