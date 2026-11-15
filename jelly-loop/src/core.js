// core.js - the rules of the game, with no DOM in sight.
//
// A port of the Unity prototype in ../unity-original/Scripts:
//   ColorTypes.cs      -> PALETTE
//   Cell.cs + BoardManager.cs -> Game.grid, firstInLane, exposed
//   Jelly.cs           -> the jelly objects in the hand, on the loop and on the belt
//   ConveyorManager.cs -> the loop round the picture (seats) and the belt of parking places
//   HandManager.cs     -> Game.hand (columns, front jelly is playable)
//   GameManager.cs     -> send, relaunch, status
//
// How a round works:
//   - Tapping a jelly in the hand puts it on the LOOP, if one of its seats is free.
//   - It rides once round the picture, popping the outermost cube of its own colour in
//     every row and column it passes. Each pop costs one ammo.
//   - Out of ammo, it pops and is gone. Otherwise it lands on the BELT in a free place.
//     If every place on the belt is taken, the round is lost.
//   - Tapping a jelly on the belt sends it round the loop again (it needs a free seat).
//   - When every jelly left fits on the loop at once there is nothing left to decide:
//     they all launch, keep circling, and the round fast-forwards to the end.
//
// Coordinates are in cells: cell (x, y) has its centre at (x, y), y grows downward.
//
// Board pieces (one character per cell in a level's art):
//   R, B, ...  a cube of that colour: one hit
//   r, b, ...  an ICE cube: the first hit cracks the ice and leaves an ordinary cube
//   #          a CRATE: no jelly can shoot it, and it blocks the lanes it sits in. It
//              breaks when a cube next to it (left, right, above or below) is popped,
//              or when a Bolt or Firework hits it.
// Hand jellies written 'R8?' are MYSTERY jellies: their colour stays hidden until they
// reach the front of their column.

var BELT_MARGIN = 1.4;   // loop centre line sits this far outside the outer cells
var BELT_SPEED = 6;      // cells per second            (ConveyorManager.moveSpeed)
var LOOP_SEATS = 5;      // jellies on the loop at once (ConveyorManager.maxSlots)
var BELT_SLOTS = 5;      // parking places on the belt
var ENTRY_GAP = 1.7;     // minimum spacing between jellies on the loop
var AUTO_SPEED = 3;      // how much faster the quick finish runs

// key: [name, fill, text colour]. '*' is the wild jelly from the Wild Jelly booster.
var PALETTE = {
  R: ['Red', '#ef4444', '#fff'],
  Y: ['Yellow', '#facc15', '#422006'],
  B: ['Blue', '#3b82f6', '#fff'],
  G: ['Green', '#22c55e', '#052e16'],
  P: ['Purple', '#a855f7', '#fff'],
  K: ['Black', '#334155', '#fff'],
  C: ['Cyan', '#22d3ee', '#083344'],
  O: ['Orange', '#fb923c', '#431407'],
  N: ['Pink', '#f472b6', '#500724'],
  W: ['White', '#f8fafc', '#334155'],
  T: ['Brown', '#a16207', '#fff'],
  '*': ['Wild', '#e879f9', '#1e1b4b'],
  '#': ['Crate', '#b45309', '#fff']
};

// The colour key of a board cell: 'r' (ice) -> 'R', '#' stays '#'.
function cubeColor(ch) { return ch === '#' ? '#' : ch.toUpperCase(); }
// Hits a cell needs: ice 2, a plain cube 1, a crate or an empty cell 0.
function cubeHits(ch) { return !ch || ch === '#' ? 0 : ch === ch.toUpperCase() ? 1 : 2; }

