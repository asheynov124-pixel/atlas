// render.js - draws a Game onto the canvas. No rules live here.

var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');
var view = { w: 0, h: 0, cell: 20, cx: 0, cy: 0, handTop: 0, handH: 0, colGap: 0, jr: 0 };
var fx = { shots: [], pops: [], bits: [], vis: [], pos: {}, kick: {}, slide: [], shake: 0, deny: 0 };

function layout(g) {
  var dpr = Math.min(window.devicePixelRatio || 1, 3);
  var w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  var top = document.getElementById('hud').getBoundingClientRect().bottom + 4;
  var safe = document.getElementById('safe').offsetHeight;
  var handH = Math.max(140, Math.min(240, h * 0.27));
  var bottom = h - safe - handH;
  var spanX = g.w + 2 * BELT_MARGIN + 1.7, spanY = g.h + 2 * BELT_MARGIN + 1.7;
  view.w = w;
  view.h = h;
  view.cell = Math.max(8, Math.min((w - 6) / spanX, (bottom - top) / spanY, 44));
  view.cx = w / 2;
  view.cy = top + (bottom - top) / 2;
  view.handTop = bottom;
  view.handH = handH;
  view.colGap = Math.min((w - 20) / g.hand.length, 96);
  view.jr = Math.min(view.colGap * 0.38, handH * 0.2, 36);
}

function px(g, x) { return view.cx + (x - (g.w - 1) / 2) * view.cell; }
function py(g, y) { return view.cy + (y - (g.h - 1) / 2) * view.cell; }
function colX(g, c) { return view.cx + (c - (g.hand.length - 1) / 2) * view.colGap; }
function frontY() { return view.handTop + view.jr * 1.15 + 10; }

// Where a jelly is drawn at belt distance u: the same rectangle as the rules use,
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

function drawCube(x, y, s, key, alpha) {
  var r = s * 0.22;
  ctx.globalAlpha = alpha;
  roundRect(x - s / 2, y - s / 2, s, s, r);
  ctx.fillStyle = PALETTE[key][1];
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  roundRect(x - s * 0.36, y - s * 0.38, s * 0.72, s * 0.26, r * 0.7);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.14)';
  roundRect(x - s / 2, y + s * 0.26, s, s * 0.24, r);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawJelly(x, y, r, key, ammo, squash, alpha) {
  var col = PALETTE[key];
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
  ctx.fillStyle = col[1];
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.1);
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.5, -r * 0.42, r * 0.13, r * 0.26, 0.6, 0, 7);
  ctx.fill();
  var e;
  for (e = -1; e <= 1; e += 2) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(e * r * 0.32, -r * 0.2, r * 0.2, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(e * r * 0.32 + r * 0.04, -r * 0.17, r * 0.1, 0, 7);
    ctx.fill();
  }
  ctx.fillStyle = col[2];
  ctx.font = '800 ' + Math.round(r * 0.74) + 'px system-ui,-apple-system,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ammo, 0, r * 0.52);
  ctx.restore();
}

function burst(x, y, key, n, power) {
  var i, a, v;
  for (i = 0; i < n; i++) {
    a = Math.random() * 6.283;
    v = power * (0.4 + Math.random() * 0.8);
    fx.bits.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.3, life: 0.35 + Math.random() * 0.3, t: 0, key: key, s: view.cell * (0.12 + Math.random() * 0.14) });
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
}

