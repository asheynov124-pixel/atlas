// node tools/build.mjs
//
// 1. Deals a hand for every picture in levels.mjs and proves with a bot that it can be won.
//    Writes src/levels.js.
// 2. Minifies src/ into dist/, which is the folder that gets deployed.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { minify } from 'terser';
import { PICTURES } from './levels.mjs';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { Game, PALETTE, MAX_SLOTS } = require(path.join(root, 'src/core.js'));

// ---------- bots ----------

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Careful player: sends a parked jelly round again whenever its colour is showing, and
// takes a new one from the hand only when its colour is showing and not already covered.
function smart(g) {
  const ex = g.exposed();
  g.slots.forEach((j, s) => { if (j && j.parked && ex[j.color]) g.relaunch(s); });
  if (g.slotsUsed() >= g.maxSlots) return -1;
  const on = g.inPlay();
  const riding = {};
  for (const j of on) riding[j.color] = (riding[j.color] || 0) + j.ammo;
  let best = -1, score = 0;
  g.hand.forEach((col, c) => {
    if (!col.length) return;
    const k = col[0].color;
    const need = (ex[k] || 0) - (riding[k] || 0);
    if (need > score) { score = need; best = c; }
  });
  if (best >= 0) return best;
  if (on.some((j) => ex[j.color])) return -1; // something is still working: wait
  // Nothing useful on the belt or at the front of a column: dig for the nearest useful jelly.
  let depth = 1e9;
  g.hand.forEach((col, c) => {
    const d = col.findIndex((j) => ex[j.color]);
    if (d >= 0 && d < depth) { depth = d; best = c; }
  });
  return best;
}

// Careless player: about once a second, taps something at random - a front jelly in the
// hand if a place is free, or a jelly parked on the belt.
function casual(rand) {
  let wait = 0;
  return (g) => {
    if (--wait > 0) return -1;
    const free = g.slotsUsed() < g.maxSlots;
    const moves = [];
    g.hand.forEach((c, i) => { if (free && c.length) moves.push(i); });
    g.slots.forEach((j, s) => { if (j && j.parked) moves.push(-1 - s); });
    if (!moves.length) return -1;
    wait = 30 + Math.floor(rand() * 60);
    const pick = moves[Math.floor(rand() * moves.length)];
    if (pick >= 0) return pick;
    g.relaunch(-1 - pick);
    return -1;
  };
}

function play(level, policy) {
  const g = new Game(level);
  const order = [];
  let ticks = 0;
  while (g.status === 'playing' && ticks < 60 * 900) {
    const c = policy(g);
    if (c >= 0) {
      const j = g.hand[c][0];
      if (g.send(c)) order.push(j.color + j.max);
    }
    g.step(1 / 60);
    g.events.length = 0;
    ticks++;
  }
  return { status: g.status, seconds: ticks / 60, order };
}

// ---------- dealing a hand ----------

function jelliesFor(pic) {
  const count = {};
  for (const row of pic.art) for (const ch of row) if (ch !== '.') count[ch] = (count[ch] || 0) + 1;
  const out = [];
  for (const [k, n] of Object.entries(count)) {
    if (!PALETTE[k]) throw new Error(pic.name + ': unknown colour ' + k);
    const parts = Math.ceil(n / pic.chunk);
    for (let i = 0; i < parts; i++) out.push(k + (Math.floor(n / parts) + (i < n % parts ? 1 : 0)));
  }
  return out;
}

function deal(order, cols) {
  const hand = Array.from({ length: cols }, () => []);
  order.forEach((tok, i) => hand[i % cols].push(tok));
  return hand.map((c) => c.join(' '));
}

