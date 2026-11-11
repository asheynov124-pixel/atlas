// app.js - game loop, touch input, sound, saved progress, end-of-round panel.

var game = null;
var levelIndex = 0;
var clock = 0;
var endTimer = 0;
var combo = 0, comboAt = 0, chain = 0;
var shownSec = -1;
var result = null;   // { stars, gain, time } of the round just won
var save = { unlocked: 1, muted: false, fast: false };
var $ = function (id) { return document.getElementById(id); };

try {
  var stored = JSON.parse(localStorage.getItem('jellyloop1') || 'null');
  if (stored) save = stored;
} catch (e) { /* private mode: play without saving */ }

function persist() {
  try { localStorage.setItem('jellyloop1', JSON.stringify(save)); } catch (e) { /* ignore */ }
}

// Fill in anything an older save does not have yet.
function normalise() {
  var i;
  ['coins', 'pops', 'chain', 'light', 'quick', 'saved'].forEach(function (k) { save[k] = save[k] || 0; });
  save.unlocked = save.unlocked || 1;
  save.awards = save.awards || {};
  save.up = save.up || {};
  if (!save.stars) {
    // Saves from before stars existed: every level already passed counts as one star.
    save.stars = [];
    for (i = 0; i < save.unlocked - 1; i++) save.stars[i] = 1;
  }
  for (i = 0; i < LEVELS.length; i++) save.stars[i] = save.stars[i] || 0;
  UPGRADES.forEach(function (u) { save.up[u.id] = Math.min(save.up[u.id] || 0, u.cost.length); });
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

// ---------- rounds ----------

function clockText(sec) {
  var s = Math.floor(sec);
  return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + s % 60;
}

// Stars are for speed: three at up to 1.6x the build bot's time, two at up to 2.4x.
function starsFor(level, sec) {
  return sec <= level.par * 1.6 ? 3 : sec <= level.par * 2.4 ? 2 : 1;
}

function startLevel(i) {
  levelIndex = Math.max(0, Math.min(LEVELS.length - 1, i));
  game = new Game(LEVELS[levelIndex], { slots: save.up.slot, turbo: save.up.turbo, jumps: save.up.jump, rescues: save.up.wind });
  endTimer = 0;
  combo = 0;
  chain = 0;
  shownSec = -1;
  result = null;
  resetFx(game);
  layout(game);
  $('lvNum').textContent = 'Lv ' + (levelIndex + 1);
  $('lvName').textContent = LEVELS[levelIndex].name;
  $('panel').hidden = true;
  $('home').hidden = true;
  $('hint').hidden = levelIndex > 0 || starCount() > 0;
  updateBar();
}

function updateBar() {
  var left = 0, i;
  for (i = 0; i < fx.vis.length; i++) if (fx.vis[i]) left++;
  $('bar').style.width = (100 * (1 - left / game.total)) + '%';
  $('left').textContent = left;
}

function showPanel(won) {
  var last = levelIndex === LEVELS.length - 1, lv = LEVELS[levelIndex];
  $('pTitle').textContent = won ? 'Cleared!' : 'Belt jammed';
  $('pStars').hidden = !won;
  $('pGain').hidden = !won;
  if (won) {
    $('pStars').textContent = '';
    $('pStars').appendChild(starRow(result.stars));
    $('pGainN').textContent = '+' + result.gain;
    $('pText').textContent = 'Time ' + clockText(result.time) + '. Three stars at ' + clockText(lv.par * 1.6) + ' or faster.';
  } else {
    $('pText').textContent = 'Every place on the belt is taken and no jelly in play can reach a cube of its own colour.';
  }
  $('pGo').textContent = won ? (last ? 'Back to home' : 'Next level') : 'Try again';
  $('pGo').onclick = function () {
    if (won && last) showHome('list');
    else startLevel(won ? levelIndex + 1 : levelIndex);
  };
  $('pHome').hidden = won && last;
  $('pHome').onclick = function () { showHome(); };
  $('panel').className = won ? 'overlay won' : 'overlay lost';
  $('panel').hidden = false;
}

// ---------- events from the rules ----------

function handle(ev) {
  var c = view.cell, j = ev.jelly;
  if (ev.type === 'send') {
    if (ev.slot !== undefined) {
      // sent again from its place on the belt
      fx.pos[j.id] = { x: slotX(game, ev.slot), y: view.trayY, done: false };
    } else {
      fx.pos[j.id] = { x: colX(game, ev.col), y: frontY() + (ev.second ? view.jr * 1.62 : 0), done: false };
      fx.slide[ev.col] = ev.second ? 0 : 1;
    }
    tone(ev.second ? 440 : ev.slot !== undefined ? 392 : 330, 0.12, 'triangle', 0.12, 1.8);
    buzz(8);
    $('hint').hidden = true;
  } else if (ev.type === 'shot') {
    var x1 = px(game, ev.cell % game.w), y1 = py(game, Math.floor(ev.cell / game.w));
    var x0 = px(game, ev.x), y0 = py(game, ev.y);
    var dist = Math.abs(x1 - x0) + Math.abs(y1 - y0);
    fx.shots.push({ x0: x0, y0: y0, x1: x1, y1: y1, t: 0, dur: 0.05 + dist / (c * 90), key: ev.color, cell: ev.cell });
    fx.kick[j.id] = 1;
    save.pops++;
  } else if (ev.type === 'park') {
    // lap done with ammo to spare: glide from the end of the loop to its place
    fx.pos[j.id] = { x: view.cx, y: py(game, game.h - 1 + BELT_MARGIN), done: false };
    tone(260, 0.1, 'sine', 0.07, 0.8);
  } else if (ev.type === 'retire') {
    burst(px(game, ev.x), py(game, ev.y), j.color, 12, c * 7);
    tone(660, 0.18, 'sine', 0.1, 1.5);
  } else if (ev.type === 'full') {
    fx.deny = 1;
    tone(140, 0.12, 'square', 0.06, 0.8);
    buzz(20);
  } else if (ev.type === 'rescue') {
    burst(px(game, ev.x), py(game, ev.y), j.color, 16, c * 8);
    delete fx.pos[j.id];
    save.saved = 1;
    toast('Second Wind!');
    buzz(30);
    checkAwards();
  } else if (ev.type === 'won') {
    var stars = starsFor(LEVELS[levelIndex], game.time);
    var gain = 10 + 15 * Math.max(0, stars - save.stars[levelIndex]);
    save.stars[levelIndex] = Math.max(save.stars[levelIndex], stars);
    save.coins += gain;
    if (save.unlocked < levelIndex + 2) save.unlocked = Math.min(LEVELS.length, levelIndex + 2);
    if (game.peak <= 2) save.light = 1;
    if (game.time < 20) save.quick = 1;
    result = { stars: stars, gain: gain, time: game.time };
    persist();
    checkAwards();
  } else if (ev.type === 'lost') {
    fx.shake = 1;
    tone(200, 0.4, 'sawtooth', 0.08, 0.4);
    buzz(60);
    persist();
  }
}

// ---------- loop ----------

var lastFrame = 0;
function frame(now) {
  var dt = Math.min(0.05, (now - lastFrame) / 1000 || 0), i, steps;
  var playing = $('home').hidden;
  lastFrame = now;
  clock += dt;
  if (playing) {
    steps = save.fast ? 4 : 2;
    for (i = 0; i < steps; i++) game.step(dt * (save.fast ? 2 : 1) / steps);
    while (game.events.length) handle(game.events.shift());
    if (Math.floor(game.time) !== shownSec) {
      shownSec = Math.floor(game.time);
      $('time').textContent = clockText(shownSec);
    }
  }
  var landed = stepFx(game, dt);
  if (landed) {
    if (clock - comboAt < 0.35) {
      combo = Math.min(combo + landed, 16);
      chain += landed;
    } else {
      combo = 0;
      chain = landed;
    }
    comboAt = clock;
    if (chain > save.chain) {
      save.chain = chain;
      checkAwards();
    }
    tone(380 * Math.pow(2, combo / 12), 0.07, 'triangle', 0.1, 1.3);
    buzz(4);
    updateBar();
  }
  if (playing && game.status !== 'playing' && $('panel').hidden && !fx.shots.length) {
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
  var s = slotAt(game, e.clientX, e.clientY);
  if (s >= 0) {
    game.relaunch(s);
    return;
  }
  var c = columnAt(game, e.clientX, e.clientY);
  if (c >= 0) game.send(c, secondAt(e.clientY));
});
document.addEventListener('touchmove', function (e) { if (!e.target.closest('.pane')) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
window.addEventListener('resize', function () { layout(game); });
window.addEventListener('orientationchange', function () { setTimeout(function () { layout(game); }, 250); });
window.addEventListener('pagehide', persist);

function syncButtons() {
  $('bSound').className = save.muted ? 'off' : '';
  $('bSpeed').textContent = save.fast ? '2x' : '1x';
  $('bSpeed').className = save.fast ? 'on' : '';
}
$('bRestart').onclick = function () { startLevel(levelIndex); };
$('bHome').onclick = function () { showHome(); };
$('bSound').onclick = function () { save.muted = !save.muted; persist(); syncButtons(); tone(520, 0.08, 'triangle', 0.1); };
$('bSpeed').onclick = function () { save.fast = !save.fast; persist(); syncButtons(); };
['list', 'shop', 'wall'].forEach(function (id) {
  $('t-' + id).onclick = function () { setTab(id); };
});

normalise();
syncButtons();
drawMascot();
startLevel(Math.min(save.unlocked, LEVELS.length) - 1);
checkAwards();
showHome('list');
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js');
}
