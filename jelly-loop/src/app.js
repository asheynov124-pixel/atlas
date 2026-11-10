// app.js - game loop, touch input, sound, menus, saved progress.

var game = null;
var levelIndex = 0;
var clock = 0;
var endTimer = 0;
var combo = 0, comboAt = 0;
var save = { unlocked: 1, muted: false, fast: false };
var $ = function (id) { return document.getElementById(id); };

try {
  var stored = JSON.parse(localStorage.getItem('jellyloop1') || 'null');
  if (stored) save = stored;
} catch (e) { /* private mode: play without saving */ }

function persist() {
  try { localStorage.setItem('jellyloop1', JSON.stringify(save)); } catch (e) { /* ignore */ }
}

// ---------- sound ----------

var audio = null;
function tone(freq, dur, type, vol, slide) {
  if (save.muted) return;
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    var o = audio.createOscillator(), v = audio.createGain(), t = audio.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    v.gain.setValueAtTime(vol, t);
    v.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(v);
    v.connect(audio.destination);
    o.start(t);
    o.stop(t + dur);
  } catch (e) { /* no audio available */ }
}

function buzz(ms) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

// ---------- levels ----------

function startLevel(i) {
  levelIndex = Math.max(0, Math.min(LEVELS.length - 1, i));
  game = new Game(LEVELS[levelIndex]);
  endTimer = 0;
  combo = 0;
  resetFx(game);
  layout(game);
  $('lvNum').textContent = 'Level ' + (levelIndex + 1);
  $('lvName').textContent = LEVELS[levelIndex].name;
  $('panel').hidden = true;
  $('levels').hidden = true;
  $('hint').hidden = levelIndex > 0 || save.unlocked > 1;
  updateBar();
}

function updateBar() {
  var left = 0, i;
  for (i = 0; i < fx.vis.length; i++) if (fx.vis[i]) left++;
  $('bar').style.width = (100 * (1 - left / game.total)) + '%';
  $('left').textContent = left;
}

function showPanel(won) {
  var last = levelIndex === LEVELS.length - 1;
  $('pTitle').textContent = won ? (last ? 'All clear!' : 'Cleared!') : 'Belt jammed';
  $('pText').textContent = won
    ? (last ? 'That was the last picture. Play any of them again from the menu.' : LEVELS[levelIndex].name + ' is busted. On to ' + LEVELS[levelIndex + 1].name + '.')
    : 'Five jellies on the belt and none of them can reach a cube of its own colour.';
  $('pGo').textContent = won ? (last ? 'Play again' : 'Next level') : 'Try again';
  $('pGo').onclick = function () { startLevel(won && !last ? levelIndex + 1 : (won ? 0 : levelIndex)); };
  $('panel').className = won ? 'overlay won' : 'overlay lost';
  $('panel').hidden = false;
}

function thumb(level) {
  var art = level.art, s = Math.floor(56 / Math.max(art[0].length, art.length));
  var c = document.createElement('canvas'), x, y;
  c.width = art[0].length * s;
  c.height = art.length * s;
  var t = c.getContext('2d');
  for (y = 0; y < art.length; y++) {
    for (x = 0; x < art[0].length; x++) {
      if (art[y].charAt(x) === '.') continue;
      t.fillStyle = PALETTE[art[y].charAt(x)][1];
      t.fillRect(x * s, y * s, s, s);
    }
  }
  return c;
}

function showLevels() {
  var list = $('list');
  list.textContent = '';
  LEVELS.forEach(function (level, i) {
    var b = document.createElement('button'), open = i < save.unlocked;
    b.className = 'lv' + (open ? '' : ' locked') + (i === levelIndex ? ' current' : '');
    b.disabled = !open;
    if (open) b.appendChild(thumb(level));
    else b.appendChild(document.createElement('i'));
    var label = document.createElement('span');
    label.textContent = (i + 1) + '. ' + level.name;
    b.appendChild(label);
    b.onclick = function () { startLevel(i); };
    list.appendChild(b);
  });
  $('install').hidden = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  $('levels').hidden = false;
}

// ---------- events from the rules ----------

