// home.js - the home screen: coins, stars, upgrades and awards.
// Declarations only. app.js owns `save` and starts everything.

var STAR = String.fromCharCode(9733);
var homeTab = 'list';

// cost[n] is the price of going from level n to n + 1.
var UPGRADES = [
  { id: 'turbo', name: 'Turbo Belt', tag: '>>', cost: [60, 120, 200],
    text: 'The belt runs 15% faster for each level of this upgrade.' },
  { id: 'jump', name: 'Queue Jump', tag: '2nd', cost: [80, 160, 260],
    text: 'Tap the second jelly in a column to play it ahead of the front one. One use per round for each level.' },
  { id: 'wind', name: 'Second Wind', tag: 'SOS', cost: [120, 240],
    text: 'When the belt jams, the fullest jelly goes back to the hand and play carries on. One rescue per round for each level.' },
  { id: 'slot', name: 'Sixth Slot', tag: '+1', cost: [300],
    text: 'The belt carries six jellies instead of five.' }
];

function clearedCount() {
  return save.stars.filter(function (n) { return n > 0; }).length;
}
function starCount() {
  return save.stars.reduce(function (a, n) { return a + n; }, 0);
}
function upgradeCount() {
  return UPGRADES.reduce(function (a, u) { return a + save.up[u.id]; }, 0);
}

// An award is earned when have() reaches goal. It pays its coins once.
var AWARDS = [
  { id: 'first', name: 'First Pop', text: 'Clear a level.', coins: 20, goal: 1, have: clearedCount },
  { id: 'half', name: 'Halfway There', text: 'Clear 6 levels.', coins: 50, goal: 6, have: clearedCount },
  { id: 'all', name: 'Full Gallery', text: 'Clear every level.', coins: 150, goal: LEVELS.length, have: clearedCount },
  { id: 'star10', name: 'Star Pupil', text: 'Collect 10 stars.', coins: 40, goal: 10, have: starCount },
  { id: 'star25', name: 'Constellation', text: 'Collect 25 stars.', coins: 100, goal: 25, have: starCount },
  { id: 'perfect', name: 'Perfectionist', text: 'Three stars on every level.', coins: 300, goal: LEVELS.length * 3, have: starCount },
  { id: 'pop500', name: 'Cube Crusher', text: 'Pop 500 cubes.', coins: 30, goal: 500, have: function () { return save.pops; } },
  { id: 'pop3000', name: 'Demolition Crew', text: 'Pop 3,000 cubes.', coins: 120, goal: 3000, have: function () { return save.pops; } },
  { id: 'chain', name: 'Chain Reaction', text: 'Pop 40 cubes in one unbroken run.', coins: 40, goal: 40, have: function () { return save.chain; } },
  { id: 'light', name: 'Light Touch', text: 'Clear a level with never more than 2 jellies on the belt.', coins: 60, goal: 1, have: function () { return save.light; } },
  { id: 'quick', name: 'Quick Hands', text: 'Clear a level in under 20 seconds.', coins: 50, goal: 1, have: function () { return save.quick; } },
  { id: 'saved', name: 'Saved by the Wind', text: 'Survive a jam with Second Wind.', coins: 30, goal: 1, have: function () { return save.saved; } },
  { id: 'spender', name: 'Big Spender', text: 'Buy 3 upgrades.', coins: 50, goal: 3, have: upgradeCount }
];

// Grant anything newly earned. Safe to call often.
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

// ---------- small DOM helpers ----------

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
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

// ---------- the three tabs ----------

function drawLevels() {
  var list = $('list');
  list.textContent = '';
  LEVELS.forEach(function (level, i) {
    var open = i < save.unlocked;
    var b = el('button', 'lv' + (open ? '' : ' locked') + (i === levelIndex ? ' current' : ''));
    b.disabled = !open;
    b.appendChild(open ? thumb(level) : el('i'));
    b.appendChild(el('span', '', (i + 1) + '. ' + level.name));
    b.appendChild(starRow(save.stars[i]));
    b.onclick = function () { startLevel(i); };
    list.appendChild(b);
  });
}

function drawShop() {
  var shop = $('shop');
  shop.textContent = '';
  UPGRADES.forEach(function (u) {
    var have = save.up[u.id], max = u.cost.length, cost = u.cost[have];
    var row = el('div', 'row' + (have >= max ? ' done' : ''));
    var body = el('div', 'body');
    row.appendChild(el('div', 'tag', u.tag));
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
        showHome('shop');
      };
    }
    row.appendChild(buy);
    shop.appendChild(row);
  });
  shop.appendChild(el('p', 'note', 'Upgrades apply from the next round you start. Coins come from clearing levels, new stars and awards.'));
}

function drawWall() {
  var wall = $('wall');
  wall.textContent = '';
  AWARDS.forEach(function (a) {
    var done = !!save.awards[a.id], have = Math.min(a.have(), a.goal);
    var row = el('div', 'row' + (done ? ' done' : ''));
    var body = el('div', 'body');
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
    wall.appendChild(row);
  });
}

function setTab(name) {
  homeTab = name;
  ['list', 'shop', 'wall'].forEach(function (id) {
    $(id).hidden = id !== name;
    $('t-' + id).className = id === name ? 'on' : '';
  });
}

function showHome(tab) {
  var next = Math.min(save.unlocked, LEVELS.length) - 1;
  var mid = game && game.status === 'playing' && game.time > 0;
  $('coins').textContent = save.coins;
  $('starsN').textContent = starCount() + '/' + LEVELS.length * 3;
  $('bPlay').textContent = mid ? 'Resume level ' + (levelIndex + 1) : 'Play level ' + (next + 1) + ': ' + LEVELS[next].name;
  $('bPlay').onclick = function () {
    if (mid) $('home').hidden = true;
    else startLevel(next);
  };
  drawLevels();
  drawShop();
  drawWall();
  setTab(tab || homeTab);
  $('install').hidden = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  $('panel').hidden = true;
  $('home').hidden = false;
}

// The jelly next to the title, drawn with the same routine as the ones in play.
function drawMascot() {
  var m = $('mascot'), keep = ctx;
  ctx = m.getContext('2d');
  ctx.clearRect(0, 0, m.width, m.height);
  drawJelly(m.width / 2, m.height * 0.55, m.width * 0.4, 'N', '', 0, 1);
  ctx = keep;
}
