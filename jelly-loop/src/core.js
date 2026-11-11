// core.js - the rules of the game, with no DOM in sight.
//
// A port of the Unity prototype in ../unity-original/Scripts:
//   ColorTypes.cs      -> PALETTE
//   Cell.cs + BoardManager.cs -> Game.grid, firstInLane, exposed
//   Jelly.cs           -> the jelly objects in hand / pending / belt
//   ConveyorManager.cs -> the loop round the picture and the belt of parking places
//   HandManager.cs     -> Game.hand (columns, front jelly is playable)
//   GameManager.cs     -> send, status, checkJam
//
// Coordinates are in cells: cell (x, y) has its centre at (x, y), y grows downward.

var BELT_MARGIN = 1.4;   // belt centre line sits this far outside the outer cells
var BELT_SPEED = 6;      // cells per second            (ConveyorManager.moveSpeed)
var MAX_SLOTS = 5;       // places on the belt        (ConveyorManager.maxSlots)
var ENTRY_GAP = 1.7;     // minimum spacing between jellies on the belt

// key: [name, fill, text colour]
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
  T: ['Brown', '#a16207', '#fff']
};

// level = { name, art: [row strings, '.' = empty], hand: ['R12 B9', 'Y10 G4', ...] }
// opts  = upgrades in play: { slots: extra belt slots, turbo: speed steps,
//           jumps: times the second jelly of a column may be played, rescues: jams survived }
function Game(level, opts) {
  var art = level.art, x, y, id = 0;
  opts = opts || {};
  this.maxSlots = MAX_SLOTS + (opts.slots || 0);
  this.speed = BELT_SPEED * (1 + 0.15 * (opts.turbo || 0));
  this.jumps = opts.jumps || 0;
  this.rescues = opts.rescues || 0;
  this.peak = 0;   // most jellies on the belt at once, which is what the stars measure
  this.w = art[0].length;
  this.h = art.length;
  this.grid = [];
  this.remaining = 0;
  for (y = 0; y < this.h; y++) {
    for (x = 0; x < this.w; x++) {
      var ch = art[y].charAt(x);
      if (ch === '.') ch = '';
      this.grid.push(ch);
      if (ch) this.remaining++;
    }
  }
  this.total = this.remaining;
  this.hand = level.hand.map(function (col) {
    return col.split(' ').filter(Boolean).map(function (tok) {
      var n = parseInt(tok.slice(1), 10);
      return { id: ++id, color: tok.charAt(0), ammo: n, max: n, d: 0, k: 0, nextD: 0 };
    });
  });
  // A jelly in play holds one place on the belt from the moment it is sent until its
  // ammo runs out. It goes once round the loop, then parks in its place until tapped again.
  this.slots = [];
  for (x = 0; x < this.maxSlots; x++) this.slots.push(null);
  this.belt = [];      // jellies travelling round the loop right now
  this.pending = [];   // jellies waiting for a gap to join the loop
  this.events = [];
  this.status = 'playing';
  this.time = 0;

  // The belt is a rectangle around the board, travelled clockwise.
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
}

// Position on the (sharp-cornered) belt at path distance u.
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
    if (c >= 0) out[this.grid[c]] = (out[this.grid[c]] || 0) + 1;
  }
  return out;
};

// Every jelly in play: travelling, waiting to join, or parked.
Game.prototype.inPlay = function () {
  return this.slots.filter(Boolean);
};

Game.prototype.slotsUsed = function () {
  return this.inPlay().length;
};

// Tap on a hand column: its front jelly takes a place on the belt and sets off round the loop.
// With a Queue Jump to spend, `second` plays the jelly behind the front one instead.
Game.prototype.send = function (c, second) {
  if (this.status !== 'playing') return false;
  var col = this.hand[c];
  if (!col || !col.length) return false;
  if (second && (col.length < 2 || this.jumps < 1)) second = false;
  var free = this.slots.indexOf(null);
  if (free < 0) {
    this.events.push({ type: 'full' });
    return false;
  }
  var j = second ? col.splice(1, 1)[0] : col.shift();
  if (second) this.jumps--;
  j.slot = free;
  j.parked = false;
  this.slots[free] = j;
  this.pending.push(j);
  this.peak = Math.max(this.peak, this.slotsUsed());
  this.events.push({ type: 'send', jelly: j, col: c, second: !!second });
  this.checkJam();
  return true;
};

