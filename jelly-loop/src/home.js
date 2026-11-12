// home.js - everything outside the round itself: the level map, lives, boosters, shop,
// upgrades, awards, daily tasks, the daily gift, the win streak and the Star Road.
// Declarations only. app.js owns `save` and starts everything.

var STAR = String.fromCharCode(9733);
function E(cp) { return String.fromCodePoint(cp); }

// Boosters. The first four are used during a round from the bar at the bottom; the
// last three are chosen on the level card before a round starts.
var BOOSTS = {
  bolt: { name: 'Bolt', icon: 0x26A1, price: 60, text: 'Tap any cube: it pops, with the cubes of its colour touching it (up to 10).' },
  grab: { name: 'Grabber', icon: 0x1F9F2, price: 40, text: 'Play any jelly you can see in the hand, not just the front one.' },
  squish: { name: 'Squish', icon: 0x1F517, price: 50, text: 'Landed jellies of the same colour merge into one, freeing places on the belt.' },
  slot: { name: 'Extra Place', icon: 0x2795, price: 70, text: 'One more place on the belt for this round.' },
  fire: { name: 'Firework', icon: 0x1F386, price: 50, text: 'Pops 12 cubes on the outside of the picture before you start.' },
  wild: { name: 'Wild Jelly', icon: 0x1F308, price: 70, text: 'Starts the round on the loop with a jelly that pops any colour (12 ammo).' },
  seat: { name: 'Extra Seat', icon: 0x1F4BA, price: 40, text: 'One more seat on the loop for this round.' }
};
var IN_ROUND = ['bolt', 'grab', 'squish', 'slot'];
var PRE = ['fire', 'wild', 'seat'];

// cost[n] is the price of going from level n to n + 1.
var UPGRADES = [
  { id: 'turbo', name: 'Turbo Loop', icon: 0x23E9, cost: [60, 120, 200],
    text: 'Jellies travel round the loop 15% faster for each level of this upgrade.' },
  { id: 'slot', name: 'Bigger Belt', icon: 0x1F4E6, cost: [300],
    text: 'The belt has six places instead of five, every round.' },
  { id: 'seat', name: 'Wider Loop', icon: 0x1F3A2, cost: [250],
    text: 'The loop has six seats instead of five, every round.' },
  { id: 'wind', name: 'Second Wind', icon: 0x1F32C, cost: [120, 240],
    text: 'A jelly with nowhere to land goes back to the hand instead of ending the round. Once per round for each level.' }
];

function clearedCount() { return save.stars.filter(function (n) { return n > 0; }).length; }
function starCount() { return save.stars.reduce(function (a, n) { return a + (n || 0); }, 0); }
function upgradeCount() { return UPGRADES.reduce(function (a, u) { return a + (save.up[u.id] || 0); }, 0); }
function firstStars(n) { return save.stars.slice(0, n).reduce(function (a, s) { return a + (s || 0); }, 0); }

// An award is earned when have() reaches goal. It pays its coins once.
var AWARDS = [
  { id: 'first', name: 'First Pop', text: 'Clear a level.', coins: 20, goal: 1, have: clearedCount },
  { id: 'half', name: 'Getting Going', text: 'Clear 10 levels.', coins: 50, goal: 10, have: clearedCount },
  { id: 'all', name: 'Full Gallery', text: 'Clear the 45 hand-drawn levels.', coins: 200, goal: 45, have: clearedCount },
  { id: 'fifty', name: 'Endless Road', text: 'Clear 50 levels.', coins: 300, goal: 50, have: clearedCount },
  { id: 'star10', name: 'Star Pupil', text: 'Collect 10 stars.', coins: 40, goal: 10, have: starCount },
  { id: 'star25', name: 'Constellation', text: 'Collect 25 stars.', coins: 100, goal: 25, have: starCount },
  { id: 'perfect', name: 'Perfectionist', text: 'Three stars on each of the first 20 levels.', coins: 300, goal: 60, have: function () { return firstStars(20); } },
  { id: 'pop500', name: 'Cube Crusher', text: 'Pop 500 cubes.', coins: 30, goal: 500, have: function () { return save.pops; } },
  { id: 'pop3000', name: 'Demolition Crew', text: 'Pop 3,000 cubes.', coins: 120, goal: 3000, have: function () { return save.pops; } },
  { id: 'chain', name: 'Chain Reaction', text: 'Pop 30 cubes in one unbroken run.', coins: 40, goal: 30, have: function () { return save.chain; } },
  { id: 'light', name: 'Light Touch', text: 'Clear a level with never more than 2 jellies on the belt.', coins: 60, goal: 1, have: function () { return save.light; } },
  { id: 'quick', name: 'Quick Hands', text: 'Clear a level in under 20 seconds.', coins: 50, goal: 1, have: function () { return save.quick; } },
  { id: 'streak5', name: 'On a Roll', text: 'Win 5 levels in a row.', coins: 80, goal: 5, have: function () { return save.bestStreak; } },
  { id: 'auto10', name: 'Autopilot', text: 'Reach 10 quick finishes.', coins: 60, goal: 10, have: function () { return save.autos; } },
  { id: 'saved', name: 'Saved by the Wind', text: 'Get a jelly back with Second Wind.', coins: 30, goal: 1, have: function () { return save.saved; } },
  { id: 'spender', name: 'Big Spender', text: 'Buy 3 upgrades.', coins: 50, goal: 3, have: upgradeCount },
  { id: 'ice', name: 'Ice Breaker', text: 'Crack 100 ice cubes.', coins: 60, goal: 100, have: function () { return save.iceCracked; } },
  { id: 'crate', name: 'Crate Smasher', text: 'Break 50 crates.', coins: 60, goal: 50, have: function () { return save.cratesBroken; } },
  { id: 'daily5', name: 'Daily Devotee', text: 'Win 5 Daily Challenges.', coins: 150, goal: 5, have: function () { return save.dailyWins; } },
  { id: 'spin10', name: 'High Roller', text: 'Spin the Lucky Wheel 10 times.', coins: 50, goal: 10, have: function () { return save.spins; } },
  { id: 'style', name: 'Style Icon', text: 'Buy 3 looks in the shop.', coins: 80, goal: 3, have: function () { return save.looks.length - 2; } }
];

function checkAwards() {
  var any = false;
  AWARDS.forEach(function (a) {
    if (save.awards[a.id] || a.have() < a.goal) return;
    save.awards[a.id] = 1;
    save.coins += a.coins;
    any = true;
    toast('Award: ' + a.name + '  +' + a.coins);
  });
  if (any) persist();
}

// ---------- rewards ----------