// level = { name, art: [row strings, '.' = empty], hand: ['R12 B9', 'Y10 G4', ...] }
// opts  = what is in play this round:
//   slots, seats - extra belt places / loop seats      turbo - loop speed steps (+15% each)
//   rescues      - times a jelly with nowhere to land goes back to the hand instead
//   wild         - ammo of a wild jelly (pops any colour) that starts on the loop
function Game(level, opts) {
  var art = level.art, x, y, self = this;
  opts = opts || {};
  this.maxSlots = BELT_SLOTS + (opts.slots || 0);
  this.maxSeats = LOOP_SEATS + (opts.seats || 0);
  this.speed = BELT_SPEED * (1 + 0.15 * (opts.turbo || 0));
  this.rescues = opts.rescues || 0;
  this.w = art[0].length;
  this.h = art.length;
  this.grid = [];
  this.left = {};          // hits still needed, per colour (an ice cube counts twice)
  this.remaining = 0;      // hits still needed in all
  this.crates = 0;
  for (y = 0; y < this.h; y++) {
    for (x = 0; x < this.w; x++) {
      var ch = art[y].charAt(x), n;
      if (ch === '.') ch = '';
      this.grid.push(ch);
      if (ch === '#') this.crates++;
      n = cubeHits(ch);
      if (n) {
        this.remaining += n;
        this.left[cubeColor(ch)] = (this.left[cubeColor(ch)] || 0) + n;
      }
    }
  }
  this.total = this.remaining;
  this.nextId = 0;
  this.idle = 0;           // loop distance travelled in the quick finish since the last pop
  this.hand = level.hand.map(function (col) {
    return col.split(' ').filter(Boolean).map(function (tok, i) {
      var j = self.jelly(tok.charAt(0), parseInt(tok.slice(1), 10));
      if (i > 0 && tok.charAt(tok.length - 1) === '?') j.hidden = true;
      return j;
    });
  });
  this.slots = [];         // the belt: a parked jelly or null in each place
  for (x = 0; x < this.maxSlots; x++) this.slots.push(null);
  this.belt = [];          // jellies riding the loop right now
  this.pending = [];       // jellies holding a seat, waiting for a gap to join the loop
  this.events = [];
  this.status = 'playing';
  this.reason = '';        // why a round was lost: 'full' or 'stuck'
  this.stranded = null;    // the jelly that had nowhere to land
  this.time = 0;
  this.auto = false;       // quick finish under way
  this.peak = 0;           // most jellies parked on the belt at once
  this.sent = 0;           // jellies sent round the loop, counting repeat trips

  // The loop is a rectangle around the board, travelled clockwise.
  // u = 0 is the bottom-right corner; jellies join at the middle of the bottom side.
  var m = BELT_MARGIN;
  this.lw = this.w - 1 + 2 * m;
  this.lh = this.h - 1 + 2 * m;
  this.perim = 2 * (this.lw + this.lh);
  this.entry = this.lw / 2;

  // One trigger per lane per side: the spot where a passing jelly lines up with that lane.
  // side 0 bottom (shoots up), 1 left (shoots right), 2 top (shoots down), 3 right (shoots left)
  var t = this.triggers = [];
  for (x = this.w - 1; x >= 0; x--) t.push({ u: this.w - 1 + m - x, side: 0, lane: x });
  for (y = this.h - 1; y >= 0; y--) t.push({ u: this.lw + this.h - 1 + m - y, side: 1, lane: y });
  for (x = 0; x < this.w; x++) t.push({ u: this.lw + this.lh + m + x, side: 2, lane: x });
  for (y = 0; y < this.h; y++) t.push({ u: 2 * this.lw + this.lh + m + y, side: 3, lane: y });

  if (opts.wild) {
    var wj = this.jelly('*', opts.wild);
    this.pending.push(wj);
    this.events.push({ type: 'send', jelly: wj, wild: true });
  }
}

Game.prototype.jelly = function (color, ammo) {
  return { id: ++this.nextId, color: color, ammo: ammo, max: ammo, d: 0, k: 0, nextD: 0 };
};

// Position on the (sharp-cornered) loop at path distance u.
Game.prototype.pointAt = function (u) {
  var m = BELT_MARGIN, P = this.perim;
  u = ((u % P) + P) % P;
  if (u < this.lw) return [this.w - 1 + m - u, this.h - 1 + m];
  u -= this.lw;
  if (u < this.lh) return [-m, this.h - 1 + m - u];
  u -= this.lh;
  if (u < this.lw) return [-m + u, -m];
  u -= this.lw;
  return [this.w - 1 + m, -m + u];
};

// The outermost cube still standing in a lane, seen from one side. -1 if the lane is empty.
Game.prototype.firstInLane = function (side, lane) {
  var w = this.w, h = this.h, g = this.grid, i;
  if (side === 0) { for (i = h - 1; i >= 0; i--) if (g[i * w + lane]) return i * w + lane; }
  else if (side === 1) { for (i = 0; i < w; i++) if (g[lane * w + i]) return lane * w + i; }
  else if (side === 2) { for (i = 0; i < h; i++) if (g[i * w + lane]) return i * w + lane; }
  else { for (i = w - 1; i >= 0; i--) if (g[lane * w + i]) return lane * w + i; }
  return -1;
};

// How many lanes currently show each colour on the outside: { R: 3, B: 7, ... }
Game.prototype.exposed = function () {
  var out = {}, t = this.triggers, i, c;
  for (i = 0; i < t.length; i++) {
    c = this.firstInLane(t[i].side, t[i].lane);
    if (c >= 0) { var k = cubeColor(this.grid[c]); out[k] = (out[k] || 0) + 1; }
  }
  return out;
};

