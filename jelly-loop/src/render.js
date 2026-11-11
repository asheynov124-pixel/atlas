// render.js - draws a Game onto the canvas. No rules live here.

var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');
var view = { w: 0, h: 0, cell: 20, cx: 0, cy: 0, handTop: 0, handH: 0, colGap: 0, jr: 0, tr: 20, trayY: 0 };
var fx = { shots: [], pops: [], bits: [], vis: [], pos: {}, kick: {}, slide: [], shake: 0, deny: 0, flash: 0 };
var UI = 'system-ui,-apple-system,sans-serif';

function layout(g) {
  var dpr = Math.min(window.devicePixelRatio || 1, 3);
  var w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  var top = document.getElementById('hud').getBoundingClientRect().bottom + 2;
  var bar = document.getElementById('boost').getBoundingClientRect().top;
  if (!bar) bar = h;
  var handH = Math.max(124, Math.min(200, h * 0.2));
  // the belt of parking places sits between the loop and the hand
  var tr = Math.max(14, Math.min(24, (w - 28) / (g.maxSlots * 2.5)));
  var trayH = tr * 2.4 + 14;
  var bottom = bar - handH - trayH;
  var spanX = g.w + 2 * BELT_MARGIN + 1.7, spanY = g.h + 2 * BELT_MARGIN + 1.7;
  view.w = w;
  view.h = h;
  view.cell = Math.max(8, Math.min((w - 6) / spanX, (bottom - top) / spanY, 44));
  view.cx = w / 2;
  view.cy = top + (bottom - top) / 2;
  view.tr = tr;
  view.trayY = bottom + tr * 1.2 + 6;
  view.handTop = bottom + trayH;
  view.handH = handH;
  view.colGap = Math.min((w - 20) / g.hand.length, 96);
  view.jr = Math.min(view.colGap * 0.36, handH * 0.21, 34);
}

function px(g, x) { return view.cx + (x - (g.w - 1) / 2) * view.cell; }
function py(g, y) { return view.cy + (y - (g.h - 1) / 2) * view.cell; }
function colX(g, c) { return view.cx + (c - (g.hand.length - 1) / 2) * view.colGap; }
function frontY() { return view.handTop + view.jr * 1.1 + 6; }
function slotX(g, i) { return view.cx + (i - (g.maxSlots - 1) / 2) * view.tr * 2.5; }
function entryXY(g) { return [px(g, g.w / 2 - 0.5), py(g, g.h - 1 + BELT_MARGIN)]; }

// How many jellies of a column are drawn below the front one, and where the k-th sits.
function handShow(col) {
  var room = Math.floor(1 + (view.handH - 14 - view.jr * 3.39) / (view.jr * 1.12));
  return Math.max(0, Math.min(3, room, col.length - 1));
}
function handY(k) {
  var jr = view.jr, fy = frontY();
  return fy + (k <= 1 ? k * jr * 1.62 : jr * 1.62 + (k - 1) * jr * 1.12);
}

// Where a jelly is drawn at loop distance u: the same rectangle as the rules use,
// with the corners rounded off so jellies sweep round them.
function beltPoint(g, u) {
  var P = g.perim, m = BELT_MARGIN, r = m * 0.9, i, d, t, a;
  u = ((u % P) + P) % P;
  var ends = [g.lw, g.lw + g.lh, 2 * g.lw + g.lh, P];
  var corner = [[-m, g.h - 1 + m], [-m, -m], [g.w - 1 + m, -m], [g.w - 1 + m, g.h - 1 + m]];
  var dir = [[-1, 0], [0, -1], [1, 0], [0, 1]];
  for (i = 0; i < 4; i++) {
    d = u - ends[i];
    if (i === 3 && u < r) d = u;
    if (d > -r && d < r) {
      var din = dir[i], dout = dir[(i + 1) % 4], c = corner[i];
      t = (d + r) / (2 * r);
      a = t * Math.PI / 2;
      return [
        c[0] - din[0] * r + dout[0] * r - dout[0] * r * Math.cos(a) + din[0] * r * Math.sin(a),
        c[1] - din[1] * r + dout[1] * r - dout[1] * r * Math.cos(a) + din[1] * r * Math.sin(a)
      ];
    }
  }
  return g.pointAt(u);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

var MYSTERY = ['Mystery', '#64748b', '#fff'];

function fillFor(key, r) {
  if (key === '?') {
    var g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, '#94a3b8');
    g.addColorStop(1, '#475569');
    return g;
  }
  if (key !== '*') return PALETTE[key][1];
  var gr = ctx.createLinearGradient(-r, -r, r, r);
  ['#ef4444', '#facc15', '#22c55e', '#22d3ee', '#3b82f6', '#a855f7'].forEach(function (c, i) { gr.addColorStop(i / 5, c); });
  return gr;
}