function handle(ev) {
  var c = view.cell, j = ev.jelly;
  if (ev.type === 'send') {
    fx.pos[j.id] = { x: colX(game, ev.col), y: frontY(), done: false };
    fx.slide[ev.col] = 1;
    tone(330, 0.12, 'triangle', 0.12, 1.8);
    buzz(8);
    $('hint').hidden = true;
  } else if (ev.type === 'shot') {
    var x1 = px(game, ev.cell % game.w), y1 = py(game, Math.floor(ev.cell / game.w));
    var x0 = px(game, ev.x), y0 = py(game, ev.y);
    var dist = Math.abs(x1 - x0) + Math.abs(y1 - y0);
    fx.shots.push({ x0: x0, y0: y0, x1: x1, y1: y1, t: 0, dur: 0.05 + dist / (c * 90), key: ev.color, cell: ev.cell });
    fx.kick[j.id] = 1;
  } else if (ev.type === 'retire') {
    burst(px(game, ev.x), py(game, ev.y), j.color, 12, c * 7);
    tone(660, 0.18, 'sine', 0.1, 1.5);
  } else if (ev.type === 'full') {
    fx.deny = 1;
    tone(140, 0.12, 'square', 0.06, 0.8);
    buzz(20);
  } else if (ev.type === 'won') {
    if (save.unlocked < levelIndex + 2) save.unlocked = Math.min(LEVELS.length, levelIndex + 2);
    persist();
  } else if (ev.type === 'lost') {
    fx.shake = 1;
    tone(200, 0.4, 'sawtooth', 0.08, 0.4);
    buzz(60);
  }
}

// ---------- loop ----------

var lastFrame = 0;
function frame(now) {
  var dt = Math.min(0.05, (now - lastFrame) / 1000 || 0), i, steps;
  lastFrame = now;
  clock += dt;
  if ($('levels').hidden) {
    steps = save.fast ? 4 : 2;
    for (i = 0; i < steps; i++) game.step(dt * (save.fast ? 2 : 1) / steps);
    while (game.events.length) handle(game.events.shift());
  }
  var landed = stepFx(game, dt);
  if (landed) {
    combo = clock - comboAt < 0.35 ? Math.min(combo + landed, 16) : 0;
    comboAt = clock;
    tone(380 * Math.pow(2, combo / 12), 0.07, 'triangle', 0.1, 1.3);
    buzz(4);
    updateBar();
  }
  if (game.status !== 'playing' && $('panel').hidden && !fx.shots.length) {
    if (!endTimer) {
      endTimer = clock;
      if (game.status === 'won') {
        tone(523, 0.14, 'triangle', 0.12);
        setTimeout(function () { tone(659, 0.14, 'triangle', 0.12); }, 120);
        setTimeout(function () { tone(784, 0.3, 'triangle', 0.12); }, 240);
        for (i = 0; i < 70; i++) burst(Math.random() * view.w, view.cy - view.cell * 3, 'RYBGPCON'.charAt(i % 8), 1, view.cell * 14);
      }
    }
    if (clock - endTimer > 0.9) showPanel(game.status === 'won');
  }
  draw(game, clock);
  requestAnimationFrame(frame);
}

// ---------- input ----------

canvas.addEventListener('pointerdown', function (e) {
  e.preventDefault();
  var c = columnAt(game, e.clientX, e.clientY);
  if (c >= 0) game.send(c);
});
document.addEventListener('touchmove', function (e) { if (!e.target.closest('#list')) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
window.addEventListener('resize', function () { layout(game); });
window.addEventListener('orientationchange', function () { setTimeout(function () { layout(game); }, 250); });

function syncButtons() {
  $('bSound').className = save.muted ? 'off' : '';
  $('bSpeed').textContent = save.fast ? '2x' : '1x';
  $('bSpeed').className = save.fast ? 'on' : '';
}
$('bRestart').onclick = function () { startLevel(levelIndex); };
$('bLevels').onclick = showLevels;
$('bClose').onclick = function () { $('levels').hidden = true; };
$('bSound').onclick = function () { save.muted = !save.muted; persist(); syncButtons(); tone(520, 0.08, 'triangle', 0.1); };
$('bSpeed').onclick = function () { save.fast = !save.fast; persist(); syncButtons(); };

syncButtons();
startLevel(Math.min(save.unlocked, LEVELS.length) - 1);
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js');
}