Game.prototype.riders = function () { return this.belt.length + this.pending.length; };
Game.prototype.parked = function () { return this.slots.filter(Boolean); };
Game.prototype.parkedCount = function () { return this.parked().length; };
Game.prototype.inPlay = function () { return this.belt.concat(this.pending, this.parked()); };
Game.prototype.handCount = function () {
  return this.hand.reduce(function (a, c) { return a + c.length; }, 0);
};
Game.prototype.jelliesLeft = function () { return this.inPlay().length + this.handCount(); };

// Tap on a hand column: the jelly at `depth` (0 = front; deeper only with the Grabber)
// takes a seat on the loop.
Game.prototype.send = function (c, depth) {
  if (this.status !== 'playing') return false;
  var col = this.hand[c];
  depth = depth || 0;
  if (!col || depth >= col.length) return false;
  if (this.riders() >= this.maxSeats) {
    this.events.push({ type: 'full' });
    return false;
  }
  var j = col.splice(depth, 1)[0];
  j.hidden = false;
  this.revealFronts();
  this.pending.push(j);
  this.sent++;
  this.events.push({ type: 'send', jelly: j, col: c, depth: depth });
  this.checkAuto();
  return true;
};

// Tap on a parked jelly: it leaves its place and goes round the loop again.
Game.prototype.relaunch = function (slot) {
  var j = this.slots[slot];
  if (this.status !== 'playing' || !j) return false;
  if (this.riders() >= this.maxSeats) {
    this.events.push({ type: 'full' });
    return false;
  }
  this.slots[slot] = null;
  this.pending.push(j);
  this.sent++;
  this.events.push({ type: 'send', jelly: j, slot: slot });
  return true;
};

// A mystery jelly that reaches the front of its column shows its colour.
Game.prototype.revealFronts = function () {
  for (var c = 0; c < this.hand.length; c++) {
    var f = this.hand[c][0];
    if (f && f.hidden) {
      f.hidden = false;
      this.events.push({ type: 'reveal', jelly: f, col: c });
    }
  }
};

Game.prototype.entryClear = function () {
  var P = this.perim, i, ph;
  for (i = 0; i < this.belt.length; i++) {
    ph = this.belt[i].d % P;
    if (ph < ENTRY_GAP || P - ph < ENTRY_GAP) return false;
  }
  return true;
};

// One hit on a cell: a cube pops, ice cracks, a crate breaks. Returns the colour hit
// ('#' for a crate, '' for nothing). When the last cube of a colour goes, every jelly of
// that colour is spent, whatever ammo it has left (the Bolt, the Firework and the wild
// jelly pop cubes without using that colour's ammo).
Game.prototype.pop = function (c) {
  var ch = this.grid[c];
  if (!ch) return '';
  if (ch === '#') {
    this.grid[c] = '';
    this.crates--;
    return '#';
  }
  var col = cubeColor(ch);
  this.grid[c] = ch === col ? '' : col;   // ice cracks first
  this.remaining--;
  this.left[col]--;
  this.idle = 0;
  if (!this.grid[c]) this.breakCrates(c);
  if (!this.left[col]) this.spend(col);
  if (this.remaining === 0 && this.status === 'playing') {
    this.status = 'won';
    this.auto = false;
    this.events.push({ type: 'won' });
  }
  return col;
};

// A cube popped: crates touching it break.
Game.prototype.breakCrates = function (c) {
  var x = c % this.w, y = Math.floor(c / this.w), n = [], i, k;
  if (x > 0) n.push(c - 1);
  if (x < this.w - 1) n.push(c + 1);
  if (y > 0) n.push(c - this.w);
  if (y < this.h - 1) n.push(c + this.w);
  for (i = 0; i < n.length; i++) {
    k = n[i];
    if (this.grid[k] !== '#') continue;
    this.grid[k] = '';
    this.crates--;
    this.events.push({ type: 'crate', cell: k });
  }
};

Game.prototype.spend = function (col) {
  var self = this;
  this.hand.forEach(function (column, c) {
    for (var i = column.length - 1; i >= 0; i--) {
      if (column[i].color === col) {
        self.events.push({ type: 'discard', jelly: column[i], col: c, depth: i });
        column.splice(i, 1);
      }
    }
  });
  this.slots.forEach(function (j, s) {
    if (j && j.color === col) {
      self.slots[s] = null;
      self.events.push({ type: 'retire', jelly: j, slot: s });
    }
  });
  this.belt.concat(this.pending).forEach(function (j) { if (j.color === col) j.done = true; });
  this.revealFronts();
};

