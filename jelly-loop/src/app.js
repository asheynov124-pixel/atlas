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
var lastFull = 0, lastLock = 0;
var puzzleNo = -1;   // which puzzle is being played, or -1
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
  // Ten hand-drawn levels (21-30) were slotted in before the endless ones. A player who
  // was already past level 21 keeps their place: the endless levels they had cleared move
  // up by ten, and the new levels show up behind them on the map, open and marked NEW.
  if (!(save.v >= 5) && save.unlocked > 21 && save.stars) {
    var old = save.stars.slice(20);
    save.stars = save.stars.slice(0, 20).concat([0, 0, 0, 0, 0, 0, 0, 0, 0, 0], old);
    save.unlocked += 10;
  }
  // Fifteen more (31-45) went in the same way in the next version.
  if (!(save.v >= 6) && save.unlocked > 31 && save.stars) {
    var old2 = save.stars.slice(30), gap = [], g;
    for (g = 0; g < 15; g++) gap.push(0);
    save.stars = save.stars.slice(0, 30).concat(gap, old2);
    save.unlocked += 15;
  }
  // Four boss levels took the places of four pictures (levels 10, 20, 30 and 40), and those
  // pictures moved to the end as 46-49. Endless levels a player had cleared move up by four.
  if (!(save.v >= 7) && save.unlocked > 46 && save.stars) {
    save.stars = save.stars.slice(0, 45).concat([0, 0, 0, 0], save.stars.slice(45));
    save.unlocked += 4;
  }
  save.v = 7;
  var DEF = {
    unlocked: 1, coins: 0, pops: 0, chain: 0, light: 0, quick: 0, saved: 0, autos: 0,
    muted: false, fast: false, hearts: 5, heartAt: Date.now(), infUntil: 0,
    streak: 0, bestStreak: 0, keys: 0, roadGot: 0, giftDay: '', giftN: 0,
    taskDay: '', tasks: [], taskPts: 0, chestsGot: [], wins: 0,
    seen: {}, iceCracked: 0, cratesBroken: 0, dailyDay: '', dailyWins: 0,
    spins: 0, spinDay: '', paidDay: '', paidSpins: 0, dealDay: '',
    theme: 'night', face: 'classic', looks: ['theme:night', 'face:classic'],
    fevers: 0, megas: 0, unlocks: 0, bossWins: 0, puzzles: {}, hintsUsed: 0, albumGot: {}
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
  puzzleNo = -1;
  level = i === DAILY ? dailyLevel() : Deal.get(i, LEVELS);
  game = new Game(level, {
    slots: save.up.slot, seats: (save.up.seat || 0) + (pre.seat ? 1 : 0),
    turbo: save.up.turbo, rescues: save.up.wind, wild: pre.wild ? 12 : 0, fever: true
  });
  // From level 3 on, one jelly in the hand is a gold Mega jelly with double ammo.
  if (i >= 2 || i === DAILY) {
    if (game.makeMega(Deal.rng(i === DAILY ? dailyIndex() : i * 31 + 7))) save.megas++;
  }
  begin(pre);
}

// Puzzles: one seat, a short belt, a fixed number of sends. No lives, no boosters, no Fever.
function startPuzzle(k) {
  levelIndex = PUZZLE;
  puzzleNo = k;
  level = PUZZLES[k];
  game = new Game(level, {});
  begin({});
}

function begin(pre) {
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
  // Fill the header first: the board is sized to the space left under it.
  var i = levelIndex, puz = puzzleNo >= 0;
  $('time').textContent = puz ? movesText() : clockText(0);
  $('lvNum').textContent = puz ? 'Puzzle ' + (puzzleNo + 1) : i === DAILY ? 'Daily' : (level.boss ? 'BOSS ' : 'Level ') + (i + 1);
  $('lvName').textContent = level.name;
  $('hint').textContent = puz
    ? 'One jelly rides at a time and the belt has ' + game.maxSlots + ' places. Clear the picture in ' + game.moves + ' sends. Stuck? Tap the bulb for a hint.'
    : 'Tap a jelly: it rides once round the picture, popping cubes of its colour, then lands on the belt. Tap a landed jelly to send it again. If one comes back to a full belt, the round is lost.';
  $('hint').hidden = puz ? puzzleNo > 0 || !!save.puzzles[0] : i === DAILY || i > 2 || clearedCount() > 2;
  $('ftrack').hidden = puz;
  $('bar').className = level.boss ? 'boss' : '';
  IN_ROUND.forEach(function (id) { $('k-' + id).hidden = puz; });
  $('k-hint').hidden = !puz;
  syncBoosts();
  updateBar();
  layout(game);
  // in a puzzle the first-time tip sits above the hand, which must stay in view
  $('hint').style.bottom = puz ? (view.h - view.handTop + 10) + 'px' : '';
  if (pre.fire) game.firework(12);
  showIntros(level);
}

