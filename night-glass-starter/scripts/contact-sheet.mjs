#!/usr/bin/env node
/**
 * One page to eyeball the design: the Night Glass reference screens next to this app's
 * screenshot baselines, plus expected / actual / diff for any screen that drifted in
 * the last `npm run visual`. Writes test-results/contact-sheet.html.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'test-results');
mkdirSync(out, { recursive: true });
const rel = (p) => relative(out, p);
const list = (dir, ext) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(ext)).sort() : []);

const reference = list(join(root, 'design/reference'), '.png').map((f) => ({ name: f.replace(/\.png$/, ''), src: rel(join(root, 'design/reference', f)) }));

const baseDir = join(root, 'tests/visual/__screens__');
const sizes = existsSync(baseDir) ? readdirSync(baseDir).sort() : [];
const baselines = sizes.map((size) => ({ size, shots: list(join(baseDir, size), '.png').map((f) => ({ name: f.replace(/\.png$/, ''), src: rel(join(baseDir, size, f)) })) }));

// Playwright leaves <name>-expected/actual/diff.png in test-results/<test>/ for each failure.
const drift = [];
for (const dir of existsSync(out) ? readdirSync(out, { withFileTypes: true }) : []) {
  if (!dir.isDirectory() || !dir.name.startsWith('visual-screens-')) continue;
  const files = readdirSync(join(out, dir.name));
  for (const f of files.filter((x) => x.endsWith('-actual.png'))) {
    const base = f.replace(/-actual\.png$/, '');
    const pick = (suffix) => (files.includes(`${base}-${suffix}.png`) ? join(dir.name, `${base}-${suffix}.png`) : null);
    drift.push({ test: dir.name.replace(/^visual-screens-/, ''), expected: pick('expected'), actual: join(dir.name, f), diff: pick('diff') });
  }
}

const fig = (src, caption) => `<figure><img loading="lazy" src="${src}" alt="${caption}"><figcaption>${caption}</figcaption></figure>`;
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Night Glass contact sheet</title>
<style>
  :root { color-scheme: dark; --bg:#07070a; --surface:#111117; --line:rgba(255,255,255,.08); --text:#f4f3f8; --muted:#9b99aa; --dislike:#fb7185; }
  body { margin:0; padding:24px 16px 48px; background:var(--bg); color:var(--text); font:15px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,system-ui,sans-serif; }
  h1 { font-size:1.9rem; margin:0 0 4px; } h2 { font-size:1.1rem; margin:28px 0 10px; } p { color:var(--muted); margin:0; max-width:70ch; }
  .strip { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:12px; }
  figure { margin:0; } img { width:100%; border-radius:12px; border:1px solid var(--line); display:block; background:var(--surface); }
  figcaption { font-size:.8rem; color:var(--muted); margin-top:4px; }
  .drift { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; padding:12px; border:1px solid rgba(251,113,133,.4); border-radius:14px; margin-bottom:12px; }
  .bad { color:var(--dislike); }
</style>
<h1>Night Glass contact sheet</h1>
<p>The starter's frozen Night Glass screens, then this app's baselines at each size. Compare the feel, not the content: the same glass, gradient, verb colors, spacing and type.</p>
${drift.length ? `<h2 class="bad">${drift.length} screen${drift.length === 1 ? '' : 's'} drifted in the last run</h2>${drift.map((d) => `<div class="drift">${d.expected ? fig(d.expected, `${d.test}: baseline`) : ''}${fig(d.actual, `${d.test}: now`)}${d.diff ? fig(d.diff, `${d.test}: difference`) : ''}</div>`).join('')}` : ''}
<h2>Night Glass reference</h2><div class="strip">${reference.map((r) => fig(r.src, r.name)).join('')}</div>
${baselines.map((b) => `<h2>This app · ${b.size}</h2><div class="strip">${b.shots.map((s) => fig(s.src, s.name)).join('')}</div>`).join('')}
`;
writeFileSync(join(out, 'contact-sheet.html'), html);
console.log(`Wrote ${relative(root, join(out, 'contact-sheet.html'))}: ${reference.length} reference screens, ${baselines.reduce((n, b) => n + b.shots.length, 0)} baselines, ${drift.length} drifted.`);
