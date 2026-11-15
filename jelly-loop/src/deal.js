// deal.js - deals a hand of jellies for a picture and proves with a bot that it can be won.
// Shared by tools/build.mjs (the hand-drawn levels) and the game itself, which uses it to
// make endless new levels once the hand-drawn ones run out.

var Deal = (function () {
  var core = typeof Game !== 'undefined' ? { Game: Game, PALETTE: PALETTE, cubeColor: cubeColor, cubeHits: cubeHits } : require('./core.js');

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Careful player. Never lets more jellies be out than the belt can take back
  // (riders + parked <= places), re-sends a parked jelly when its colour is showing, and
  // takes a new jelly only when its colour is showing and not already covered.
  function smart(g) {
    if (g.auto || g.status !== 'playing' || g.riders() >= g.maxSeats) return;
    var ex = g.exposed(), riding = {}, i, j, k, best = -1, score = 0, depth = 1e9;
    g.belt.concat(g.pending).forEach(function (x) { riding[x.color] = (riding[x.color] || 0) + x.ammo; });
    for (i = 0; i < g.slots.length; i++) {
      j = g.slots[i];
      if (j && (ex[j.color] || 0) > (riding[j.color] || 0)) { g.relaunch(i); return; }
    }
    if (g.maxSlots - g.parkedCount() - g.riders() <= 0) return;
    g.hand.forEach(function (col, c) {
      if (!col.length) return;
      var need = (ex[col[0].color] || 0) - (riding[col[0].color] || 0);
      if (need > score) { score = need; best = c; }
    });
    if (best >= 0) { g.send(best); return; }
    if (g.riders()) return; // something is still working: wait
    // Nothing useful anywhere: dig toward the nearest useful jelly.
    g.hand.forEach(function (col, c) {
      for (k = 0; k < col.length; k++) if (ex[col[k].color]) break;
      if (k < col.length && k < depth) { depth = k; best = c; }
    });
    if (best >= 0) g.send(best);
  }

  // Careless player: about once a second, taps a front jelly or a parked one at random.
  function casual(rand) {
    var wait = 0;
    return function (g) {
      if (g.auto || --wait > 0 || g.riders() >= g.maxSeats) return;
      var moves = [];
      g.hand.forEach(function (c, i) { if (c.length) moves.push(i); });
      g.slots.forEach(function (j, s) { if (j) moves.push(-1 - s); });
      if (!moves.length) return;
      wait = 30 + Math.floor(rand() * 60);
      var m = moves[Math.floor(rand() * moves.length)];
      if (m >= 0) g.send(m); else g.relaunch(-1 - m);
    };
  }

  // Run a whole round at 60 steps a second. `order` lists the hand jellies in the order
  // they were sent, which is how a natural order for a picture is found.
  function play(level, policy, capSeconds) {
    var g = new core.Game(level), order = [], ticks = 0, i, e;
    while (g.status === 'playing' && ticks < 60 * (capSeconds || 600)) {
      policy(g);
      g.step(1 / 60);
      for (i = 0; i < g.events.length; i++) {
        e = g.events[i];
        if (e.type === 'send' && e.col !== undefined) order.push(e.jelly.color + e.jelly.max);
      }
      g.events.length = 0;
      ticks++;
    }
    return { status: g.status, seconds: g.time, order: order };
  }

  // Hits of each colour (an ice cube needs two) are split into jellies of about `chunk` ammo.
  function jelliesFor(art, chunk) {
    var count = {}, out = [], keys = [];
    art.forEach(function (row) {
      for (var i = 0; i < row.length; i++) {
        var ch = row.charAt(i), k;
        if (ch === '.' || ch === '#') continue;
        k = core.cubeColor(ch);
        if (!core.PALETTE[k] || k === '*') throw new Error('unknown colour ' + ch);
        if (!count[k]) keys.push(k);
        count[k] = (count[k] || 0) + core.cubeHits(ch);
      }
    });
    keys.forEach(function (k) {
      var n = count[k], parts = Math.ceil(n / chunk);
      for (var i = 0; i < parts; i++) out.push(k + (Math.floor(n / parts) + (i < n % parts ? 1 : 0)));
    });
    return out;
  }

  // Deal the order into queue columns. `mystery` is the share of jellies (never the front
  // one of a column) whose colour stays hidden until they reach the front.
  function dealInto(order, cols, mystery, rand) {
    var hand = [], i;
    for (i = 0; i < cols; i++) hand.push([]);
    order.forEach(function (tok, n) {
      var col = hand[n % cols];
      col.push(mystery && col.length && rand() < mystery ? tok + '?' : tok);
    });
    return hand.map(function (c) { return c.join(' '); });
  }

  // pic = { name, art, cols, chunk, mix }. o.trials > 0 tunes difficulty against the
  // careless player (slow; the build does it). o.attempts caps the hands tried.
  function level(pic, index, o) {
    o = o || {};
    var jellies = jelliesFor(pic.art, pic.chunk);
    // With every jelly free to pick, the careful bot finds a natural order to clear the picture.
    var free = play({ art: pic.art, hand: jellies }, smart);
    if (free.status !== 'won') return null;
    var target = Math.min(0.7, pic.mix * 0.12), rand = rng(1000 + index), chosen = null;
    var attempts = o.attempts || 60, a, s, t;
    for (a = 0; a < attempts; a++) {
      var order = free.order.slice();
      // Early attempts nudge neighbours; later ones swap across the whole hand.
      var swaps = a ? Math.ceil(pic.mix * (1 + a / 10)) : 0;
      var reach = a < 30 ? 1 + pic.mix : order.length;
      for (s = 0; s < swaps; s++) {
        var i = Math.floor(rand() * order.length);
        var j = Math.min(order.length - 1, i + 1 + Math.floor(rand() * reach));
        var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
      }
      var lv = { name: pic.name, art: pic.art, hand: dealInto(order, pic.cols, pic.mystery || 0, rng(77 + index)) };
      var proof = play(lv, smart);
      if (proof.status !== 'won') continue;
      var rate = 0, miss;
      if (o.trials) {
        var losses = 0;
        for (t = 0; t < o.trials; t++) if (play(lv, casual(rng(t * 7919 + index))).status !== 'won') losses++;
        rate = losses / o.trials;
        miss = Math.abs(rate - target);
      } else {
        miss = a || !pic.mix ? 0 : 1; // without tuning, take the first shuffled hand that works
      }
      if (!chosen || miss < chosen.miss) chosen = { level: lv, miss: miss, rate: rate, seconds: proof.seconds };
      if (!pic.mix || miss < 0.05) break;
    }
    if (!chosen) return null;
    chosen.level.par = Math.ceil(chosen.seconds);
    return chosen;
  }

  // Jellies grow as the levels go up: one more ammo per jelly for every four levels,
  // up to 30. Level n is 0-based.
  var MAX_CHUNK = 30;
  function jellyChunk(base, n) { return Math.min(MAX_CHUNK, base + Math.floor(n / 4)); }

  // ---------- endless levels, made from the hand-drawn pictures ----------

  var MOODS = ['Night', 'Sunset', 'Mint', 'Candy', 'Frost', 'Ember', 'Lagoon', 'Meadow', 'Neon', 'Dusk'];
  var KEYS = Object.keys(core.PALETTE).filter(function (k) { return k !== '*' && k !== '#'; });

  // Level n (0-based) past the hand-drawn list: a picture from the list, maybe mirrored,
  // with its colours swapped round. Further along, some cubes freeze into ice and some
  // jellies are dealt as mysteries. Cheap; no dealing.
  function variant(n, list) {
    var H = list.length, r = rng(n * 7919 + 17), base = list[Math.floor(r() * H)];
    var perm = KEYS.slice(), map = {}, i, step = n - H;
    for (i = perm.length - 1; i > 0; i--) {
      var k = Math.floor(r() * (i + 1)), tmp = perm[i]; perm[i] = perm[k]; perm[k] = tmp;
    }
    KEYS.forEach(function (key, idx) { map[key] = perm[idx]; });
    var mirror = r() < 0.5;
    var art = base.art.map(function (row) {
      var cells = row.split('');
      if (mirror) cells.reverse();
      return cells.map(function (ch) {
        if (ch === '.' || ch === '#') return ch;
        var to = map[core.cubeColor(ch)];
        return ch === core.cubeColor(ch) ? to : to.toLowerCase();
      }).join('');
    });
    var name = base.name + ' ' + MOODS[Math.floor(r() * MOODS.length)];
    var ice = step >= 4 ? Math.min(0.18, 0.04 + step * 0.004) : 0;
    if (ice) {
      art = art.map(function (row) {
        return row.split('').map(function (ch) {
          return ch !== '.' && ch !== '#' && r() < ice ? ch.toLowerCase() : ch;
        }).join('');
      });
    }
    return {
      name: name,
      art: art,
      cols: 3 + Math.min(2, Math.floor(step / 4)),
      chunk: jellyChunk(8 + Math.floor(r() * 4), n),
      mix: Math.min(6, 2 + Math.floor(step / 5)),
      mystery: step >= 8 ? Math.min(0.3, 0.1 + step * 0.005) : (base.mystery || 0)
    };
  }

  var cache = {};
  // The playable level n: hand-drawn, or dealt now and remembered for this session.
  function get(n, list) {
    if (n < list.length) return list[n];
    if (cache[n]) return cache[n];
    var pic = variant(n, list), got = null, tries = 0;
    while (!got && tries < 6) {
      got = level(pic, n + tries * 100003, { attempts: 12 });
      if (!got) pic.mix = Math.max(0, pic.mix - 1);
      if (!got && tries === 2) pic.art = pic.art.map(function (row) { return row.toUpperCase(); });
      tries++;
    }
    cache[n] = got ? got.level : list[n % list.length];
    return cache[n];
  }

  // Name and picture only, for the map.
  function preview(n, list) {
    return n < list.length ? list[n] : variant(n, list);
  }

  return {
    rng: rng, smart: smart, casual: casual, play: play, jellyChunk: jellyChunk,
    jelliesFor: jelliesFor, dealInto: dealInto, level: level,
    variant: variant, get: get, preview: preview
  };
})();

if (typeof module !== 'undefined') module.exports = Deal;