function grant(r) {
  var k;
  if (r.coins) save.coins += r.coins;
  if (r.inf) giveUnlimited(r.inf);
  if (r.boosts) for (k in r.boosts) save.boosts[k] = (save.boosts[k] || 0) + r.boosts[k];
  persist();
}
function describe(r) {
  var out = [], k;
  if (r.coins) out.push(r.coins + ' coins');
  if (r.boosts) for (k in r.boosts) out.push(r.boosts[k] + ' ' + BOOSTS[k].name);
  if (r.inf) out.push(r.inf + ' min of unlimited lives');
  return out.join(' + ');
}
// A few words for a small tile: the first part of the reward, with '+' if there is more.
function shortReward(r) {
  var parts = describe(r).split(' + ');
  return parts[0].replace(' of unlimited lives', ' lives') + (parts.length > 1 ? ' +' : '');
}
function rewardIcon(r) {
  if (r.inf) return E(0x2764);
  if (r.boosts) return E(BOOSTS[Object.keys(r.boosts)[0]].icon);
  return E(0x1FA99);
}

// ---------- lives ----------

var MAX_HEARTS = 5, HEART_MS = 15 * 60000;
function unlimited() { return save.infUntil > Date.now(); }
function regen() {
  var now = Date.now();
  if (save.hearts >= MAX_HEARTS) { save.heartAt = now; return; }
  var n = Math.floor((now - save.heartAt) / HEART_MS);
  if (n > 0) {
    save.hearts = Math.min(MAX_HEARTS, save.hearts + n);
    save.heartAt = save.hearts >= MAX_HEARTS ? now : save.heartAt + n * HEART_MS;
  }
}
function canPlay() { regen(); return unlimited() || save.hearts > 0; }
function loseHeart() {
  if (unlimited()) return;
  regen();
  if (save.hearts >= MAX_HEARTS) save.heartAt = Date.now();
  save.hearts = Math.max(0, save.hearts - 1);
  persist();
}
function refundHeart() {
  if (!unlimited()) save.hearts = Math.min(MAX_HEARTS, save.hearts + 1);
}
function giveUnlimited(min) { save.infUntil = Math.max(save.infUntil, Date.now()) + min * 60000; }

function fmt(ms) {
  var s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
  if (h) return h + 'h ' + m + 'm';
  return m + ':' + (s % 60 < 10 ? '0' : '') + s % 60;
}
function heartLabel() {
  if (unlimited()) return fmt(save.infUntil - Date.now());
  return save.hearts >= MAX_HEARTS ? 'Full' : fmt(save.heartAt + HEART_MS - Date.now());
}

// ---------- days, daily tasks and the daily gift ----------

function today() {
  var d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
function untilMidnight() {
  var d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) - d;
}

var TASKS = [
  { id: 'win', text: 'Win {n} levels', ns: [2, 3, 4] },
  { id: 'pop', text: 'Pop {n} cubes', ns: [300, 500, 800] },
  { id: 'stars', text: 'Earn {n} stars', ns: [4, 6, 8] },
  { id: 'boost', text: 'Use {n} boosters', ns: [1, 2, 3] },
  { id: 'three', text: 'Get 3 stars on {n} levels', ns: [1, 2] },
  { id: 'send', text: 'Send {n} jellies round the loop', ns: [40, 70, 100] },
  { id: 'auto', text: 'Reach {n} quick finishes', ns: [2, 3] },
  { id: 'spin', text: 'Spin the Lucky Wheel', ns: [1] }
];
var TASK_PTS = 25;
var CHESTS = [
  { at: 25, reward: { coins: 40 } },
  { at: 50, reward: { coins: 60, boosts: { bolt: 1, grab: 1 } } },
  { at: 100, reward: { coins: 100, boosts: { wild: 1 }, inf: 30 } }
];

function rollTasks() {
  if (save.taskDay === today()) return;
  var r = Deal.rng(today().split('-').reduce(function (a, n) { return a * 37 + Number(n); }, 7));
  var pool = TASKS.slice(), picked = [];
  while (picked.length < 4) {
    var t = pool.splice(Math.floor(r() * pool.length), 1)[0];
    picked.push({ id: t.id, n: t.ns[Math.floor(r() * t.ns.length)], have: 0 });
  }
  save.taskDay = today();
  save.tasks = picked;
  save.taskPts = 0;
  save.chestsGot = [];
}
function taskText(t) {
  var def = TASKS.filter(function (d) { return d.id === t.id; })[0];
  return def.text.replace('{n}', t.n).replace(' 1 levels', ' 1 level');
}
function track(id, amount) {
  rollTasks();
  save.tasks.forEach(function (t) {
    if (t.id !== id || t.have >= t.n) return;
    t.have = Math.min(t.n, t.have + amount);
    if (t.have >= t.n) {
      save.taskPts += TASK_PTS;
      toast('Task done: ' + taskText(t));
    }
  });
}
function chestsReady() {
  return CHESTS.filter(function (c, i) { return save.taskPts >= c.at && save.chestsGot.indexOf(i) < 0; }).length;
}

var GIFTS = [
  { coins: 30 }, { boosts: { bolt: 1 } }, { coins: 50 }, { boosts: { grab: 1, squish: 1 } },
  { coins: 80 }, { boosts: { fire: 1, wild: 1 } }, { coins: 150, inf: 30 }
];
function giftReady() { return save.giftDay !== today(); }

// ---------- win streak and the Star Road ----------

// Wins in a row unlock free pre-round boosters: 1 win a Firework, 2 a Wild Jelly too,
// 3 or more an Extra Seat as well. A loss resets the streak.
function streakFree() { return PRE.slice(0, Math.min(3, save.streak)); }

var KEYS_PER_STEP = 3;
var ROAD = [
  { coins: 30 }, { boosts: { bolt: 1 } }, { coins: 40 }, { boosts: { grab: 1 } }, { inf: 15 },
  { coins: 60 }, { boosts: { squish: 1 } }, { boosts: { wild: 1 } }, { coins: 80 },
  { boosts: { slot: 1 } }, { boosts: { fire: 1 } }, { boosts: { seat: 1 } }
];
function roadReward(i) {
  var base = ROAD[i % ROAD.length], lap = Math.floor(i / ROAD.length), r = {}, k;
  if (base.coins) r.coins = base.coins + lap * 20;
  if (base.inf) r.inf = base.inf;
  if (base.boosts) { r.boosts = {}; for (k in base.boosts) r.boosts[k] = base.boosts[k] + (lap > 1 ? 1 : 0); }
  return r;
}
function roadReady() { return Math.floor(save.keys / KEYS_PER_STEP) - save.roadGot; }

// ---------- small DOM helpers ----------

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function btn(cls, text, fn) {
  var b = el('button', cls, text);
  b.onclick = fn;
  return b;
}
function starRow(n) {
  var row = el('span', 'stars'), i;
  for (i = 0; i < 3; i++) row.appendChild(el('b', i < n ? 'on' : '', STAR));
  return row;
}
function price(n) {
  var b = el('span', 'price');
  b.appendChild(el('i', 'coin'));
  b.appendChild(el('span', '', n));
  return b;
}
function coinRow(text) {
  var s = el('span');
  s.appendChild(el('i', 'coin'));
  s.appendChild(el('span', '', text));
  return s;
}