// key is the board character: 'R' a cube, 'r' an ice cube, '#' a crate.
function drawCube(x, y, s, key, alpha) {
  var r = s * 0.22, ice = key !== '#' && key !== key.toUpperCase();
  ctx.globalAlpha = alpha;
  if (key === '#') {
    roundRect(x - s / 2, y - s / 2, s, s, r * 0.5);
    ctx.fillStyle = '#b45309';
    ctx.fill();
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = Math.max(1, s * 0.09);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - s * 0.36, y - s * 0.36);
    ctx.lineTo(x + s * 0.36, y + s * 0.36);
    ctx.moveTo(x + s * 0.36, y - s * 0.36);
    ctx.lineTo(x - s * 0.36, y + s * 0.36);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(x - s * 0.42, y - s * 0.42, s * 0.84, s * 0.12);
    ctx.globalAlpha = 1;
    return;
  }
  roundRect(x - s / 2, y - s / 2, s, s, r);
  ctx.fillStyle = PALETTE[cubeColor(key)][1];
  ctx.fill();
  if (ice) {
    // frosted over: pale glaze, a white rim and a glint
    ctx.fillStyle = 'rgba(224,242,254,.55)';
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, s * 0.08);
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = Math.max(1, s * 0.06);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.22, y + s * 0.2);
    ctx.lineTo(x + s * 0.2, y - s * 0.22);
    ctx.moveTo(x - s * 0.05, y + s * 0.26);
    ctx.lineTo(x + s * 0.26, y - s * 0.05);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  roundRect(x - s * 0.36, y - s * 0.38, s * 0.72, s * 0.26, r * 0.7);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.14)';
  roundRect(x - s / 2, y + s * 0.26, s, s * 0.24, r);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// The jelly face bought in the shop's Looks tab: classic, blush, sleepy, starry, shades.
