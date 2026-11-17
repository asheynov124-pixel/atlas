#!/usr/bin/env node
// Home-screen icons, set in the book's own display face: "16" stamped on olive cloth.
//   node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const font = await readFile(join(root, 'node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2'));
const italic = await readFile(join(root, 'node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2'));
const face = (data, style) =>
  `@font-face{font-family:IS;font-style:${style};src:url(data:font/woff2;base64,${data.toString('base64')}) format('woff2')}`;

function html(size, { maskable = false, round = false } = {}) {
  const pad = maskable ? 0.2 : 0.08;
  return `<!doctype html><html><head><style>${face(font, 'normal')}${face(italic, 'italic')}
  html,body{margin:0;width:${size}px;height:${size}px;background:transparent}
  .c{width:${size}px;height:${size}px;border-radius:${round ? size * 0.22 : 0}px;overflow:hidden;position:relative;
     background:#5E6B4A;background-image:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 1px,transparent 1px 3px),repeating-linear-gradient(90deg,rgba(0,0,0,.05) 0 1px,transparent 1px 3px)}
  .hinge{position:absolute;inset:0 auto 0 0;width:${size * 0.09}px;background:linear-gradient(90deg,rgba(0,0,0,.28),rgba(0,0,0,.06) 40%,rgba(255,255,255,.06) 70%,transparent)}
  .n{position:absolute;inset:${size * pad}px;display:flex;align-items:center;justify-content:center;flex-direction:column;
     font-family:IS;color:#F3EEE5;text-shadow:0 -1px 0 rgba(0,0,0,.25)}
  .num{font-size:${size * (maskable ? 0.4 : 0.5)}px;line-height:.8;letter-spacing:-.02em}
  .rule{width:${size * 0.16}px;height:${Math.max(1, size * 0.008)}px;background:#B08B5E;margin:${size * 0.04}px 0 ${size * 0.03}px}
  .b{font-style:italic;font-size:${size * (maskable ? 0.1 : 0.12)}px;line-height:1}
  </style></head><body><div class="c"><div class="hinge"></div><div class="n"><div class="num">16</div><div class="rule"></div><div class="b">Bannehr</div></div></div></body></html>`;
}

const targets = [
  ['icon-192.png', 192, { round: false }],
  ['icon-512.png', 512, { round: false }],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}],
];

const browser = await chromium.launch();
for (const [name, size, opts] of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(html(size, opts));
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await writeFile(join(root, 'public', name), png);
  await page.close();
  console.log(`public/${name}`);
}
await browser.close();