function updateBar() {
  var left = 0, i;
  for (i = 0; i < fx.vis.length; i++) left += cubeHits(fx.vis[i]);
  $('bar').style.width = (100 * (level.boss ? left / game.total : 1 - left / game.total)) + '%';
  $('left').textContent = level.boss ? left + ' HP' : left + ' left';
  $('hCoins').textContent = save.coins;
}

// The Fever meter under the progress bar: filling, or burning down while Fever lasts.
function updateFever() {
  var f = $('fbar'), hot = game.fever > 0;
  f.style.width = (100 * (hot ? game.fever / FEVER_TIME : game.heat / FEVER_HEAT)) + '%';
  f.className = hot ? 'hot' : '';
}

function movesText() {
  var n = game.moves - game.sent;
  return n + (n === 1 ? ' send' : ' sends') + ' left';
}

function syncBoosts() {
  IN_ROUND.forEach(function (id) {
    var n = save.boosts[id] || 0, b = $('k-' + id);
    b.querySelector('b').textContent = n || '+';
    b.querySelector('b').className = n ? '' : 'plus';
    b.className = mode === id ? 'on' : '';
  });
  var h = $('k-hint').querySelector('b');
  h.textContent = HINT_COST;
  h.className = 'cost';
}

// Puzzle hint: search from where the round stands for the fewest sends that still clear it,
// and ring the jelly to send next. Paid only when a way is found.
var HINT_COST = 30;
function tapHint() {
  if (!game || game.status !== 'playing' || puzzleNo < 0) return;
  if (game.riders()) { toast('Wait for the jelly to come round'); return; }
  if (save.coins < HINT_COST) { toast('A hint costs ' + HINT_COST + ' coins'); return; }
  var res = Deal.solve(game.clone(), game.moves - game.sent, 40000);
  if (!res.path) { toast('No way to clear it from here. Try again!'); return; }
  save.coins -= HINT_COST;
  save.hintsUsed++;
  persist();
  fx.hint = res.path[0];
  tone(880, 0.2, 'sine', 0.1, 1.5);
  updateBar();
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
  if (puzzleNo >= 0) {
    $('pTitle').textContent = won ? 'Solved!' : 'Out of sends';
    $('pText').textContent = won
      ? 'Cleared in ' + game.sent + ' sends.' + (result.first ? '' : ' You had solved this one before.')
      : game.reason === 'full' ? 'A jelly came back to a full belt. Try a different order.' : 'The sends ran out before the picture was cleared. Try a different order.';
    if (won) {
      $('pStars').textContent = E(0x2705);
      if (result.coins) {
        $('pGain').appendChild(coinRow('+' + result.coins));
        $('pGain').appendChild(el('span', '', E(0x1F511) + ' +' + result.keys));
      }
    }
    var k = puzzleNo;
    if (won && k + 1 < PUZZLES.length) btns.appendChild(btn('go', 'Next puzzle', function () { startPuzzle(k + 1); }));
    btns.appendChild(btn(won ? 'go alt' : 'go', won ? 'Play again' : 'Try again', function () { startPuzzle(k); }));
    btns.appendChild(btn('go plain', 'All puzzles', function () { showHome('map'); openPuzzles(); }));
    $('panel').className = won ? 'overlay won' : 'overlay lost';
    $('panel').hidden = false;
    return;
  }
  if (won) {
    $('pTitle').textContent = result.daily ? 'Daily Challenge won!' : level.boss ? 'Boss beaten!' : 'Cleared!';
    $('pStars').appendChild(starRow(result.stars));
    $('pText').textContent = result.daily
      ? (result.first ? 'Time ' + clockText(result.time) + '. A Wild Jelly is in your bag. A new challenge arrives tomorrow.' : 'Time ' + clockText(result.time) + '. Today' + E(0x2019) + 's prize is already yours.')
      : 'Time ' + clockText(result.time) + '. Three stars at ' + clockText(lv.par * 1.6) + ' or faster.' +
        (result.boss ? ' Boss bonus: ' + result.boss + ' coins.' : '') + (result.sticker ? ' New sticker for your album!' : '');
    $('pGain').appendChild(coinRow('+' + result.coins));
    $('pGain').appendChild(el('span', '', E(0x1F511) + ' +' + result.keys));
    btns.appendChild(btn('go', result.daily ? 'Play - Level ' + save.unlocked : 'Next level', function () {
      showHome('map');
      openLevel(result.daily ? save.unlocked - 1 : levelIndex + 1);
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
  if (puzzleNo >= 0) {
    var firstSolve = !save.puzzles[puzzleNo];
    result = { first: firstSolve, coins: firstSolve ? 40 : 0, keys: firstSolve ? 1 : 0 };
    if (firstSolve) {
      save.puzzles[puzzleNo] = 1;
      save.coins += 40;
      save.keys += 1;
    }
    save.wins++;
    track('win', 1);
    persist();
    checkAwards();
    return;
  }
  var stars = starsFor(level, game.time), daily = levelIndex === DAILY, prev = daily ? 3 : save.stars[levelIndex] || 0;
  var coins = 20 + 15 * Math.max(0, stars - prev), keys = 1 + (stars === 3 ? 1 : 0), first = false;
  if (daily) {
    first = !dailyDone();
    if (first) {
      save.dailyDay = today();
      save.dailyWins++;
      grant(DAILY_PRIZE);
      coins = 20 + DAILY_PRIZE.coins;
      keys = 3;
      save.coins += 20;
    } else {
      save.coins += coins;
    }
  } else {
    save.stars[levelIndex] = Math.max(prev, stars);
    save.coins += coins;
  }
  // a boss pays 100 more the first time it is beaten
  var bossBonus = 0;
  if (level.boss && !daily) {
    save.bossWins++;
    if (!prev) { bossBonus = 100; save.coins += 100; coins += 100; }
  }
  var sticker = !daily && !prev && levelIndex < LEVELS.length;
  save.keys += keys;
  save.wins++;
  if (!daily && save.unlocked < levelIndex + 2) save.unlocked = levelIndex + 2;
  if (game.peak <= 2) save.light = 1;
  if (game.time < 20) save.quick = 1;
  save.streak++;
  save.bestStreak = Math.max(save.bestStreak, save.streak);
  track('win', 1);
  track('stars', stars);
  if (stars === 3) track('three', 1);
  result = { stars: stars, coins: coins, keys: keys, time: game.time, daily: daily, first: first, boss: bossBonus, sticker: sticker };
  persist();
  checkAwards();
}

function loseRound() {
  if (puzzleNo >= 0) return;   // puzzles cost nothing to lose
  save.streakBefore = save.streak;
  save.streak = 0;
  loseHeart();
  persist();
}

// Leaving a round that has started costs a life and the streak.
function abandon() {
  if (game && game.status === 'playing' && game.sent > 0 && puzzleNo < 0) {
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
    fx.hint = null;
    $('hint').hidden = true;
    if (puzzleNo >= 0) $('time').textContent = movesText();
  } else if (ev.type === 'shot') {
    var x1 = px(game, ev.cell % game.w), y1 = py(game, Math.floor(ev.cell / game.w));
    var x0 = px(game, ev.x), y0 = py(game, ev.y);
    var dist = Math.abs(x1 - x0) + Math.abs(y1 - y0);
    fx.shots.push({ x0: x0, y0: y0, x1: x1, y1: y1, t: ev.bonus ? -0.06 : 0, dur: 0.05 + dist / (c * 90), key: ev.color, cell: ev.cell, to: ev.to, bonus: ev.bonus });
    fx.kick[j.id] = 1;
    if (ev.bonus) sprinkle(x1, y1, 'star', 'Y', 0, -c, 0.5, c * 0.4);
    if (ev.to) {
      save.iceCracked++;
    } else {
      save.pops++;
      track('pop', 1);
    }
  } else if (ev.type === 'blast') {
    en = entryXY(game);
    ev.cells.forEach(function (b, n) {
      x = px(game, b.cell % game.w);
      y = py(game, Math.floor(b.cell / game.w));
      var from = ev.kind === 'firework' ? [en[0], en[1]] : [x, y - c * 0.01];
      fx.shots.push({ x0: from[0], y0: from[1], x1: x, y1: y, t: -n * 0.04, dur: ev.kind === 'firework' ? 0.35 : 0.08, key: b.color, cell: b.cell, to: b.to });
      if (b.color === '#') save.cratesBroken++;
      else if (b.to) save.iceCracked++;
      else { save.pops++; track('pop', 1); }
    });
    tone(ev.kind === 'firework' ? 300 : 900, 0.3, 'sawtooth', 0.06, ev.kind === 'firework' ? 3 : 0.3);
    buzz(25);
  } else if (ev.type === 'crate') {
    x = px(game, ev.cell % game.w);
    y = py(game, Math.floor(ev.cell / game.w));
    fx.vis[ev.cell] = '';
    fx.pops.push({ x: x, y: y, key: '#', t: 0 });
    burst(x, y, '#', 14, c * 6);
    tone(150, 0.16, 'square', 0.07, 0.6);
    save.cratesBroken++;
  } else if (ev.type === 'reveal') {
    burst(colX(game, ev.col), frontY(), j.color, 12, c * 5);
    tone(880, 0.12, 'sine', 0.08, 1.4);
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
  } else if (ev.type === 'fever') {
    save.fevers++;
    track('fever', 1);
    fx.flash = 0.7;
    toast('FEVER! Double shots');
    [523, 659, 784, 1047].forEach(function (f, n) { setTimeout(function () { tone(f, 0.12, 'square', 0.06, 1.2); }, n * 70); });
    buzz(40);
    checkAwards();
  } else if (ev.type === 'feverEnd') {
    tone(330, 0.25, 'sine', 0.06, 0.6);
  } else if (ev.type === 'locked') {
    fx.deny = 1;
    tone(140, 0.12, 'square', 0.06, 0.8);
    if (clock - lastLock > 2) toast('Chained! Pop a ' + E(0x1F511) + ' key cube to free it');
    lastLock = clock;
  } else if (ev.type === 'unlock') {
    x = px(game, ev.cell % game.w);
    y = py(game, Math.floor(ev.cell / game.w));
    for (var n = 0; n < 10; n++) sprinkle(x, y, 'star', 'Y', (Math.random() - 0.5) * c * 6, (Math.random() - 0.5) * c * 6, 0.6, c * 0.35);
    if (j) {
      save.unlocks++;
      burst(colX(game, ev.col), handY(Math.min(ev.depth, 3)), 'Y', 16, c * 6);
      toast('Unlocked!');
    }
    tone(988, 0.1, 'triangle', 0.1, 1.5);
    setTimeout(function () { tone(1319, 0.18, 'triangle', 0.1, 1.2); }, 90);
  } else if (ev.type === 'grow') {
    ev.cells.forEach(function (cell) {
      fx.vis[cell] = game.grid[cell];
      fx.grow[cell] = 0;
      burst(px(game, cell % game.w), py(game, Math.floor(cell / game.w)), 'G', 3, c * 4);
    });
    ev.jellies.forEach(function (m) { burst(colX(game, m.col), frontY(), m.jelly.color, 10, c * 5); });
    fx.shake = 0.35;
    tone(110, 0.35, 'sawtooth', 0.08, 1.8);
    toast(level.name + ' grows back ' + ev.cells.length + ' cubes!');
    updateBar();
  } else if (ev.type === 'nomoves') {
    if (clock - lastFull > 2) toast('No sends left');
    lastFull = clock;
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
    if (puzzleNo >= 0) {
      if (shownSec !== -2) { shownSec = -2; $('time').textContent = movesText(); }
    } else if (Math.floor(game.time) !== shownSec) {
      shownSec = Math.floor(game.time);
      $('time').textContent = clockText(shownSec);
    }
    if (puzzleNo < 0) updateFever();
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
          setTimeout(function () { tone(1047, 0.45, 'triangle', 0.1); }, 400);
          for (i = 0; i < 70; i++) burst(Math.random() * view.w, view.cy - view.cell * 3, 'RYBGPCON'.charAt(i % 8), 1, view.cell * 14);
          // the finished picture comes back to life before the result card
          startAlive(game, level);
        }
      }
      if (clock - endTimer > (game.status === 'won' ? 2.6 : 0.9)) showPanel(game.status === 'won');
    }
    draw(game, clock, mode);
  }
  requestAnimationFrame(frame);
}

// ---------- input ----------

canvas.addEventListener('pointerdown', function (e) {
  e.preventDefault();
  // a tap during the picture's victory dance skips straight to the result card
  if (running() && game.status === 'won' && fx.alive && $('panel').hidden && endTimer) endTimer = clock - 3;
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
  $('qNote').textContent = game && game.sent > 0 && puzzleNo < 0 ? 'Leaving a round you have started costs a life and ends your win streak.' : '';
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
  if (puzzleNo >= 0) { startPuzzle(puzzleNo); return; }
  showHome('map');
  if (canPlay()) openLevel(levelIndex); else openHearts();
};
$('bQuit').onclick = function () {
  abandon();
  showHome('map');
};
IN_ROUND.forEach(function (id) { $('k-' + id).onclick = function () { tapBoost(id); }; });
$('k-hint').onclick = tapHint;
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
$('sDaily').onclick = function () {
  if (!canPlay()) { openHearts(); return; }
  openLevel(DAILY);
};
$('sWheel').onclick = openWheel;
$('sPuzzle').onclick = openPuzzles;
$('sAlbum').onclick = function () { openAlbum(); };

setInterval(function () {
  if ($('home').hidden) return;
  regen();
  updateTop();
}, 1000);

normalise();
applyLooks();
regen();
rollTasks();
checkAwards();
persist();
showHome('map');
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js');
}