var toasts = [], toastBusy = false;
function toast(text) {
  toasts.push(text);
  if (!toastBusy) nextToast();
}
function nextToast() {
  var t = $('toast');
  toastBusy = toasts.length > 0;
  t.hidden = !toastBusy;
  if (!toastBusy) return;
  t.textContent = toasts.shift();
  t.className = '';
  t.getBoundingClientRect();   // restart the animation
  t.className = 'show';
  tone(880, 0.14, 'triangle', 0.1, 1.5);
  setTimeout(nextToast, 2300);
}

// ---------- modal ----------

var modalClose = null;
function openModal(fill, onClose) {
  var body = $('mBody');
  body.textContent = '';
  fill(body);
  modalClose = onClose || null;
  $('modal').hidden = false;
}
function closeModal() {
  $('modal').hidden = true;
  var f = modalClose;
  modalClose = null;
  if (f) f();
}

// ---------- days ----------

function dayNum() {
  var d = new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

// ---------- board pieces: ice, crates, mystery jellies ----------

var PIECES = {
  ice: {
    name: 'Ice cubes',
    text: 'A frozen cube takes two hits. The first cracks the ice, the second pops the cube. Each hit costs a jelly one ammo, and the hand is dealt with that in mind.'
  },
  crate: {
    name: 'Crates',
    text: 'No jelly can shoot a crate, and it blocks the row and the column it sits in. It breaks when a cube right next to it pops. A Bolt or a Firework smashes crates too.'
  },
  mystery: {
    name: 'Mystery jellies',
    text: 'A jelly marked ? keeps its colour secret until it reaches the front of its column. A Grabber can pull one out early, but you will not know what you get.'
  }
};

// Which pieces a level (or a map preview of one) uses.
function piecesOf(lv) {
  var art = lv.art.join(''), out = [];
  if (/[a-z]/.test(art)) out.push('ice');
  if (art.indexOf('#') >= 0) out.push('crate');
  if ((lv.hand && lv.hand.join(' ').indexOf('?') >= 0) || lv.mystery > 0) out.push('mystery');
  return out;
}

// A small picture of a piece, drawn with the game's own brushes.
function pieceIcon(id, size) {
  var cv = document.createElement('canvas'), keep = ctx, d = Math.min(window.devicePixelRatio || 1, 3);
  cv.width = cv.height = size * d;
  cv.style.width = cv.style.height = size + 'px';
  ctx = cv.getContext('2d');
  ctx.scale(d, d);
  if (id === 'ice') { drawCube(size * 0.3, size * 0.5, size * 0.42, 'b', 1); drawCube(size * 0.72, size * 0.5, size * 0.42, 'B', 1); }
  else if (id === 'crate') drawCube(size / 2, size / 2, size * 0.6, '#', 1);
  else drawJelly(size / 2, size * 0.52, size * 0.34, '?', '?', 0, 1);
  ctx = keep;
  return cv;
}

// The first time a round has a piece the player has not met, explain it (the round waits).
function showIntros(lv) {
  var todo = piecesOf(lv).filter(function (p) { return !save.seen[p]; });
  if (!todo.length) return;
  var id = todo[0];
  save.seen[id] = 1;
  persist();
  openModal(function (b) {
    b.appendChild(el('h1', '', 'New: ' + PIECES[id].name));
    var ic = pieceIcon(id, 96);
    ic.className = 'pic';
    b.appendChild(ic);
    b.appendChild(el('p', '', PIECES[id].text));
    b.appendChild(btn('go', 'Got it', closeModal));
  }, function () { showIntros(lv); });
}

function pieceChips(lv) {
  var list = piecesOf(lv);
  if (!list.length) return null;
  var row = el('div', 'chips');
  list.forEach(function (p) {
    var c = el('span', 'chip');
    c.appendChild(pieceIcon(p, 22));
    c.appendChild(document.createTextNode(PIECES[p].name));
    row.appendChild(c);
  });
  return row;
}

// ---------- daily challenge ----------

var DAILY = -1;
function dailyIndex() { return 5000 + dayNum() % 1000; }
function dailyLevel() { return Deal.get(dailyIndex(), LEVELS); }
function dailyPreview() { return Deal.preview(dailyIndex(), LEVELS); }
function dailyDone() { return save.dailyDay === today(); }
var DAILY_PRIZE = { coins: 150, boosts: { wild: 1 } };

// ---------- looks: colour themes and jelly faces ----------

var THEMES = [
  { id: 'night', name: 'Indigo Night', cost: 0, c: ['#4f46e5', '#312e81', '#1e1b4b'] },
  { id: 'ocean', name: 'Deep Ocean', cost: 300, c: ['#0ea5e9', '#075985', '#082f49'] },
  { id: 'candy', name: 'Candy Shop', cost: 300, c: ['#f472b6', '#a21caf', '#3b0764'] },
  { id: 'forest', name: 'Forest', cost: 300, c: ['#22c55e', '#166534', '#052e16'] },
  { id: 'sunset', name: 'Sunset', cost: 400, c: ['#fb923c', '#be123c', '#3b0764'] },
  { id: 'gold', name: 'Midnight Gold', cost: 600, c: ['#ca8a04', '#422006', '#0c0a09'] }
];
var FACES = [
  { id: 'classic', name: 'Classic', cost: 0 },
  { id: 'blush', name: 'Rosy Cheeks', cost: 200 },
  { id: 'sleepy', name: 'Sleepyhead', cost: 250 },
  { id: 'starry', name: 'Starry Eyes', cost: 300 },
  { id: 'shades', name: 'Cool Shades', cost: 400 }
];
function lookById(list, id) { return list.filter(function (l) { return l.id === id; })[0] || list[0]; }
function looksOwned() { return save.looks.length; }

function applyLooks() {
  var t = lookById(THEMES, save.theme), root = document.documentElement.style;
  root.setProperty('--bg1', t.c[0]);
  root.setProperty('--bg2', t.c[1]);
  root.setProperty('--bg3', t.c[2]);
  var meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', t.c[2]);
  FACE = lookById(FACES, save.face).id;
}

function facePreview(id, size) {
  var cv = document.createElement('canvas'), keep = ctx, kf = FACE, d = Math.min(window.devicePixelRatio || 1, 3);
  cv.width = cv.height = size * d;
  cv.style.width = cv.style.height = size + 'px';
  ctx = cv.getContext('2d');
  ctx.scale(d, d);
  FACE = id;
  drawJelly(size / 2, size * 0.54, size * 0.36, 'P', '', 0, 1);
  ctx = keep;
  FACE = kf;
  return cv;
}

// ---------- lucky wheel ----------

var WHEEL = [
  { r: { coins: 25 }, t: '25', w: 22, c: '#fde68a' },
  { r: { boosts: { bolt: 1 } }, t: 'Bolt', w: 14, c: '#93c5fd' },
  { r: { coins: 60 }, t: '60', w: 16, c: '#f9a8d4' },
  { r: { boosts: { grab: 1 } }, t: 'Grab', w: 14, c: '#86efac' },
  { r: { inf: 15 }, t: '15m', w: 8, c: '#fca5a5' },
  { r: { boosts: { wild: 1 } }, t: 'Wild', w: 10, c: '#d8b4fe' },
  { r: { coins: 120 }, t: '120', w: 10, c: '#fdba74' },
  { r: { coins: 400 }, t: '400', w: 3, c: '#facc15' }
];
var SPIN_COST = 80, SPINS_PER_DAY = 3;
function wheelFree() { return save.spinDay !== today(); }
function paidSpinsLeft() { return save.paidDay === today() ? Math.max(0, SPINS_PER_DAY - save.paidSpins) : SPINS_PER_DAY; }

function drawWheel(cv, size) {
  var t = cv.getContext('2d'), d = Math.min(window.devicePixelRatio || 1, 3), r = size / 2, n = WHEEL.length, i;
  cv.width = cv.height = size * d;
  cv.style.width = cv.style.height = size + 'px';
  t.scale(d, d);
  for (i = 0; i < n; i++) {
    var a0 = -Math.PI / 2 + i * 2 * Math.PI / n, a1 = a0 + 2 * Math.PI / n;
    t.beginPath();
    t.moveTo(r, r);
    t.arc(r, r, r - 4, a0, a1);
    t.closePath();
    t.fillStyle = WHEEL[i].c;
    t.fill();
    t.strokeStyle = '#fff';
    t.lineWidth = 3;
    t.stroke();
    t.save();
    t.translate(r, r);
    t.rotate((a0 + a1) / 2);
    t.textAlign = 'center';
    t.textBaseline = 'middle';
    t.font = Math.round(size * 0.095) + 'px system-ui,sans-serif';
    t.fillText(rewardIcon(WHEEL[i].r), r * 0.74, 0);
    t.font = '800 ' + Math.round(size * 0.06) + 'px system-ui,sans-serif';
    t.fillStyle = '#1e1b4b';
    t.fillText(WHEEL[i].t, r * 0.43, 0);
    t.restore();
  }
  t.beginPath();
  t.arc(r, r, size * 0.08, 0, 7);
  t.fillStyle = '#1e1b4b';
  t.fill();
}

function openWheel() {
  var spinning = false, turned = 0;
  openModal(function fill(b) {
    b.textContent = '';
    b.appendChild(el('h1', '', 'Lucky Wheel'));
    b.appendChild(el('p', 'note', 'One free spin every day. Up to ' + SPINS_PER_DAY + ' more for ' + SPIN_COST + ' coins each.'));
    var box = el('div', 'wheel'), cv = document.createElement('canvas');
    box.appendChild(el('i', 'pin'));
    box.appendChild(cv);
    drawWheel(cv, 250);
    cv.style.transform = 'rotate(' + turned + 'deg)';
    b.appendChild(box);
    var free = wheelFree(), left = paidSpinsLeft();
    var go = btn('go', free ? 'Spin for free' : left ? 'Spin for ' + SPIN_COST + ' coins' : 'Come back tomorrow', function () {
      if (spinning) return;
      if (!free) {
        if (!left || save.coins < SPIN_COST) return;
        save.coins -= SPIN_COST;
        if (save.paidDay !== today()) { save.paidDay = today(); save.paidSpins = 0; }
        save.paidSpins++;
      } else {
        save.spinDay = today();
      }
      spinning = true;
      go.disabled = true;
      var total = 0, i, pick = 0, x;
      WHEEL.forEach(function (s) { total += s.w; });
      x = Math.random() * total;
      for (i = 0; i < WHEEL.length; i++) { x -= WHEEL[i].w; if (x < 0) { pick = i; break; } }
      var seg = 360 / WHEEL.length, jitter = (Math.random() - 0.5) * seg * 0.6;
      var target = 360 - (pick + 0.5) * seg + jitter;
      turned += 360 * 5 + ((target - turned) % 360 + 360) % 360;
      cv.style.transition = 'transform 3.2s cubic-bezier(.15,.7,.2,1)';
      cv.style.transform = 'rotate(' + turned + 'deg)';
      tone(500, 0.2, 'triangle', 0.08, 1.5);
      persist();
      updateTop();
      setTimeout(function () {
        var prize = WHEEL[pick].r;
        grant(prize);
        save.spins++;
        track('spin', 1);
        persist();
        checkAwards();
        tone(784, 0.3, 'triangle', 0.12, 1.3);
        toast('You won ' + describe(prize) + '!');
        spinning = false;
        updateTop();
        if (homePage === 'shop') drawShop();
        fill(b);
      }, 3300);
    });
    go.disabled = !free && (!left || save.coins < SPIN_COST);
    b.appendChild(go);
    var odds = el('p', 'note', 'Prizes: ' + WHEEL.map(function (s) { return shortReward(s.r).replace(' +', ''); }).join(', ') + '. The 400-coin jackpot is the rarest.');
    b.appendChild(odds);
  }, updateTop);
}

// ---------- shop ----------

var shopTab = 'deals';
var BUNDLES = [
  { id: 'starter', name: 'Starter Pack', icon: 0x1F381, boosts: { bolt: 2, grab: 2, squish: 1 }, price: 220 },
  { id: 'prep', name: 'Head Start Pack', icon: 0x1F680, boosts: { fire: 2, wild: 2, seat: 2 }, price: 260 },
  { id: 'rescue', name: 'Rescue Kit', icon: 0x1F6DF, boosts: { slot: 3, squish: 2 }, price: 260 },
  { id: 'mega', name: 'Mega Box', icon: 0x1F4E6, boosts: { bolt: 3, grab: 3, squish: 3, slot: 3, fire: 3, wild: 3, seat: 3 }, price: 760 }
];
function worth(boosts) {
  var k, n = 0;
  for (k in boosts) n += boosts[k] * BOOSTS[k].price;
  return n;
}
function boostList(boosts) {
  return Object.keys(boosts).map(function (k) { return boosts[k] + ' ' + BOOSTS[k].name; }).join(', ');
}

// Today's deal: one pack at 45% off, the same for everyone on the same day, once a day.
function dailyDeal() {
  var r = Deal.rng(dayNum() * 131 + 7), ids = Object.keys(BOOSTS), pick = Math.floor(r() * (ids.length + BUNDLES.length)), d;
  if (pick < ids.length) {
    var b = {};
    b[ids[pick]] = 4;
    d = { name: '4 ' + BOOSTS[ids[pick]].name, icon: BOOSTS[ids[pick]].icon, boosts: b };
  } else {
    var bu = BUNDLES[pick - ids.length];
    d = { name: bu.name, icon: bu.icon, boosts: bu.boosts };
  }
  d.was = worth(d.boosts);
  d.price = Math.round(d.was * 0.55 / 5) * 5;
  return d;
}

function pay(cost) {
  if (save.coins < cost) { toast('Not enough coins'); return false; }
  save.coins -= cost;
  tone(700, 0.16, 'triangle', 0.12, 1.6);
  return true;
}
function afterBuy() {
  persist();
  checkAwards();
  updateTop();
  if (homePage === 'shop') drawShop();
}

function shopRow(icon, title, text, small) {
  var row = el('div', 'row'), body = el('div', 'body');
  row.appendChild(typeof icon === 'number' ? el('div', 'tag', E(icon)) : icon);
  body.appendChild(el('h2', '', title));
  if (text) body.appendChild(el('p', '', text));
  if (small) body.appendChild(el('small', '', small));
  row.appendChild(body);
  return row;
}
function buyBtn(cost, fn, label) {
  var b = el('button', 'buy');
  if (label) b.appendChild(el('span', 'qty', label));
  b.appendChild(price(cost));
  b.disabled = save.coins < cost;
  b.onclick = fn;
  return b;
}

function drawShop() {
  var pg = $('pg-shop');
  pg.textContent = '';
  pg.appendChild(el('div', 'head', 'Shop'));
  var tabs = el('div', 'tabs');
  [['deals', 'Deals'], ['boost', 'Boosters'], ['lives', 'Lives'], ['looks', 'Looks']].forEach(function (t) {
    tabs.appendChild(btn(shopTab === t[0] ? 'on' : '', t[1], function () { shopTab = t[0]; drawShop(); }));
  });
  pg.appendChild(tabs);
  if (shopTab === 'deals') shopDeals(pg);
  if (shopTab === 'boost') shopBoosters(pg);
  if (shopTab === 'lives') lifeRows(pg);
  if (shopTab === 'looks') shopLooks(pg);
  pg.appendChild(el('p', 'note', 'Everything here is bought with coins you earn by playing. There is no real money in this game.'));
}

function shopDeals(pg) {
  var d = dailyDeal(), sold = save.dealDay === today();
  var card = el('div', 'deal');
  card.appendChild(el('span', 'ribbon', sold ? 'Sold out' : '45% off today'));
  card.appendChild(el('div', 'big', E(d.icon)));
  card.appendChild(el('h2', '', 'Daily Deal: ' + d.name));
  card.appendChild(el('p', '', boostList(d.boosts) + '. Was ' + d.was + ' coins.'));
  card.appendChild(el('small', '', sold ? 'A new deal in ' + fmt(untilMidnight()) + '.' : 'Ends in ' + fmt(untilMidnight()) + '. One per day.'));
  var b = buyBtn(d.price, function () {
    if (sold || !pay(d.price)) return;
    grant({ boosts: d.boosts });
    save.dealDay = today();
    toast('Bought ' + d.name);
    afterBuy();
  });
  if (sold) b.disabled = true;
  card.appendChild(b);
  pg.appendChild(card);

  var w = shopRow(0x1F3A1, 'Lucky Wheel', wheelFree() ? 'Your free spin for today is ready.' : 'Free spin used. Extra spins ' + SPIN_COST + ' coins.', null);
  var spin = el('button', 'buy', wheelFree() ? 'Spin' : 'Open');
  spin.onclick = openWheel;
  w.appendChild(spin);
  pg.appendChild(w);

  pg.appendChild(el('h3', 'sub', 'Bundles'));
  BUNDLES.forEach(function (bu) {
    var was = worth(bu.boosts), off = Math.round(100 * (1 - bu.price / was));
    var row = shopRow(bu.icon, bu.name + '  -' + off + '%', boostList(bu.boosts), 'Worth ' + was + ' coins');
    row.appendChild(buyBtn(bu.price, function () {
      if (!pay(bu.price)) return;
      grant({ boosts: bu.boosts });
      toast('Bought ' + bu.name);
      afterBuy();
    }));
    pg.appendChild(row);
  });
}

function shopBoosters(pg) {
  pg.appendChild(el('p', 'note', 'Buy five at once and save 20%.'));
  Object.keys(BOOSTS).forEach(function (id) {
    var b = BOOSTS[id], five = Math.round(b.price * 5 * 0.8 / 5) * 5;
    var row = shopRow(b.icon, b.name, b.text, 'You have ' + (save.boosts[id] || 0) + (PRE.indexOf(id) >= 0 ? ' - chosen before a round' : ' - used during a round'));
    var buys = el('div', 'buys');
    buys.appendChild(buyBtn(b.price, function () {
      if (!pay(b.price)) return;
      save.boosts[id] = (save.boosts[id] || 0) + 1;
      afterBuy();
    }, 'x1'));
    buys.appendChild(buyBtn(five, function () {
      if (!pay(five)) return;
      save.boosts[id] = (save.boosts[id] || 0) + 5;
      afterBuy();
    }, 'x5'));
    row.appendChild(buys);
    pg.appendChild(row);
  });
}

function shopLooks(pg) {
  function lookRow(kind, item, preview) {
    var key = kind + ':' + item.id, own = save.looks.indexOf(key) >= 0, on = save[kind] === item.id;
    var row = shopRow(preview, item.name, null, on ? 'In use' : own ? 'Owned' : item.cost + ' coins');
    var b;
    if (on) {
      b = el('button', 'buy', 'In use');
      b.disabled = true;
    } else if (own) {
      b = el('button', 'buy', 'Use');
      b.onclick = function () { save[kind] = item.id; applyLooks(); afterBuy(); };
    } else {
      b = buyBtn(item.cost, function () {
        if (!pay(item.cost)) return;
        save.looks.push(key);
        save[kind] = item.id;
        applyLooks();
        toast('New look: ' + item.name);
        afterBuy();
      });
    }
    row.appendChild(b);
    pg.appendChild(row);
  }
  pg.appendChild(el('h3', 'sub', 'Colour themes'));
  THEMES.forEach(function (t) {
    var sw = el('div', 'tag swatch');
    sw.style.background = 'radial-gradient(120% 90% at 50% 0%,' + t.c[0] + ',' + t.c[1] + ' 55%,' + t.c[2] + ')';
    lookRow('theme', t, sw);
  });
  pg.appendChild(el('h3', 'sub', 'Jelly faces'));
  FACES.forEach(function (f) {
    var tag = el('div', 'tag face');
    tag.appendChild(facePreview(f.id, 46));
    lookRow('face', f, tag);
  });
}

// ---------- home pages ----------

var homePage = 'map';
function setPage(name) {
  homePage = name;
  ['map', 'shop', 'up', 'awards'].forEach(function (p) {
    $('pg-' + p).hidden = p !== name;
    $('n-' + p).className = p === name ? 'on' : '';
  });
  if (name === 'map') drawMap();
  if (name === 'shop') drawShop();
  if (name === 'up') drawUpgrades();
  if (name === 'awards') drawAwards();
}

function showHome(page) {
  mode = '';
  $('panel').hidden = true;
  $('pause').hidden = true;
  $('tip').hidden = true;
  $('home').hidden = false;
  regen();
  rollTasks();
  updateTop();
  setPage(page || 'map');
}

function updateTop() {
  $('coins').textContent = save.coins;
  $('hearts').textContent = unlimited() ? E(0x221E) : save.hearts;
  $('heartT').textContent = heartLabel();
  var ready = chestsReady(), road = roadReady();
  $('sTasksT').textContent = fmt(untilMidnight());
  $('sTasks').querySelector('b').hidden = !ready;
  $('sTasks').querySelector('b').textContent = ready;
  $('sRoadT').textContent = (save.keys % KEYS_PER_STEP) + '/' + KEYS_PER_STEP;
  $('sRoad').querySelector('b').hidden = road <= 0;
  $('sRoad').querySelector('b').textContent = road;
  $('sGiftT').textContent = giftReady() ? 'Ready!' : fmt(untilMidnight());
  $('sGift').querySelector('b').hidden = !giftReady();
  $('sGift').querySelector('b').textContent = '!';
  $('sStreakT').textContent = 'Streak ' + save.streak;
  $('sDailyT').textContent = dailyDone() ? 'Done' : 'New!';
  $('sDaily').querySelector('b').hidden = dailyDone();
  $('sDaily').querySelector('b').textContent = '!';
  $('sWheelT').textContent = wheelFree() ? 'Free spin' : fmt(untilMidnight());
  $('sWheel').querySelector('b').hidden = !wheelFree();
  $('sWheel').querySelector('b').textContent = '1';
  $('bPlay').textContent = 'Play - Level ' + save.unlocked;
}

function drawMap() {
  var map = $('map'), cur = save.unlocked - 1, from = Math.max(0, cur - 12), to = cur + 3, now = null, i;
  map.textContent = '';
  for (i = from; i <= to; i++) {
    if (i > from) map.appendChild(el('div', 'road'));
    var info = Deal.preview(i, LEVELS), stars = save.stars[i] || 0;
    var card = el('button', 'lvl' + (i < cur ? (stars ? ' done' : ' fresh') : i === cur ? ' now' : ' lock'));
    card.appendChild(thumb(info.art, 110));
    card.appendChild(el('strong', '', i + 1));
    if (stars) card.appendChild(starRow(stars));
    else if (i < cur) card.appendChild(el('em', 'tagnew', 'NEW'));
    if (piecesOf(info).length) card.appendChild(el('span', 'pz', piecesOf(info).map(function (p) { return p === 'ice' ? E(0x2744) : p === 'crate' ? E(0x1F4E6) : '?'; }).join(' ')));
    card.onclick = (function (n) {
      return function () {
        if (n <= cur) openLevel(n);
        else toast('Clear level ' + (cur + 1) + ' first');
      };
    })(i);
    map.appendChild(card);
    if (i === cur) now = card;
  }
  if (now) setTimeout(function () { now.scrollIntoView({ block: 'center' }); }, 0);
}

function lifeRows(pg) {
  regen();
  var row = el('div', 'row'), body = el('div', 'body'), buy;
  row.appendChild(el('div', 'tag', E(0x2764)));
  body.appendChild(el('h2', '', 'Refill lives'));
  body.appendChild(el('p', '', 'Back to ' + MAX_HEARTS + ' lives straight away.'));
  row.appendChild(body);
  buy = el('button', 'buy');
  buy.appendChild(price(100));
  buy.disabled = save.coins < 100 || save.hearts >= MAX_HEARTS || unlimited();
  buy.onclick = function () {
    save.coins -= 100;
    save.hearts = MAX_HEARTS;
    persist();
    updateTop();
    if (homePage === 'shop') drawShop(); else closeModal();
  };
  row.appendChild(buy);
  pg.appendChild(row);
  row = el('div', 'row');
  body = el('div', 'body');
  row.appendChild(el('div', 'tag', E(0x221E)));
  body.appendChild(el('h2', '', 'Unlimited lives, 30 min'));
  body.appendChild(el('p', '', 'Losing a round costs nothing for half an hour.'));
  row.appendChild(body);
  buy = el('button', 'buy');
  buy.appendChild(price(200));
  buy.disabled = save.coins < 200;
  buy.onclick = function () {
    save.coins -= 200;
    giveUnlimited(30);
    persist();
    updateTop();
    if (homePage === 'shop') drawShop(); else closeModal();
  };
  row.appendChild(buy);
  pg.appendChild(row);
  row = el('div', 'row');
  body = el('div', 'body');
  row.appendChild(el('div', 'tag', E(0x1F31F)));
  body.appendChild(el('h2', '', 'Unlimited lives, 2 hours'));
  body.appendChild(el('p', '', 'A long session with nothing to lose. Best value.'));
  row.appendChild(body);
  buy = el('button', 'buy');
  buy.appendChild(price(500));
  buy.disabled = save.coins < 500;
  buy.onclick = function () {
    save.coins -= 500;
    giveUnlimited(120);
    persist();
    updateTop();
    if (homePage === 'shop') drawShop(); else closeModal();
  };
  row.appendChild(buy);
  pg.appendChild(row);
}

function drawUpgrades() {
  var pg = $('pg-up');
  pg.textContent = '';
  pg.appendChild(el('div', 'head', 'Upgrades'));
  pg.appendChild(el('p', 'note', 'Upgrades are permanent and apply from the next round you start.'));
  UPGRADES.forEach(function (u) {
    var have = save.up[u.id] || 0, max = u.cost.length, cost = u.cost[have];
    var row = el('div', 'row' + (have >= max ? ' done' : '')), body = el('div', 'body');
    row.appendChild(el('div', 'tag', E(u.icon)));
    body.appendChild(el('h2', '', u.name));
    body.appendChild(el('p', '', u.text));
    body.appendChild(el('small', '', 'Level ' + have + ' of ' + max));
    row.appendChild(body);
    var buy = el('button', 'buy');
    if (have >= max) {
      buy.textContent = 'Max';
      buy.disabled = true;
    } else {
      buy.appendChild(price(cost));
      buy.disabled = save.coins < cost;
      buy.onclick = function () {
        if (save.coins < cost) return;
        save.coins -= cost;
        save.up[u.id] = have + 1;
        persist();
        tone(700, 0.16, 'triangle', 0.12, 1.6);
        checkAwards();
        updateTop();
        drawUpgrades();
      };
    }
    row.appendChild(buy);
    pg.appendChild(row);
  });
}

function drawAwards() {
  var pg = $('pg-awards');
  pg.textContent = '';
  pg.appendChild(el('div', 'head', 'Awards'));
  AWARDS.forEach(function (a) {
    var done = !!save.awards[a.id], have = Math.min(a.have(), a.goal);
    var row = el('div', 'row' + (done ? ' done' : '')), body = el('div', 'body');
    row.appendChild(el('div', 'tag', done ? STAR : '?'));
    body.appendChild(el('h2', '', a.name));
    body.appendChild(el('p', '', a.text));
    if (!done && a.goal > 1) {
      var meter = el('div', 'meter'), fill = el('i');
      fill.style.width = (100 * have / a.goal) + '%';
      meter.appendChild(fill);
      body.appendChild(meter);
      body.appendChild(el('small', '', have + ' of ' + a.goal));
    }
    row.appendChild(body);
    var pay = price(done ? 'Paid' : '+' + a.coins);
    pay.className = 'price' + (done ? ' paid' : '');
    row.appendChild(pay);
    pg.appendChild(row);
  });
}

// ---------- level card (before a round) ----------

function openLevel(i) {
  var daily = i === DAILY, info = daily ? dailyPreview() : Deal.preview(i, LEVELS), chosen = {}, free = streakFree();
  free.forEach(function (id) { chosen[id] = true; });
  openModal(function (b) {
    b.appendChild(el('h1', '', daily ? 'Daily Challenge' : 'Level ' + (i + 1)));
    var pic = thumb(info.art, 150);
    pic.className = 'pic';
    b.appendChild(pic);
    b.appendChild(el('p', '', info.name + (!daily && save.stars[i] ? '  ' + STAR.repeat(save.stars[i]) : '')));
    if (daily) {
      b.appendChild(el('p', 'note', dailyDone()
        ? 'You won today' + E(0x2019) + 's challenge. Play again for fun; a new one arrives in ' + fmt(untilMidnight()) + '.'
        : 'A tougher level, new every day. Win it today for ' + describe(DAILY_PRIZE) + ' and 3 keys.'));
    }
    var big = info.hand ? Math.max.apply(null, info.hand.join(' ').split(' ').map(function (t) { return parseInt(t.slice(1), 10) || 0; })) : info.chunk;
    b.appendChild(el('p', 'note', 'Jellies here carry up to ' + big + ' shots each.'));
    var chips = pieceChips(info);
    if (chips) b.appendChild(chips);
    var st = el('div', 'streak'), txt = el('div', 'body'), steps = el('div', 'steps');
    st.appendChild(el('span', 'fire', E(0x1F525)));
    txt.appendChild(el('h2', '', 'Win streak: ' + save.streak));
    for (var s = 0; s < 3; s++) steps.appendChild(el('i', s < save.streak ? 'on' : ''));
    txt.appendChild(steps);
    txt.appendChild(el('small', '', 'Win in a row for free boosters. A loss resets it.'));
    st.appendChild(txt);
    b.appendChild(st);
    b.appendChild(el('h3', '', 'Boosters for this round'));
    var tiles = el('div', 'tiles');
    PRE.forEach(function (id) {
      var isFree = free.indexOf(id) >= 0, have = save.boosts[id] || 0;
      var t = el('button', 'tile' + (chosen[id] ? ' on' : '') + (isFree ? ' free' : ''));
      t.appendChild(el('span', '', E(BOOSTS[id].icon)));
      t.appendChild(el('small', '', BOOSTS[id].name));
      var badge = el('b', !isFree && !have ? 'plus' : '', isFree ? 'FREE' : have ? have : '+');
      t.appendChild(badge);
      t.onclick = function () {
        if (!isFree && !have) {
          openBuy(id, function () { openLevel(i); });
          return;
        }
        chosen[id] = !chosen[id];
        t.className = 'tile' + (chosen[id] ? ' on' : '') + (isFree ? ' free' : '');
        toast(BOOSTS[id].name + (chosen[id] ? ': on' : ': off'));
      };
      tiles.appendChild(t);
    });
    b.appendChild(tiles);
    var play = btn('go', canPlay() ? 'Play' : 'No lives left', function () {
      if (!canPlay()) { openHearts(); return; }
      var used = 0;
      PRE.forEach(function (id) {
        if (!chosen[id]) return;
        used++;
        if (free.indexOf(id) < 0) save.boosts[id]--;
      });
      if (used) track('boost', used);
      $('modal').hidden = true;
      modalClose = null;
      startLevel(i, chosen);
    });
    b.appendChild(play);
  });
}

function openBuy(id, then) {
  var bst = BOOSTS[id];
  openModal(function (b) {
    b.appendChild(el('h1', '', E(bst.icon) + ' ' + bst.name));
    b.appendChild(el('p', '', bst.text));
    b.appendChild(el('p', 'note', 'You have none left. You have ' + save.coins + ' coins.'));
    var buy = btn('go', '', function () {
      if (save.coins < bst.price) return;
      save.coins -= bst.price;
      save.boosts[id] = (save.boosts[id] || 0) + 1;
      persist();
      updateTop();
      syncBoosts();
      closeModal();
    });
    buy.appendChild(document.createTextNode('Buy for ' + bst.price + ' coins'));
    buy.disabled = save.coins < bst.price;
    b.appendChild(buy);
  }, then);
}

// ---------- side buttons ----------

function openTasks() {
  rollTasks();
  openModal(function (b) {
    b.appendChild(el('h1', '', 'Daily Tasks'));
    b.appendChild(el('p', 'note', 'New tasks in ' + fmt(untilMidnight()) + '. Each one done is worth ' + TASK_PTS + ' points.'));
    var meter = el('div', 'meter'), fill = el('i');
    fill.style.width = Math.min(100, save.taskPts) + '%';
    meter.appendChild(fill);
    b.appendChild(meter);
    b.appendChild(el('p', 'note', save.taskPts + ' / 100 points'));
    var chests = el('div', 'chests');
    CHESTS.forEach(function (c, n) {
      var got = save.chestsGot.indexOf(n) >= 0, ready = save.taskPts >= c.at && !got;
      var ch = el('button', 'chest' + (ready ? ' ready' : '') + (got ? ' got' : ''));
      ch.appendChild(el('span', '', got ? E(0x2705) : E(0x1F381)));
      ch.appendChild(el('small', '', c.at + ' pts'));
      ch.onclick = function () {
        if (got) return;
        if (!ready) { toast(describe(c.reward)); return; }
        save.chestsGot.push(n);
        grant(c.reward);
        save.keys += 1;
        toast('Chest: ' + describe(c.reward) + ' + 1 key');
        openTasks();
      };
      chests.appendChild(ch);
    });
    b.appendChild(chests);
    save.tasks.forEach(function (t) {
      var row = el('div', 'row' + (t.have >= t.n ? ' done' : '')), body = el('div', 'body');
      row.appendChild(el('div', 'tag', t.have >= t.n ? E(0x2714) : E(0x1F4CB)));
      body.appendChild(el('h2', '', taskText(t)));
      var m = el('div', 'meter'), f = el('i');
      f.style.width = (100 * t.have / t.n) + '%';
      m.appendChild(f);
      body.appendChild(m);
      body.appendChild(el('small', '', t.have + ' / ' + t.n));
      row.appendChild(body);
      b.appendChild(row);
    });
  }, updateTop);
}

function openGift() {
  openModal(function (b) {
    b.appendChild(el('h1', '', 'Daily Gift'));
    b.appendChild(el('p', 'note', 'One gift a day. The seventh is the biggest, then it starts again.'));
    var days = el('div', 'days'), start = save.giftN - (save.giftN % 7);
    GIFTS.forEach(function (g, n) {
      var idx = start + n, got = idx < save.giftN, isToday = idx === save.giftN && giftReady();
      var d = el('div', 'day' + (got ? ' got' : '') + (isToday ? ' today' : ''));
      d.appendChild(el('small', '', 'Day ' + (n + 1)));
      d.appendChild(el('span', '', got ? E(0x2705) : rewardIcon(g)));
      d.appendChild(el('small', '', shortReward(g)));
      days.appendChild(d);
    });
    b.appendChild(days);
    var claim = btn('go', giftReady() ? 'Claim' : 'Next gift in ' + fmt(untilMidnight()), function () {
      if (!giftReady()) return;
      var g = GIFTS[save.giftN % 7];
      grant(g);
      save.giftN++;
      save.giftDay = today();
      persist();
      toast('Gift: ' + describe(g));
      openGift();
    });
    claim.disabled = !giftReady();
    b.appendChild(claim);
  }, updateTop);
}

function openRoad() {
  openModal(function (b) {
    var reached = Math.floor(save.keys / KEYS_PER_STEP), i;
    b.appendChild(el('h1', '', 'Star Road'));
    b.appendChild(el('p', 'note', 'Keys: 1 for each win, 1 more for three stars, 1 for each task chest. Every ' + KEYS_PER_STEP + ' keys reach the next step.'));
    var list = el('div', 'track');
    for (i = Math.max(0, save.roadGot - 1); i < save.roadGot + 7; i++) {
      var r = roadReward(i), got = i < save.roadGot, open = !got && i < reached;
      var s = el('div', 'step' + (got || open ? ' reach' : ''));
      s.appendChild(el('span', 'n', i + 1));
      s.appendChild(el('span', '', rewardIcon(r)));
      s.appendChild(el('span', 'what', describe(r)));
      if (got) s.appendChild(el('span', '', E(0x2705)));
      else if (open && i === save.roadGot) {
        s.appendChild(btn('buy', 'Claim', function () {
          var rw = roadReward(save.roadGot);
          grant(rw);
          save.roadGot++;
          persist();
          toast('Star Road: ' + describe(rw));
          openRoad();
        }));
      } else if (!open) s.appendChild(el('small', 'dim', E(0x1F512)));
      list.appendChild(s);
    }
    b.appendChild(list);
    b.appendChild(el('p', 'note', 'You have ' + save.keys + ' keys. ' + (KEYS_PER_STEP - save.keys % KEYS_PER_STEP) + ' more to the next step.'));
  }, updateTop);
}

function openStreak() {
  openModal(function (b) {
    b.appendChild(el('h1', '', E(0x1F525) + ' Win Streak'));
    b.appendChild(el('p', '', 'You have won ' + save.streak + ' in a row. Best: ' + save.bestStreak + '.'));
    PRE.forEach(function (id, n) {
      var row = el('div', 'row' + (save.streak > n ? ' done' : '')), body = el('div', 'body');
      row.appendChild(el('div', 'tag', E(BOOSTS[id].icon)));
      body.appendChild(el('h2', '', (n + 1) + (n ? ' wins' : ' win') + ' in a row: free ' + BOOSTS[id].name));
      body.appendChild(el('p', '', BOOSTS[id].text));
      row.appendChild(body);
      b.appendChild(row);
    });
    b.appendChild(el('p', 'note', 'Free boosters are switched on for you on the level card. Losing a round, or quitting one you have started, resets the streak.'));
  });
}

function openHearts() {
  regen();
  openModal(function (b) {
    b.appendChild(el('h1', '', E(0x2764) + ' Lives'));
    if (unlimited()) b.appendChild(el('p', '', 'Unlimited lives for ' + fmt(save.infUntil - Date.now()) + '.'));
    else b.appendChild(el('p', '', 'You have ' + save.hearts + ' of ' + MAX_HEARTS + '. ' +
      (save.hearts < MAX_HEARTS ? 'Next life in ' + heartLabel() + '.' : 'Full.')));
    b.appendChild(el('p', 'note', 'Losing a round costs a life. A new one grows back every 15 minutes.'));
    lifeRows(b);
  }, updateTop);
}

function openSettings() {
  var confirmReset = false;
  openModal(function fill(b) {
    b.textContent = '';
    b.appendChild(el('h1', '', 'Settings'));
    var s1 = el('div', 'set', 'Sound');
    s1.appendChild(btn(save.muted ? 'off' : '', save.muted ? 'Off' : 'On', function () { save.muted = !save.muted; persist(); fill(b); }));
    b.appendChild(s1);
    var s2 = el('div', 'set', 'Game speed');
    s2.appendChild(btn(save.fast ? '' : 'off', save.fast ? '2x' : '1x', function () { save.fast = !save.fast; persist(); fill(b); }));
    b.appendChild(s2);
    b.appendChild(el('h3', '', 'How to play'));
    b.appendChild(el('p', 'note', 'Tap a jelly at the front of a column to put it on the loop. It rides once round the picture and pops the outermost cube of its own colour in every row and column it passes. If it still has ammo it lands on the belt; tap it there to send it round again. The loop has 5 seats and the belt 5 places. If a jelly comes back and every place on the belt is taken, you lose the round. When every jelly left fits on the loop at once, the round finishes by itself.'));
    b.appendChild(el('p', 'note', 'Ice cubes take two hits. Crates block their lanes until a cube next to them pops. Jellies marked ? show their colour at the front of their column.'));
    b.appendChild(el('h3', '', 'Your stats'));
    var st = el('div', 'stats');
    [['Levels cleared', clearedCount()], ['Stars', starCount()], ['Wins', save.wins], ['Best streak', save.bestStreak],
     ['Cubes popped', save.pops], ['Ice cracked', save.iceCracked], ['Crates broken', save.cratesBroken],
     ['Daily wins', save.dailyWins], ['Wheel spins', save.spins]].forEach(function (r) {
      var cell = el('div', '');
      cell.appendChild(el('b', '', String(r[1])));
      cell.appendChild(el('small', '', r[0]));
      st.appendChild(cell);
    });
    b.appendChild(st);
    if (!(window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true)) {
      b.appendChild(el('p', 'note', 'To install on a phone: tap Share, then Add to Home Screen.'));
    }
    b.appendChild(btn('go plain', confirmReset ? 'Tap again to erase all progress' : 'Reset progress', function () {
      if (!confirmReset) { confirmReset = true; fill(b); return; }
      try { localStorage.removeItem('jellyloop1'); } catch (e) { /* ignore */ }
      location.reload();
    }));
  }, updateTop);
}