// Advance animations. Returns how many shots landed this frame (for the pop sound).
function stepFx(g, dt) {
  var i, s, b, landed = 0;
  for (i = fx.shots.length - 1; i >= 0; i--) {
    s = fx.shots[i];
    s.t += dt;
    if (s.t >= s.dur) {
      fx.vis[s.cell] = '';
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
  return landed;
}

function draw(g, time) {
  var c = view.cell, m = BELT_MARGIN, i, j, p, x, y, k;
  ctx.clearRect(0, 0, view.w, view.h);
  ctx.save();
  if (fx.shake > 0) ctx.translate(Math.sin(time * 70) * fx.shake * 7, Math.cos(time * 55) * fx.shake * 4);

  // belt
  var bx = px(g, -m), by = py(g, -m), bw = g.lw * c, bh = g.lh * c, br = m * 0.9 * c;
  roundRect(bx, by, bw, bh, br);
  ctx.lineWidth = c * 1.62;
  ctx.strokeStyle = 'rgba(15,23,42,.5)';
  ctx.stroke();
  ctx.lineWidth = c * 1.62 - 4;
  ctx.strokeStyle = fx.deny > 0 ? 'rgba(127,29,29,.75)' : 'rgba(30,41,59,.9)';
  ctx.stroke();
  ctx.setLineDash([c * 0.35, c * 0.85]);
  ctx.lineDashOffset = -time * g.speed * c * (g.status === 'playing' ? 1 : 0);
  ctx.lineWidth = Math.max(2, c * 0.14);
  ctx.strokeStyle = 'rgba(148,163,184,.55)';
  ctx.stroke();
  ctx.setLineDash([]);

  // tray under the cubes
  roundRect(px(g, -0.72), py(g, -0.72), (g.w + 0.44) * c, (g.h + 0.44) * c, c * 0.45);
  ctx.fillStyle = 'rgba(238,242,255,.94)';
  ctx.fill();

  // slot pips, just under the spot where jellies join the belt
  var used = g.slotsUsed(), ey = py(g, g.h - 1 + m) + c * 1.12, pr = Math.max(3, c * 0.16);
  for (i = 0; i < g.maxSlots; i++) {
    ctx.beginPath();
    ctx.arc(view.cx + (i - (g.maxSlots - 1) / 2) * pr * 3.2, ey, pr, 0, 7);
    ctx.fillStyle = i < used ? (used >= g.maxSlots ? '#f87171' : '#fde047') : 'rgba(255,255,255,.22)';
    ctx.fill();
  }
  // upgrade charges left this level, either side of the pips
  ctx.font = '700 ' + Math.max(9, Math.round(c * 0.44)) + 'px system-ui,-apple-system,sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(253,224,71,.9)';
  if (g.jumps > 0) {
    ctx.textAlign = 'right';
    ctx.fillText('JUMP x' + g.jumps, view.cx - g.maxSlots * pr * 1.9, ey);
  }
  if (g.rescues > 0) {
    ctx.textAlign = 'left';
    ctx.fillText('WIND x' + g.rescues, view.cx + g.maxSlots * pr * 1.9, ey);
  }

  // cubes
  for (i = 0; i < fx.vis.length; i++) {
    x = px(g, i % g.w);
    y = py(g, Math.floor(i / g.w));
    if (fx.vis[i]) drawCube(x, y, c * 0.92, fx.vis[i], 1);
    else {
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

  // jellies riding the belt, and those waiting to join it
  var r = c * 0.7, ride = g.belt.concat(g.pending), ease = 1 - Math.exp(-0.016 * 16);
  for (i = 0; i < ride.length; i++) {
    j = ride[i];
    var onBelt = i < g.belt.length;
    if (onBelt) {
      p = beltPoint(g, g.entry + j.d);
      x = px(g, p[0]);
      y = py(g, p[1]);
    } else {
      x = view.cx + (i - g.belt.length) * r * 0.7;
      y = py(g, g.h - 1 + m) + c * 0.2;
    }
    var at = fx.pos[j.id];
    if (at && !at.done) {
      at.x += (x - at.x) * ease;
      at.y += (y - at.y) * ease;
      if (onBelt && Math.abs(at.x - x) + Math.abs(at.y - y) < 1.5) at.done = true;
      x = at.x;
      y = at.y;
    }
    k = fx.kick[j.id] || 0;
    drawJelly(x, y, r * (1 + k * 0.22), j.color, j.ammo, Math.sin(time * 9 + j.id) * 0.05, 1);
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
  var jr = view.jr, fy = frontY(), full = used >= g.maxSlots;
  for (i = 0; i < g.hand.length; i++) {
    var col = g.hand[i], hx = colX(g, i), sl = fx.slide[i] || 0;
    roundRect(hx - view.colGap * 0.44, view.handTop + 2, view.colGap * 0.88, view.handH - 6, 16);
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    ctx.fill();
    // how many queued jellies fit under the front one
    var room = Math.floor(1 + (view.handH - 14 - jr * 3.39) / (jr * 1.12));
    var show = Math.max(0, Math.min(3, room, col.length - 1));
    for (k = col.length ? show : -1; k >= 0; k--) {
      var back = Math.min(k + sl, show + 0.5);
      var s = back <= 1 ? 1 - 0.38 * back : 0.62;
      y = fy + (back <= 1 ? back * jr * 1.62 : jr * 1.62 + (back - 1) * jr * 1.12);
      var bob = k === 0 && !full && g.status === 'playing' ? Math.sin(time * 4 + i) * 0.04 : 0;
      drawJelly(hx, y, jr * s, col[k].color, col[k].ammo, bob, k === 0 ? (full ? 0.55 : 1) : 0.9);
      if (k === 1 && g.jumps > 0 && !full && sl < 0.05) {
        // a Queue Jump is available: ring the second jelly to show it can be tapped
        ctx.beginPath();
        ctx.arc(hx, y + jr * 0.06, jr * 0.84, 0, 7);
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
      ctx.font = '700 ' + Math.round(jr * 0.4) + 'px system-ui,-apple-system,sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('+' + (col.length - 1 - show), hx + jr * 0.72, fy + jr * (show ? 1.62 + (show - 1) * 1.12 : 1.3));
    }
  }
  ctx.restore();
}

// Which hand column is under a touch, or -1.
function columnAt(g, x, y) {
  if (y < view.handTop - view.jr * 0.4) return -1;
  var c = Math.round((x - view.cx) / view.colGap + (g.hand.length - 1) / 2);
  return c >= 0 && c < g.hand.length && Math.abs(x - colX(g, c)) < view.colGap * 0.5 ? c : -1;
}

// Is a touch at height y on the second jelly of a column (the Queue Jump target)?
function secondAt(y) {
  var top = frontY() + view.jr * 1.08;
  return y > top && y < top + view.jr * 1.25;
}