// Tap on a parked jelly: it goes round the loop once more.
Game.prototype.relaunch = function (slot) {
  var j = this.slots[slot];
  if (this.status !== 'playing' || !j || !j.parked) return false;
  j.parked = false;
  this.pending.push(j);
  this.events.push({ type: 'send', jelly: j, slot: slot });
  return true;
};

Game.prototype.entryClear = function () {
  var P = this.perim, i, ph;
  for (i = 0; i < this.belt.length; i++) {
    ph = this.belt[i].d % P;
    if (ph < ENTRY_GAP || P - ph < ENTRY_GAP) return false;
  }
  return true;
};

Game.prototype.fire = function (j, trig) {
  var c = this.firstInLane(trig.side, trig.lane);
  if (c < 0 || this.grid[c] !== j.color) return;
  this.grid[c] = '';
  this.remaining--;
  j.ammo--;
  var p = this.pointAt(this.entry + j.nextD);
  this.events.push({ type: 'shot', jelly: j, cell: c, color: j.color, x: p[0], y: p[1] });
};

Game.prototype.step = function (dt) {
  if (this.status !== 'playing') return;
  this.time += dt;
  var t = this.triggers, n = t.length, P = this.perim, i, j, k, gap, fired = false;

  if (this.pending.length && this.entryClear()) {
    j = this.pending.shift();
    j.d = 0;
    for (k = 0; k < n && t[k].u <= this.entry; k++) { /* find the first lane ahead */ }
    j.k = k % n;
    j.nextD = (t[j.k].u - this.entry + P) % P;
    this.belt.push(j);
    this.events.push({ type: 'enter', jelly: j });
  }

  for (i = this.belt.length - 1; i >= 0; i--) {
    j = this.belt[i];
    j.d += this.speed * dt;
    // one lap only: each lane is passed once, then the jelly comes off the loop
    while (j.ammo > 0 && j.d >= j.nextD && j.nextD <= P + 1e-6) {
      k = j.ammo;
      this.fire(j, t[j.k]);
      if (j.ammo < k) fired = true;
      gap = t[(j.k + 1) % n].u - t[j.k].u;
      if (gap <= 0) gap += P;
      j.k = (j.k + 1) % n;
      j.nextD += gap;
    }
    if (j.ammo === 0) {
      this.belt.splice(i, 1);
      this.slots[j.slot] = null;
      var p = this.pointAt(this.entry + j.d);
      this.events.push({ type: 'retire', jelly: j, x: p[0], y: p[1] });
    } else if (j.d >= P) {
      this.belt.splice(i, 1);
      j.parked = true;
      this.events.push({ type: 'park', jelly: j });
    }
  }

  if (this.remaining === 0) {
    this.status = 'won';
    this.events.push({ type: 'won' });
  } else if (fired) {
    this.checkJam();
  }
};

// The belt is jammed when every place is taken (or the hand is spent) and no jelly in
// play matches any cube on the outside of the picture. Nothing can ever move again,
// unless a Second Wind is left: then the fullest jelly goes to the back of the
// shortest queue and play carries on.
Game.prototype.checkJam = function () {
  if (this.status !== 'playing' || !this.remaining) return;
  var on = this.inPlay(), i;
  var handLeft = this.hand.some(function (c) { return c.length > 0; });
  if (on.length < this.maxSlots && handLeft) return;
  var ex = this.exposed();
  for (i = 0; i < on.length; i++) if (ex[on[i].color]) return;
  if (this.rescues > 0 && on.length) {
    var out = on[0], to = 0, at;
    for (i = 1; i < on.length; i++) if (on[i].ammo > out.ammo) out = on[i];
    for (i = 1; i < this.hand.length; i++) if (this.hand[i].length < this.hand[to].length) to = i;
    at = this.belt.indexOf(out);
    var p = at >= 0 ? this.pointAt(this.entry + out.d) : this.pointAt(this.entry);
    if (at >= 0) this.belt.splice(at, 1);
    else if (this.pending.indexOf(out) >= 0) this.pending.splice(this.pending.indexOf(out), 1);
    this.slots[out.slot] = null;
    out.parked = false;
    this.hand[to].push(out);
    this.rescues--;
    this.events.push({ type: 'rescue', jelly: out, col: to, x: p[0], y: p[1] });
    return;
  }
  this.status = 'lost';
  this.events.push({ type: 'lost' });
};

if (typeof module !== 'undefined') {
  module.exports = { Game: Game, PALETTE: PALETTE, MAX_SLOTS: MAX_SLOTS, BELT_SPEED: BELT_SPEED, BELT_MARGIN: BELT_MARGIN };
}