Game.prototype.fire = function (j, trig) {
  var c = this.firstInLane(trig.side, trig.lane);
  if (c < 0 || this.grid[c] === '#' || (j.color !== '*' && cubeColor(this.grid[c]) !== j.color)) return;
  var p = this.pointAt(this.entry + j.nextD);
  j.ammo--;
  var col = this.pop(c);
  this.events.push({ type: 'shot', jelly: j, cell: c, color: col, to: this.grid[c], x: p[0], y: p[1] });
  if (!j.ammo) j.done = true;
};

Game.prototype.retire = function (j, onLoop) {
  if (j.gone) return;
  j.gone = true;
  var p = this.pointAt(this.entry + (onLoop ? j.d : 0));
  this.events.push({ type: 'retire', jelly: j, x: p[0], y: p[1] });
};

// A jelly back from its lap with ammo to spare: park it, or lose the round.
Game.prototype.land = function (j) {
  var free = this.slots.indexOf(null), i, to = 0;
  j.d = 0;
  if (free >= 0) {
    this.slots[free] = j;
    this.peak = Math.max(this.peak, this.parkedCount());
    this.events.push({ type: 'park', jelly: j, slot: free });
  } else if (this.rescues > 0) {
    for (i = 1; i < this.hand.length; i++) if (this.hand[i].length < this.hand[to].length) to = i;
    this.hand[to].push(j);
    this.rescues--;
    this.events.push({ type: 'rescue', jelly: j, col: to });
  } else {
    this.status = 'lost';
    this.reason = 'full';
    this.stranded = j;
    this.events.push({ type: 'lost', reason: 'full', jelly: j });
  }
};

// Clear out jellies that were spent while riding or waiting.
Game.prototype.sweep = function () {
  var self = this;
  this.belt = this.belt.filter(function (j) {
    if (j.done) self.retire(j, true);
    return !j.done;
  });
  this.pending = this.pending.filter(function (j) {
    if (j.done) self.retire(j, false);
    return !j.done;
  });
};

// Once every jelly left fits on the loop together, launch them all and let them circle.
Game.prototype.checkAuto = function () {
  if (this.auto || this.status !== 'playing' || !this.remaining) return;
  if (this.jelliesLeft() > this.maxSeats) return;
  this.auto = true;
  this.events.push({ type: 'auto' });
};

Game.prototype.autoLaunch = function () {
  var s, c;
  while (this.riders() < this.maxSeats) {
    s = this.slots.findIndex(Boolean);
    if (s >= 0) { this.relaunch(s); continue; }
    for (c = 0; c < this.hand.length; c++) if (this.hand[c].length) break;
    if (c === this.hand.length) return;
    this.send(c, 0);
  }
};

Game.prototype.step = function (dt) {
  if (this.status !== 'playing') return;
  this.time += dt;
  this.checkAuto();
  if (this.auto) this.autoLaunch();
  var mv = this.speed * dt * (this.auto ? AUTO_SPEED : 1);
  var t = this.triggers, n = t.length, P = this.perim, i, j, k, gap, keep = [];

  if (this.pending.length && this.entryClear()) {
    j = this.pending.shift();
    j.d = 0;
    for (k = 0; k < n && t[k].u <= this.entry; k++) { /* find the first lane ahead */ }
    j.k = k % n;
    j.nextD = (t[j.k].u - this.entry + P) % P;
    this.belt.push(j);
    this.events.push({ type: 'enter', jelly: j });
  }

  for (i = 0; i < this.belt.length; i++) {
    j = this.belt[i];
    if (j.done) { keep.push(j); continue; }
    j.d += mv;
    // one lap only: each lane is passed once, then the jelly comes off the loop
    while (!j.done && j.d >= j.nextD && j.nextD <= P + 1e-6) {
      this.fire(j, t[j.k]);
      gap = t[(j.k + 1) % n].u - t[j.k].u;
      if (gap <= 0) gap += P;
      j.k = (j.k + 1) % n;
      j.nextD += gap;
    }
    if (j.done || j.d < P) { keep.push(j); continue; }
    if (this.auto) {
      // quick finish: straight on into another lap
      j.d -= P;
      j.nextD -= P;
      keep.push(j);
    } else if (this.status === 'playing') {
      this.land(j);
    }
  }
  this.belt = keep;
  this.sweep();
  if (this.status !== 'playing') return;
  this.checkStuck();
  // The quick finish has every jelly circling; if two whole laps go by without a pop,
  // what is left cannot be reached (a crate walls it in) and the round is over.
  if (this.auto && this.belt.length) {
    this.idle += mv;
    if (this.idle > 2 * P + 3 * ENTRY_GAP) {
      this.status = 'lost';
      this.reason = 'stuck';
      this.events.push({ type: 'lost', reason: 'stuck' });
    }
  }
};