var FACE = 'classic';
function drawFace(r) {
  var e, ex, ey = -r * 0.2;
  if (FACE === 'shades') {
    ctx.fillStyle = '#0f172a';
    roundRect(-r * 0.62, ey - r * 0.17, r * 0.56, r * 0.32, r * 0.12);
    ctx.fill();
    roundRect(r * 0.06, ey - r * 0.17, r * 0.56, r * 0.32, r * 0.12);
    ctx.fill();
    ctx.fillRect(-r * 0.1, ey - r * 0.1, r * 0.2, r * 0.07);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fillRect(-r * 0.5, ey - r * 0.1, r * 0.16, r * 0.05);
    ctx.fillRect(r * 0.18, ey - r * 0.1, r * 0.16, r * 0.05);
    return;
  }
  for (e = -1; e <= 1; e += 2) {
    ex = e * r * 0.32;
    if (FACE === 'sleepy') {
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = Math.max(1.2, r * 0.08);
      ctx.beginPath();
      ctx.arc(ex, ey - r * 0.04, r * 0.13, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex, ey, r * 0.2, 0, 7);
    ctx.fill();
    if (FACE === 'starry') {
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      for (var k = 0; k < 10; k++) {
        var rr = k % 2 ? r * 0.06 : r * 0.15, a = -Math.PI / 2 + k * Math.PI / 5;
        ctx.lineTo(ex + Math.cos(a) * rr, ey + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(ex + r * 0.04, ey + r * 0.03, r * 0.1, 0, 7);
      ctx.fill();
    }
    if (FACE === 'blush') {
      ctx.fillStyle = 'rgba(244,114,182,.75)';
      ctx.beginPath();
      ctx.ellipse(e * r * 0.62, r * 0.08, r * 0.14, r * 0.08, 0, 0, 7);
      ctx.fill();
    }
  }
}

function drawJelly(x, y, r, key, ammo, squash, alpha) {
  var col = key === '?' ? MYSTERY : PALETTE[key];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 + squash, 1 - squash);
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(-r, r * 0.5);
  ctx.bezierCurveTo(-r, -r * 1.3, r, -r * 1.3, r, r * 0.5);
  ctx.quadraticCurveTo(r, r, r * 0.55, r);
  ctx.lineTo(-r * 0.55, r);
  ctx.quadraticCurveTo(-r, r, -r, r * 0.5);
  ctx.closePath();
  ctx.fillStyle = fillFor(key, r);
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.1);
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.5, -r * 0.42, r * 0.13, r * 0.26, 0.6, 0, 7);
  ctx.fill();
  drawFace(r);
  if (ammo !== '') {
    ctx.fillStyle = col[2];
    ctx.font = '800 ' + Math.round(r * 0.74) + 'px ' + UI;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ammo, 0, r * 0.52);
  }
  ctx.restore();
}

// The little cart a jelly rides round the loop on.
function drawCart(x, y, r) {
  ctx.fillStyle = '#0f172a';
  roundRect(x - r * 0.85, y + r * 0.82, r * 1.7, r * 0.3, r * 0.14);
  ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.beginPath();
  ctx.arc(x - r * 0.5, y + r * 1.16, r * 0.15, 0, 7);
  ctx.arc(x + r * 0.5, y + r * 1.16, r * 0.15, 0, 7);
  ctx.fill();
}

function burst(x, y, key, n, power) {
  var i, a, v;
  for (i = 0; i < n; i++) {
    a = Math.random() * 6.283;
    v = power * (0.4 + Math.random() * 0.8);
    fx.bits.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.3, life: 0.35 + Math.random() * 0.3, t: 0, key: key === '*' ? 'P' : key, s: view.cell * (0.12 + Math.random() * 0.14) });
  }
}

// Called when a level starts.
function resetFx(g) {
  fx.shots = [];
  fx.pops = [];
  fx.bits = [];
  fx.vis = g.grid.slice();
  fx.pos = {};
  fx.kick = {};
  fx.slide = g.hand.map(function () { return 0; });
  fx.shake = 0;
  fx.deny = 0;
  fx.flash = 0;
}

// Advance animations. Returns how many shots landed this frame (for the pop sound).
function stepFx(g, dt) {
  var i, s, b, landed = 0;
  for (i = fx.shots.length - 1; i >= 0; i--) {
    s = fx.shots[i];
    s.t += dt;
    if (s.t >= s.dur) {
      fx.vis[s.cell] = s.to || '';
      fx.pops.push({ x: s.x1, y: s.y1, key: s.key, t: 0 });
      burst(s.x1, s.y1, s.key, 5, view.cell * 5);
      fx.shots.splice(i, 1);
      landed++;
    }
  }
  for (i = fx.pops.length - 1; i >= 0; i--) {
    fx.pops[i].t += dt;
    if (fx.pops[i].t > 0.2) fx.pops.splice(i, 1);
  }
  for (i = fx.bits.length - 1; i >= 0; i--) {
    b = fx.bits[i];
    b.t += dt;
    b.vy += view.cell * 30 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.t > b.life) fx.bits.splice(i, 1);
  }
  for (i in fx.kick) fx.kick[i] = Math.max(0, fx.kick[i] - dt * 7);
  for (i = 0; i < fx.slide.length; i++) fx.slide[i] = Math.max(0, fx.slide[i] - dt * 6);
  fx.shake = Math.max(0, fx.shake - dt * 3);
  fx.deny = Math.max(0, fx.deny - dt * 4);
  fx.flash = Math.max(0, fx.flash - dt * 1.5);
  return landed;
}

