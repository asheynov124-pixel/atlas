/** Make the PWA icons from a simple house mark on sage: npm run icons */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('public/icons', { recursive: true });

const mark = (size: number, pad: number) => {
  const s = size;
  const p = pad * s;
  // a gable over a square: the house, in thin paper lines on sage
  const house = `
    <path d="M ${0.26 * s} ${0.5 * s} L ${0.5 * s} ${0.3 * s} L ${0.74 * s} ${0.5 * s}" fill="none" stroke="#F5F1EA" stroke-width="${0.028 * s}" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="${0.31 * s}" y="${0.5 * s}" width="${0.38 * s}" height="${0.24 * s}" fill="none" stroke="#F5F1EA" stroke-width="${0.028 * s}"/>
    <rect x="${0.455 * s}" y="${0.6 * s}" width="${0.09 * s}" height="${0.14 * s}" fill="#F5F1EA"/>
  `;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
    <rect width="${s}" height="${s}" fill="#8A9A7B"/>
    <rect x="${p}" y="${p}" width="${s - 2 * p}" height="${s - 2 * p}" fill="none" stroke="#F5F1EA" stroke-opacity="0.55" stroke-width="${Math.max(1, 0.012 * s)}"/>
    ${house}
  </svg>`);
};

await sharp(mark(512, 0.09)).png().toFile('public/icons/icon-512.png');
await sharp(mark(192, 0.09)).png().toFile('public/icons/icon-192.png');
await sharp(mark(512, 0.2)).png().toFile('public/icons/maskable-512.png');
await sharp(mark(180, 0.09)).png().toFile('public/apple-touch-icon.png');
console.log('icons written to public/icons');
