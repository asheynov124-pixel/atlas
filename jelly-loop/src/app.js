// app.js - game loop, touch input, sound, saved progress and the end-of-round panel.

var game = null;
var level = null;
var levelIndex = 0;
var clock = 0;
var endTimer = 0;
var combo = 0, comboAt = 0, chain = 0;
var shownSec = -1;
var result = null;   // { stars, coins, keys, time } of the round just won
var mode = '';       // '' | 'bolt' | 'grab': a booster waiting for its tap
var lastFull = 0;
var save = {};
var $ = function (id) { return document.getElementById(id); };

try {
  save = JSON.parse(localStorage.getItem('jellyloop1') || 'null') || {};
} catch (e) { save = {}; }

function persist() {
  try { localStorage.setItem('jellyloop1', JSON.stringify(save)); } catch (e) { /* private mode: play without saving */ }
}

// Fill in anything an older save does not have yet.
function normalise() {
  var DEF = {
    unlocked: 1, coins: 0, pops: 0, chain: 0, light: 0, quick: 0, saved: 0, autos: 0,
    muted: false, fast: false, hearts: 5, heartAt: Date.now(), infUntil: 0,
    streak: 0, bestStreak: 0, keys: 0, roadGot: 0, giftDay: '', giftN: 0,
    taskDay: '', tasks: [], taskPts: 0, chestsGot: [], wins: 0
  };
  var k, i;
  for (k in DEF) if (save[k] === undefined) save[k] = DEF[k];
  save.awards = save.awards || {};
  save.up = save.up || {};
  if (!save.boosts) save.boosts = { bolt: 2, grab: 2, squish: 1, slot: 1, fire: 1, wild: 1, seat: 1 };
  if (!save.stars) {
    // Saves from before stars existed: every level already passed counts as one star.
    save.stars = [];
    for (i = 0; i < save.unlocked - 1; i++) save.stars[i] = 1;
  }
  // Queue Jump was an upgrade; it is now the Grabber booster.
  if (save.up.jump) {
    save.boosts.grab = (save.boosts.grab || 0) + 2 * save.up.jump;
    delete save.up.jump;
  }
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
function starsFor(lv, sec) {
  return sec <= lv.par * 1.6 ? 3 : sec <= lv.par * 2.4 ? 2 : 1;
}

// pre = { fire, wild, seat }: boosters chosen on the level card
function startLevel(i, pre) {
  pre = pre || {};
  levelIndex = i;
  level = Deal.get(i, LEVELS);
  game = new Game(level, {
    slots: save.up.slot, seats: (save.up.seat || 0) + (pre.seat ? 1 : 0),
    turbo: save.up.turbo, rescues: save.up.wind, wild: pre.wild ? 12 : 0
  });
  endTimer = 0;
  combo = 0;
  chain = 0;
  shownSec = -1;
  result = null;
  mode = '';
  resetFx(game);
  $('home').hidden = true;
  $('panel').hidden = true;
  $('pause').hidden = true;
  $('modal').hidden = true;
  $('tip').hidden = true;
  layout(game);
  if (pre.fire) game.firework(12);
  $('lvNum').textContent = 'Level ' + (i + 1);
  $('lvName').textContent = level.name;
  $('hint').hidden = i > 2 || clearedCount() > 2;
  syncBoosts();
  updateBar();
}

function updateBar() {
  var left = 0, i;
  for (i = 0; i < fx.vis.length; i++) if (fx.vis[i]) left++;
  $('bar').style.width = (100 * (1 - left / game.total)) + '%';
  $('left').textContent = left;
  $('hCoins').textContent = save.coins;
}

function syncBoosts() {
  IN_ROUND.forEach(function (id) {
    var n = save.boosts[id] || 0, b = $('k-' + id);
    b.querySelector('b').textContent = n || '+';
    b.querySelector('b').className = n ? '' : 'plus';
    b.className = mode === id ? 'on' : '';
  });
}

function setMode(m) {
  mode = mode === m ? '' : m;
  $('tip').hidden = !mode;
  if (mode === 'bolt') $('tip').textContent = 'Tap any cube to zap it, with the cubes of its colour touching it.';
  if (mode === 'grab') $('tip').textContent = 'Tap any jelly you can see in the hand to play it now, even one behind the front.';
  syncBoosts();
}

function useBoost(id) {
  save.boosts[id]--;
  save.boostUses = (save.boostUses || 0) + 1;
  track('boost', 1);
  persist();
  mode = '';
  $('tip').hidden = true;
  syncBoosts();
  tone(620, 0.15, 'triangle', 0.12, 1.7);
}

function tapBoost(id) {
  if (!game || game.status !== 'playing') return;
  if (!(save.boosts[id] > 0)) { openBuy(id); return; }
  if (id === 'bolt' || id === 'grab') { setMode(id); return; }
  if (id === 'squish') {
    if (game.squish()) useBoost('squish');
    else toast('Squish needs two landed jellies of the same colour');
    return;
  }
  if (id === 'slot') {
    if (game.maxSlots >= 8) { toast('The belt is as long as it gets'); return; }
    game.addSlot();
    useBoost('slot');
  }
}

function showPanel(won) {
  var lv = level, btns = $('pBtns');
  btns.textContent = '';
  $('pStars').textContent = '';
  $('pGain').textContent = '';
  if (won) {
    $('pTitle').textContent = 'Cleared!';
    $('pStars').appendChild(starRow(result.stars));
    $('pText').textContent = 'Time ' + clockText(result.time) + '. Three stars at ' + clockText(lv.par * 1.6) + ' or faster.';
    $('pGain').appendChild(coinRow('+' + result.coins));
    $('pGain').appendChild(el('span', '', E(0x1F511) + ' +' + result.keys));
    btns.appendChild(btn('go', 'Next level', function () {
      showHome('map');
      openLevel(levelIndex + 1);
    }));
    btns.appendChild(btn('go plain', 'Home', function () { showHome('map'); }));
  } else {
    var full = game.reason === 'full';
    $('pTitle').textContent = full ? 'No room to land' : 'Out of moves';
    $('pText').textContent = full
      ? 'A jelly came back from its lap with ammo left, and every place on the belt was taken.'
      : 'No jelly left can reach a cube of its own colour.';
    if (full) {
      var have = save.boosts.slot || 0, cost = 80;
      btns.appendChild(btn('go', have ? 'Use Extra Place (' + have + ' left)' : 'Extra place for ' + cost + ' coins', function () {
        if (have) {
          save.boosts.slot--;
          track('boost', 1);
        } else {
          if (save.coins < cost) { toast('Not enough coins'); return; }
          save.coins -= cost;
        }
        refundHeart();
        save.streak = save.streakBefore || 0;
        persist();
        game.revive();
        endTimer = 0;
        $('panel').hidden = true;
        layout(game);
        syncBoosts();
        updateBar();
      }));
      if (!have && save.coins < cost) btns.lastChild.disabled = true;
    }
    btns.appendChild(btn('go alt', canPlay() ? 'Try again' : 'No lives left', function () {
      if (!canPlay()) { openHearts(); return; }
      showHome('map');
      openLevel(levelIndex);
    }));
    btns.appendChild(btn('go plain', 'Home', function () { showHome('map'); }));
  }
  $('panel').className = won ? 'overlay won' : 'overlay lost';
  $('panel').hidden = false;
}

function winRound() {
  var stars = starsFor(level, game.time), prev = save.stars[levelIndex] || 0;
  var coins = 20 + 15 * Math.max(0, stars - prev), keys = 1 + (stars === 3 ? 1 : 0);
  save.stars[levelIndex] = Math.max(prev, stars);
  save.coins += coins;
  save.keys += keys;
  save.wins++;
  if (save.unlocked < levelIndex + 2) save.unlocked = levelIndex + 2;
  if (game.peak <= 2) save.light = 1;
  if (game.time < 20) save.quick = 1;
  save.streak++;
  save.bestStreak = Math.max(save.bestStreak, save.streak);
  track('win', 1);
  track('stars', stars);
  if (stars === 3) track('three', 1);
  result = { stars: stars, coins: coins, keys: keys, time: game.time };
  persist();
  checkAwards();
}

function loseRound() {
  save.streakBefore = save.streak;
  save.streak = 0;
  loseHeart();
  persist();
}

// Leaving a round that has started costs a life and the streak.
function abandon() {
  if (game && game.status === 'playing' && game.sent > 0) {
    save.streak = 0;
    loseHeart();
    persist();
  }
}

// ---------- events from the rules ----------

function handle(ev) {
  var c = view.cell, j = ev.jelly, en, x, y;
  if (ev.type === 'send') {
    if (ev.slot !== undefined) {
      fx.pos[j.id] = { x: slotX(game, ev.slot), y: view.trayY, done: false };
    } else if (ev.col !== undefined) {
      fx.pos[j.id] = { x: colX(game, ev.col), y: handY(Math.min(ev.depth, 3)), done: false };
      if (!ev.depth) fx.slide[ev.col] = 1;
    } else {
      en = entryXY(game);
      fx.pos[j.id] = { x: en[0], y: en[1] + c * 3, done: false };
    }
    if (!game.auto) {
      tone(ev.slot !== undefined ? 392 : 330, 0.12, 'triangle', 0.12, 1.8);
      buzz(8);
    }
    track('send', 1);
    $('hint').hidden = true;
  } else if (ev.type === 'shot') {
    var x1 = px(game, ev.cell % game.w), y1 = py(game, Math.floor(ev.cell / game.w));
    var x0 = px(game, ev.x), y0 = py(game, ev.y);
    var dist = Math.abs(x1 - x0) + Math.abs(y1 - y0);
    fx.shots.push({ x0: x0, y0: y0, x1: x1, y1: y1, t: 0, dur: 0.05 + dist / (c * 90), key: ev.color, cell: ev.cell });
    fx.kick[j.id] = 1;
    save.pops++;
    track('pop', 1);
  } else if (ev.type === 'blast') {
    en = entryXY(game);
    ev.cells.forEach(function (b, n) {
      x = px(game, b.cell % game.w);
      y = py(game, Math.floor(b.cell / game.w));
      var from = ev.kind === 'firework' ? [en[0], en[1]] : [x, y - c * 0.01];
      fx.shots.push({ x0: from[0], y0: from[1], x1: x, y1: y, t: -n * 0.04, dur: ev.kind === 'firework' ? 0.35 : 0.08, key: b.color, cell: b.cell });
    });
    save.pops += ev.cells.length;
    track('pop', ev.cells.length);
    tone(ev.kind === 'firework' ? 300 : 900, 0.3, 'sawtooth', 0.06, ev.kind === 'firework' ? 3 : 0.3);
    buzz(25);
  } else if (ev.type === 'park') {
    en = entryXY(game);
    fx.pos[j.id] = { x: en[0], y: en[1], done: false };
    tone(260, 0.1, 'sine', 0.07, 0.8);
  } else if (ev.type === 'retire') {
    if (ev.slot !== undefined) burst(slotX(game, ev.slot), view.trayY, j.color, 12, c * 7);
    else burst(px(game, ev.x), py(game, ev.y), j.color, 12, c * 7);
    if (!game.auto) tone(660, 0.18, 'sine', 0.1, 1.5);
  } else if (ev.type === 'discard') {
    burst(colX(game, ev.col), frontY(), j.color, 10, c * 6);
  } else if (ev.type === 'full') {
    fx.deny = 1;
    tone(140, 0.12, 'square', 0.06, 0.8);
    buzz(20);
    if (clock - lastFull > 2) toast('No free seat on the loop');
    lastFull = clock;
  } else if (ev.type === 'rescue') {
    save.saved = 1;
    toast('Second Wind: back to the hand');
    buzz(30);
    checkAwards();
  } else if (ev.type === 'squish') {
    burst(slotX(game, ev.from), view.trayY, j.color, 14, c * 6);
    fx.pos[j.id] = null;
  } else if (ev.type === 'slot') {
    layout(game);
  } else if (ev.type === 'auto') {
    fx.flash = 1;
    toast('Quick finish!');
    tone(523, 0.12, 'triangle', 0.1, 2);
    save.autos++;
    track('auto', 1);
    mode = '';
    $('tip').hidden = true;
    syncBoosts();
  } else if (ev.type === 'won') {
    winRound();
  } else if (ev.type === 'lost') {
    fx.shake = 1;
    tone(200, 0.4, 'sawtooth', 0.08, 0.4);
    buzz(60);
    loseRound();
  }
}

// ---------- loop ----------

function running() {
  return game && $('home').hidden && $('pause').hidden && $('modal').hidden;
}

var lastFrame = 0;
function frame(now) {
  var dt = Math.min(0.05, (now - lastFrame) / 1000 || 0), i, steps;
  lastFrame = now;
  clock += dt;
  if (running()) {
    steps = save.fast ? 4 : 2;
    for (i = 0; i < steps; i++) game.step(dt * (save.fast ? 2 : 1) / steps);
    while (game.events.length) handle(game.events.shift());
    if (Math.floor(game.time) !== shownSec) {
      shownSec = Math.floor(game.time);
      $('time').textContent = clockText(shownSec);
    }
  }
  if (game && $('home').hidden) {
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
    draw(game, clock, mode);
  }
  requestAnimationFrame(frame);
}

// ---------- input ----------

canvas.addEventListener('pointerdown', function (e) {
  e.preventDefault();
  if (!running() || game.status !== 'playing') return;
  var x = e.clientX, y = e.clientY, s, c;
  if (mode === 'bolt') {
    c = cellAt(game, x, y);
    if (c >= 0 && game.grid[c]) {
      game.bolt(c, 10);
      useBoost('bolt');
    } else {
      setMode('bolt');   // a tap anywhere else puts the Bolt away again
    }
    return;
  }
  if (mode === 'grab') {
    c = columnAt(game, x, y);
    if (c >= 0 && game.hand[c].length) {
      if (game.send(c, depthAt(game, c, y))) useBoost('grab');
    }
    return;
  }
  if (game.auto) return;
  s = slotAt(game, x, y);
  if (s >= 0) {
    game.relaunch(s);
    return;
  }
  c = columnAt(game, x, y);
  if (c >= 0) game.send(c, 0);
});
document.addEventListener('touchmove', function (e) {
  if (!e.target.closest('.page,#map,.card')) e.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
window.addEventListener('resize', function () { if (game) layout(game); });
window.addEventListener('orientationchange', function () { setTimeout(function () { if (game) layout(game); }, 250); });
window.addEventListener('pagehide', persist);

function syncPause() {
  $('tSound').textContent = save.muted ? 'Off' : 'On';
  $('tSound').className = save.muted ? 'off' : '';
  $('tSpeed').textContent = save.fast ? '2x' : '1x';
  $('tSpeed').className = save.fast ? '' : 'off';
  $('qNote').textContent = game && game.sent > 0 ? 'Leaving a round you have started costs a life and ends your win streak.' : '';
}
$('bPause').onclick = function () {
  if (!game || game.status !== 'playing') return;
  syncPause();
  $('pause').hidden = false;
};
$('bResume').onclick = function () { $('pause').hidden = true; };
$('tSound').onclick = function () { save.muted = !save.muted; persist(); syncPause(); };
$('tSpeed').onclick = function () { save.fast = !save.fast; persist(); syncPause(); };
$('bRestart').onclick = function () {
  abandon();
  showHome('map');
  if (canPlay()) openLevel(levelIndex); else openHearts();
};
$('bQuit').onclick = function () {
  abandon();
  showHome('map');
};
IN_ROUND.forEach(function (id) { $('k-' + id).onclick = function () { tapBoost(id); }; });
['map', 'shop', 'up', 'awards'].forEach(function (p) { $('n-' + p).onclick = function () { setPage(p); }; });
$('mX').onclick = closeModal;
$('bPlay').onclick = function () {
  if (!canPlay()) { openHearts(); return; }
  openLevel(save.unlocked - 1);
};
$('tCoins').onclick = function () { setPage('shop'); };
$('tHearts').onclick = openHearts;
$('bSet').onclick = openSettings;
$('sTasks').onclick = openTasks;
$('sRoad').onclick = openRoad;
$('sGift').onclick = openGift;
$('sStreak').onclick = openStreak;

setInterval(function () {
  if ($('home').hidden) return;
  regen();
  updateTop();
}, 1000);

normalise();
regen();
rollTasks();
checkAwards();
persist();
showHome('map');
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js');
}