// Safety net: nothing riding, nothing in the hand, and nothing parked can reach a cube.
Game.prototype.checkStuck = function () {
  if (this.riders() || this.handCount() || !this.remaining) return;
  var ex = this.exposed(), p = this.parked(), i;
  for (i = 0; i < p.length; i++) if (p[i].color === '*' || ex[p[i].color]) return;
  this.status = 'lost';
  this.reason = 'stuck';
  this.events.push({ type: 'lost', reason: 'stuck' });
};

// ---------- boosters ----------

// Pop a list of cells at once (Bolt, Firework). Returns the cells actually popped.
Game.prototype.blast = function (cells, kind) {
  var out = [], i, col;
  for (i = 0; i < cells.length && this.remaining; i++) {
    col = this.pop(cells[i]);
    if (col) out.push({ cell: cells[i], color: col, to: this.grid[cells[i]] });
  }
  if (out.length) this.events.push({ type: 'blast', kind: kind, cells: out });
  this.sweep();
  if (this.status === 'playing') this.checkAuto();
  return out;
};

// Bolt: the tapped cube and the cubes of its colour touching it, up to `max`.
Game.prototype.bolt = function (cell, max) {
  var col = cubeColor(this.grid[cell] || ''), seen = {}, list = [], todo = [cell], c, x, y, n;
  if (!this.grid[cell] || this.status !== 'playing') return [];
  max = max || 10;
  while (todo.length && list.length < max) {
    c = todo.shift();
    if (seen[c] || !this.grid[c] || cubeColor(this.grid[c]) !== col) continue;
    seen[c] = 1;
    list.push(c);
    x = c % this.w;
    y = Math.floor(c / this.w);
    n = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
    n.forEach(function (p) {
      if (p[0] >= 0 && p[0] < this.w && p[1] >= 0 && p[1] < this.h) todo.push(p[1] * this.w + p[0]);
    }, this);
  }
  return this.blast(list, 'bolt');
};

// Firework: pops `count` cubes chosen at random from those showing on the outside.
Game.prototype.firework = function (count, rand) {
  var seen = {}, cells = [], i, c;
  rand = rand || Math.random;
  for (i = 0; i < this.triggers.length; i++) {
    c = this.firstInLane(this.triggers[i].side, this.triggers[i].lane);
    if (c >= 0 && !seen[c]) { seen[c] = 1; cells.push(c); }
  }
  for (i = cells.length - 1; i > 0; i--) {
    c = Math.floor(rand() * (i + 1));
    var tmp = cells[i]; cells[i] = cells[c]; cells[c] = tmp;
  }
  return this.blast(cells.slice(0, count), 'firework');
};

// Squish: parked jellies of the same colour merge into one, freeing their places.
Game.prototype.squish = function () {
  var first = {}, merged = 0, s, j;
  if (this.status !== 'playing') return 0;
  for (s = 0; s < this.slots.length; s++) {
    j = this.slots[s];
    if (!j || j.color === '*') continue;
    if (first[j.color] === undefined) { first[j.color] = s; continue; }
    var into = this.slots[first[j.color]];
    into.ammo += j.ammo;
    into.max += j.max;
    this.slots[s] = null;
    merged++;
    this.events.push({ type: 'squish', jelly: j, from: s, to: first[j.color] });
  }
  return merged;
};

// One more place on the belt.
Game.prototype.addSlot = function () {
  this.maxSlots++;
  this.slots.push(null);
  this.events.push({ type: 'slot' });
};

// After 'no room to land': add a place, land the jelly that was turned away, play on.
Game.prototype.revive = function () {
  if (this.status !== 'lost' || this.reason !== 'full' || !this.stranded) return false;
  var j = this.stranded;
  this.stranded = null;
  this.status = 'playing';
  this.reason = '';
  this.addSlot();
  this.land(j);
  return true;
};

if (typeof module !== 'undefined') {
  module.exports = {
    Game: Game, PALETTE: PALETTE, cubeColor: cubeColor, cubeHits: cubeHits,
    LOOP_SEATS: LOOP_SEATS, BELT_SLOTS: BELT_SLOTS,
    BELT_SPEED: BELT_SPEED, BELT_MARGIN: BELT_MARGIN
  };
}