// Move a drawn jelly towards where the rules put it, so it glides instead of jumping.
function glide(id, x, y, settle) {
  var at = fx.pos[id];
  if (!at || at.done) return [x, y];
  var ease = 0.23;
  at.x += (x - at.x) * ease;
  at.y += (y - at.y) * ease;
  if (settle && Math.abs(at.x - x) + Math.abs(at.y - y) < 1.5) at.done = true;
  return [at.x, at.y];
}

// mode: '' | 'bolt' | 'grab' - which booster is waiting for a tap
function draw(g, time, mode) {
  var c = view.cell, m = BELT_MARGIN, i, j, p, x, y, k, q;
  var playing = g.status === 'playing';
  ctx.clearRect(0, 0, view.w, view.h);
  ctx.save();
  if (fx.shake > 0) ctx.translate(Math.sin(time * 70) * fx.shake * 7, Math.cos(time * 55) * fx.shake * 4);

  // the loop
  var bx = px(g, -m), by = py(g, -m), bw = g.lw * c, bh = g.lh * c, br = m * 0.9 * c;
  roundRect(bx, by, bw, bh, br);
  ctx.lineWidth = c * 1.62;
  ctx.strokeStyle = 'rgba(15,23,42,.5)';
  ctx.stroke();
  ctx.lineWidth = c * 1.62 - 4;
  ctx.strokeStyle = fx.deny > 0 ? 'rgba(127,29,29,.75)' : g.auto ? 'rgba(49,46,129,.95)' : 'rgba(30,41,59,.9)';
  ctx.stroke();
  ctx.setLineDash([c * 0.35, c * 0.85]);
  ctx.lineDashOffset = -time * g.speed * c * (playing ? (g.auto ? AUTO_SPEED : 1) : 0);
  ctx.lineWidth = Math.max(2, c * 0.14);
  ctx.strokeStyle = g.auto ? 'rgba(253,224,71,.8)' : 'rgba(148,163,184,.55)';
  ctx.stroke();
  ctx.setLineDash([]);

  // tray under the cubes
  roundRect(px(g, -0.72), py(g, -0.72), (g.w + 0.44) * c, (g.h + 0.44) * c, c * 0.45);
  ctx.fillStyle = 'rgba(238,242,255,.94)';
  ctx.fill();

  // free seats on the loop, at the bottom-left corner where the carts wait
  var free = g.maxSeats - g.riders(), sx = px(g, -m), sy = py(g, g.h - 1 + m);
  var sr = Math.max(13, c * 0.95);
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, 7);
  ctx.fillStyle = free ? '#0f172a' : '#7f1d1d';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,.5)';
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '800 ' + Math.round(sr * 0.62) + 'px ' + UI;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(free + '/' + g.maxSeats, sx, sy - sr * 0.08);
  ctx.font = '700 ' + Math.max(7, Math.round(sr * 0.32)) + 'px ' + UI;
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.fillText('SEATS', sx, sy + sr * 0.48);

  // cubes
  var glow = mode === 'bolt' ? 0.5 + 0.5 * Math.sin(time * 8) : 0;
  for (i = 0; i < fx.vis.length; i++) {
    x = px(g, i % g.w);
    y = py(g, Math.floor(i / g.w));
    if (fx.vis[i]) {
      drawCube(x, y, c * 0.92, fx.vis[i], 1);
      if (glow && g.grid[i]) {
        ctx.strokeStyle = 'rgba(253,224,71,' + (0.35 + glow * 0.5) + ')';
        ctx.lineWidth = 1.5;
        roundRect(x - c * 0.46, y - c * 0.46, c * 0.92, c * 0.92, c * 0.2);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = 'rgba(99,102,241,.1)';
      ctx.beginPath();
      ctx.arc(x, y, c * 0.1, 0, 7);
      ctx.fill();
    }
  }
  for (i = 0; i < fx.pops.length; i++) {
    p = fx.pops[i];
    k = p.t / 0.2;
    drawCube(p.x, p.y, c * (0.92 + k * 0.5), p.key, 1 - k);
  }

  // shots in flight
  for (i = 0; i < fx.shots.length; i++) {
    p = fx.shots[i];
    k = p.t / p.dur;
    x = p.x0 + (p.x1 - p.x0) * k;
    y = p.y0 + (p.y1 - p.y0) * k;
    ctx.strokeStyle = PALETTE[p.key][1];
    ctx.lineWidth = c * 0.2;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(p.x0 + (p.x1 - p.x0) * Math.max(0, k - 0.35), p.y0 + (p.y1 - p.y0) * Math.max(0, k - 0.35));
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, c * 0.2, 0, 7);
    ctx.fill();
    ctx.fillStyle = PALETTE[p.key][1];
    ctx.beginPath();
    ctx.arc(x, y, c * 0.14, 0, 7);
    ctx.fill();
  }

  // the belt: one place per parked jelly, under the loop
  var tr = view.tr, fullBelt = g.parkedCount() >= g.maxSlots;
  roundRect(slotX(g, 0) - tr * 1.3, view.trayY - tr * 1.2, (g.maxSlots - 1) * tr * 2.5 + tr * 2.6, tr * 2.4, tr * 0.9);
  ctx.fillStyle = 'rgba(15,23,42,.5)';
  ctx.fill();
  for (i = 0; i < g.maxSlots; i++) {
    roundRect(slotX(g, i) - tr, view.trayY - tr, tr * 2, tr * 2, tr * 0.45);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = fullBelt ? 'rgba(248,113,113,.85)' : 'rgba(255,255,255,.18)';
    ctx.stroke();
  }
  for (i = 0; i < g.maxSlots; i++) {
    j = g.slots[i];
    if (!j) continue;
    q = glide(j.id, slotX(g, i), view.trayY, true);
    drawJelly(q[0], q[1] + tr * 0.06, tr * 0.8, j.color, j.ammo, playing ? Math.sin(time * 4 + j.id) * 0.04 : 0, 1);
  }

  // jellies out on the loop, and those waiting to join it
  var r = c * 0.7, ride = g.belt.concat(g.pending), en = entryXY(g);
  for (i = 0; i < ride.length; i++) {
    j = ride[i];
    var onLoop = i < g.belt.length;
    if (onLoop) {
      p = beltPoint(g, g.entry + j.d);
      x = px(g, p[0]);
      y = py(g, p[1]);
    } else {
      x = en[0] + (i - g.belt.length) * r * 0.7;
      y = en[1] + c * 0.2;
    }
    q = glide(j.id, x, y, onLoop);
    k = fx.kick[j.id] || 0;
    drawCart(q[0], q[1], r);
    drawJelly(q[0], q[1], r * (1 + k * 0.22), j.color, j.ammo, Math.sin(time * 9 + j.id) * 0.05, 1);
  }

  // particles
  for (i = 0; i < fx.bits.length; i++) {
    p = fx.bits[i];
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    ctx.fillStyle = PALETTE[p.key][1];
    ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
  }
  ctx.globalAlpha = 1;

  // hand: one queue per column, front jelly on top and playable
  var jr = view.jr, seatsFull = g.riders() >= g.maxSeats;
  for (i = 0; i < g.hand.length; i++) {
    var col = g.hand[i], hx = colX(g, i), sl = fx.slide[i] || 0, show = handShow(col);
    roundRect(hx - view.colGap * 0.44, view.handTop + 2, view.colGap * 0.88, view.handH - 6, 16);
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    ctx.fill();
    for (k = col.length ? show : -1; k >= 0; k--) {
      var back = Math.min(k + sl, show + 0.5);
      var s = back <= 1 ? 1 - 0.38 * back : 0.62;
      y = handY(back);
      var bob = k === 0 && !seatsFull && playing ? Math.sin(time * 4 + i) * 0.04 : 0;
      var dim = mode === 'grab' ? 1 : k === 0 ? (seatsFull ? 0.55 : 1) : 0.9;
      var hid = col[k].hidden;
      drawJelly(hx, y, jr * s, hid ? '?' : col[k].color, hid ? '?' : col[k].ammo, bob, dim);
      if (mode === 'grab') {
        ctx.beginPath();
        ctx.arc(hx, y + jr * s * 0.06, jr * s * 0.98, 0, 7);
        ctx.setLineDash([jr * 0.22, jr * 0.2]);
        ctx.lineDashOffset = -time * jr * 0.5;
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fde047';
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (col.length - 1 > show) {
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.font = '700 ' + Math.round(jr * 0.4) + 'px ' + UI;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('+' + (col.length - 1 - show), hx + jr * 0.72, show ? handY(show) : frontY() + jr * 1.3);
    }
  }

  // quick finish: a light sweep over everything
  if (fx.flash > 0) {
    ctx.fillStyle = 'rgba(253,224,71,' + fx.flash * 0.18 + ')';
    ctx.fillRect(0, 0, view.w, view.h);
  }
  ctx.restore();
}

// ---------- what is under a touch ----------

function columnAt(g, x, y) {
  if (y < view.handTop) return -1;
  var c = Math.round((x - view.cx) / view.colGap + (g.hand.length - 1) / 2);
  return c >= 0 && c < g.hand.length && Math.abs(x - colX(g, c)) < view.colGap * 0.5 ? c : -1;
}

// With the Grabber: which jelly of the column (0 = front) is nearest the touch.
function depthAt(g, c, y) {
  var col = g.hand[c], show = handShow(col), best = 0, d = 1e9, k;
  for (k = 0; k <= show; k++) {
    var dy = Math.abs(y - handY(k));
    if (dy < d) { d = dy; best = k; }
  }
  return best;
}

function slotAt(g, x, y) {
  if (Math.abs(y - view.trayY) > view.tr * 1.35) return -1;
  var s = Math.round((x - view.cx) / (view.tr * 2.5) + (g.maxSlots - 1) / 2);
  return s >= 0 && s < g.maxSlots ? s : -1;
}

function cellAt(g, x, y) {
  var gx = Math.round((x - px(g, 0)) / view.cell), gy = Math.round((y - py(g, 0)) / view.cell);
  if (gx < 0 || gy < 0 || gx >= g.w || gy >= g.h) return -1;
  return gy * g.w + gx;
}

// A picture as a little pixel image, for the map and the level card.
function thumb(art, size) {
  var s = Math.max(1, Math.floor(size / Math.max(art[0].length, art.length)));
  var cv = document.createElement('canvas'), x, y;
  cv.width = art[0].length * s;
  cv.height = art.length * s;
  var t = cv.getContext('2d');
  for (y = 0; y < art.length; y++) {
    for (x = 0; x < art[0].length; x++) {
      var ch = art[y].charAt(x);
      if (ch === '.') continue;
      t.fillStyle = PALETTE[cubeColor(ch)][1];
      t.fillRect(x * s, y * s, s, s);
      if (ch !== '#' && ch !== ch.toUpperCase()) {
        t.fillStyle = 'rgba(224,242,254,.6)';
        t.fillRect(x * s, y * s, s, s);
      }
    }
  }
  return cv;
}
