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
  { id: 'all', name: 'Full Gallery', text: 'Clear the 20 hand-drawn levels.', coins: 150, goal: 20, have: clearedCount },
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
  { id: 'spender', name: 'Big Spender', text: 'Buy 3 upgrades.', coins: 50, goal: 3, have: upgradeCount }
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
  { id: 'auto', text: 'Reach {n} quick finishes', ns: [2, 3] }
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
  $('bPlay').textContent = 'Play - Level ' + save.unlocked;
}

function drawMap() {
  var map = $('map'), cur = save.unlocked - 1, from = Math.max(0, cur - 12), to = cur + 3, now = null, i;
  map.textContent = '';
  for (i = from; i <= to; i++) {
    if (i > from) map.appendChild(el('div', 'road'));
    var info = Deal.preview(i, LEVELS), stars = save.stars[i] || 0;
    var card = el('button', 'lvl' + (i < cur ? ' done' : i === cur ? ' now' : ' lock'));
    card.appendChild(thumb(info.art, 110));
    card.appendChild(el('strong', '', i + 1));
    if (stars) card.appendChild(starRow(stars));
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

function drawShop() {
  var pg = $('pg-shop');
  pg.textContent = '';
  pg.appendChild(el('div', 'head', 'Shop'));
  pg.appendChild(el('p', 'note', 'Everything here is bought with coins you earn by playing. There is no real money in this game.'));
  Object.keys(BOOSTS).forEach(function (id) {
    var b = BOOSTS[id], row = el('div', 'row'), body = el('div', 'body');
    row.appendChild(el('div', 'tag', E(b.icon)));
    body.appendChild(el('h2', '', b.name));
    body.appendChild(el('p', '', b.text));
    body.appendChild(el('small', '', 'You have ' + (save.boosts[id] || 0) + (PRE.indexOf(id) >= 0 ? '  (chosen before a round)' : '  (used during a round)')));
    row.appendChild(body);
    var buy = el('button', 'buy');
    buy.appendChild(price(b.price));
    buy.disabled = save.coins < b.price;
    buy.onclick = function () {
      if (save.coins < b.price) return;
      save.coins -= b.price;
      save.boosts[id] = (save.boosts[id] || 0) + 1;
      persist();
      tone(700, 0.16, 'triangle', 0.12, 1.6);
      updateTop();
      drawShop();
    };
    row.appendChild(buy);
    pg.appendChild(row);
  });
  lifeRows(pg);
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
  var info = Deal.preview(i, LEVELS), chosen = {}, free = streakFree();
  free.forEach(function (id) { chosen[id] = true; });
  openModal(function (b) {
    b.appendChild(el('h1', '', 'Level ' + (i + 1)));
    var pic = thumb(info.art, 150);
    pic.className = 'pic';
    b.appendChild(pic);
    b.appendChild(el('p', '', info.name + (save.stars[i] ? '  ' + STAR.repeat(save.stars[i]) : '')));
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