function buildLevel(pic, index) {
  const w = pic.art[0].length;
  for (const row of pic.art) if (row.length !== w) throw new Error(pic.name + ': ragged row ' + row);
  if (pic.bg) pic.art = pic.art.map((row) => row.replace(/\./g, pic.bg));
  const jellies = jelliesFor(pic);

  // With every jelly free to pick, the careful bot finds a natural order to clear the picture.
  const free = play({ art: pic.art, hand: jellies }, smart);
  if (free.status !== 'won') throw new Error(pic.name + ': not solvable even with a free hand');

  // Shuffle that order (further for a higher mix), deal it into columns, and keep the
  // winnable candidate whose difficulty for a careless player is closest to the target.
  const target = Math.min(0.7, pic.mix * 0.12);
  const rand = rng(1000 + index);
  let chosen = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const order = free.order.slice();
    // Early attempts nudge neighbours; later ones swap across the whole hand.
    const swaps = attempt ? Math.ceil(pic.mix * (1 + attempt / 10)) : 0;
    const reach = attempt < 30 ? 1 + pic.mix : order.length;
    for (let s = 0; s < swaps; s++) {
      const i = Math.floor(rand() * order.length);
      const j = Math.min(order.length - 1, i + 1 + Math.floor(rand() * reach));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const level = { name: pic.name, art: pic.art, hand: deal(order, pic.cols) };
    const proof = play(level, smart);
    if (proof.status !== 'won') continue;
    let losses = 0;
    const trials = 40;
    for (let t = 0; t < trials; t++) if (play(level, casual(rng(t * 7919 + index))).status !== 'won') losses++;
    const rate = losses / trials;
    const miss = Math.abs(rate - target);
    if (!chosen || miss < chosen.miss) chosen = { level, miss, rate, seconds: proof.seconds };
    if (!pic.mix || miss < 0.05) break;
  }
  if (!chosen) throw new Error(pic.name + ': no winnable hand found');
  // Par: how long the careful bot takes, in belt seconds. The stars are measured against it.
  const par = Math.ceil(chosen.seconds);
  chosen.level.par = par;
  const cubes = pic.art.join('').replace(/\./g, '').length;
  console.log(
    String(index + 1).padStart(2) + '. ' + pic.name.padEnd(11) +
    (w + 'x' + pic.art.length).padEnd(7) + String(cubes).padStart(4) + ' cubes  ' +
    String(jellies.length).padStart(2) + ' jellies  bot wins in ' + chosen.seconds.toFixed(0).padStart(3) +
    's  careless play loses ' + String(Math.round(chosen.rate * 100)).padStart(2) + '%  (target ' + Math.round(target * 100) + '%)  par ' + par + 's'
  );
  return chosen.level;
}

// ---------- build ----------

const levels = PICTURES.map(buildLevel);
const levelsJs =
  '// Generated by tools/build.mjs from tools/levels.mjs. Do not edit by hand.\n' +
  'var LEVELS = [\n' +
  levels.map((l) =>
    "  { name: '" + l.name + "', par: " + l.par + ",\n    art: [" + l.art.map((r) => "'" + r + "'").join(', ') +
    '],\n    hand: [' + l.hand.map((h) => "'" + h + "'").join(', ') + '] }'
  ).join(',\n') +
  '\n];\n';
fs.writeFileSync(path.join(root, 'src/levels.js'), levelsJs);

const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'icons'), { recursive: true });

const scripts = ['core.js', 'levels.js', 'render.js', 'home.js', 'app.js', 'sw.js'].filter((f) => fs.existsSync(path.join(root, 'src', f)));
for (const f of scripts) {
  const out = await minify(fs.readFileSync(path.join(root, 'src', f), 'utf8'), {
    compress: { passes: 2 },
    mangle: true,
    format: { quote_style: 1, comments: false }
  });
  fs.writeFileSync(path.join(dist, f), out.code);
}

// HTML: one line, tags only ever break between elements in the source.
if (fs.existsSync(path.join(root, 'src/index.html'))) {
  const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('<!--')).join('')
    .replace(/\s*([{};:,>])\s*(?=[^<]*<\/style>)/g, '$1');
  fs.writeFileSync(path.join(dist, 'index.html'), html);
}
for (const f of ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png']) {
  if (fs.existsSync(path.join(root, 'src', f))) fs.copyFileSync(path.join(root, 'src', f), path.join(dist, f));
}

// The deploy step pastes these files into a JSON request, so keep them free of
// characters that would need escaping there.
console.log('\ndist/');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const file of walk(dist).sort()) {
  const buf = fs.readFileSync(file);
  const rel = path.relative(dist, file);
  const sha = crypto.createHash('sha1').update(buf).digest('hex');
  let note = '';
  if (/\.(js|html)$/.test(rel)) {
    const s = buf.toString('utf8');
    const bad = [];
    if (s.includes('"')) bad.push('double quote');
    if (s.includes('\\')) bad.push('backslash');
    if (/[\r\n]/.test(s)) bad.push('newline');
    if (/[^\x20-\x7e]/.test(s)) bad.push('non-ASCII');
    if (bad.length) note = '  <-- contains ' + bad.join(', ');
  }
  console.log('  ' + rel.padEnd(28) + String(buf.length).padStart(6) + ' bytes  ' + sha + note);
}
