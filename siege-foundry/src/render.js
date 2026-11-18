/*
 * Siege Foundry — RENDERING
 * =========================
 * Draws the battlefield on a canvas from a read-only view of the run.
 * Owns only cosmetic state (particles, floating numbers, screen shake,
 * smoothed cannon aim). It never changes the simulation.
 *
 * Feedback is fed in through ingest(events). With reduced motion, the same
 * information is shown without movement: no shake, no drifting particles,
 * numbers fade in place, the reticle and smoke stay still.
 */
(function (root) {
  'use strict';
  const SF = (root.SiegeFoundry = root.SiegeFoundry || {});

  const C = {
    skyTop: '#1a0f0d',
    skyBottom: '#3a1d14',
    ground: '#1f1a15',
    road: '#2a231c',
    roadEdge: '#3b3127',
    silhouette: '#140d0b',
    stone: '#4a4038',
    stoneDark: '#352d27',
    iron: '#2b2f33',
    ironLight: '#4a5258',
    brass: '#c9a24a',
    brassDim: '#7d6430',
    molten: '#ff8a2a',
    hot: '#ffe2a0',
    ember: '#ff4b33',
    steel: '#9fb6c4',
    text: '#f1e7d4',
    hpFill: '#f0e2b6',
    hpBack: 'rgba(10,8,6,0.85)',
    impA: '#ffb347',
    impB: '#e8452c',
    clankA: '#a3b0b8',
    clankB: '#5c6870',
    ramA: '#9a6634',
    ramB: '#5b3a1e',
    ramPlate: '#3f4950',
  };

  const FONT_HEAD = '"Copperplate", "Copperplate Gothic Bold", "Felix Titling", Georgia, serif';
  const FONT_NUM = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

  // ---------------------------------------------------------------- enemies
  function drawImp(ctx, x, y, r, t, still) {
    const flick = still ? 0 : Math.sin(t * 22 + x * 0.05) * r * 0.25;
    const g = ctx.createLinearGradient(x - r, y, x + r * 1.6, y);
    g.addColorStop(0, C.impA);
    g.addColorStop(1, C.impB);
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.quadraticCurveTo(x - r * 0.2, y - r * 1.15, x + r * 0.8, y - r * 0.75);
    ctx.lineTo(x + r * 1.65 + flick, y - r * 0.15);
    ctx.lineTo(x + r * 0.95, y + r * 0.15);
    ctx.lineTo(x + r * 1.35 - flick * 0.6, y + r * 0.75);
    ctx.quadraticCurveTo(x - r * 0.2, y + r * 1.05, x - r, y);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#2a0c06';
    ctx.stroke();
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.22, r * 0.16, 0, Math.PI * 2);
    ctx.arc(x - r * 0.02, y - r * 0.3, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawClanker(ctx, x, y, r, t, still) {
    const step = still ? 0 : Math.sin(t * 9 + x * 0.03) * r * 0.18;
    // legs
    ctx.fillStyle = C.clankB;
    ctx.fillRect(x - r * 0.6 + step, y + r * 0.7, r * 0.35, r * 0.45);
    ctx.fillRect(x + r * 0.25 - step, y + r * 0.7, r * 0.35, r * 0.45);
    // body
    const g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, C.clankA);
    g.addColorStop(1, C.clankB);
    ctx.beginPath();
    const w = r * 1.9;
    const h = r * 1.6;
    const bx = x - w / 2;
    const by = y - h / 2;
    const cut = r * 0.35;
    ctx.moveTo(bx + cut, by);
    ctx.lineTo(bx + w - cut, by);
    ctx.lineTo(bx + w, by + cut);
    ctx.lineTo(bx + w, by + h - cut);
    ctx.lineTo(bx + w - cut, by + h);
    ctx.lineTo(bx + cut, by + h);
    ctx.lineTo(bx, by + h - cut);
    ctx.lineTo(bx, by + cut);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1b2024';
    ctx.stroke();
    // plate seam + rivets
    ctx.strokeStyle = 'rgba(20,24,28,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + r * 0.15, by + 2);
    ctx.lineTo(x + r * 0.15, by + h - 2);
    ctx.stroke();
    ctx.fillStyle = '#d6dde2';
    for (const [rx, ry] of [
      [bx + cut * 0.9, by + cut * 0.9],
      [bx + w - cut * 0.9, by + cut * 0.9],
      [bx + cut * 0.9, by + h - cut * 0.9],
      [bx + w - cut * 0.9, by + h - cut * 0.9],
    ]) {
      ctx.beginPath();
      ctx.arc(rx, ry, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // visor slit, facing left
    ctx.fillStyle = '#ffb030';
    ctx.fillRect(bx + r * 0.25, y - r * 0.28, r * 0.75, r * 0.22);
  }

  function drawRam(ctx, x, y, r, t, still) {
    const stomp = still ? 0 : Math.sin(t * 6 + x * 0.02) * r * 0.08;
    // legs
    ctx.fillStyle = C.ramB;
    for (const lx of [-0.3, 0.5]) {
      ctx.fillRect(x + r * lx - r * 0.15, y + r * 0.45 + (lx < 0 ? stomp : -stomp), r * 0.32, r * 0.55);
    }
    // body
    const g = ctx.createRadialGradient(x + r * 0.2, y - r * 0.3, r * 0.2, x + r * 0.2, y, r * 1.2);
    g.addColorStop(0, C.ramA);
    g.addColorStop(1, C.ramB);
    ctx.beginPath();
    ctx.ellipse(x + r * 0.25, y, r * 1.05, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#24160b';
    ctx.stroke();
    // horns
    ctx.strokeStyle = '#e4d3a8';
    ctx.lineWidth = r * 0.16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - r * 0.45, y - r * 0.55);
    ctx.quadraticCurveTo(x - r * 0.2, y - r * 1.25, x - r * 1.05, y - r * 1.05);
    ctx.stroke();
    ctx.lineCap = 'butt';
    // iron battering plate, facing left
    const pg = ctx.createLinearGradient(x - r * 1.25, y, x - r * 0.35, y);
    pg.addColorStop(0, '#6c7a83');
    pg.addColorStop(1, C.ramPlate);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.35, y - r * 0.8);
    ctx.lineTo(x - r * 1.0, y - r * 0.55);
    ctx.lineTo(x - r * 1.3, y);
    ctx.lineTo(x - r * 1.0, y + r * 0.55);
    ctx.lineTo(x - r * 0.35, y + r * 0.8);
    ctx.closePath();
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1b2024';
    ctx.stroke();
    ctx.fillStyle = '#d6dde2';
    for (const ry of [-0.45, 0, 0.45]) {
      ctx.beginPath();
      ctx.arc(x - r * 0.75, y + r * ry, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // eye glow behind the plate
    ctx.fillStyle = '#ff5a3a';
    ctx.beginPath();
    ctx.arc(x - r * 0.2, y - r * 0.25, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  const DRAW = { imp: drawImp, clanker: drawClanker, ram: drawRam };

  function drawShield(ctx, x, y, s, color) {
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.85, y - s * 0.6);
    ctx.lineTo(x + s * 0.7, y + s * 0.35);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s * 0.7, y + s * 0.35);
    ctx.lineTo(x - s * 0.85, y - s * 0.6);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  // --------------------------------------------------------------- renderer
  function createRenderer(canvas, config) {
    const ctx = canvas.getContext('2d');
    const F = config.field;
    const W = F.width;
    const H = F.height;
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    let reducedMotion = !!(mq && mq.matches);
    if (mq && mq.addEventListener) mq.addEventListener('change', (e) => (reducedMotion = e.matches));

    let scale = 1;
    let bg = null;
    let time = 0;
    let particles = [];
    let floaters = [];
    let shake = 0;
    let foundryFlash = 0;
    let muzzleFlash = 0;
    let upgradeGlow = 0;
    let banner = null;
    let aim = 0;

    function resize() {
      const dpr = Math.min(2, root.devicePixelRatio || 1);
      const cssW = canvas.clientWidth || W;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round((cssW * H) / W * dpr);
      scale = canvas.width / W;
      bg = buildBackground(canvas.width, canvas.height);
    }

    function buildBackground(pw, ph) {
      const off = document.createElement('canvas');
      off.width = pw;
      off.height = ph;
      const b = off.getContext('2d');
      b.scale(pw / W, ph / H);
      const sky = b.createLinearGradient(0, 0, 0, 200);
      sky.addColorStop(0, C.skyTop);
      sky.addColorStop(1, C.skyBottom);
      b.fillStyle = sky;
      b.fillRect(0, 0, W, 200);
      // distant works: chimneys and roofs (deterministic shapes)
      const rng = SF.sim.makeRng(7);
      b.fillStyle = C.silhouette;
      let x = 200;
      while (x < W) {
        const w = 40 + rng() * 70;
        const h = 30 + rng() * 60;
        b.fillRect(x, 200 - h, w, h);
        if (rng() > 0.45) b.fillRect(x + w * 0.3, 200 - h - 30 - rng() * 40, 9, 80);
        if (rng() > 0.6) {
          b.beginPath();
          b.moveTo(x, 200 - h);
          b.lineTo(x + w / 2, 200 - h - 18);
          b.lineTo(x + w, 200 - h);
          b.fill();
        }
        x += w + 6 + rng() * 30;
      }
      // a glowing furnace line on the horizon
      const glow = b.createLinearGradient(0, 185, 0, 205);
      glow.addColorStop(0, 'rgba(255,120,40,0)');
      glow.addColorStop(0.5, 'rgba(255,120,40,0.22)');
      glow.addColorStop(1, 'rgba(255,120,40,0)');
      b.fillStyle = glow;
      b.fillRect(0, 185, W, 20);
      // ground
      b.fillStyle = C.ground;
      b.fillRect(0, 200, W, H - 200);
      // the approach road
      b.fillStyle = C.road;
      b.fillRect(F.foundryFrontX, F.laneTop - 6, W, F.laneBottom - F.laneTop + 12);
      b.strokeStyle = C.roadEdge;
      b.lineWidth = 2;
      b.beginPath();
      b.moveTo(F.foundryFrontX, F.laneTop - 6);
      b.lineTo(W, F.laneTop - 6);
      b.moveTo(F.foundryFrontX, F.laneBottom + 6);
      b.lineTo(W, F.laneBottom + 6);
      b.stroke();
      // cobbles
      b.strokeStyle = 'rgba(0,0,0,0.25)';
      b.lineWidth = 1;
      for (let i = 0; i < 260; i++) {
        const cx = F.foundryFrontX + rng() * (W - F.foundryFrontX);
        const cy = F.laneTop + rng() * (F.laneBottom - F.laneTop);
        b.strokeRect(cx, cy, 10 + rng() * 10, 6 + rng() * 4);
      }
      // range arc
      b.save();
      b.beginPath();
      b.rect(F.foundryFrontX, 200, W, H - 200);
      b.clip();
      b.setLineDash([10, 8]);
      b.strokeStyle = 'rgba(201,162,74,0.45)';
      b.lineWidth = 2;
      b.beginPath();
      b.arc(F.turretX, F.turretY, config.turret.range, -0.5, 0.6);
      b.stroke();
      b.restore();
      b.fillStyle = 'rgba(201,162,74,0.75)';
      b.font = `600 11px ${FONT_HEAD}`;
      b.textAlign = 'left';
      b.fillText('◂ CANNON RANGE', F.turretX + config.turret.range + 8, F.laneTop + 14);
      return off;
    }

    // ------------------------------------------------------------- feedback
    function burst(x, y, n, color, speed, life, size) {
      if (reducedMotion) n = Math.min(n, 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = reducedMotion ? 0 : speed * (0.4 + Math.random() * 0.8);
        particles.push({
          x: x + (reducedMotion ? (Math.random() - 0.5) * 10 : 0),
          y: y + (reducedMotion ? (Math.random() - 0.5) * 10 : 0),
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s,
          life,
          max: life,
          color,
          size,
        });
      }
    }

    function floater(x, y, text, color, size, blocked) {
      floaters.push({ x, y, text, color, size, life: 0.8, max: 0.8, blocked });
      if (floaters.length > 60) floaters.shift();
    }

    function ingest(events) {
      for (const ev of events) {
        switch (ev.type) {
          case 'shot':
            muzzleFlash = 0.07;
            break;
          case 'hit':
            burst(ev.x, ev.y, 5, ev.blocked > 0 ? C.steel : C.hot, 140, 0.25, 2);
            floater(ev.x + 6, ev.y - 18, String(ev.damage), ev.blocked > 0 ? C.steel : C.hot, 13, ev.blocked > 0);
            break;
          case 'kill':
            burst(ev.x, ev.y, 10 + ev.radius, ev.enemy === 'imp' ? C.impA : ev.enemy === 'ram' ? C.ramA : C.clankA, 160, 0.5, 3);
            break;
          case 'breach':
            burst(ev.x + 4, ev.y, 16, C.ember, 220, 0.5, 3);
            floater(ev.x + 30, ev.y - 26, `-${ev.damage}`, C.ember, 22 + Math.min(10, ev.damage * 0.4), false);
            foundryFlash = 0.35;
            if (!reducedMotion) shake = Math.min(0.3, shake + 0.12 + ev.damage * 0.006);
            break;
          case 'upgrade':
            upgradeGlow = 1;
            break;
          case 'waveStart':
            banner = { text: `WAVE ${ev.index + 1} · ${ev.name.toUpperCase()}`, life: 2, max: 2 };
            break;
        }
      }
    }

    function reset() {
      particles = [];
      floaters = [];
      shake = 0;
      foundryFlash = 0;
      banner = null;
    }

    // ---------------------------------------------------------------- draw
    function drawFoundry(run) {
      const hpFrac = run.foundry.hp / run.foundry.max;
      const fx = F.foundryFrontX;
      // chimney + smoke
      ctx.fillStyle = C.stoneDark;
      ctx.fillRect(38, 70, 34, 140);
      ctx.fillStyle = C.iron;
      ctx.fillRect(34, 64, 42, 10);
      for (let i = 0; i < 4; i++) {
        const phase = reducedMotion ? i * 0.25 : (time * 0.25 + i * 0.25) % 1;
        ctx.fillStyle = `rgba(70,60,55,${0.45 * (1 - phase)})`;
        ctx.beginPath();
        ctx.arc(55 + phase * 30, 58 - phase * 60, 10 + phase * 18, 0, Math.PI * 2);
        ctx.fill();
      }
      // main hall
      const sg = ctx.createLinearGradient(0, 200, fx, 200);
      sg.addColorStop(0, C.stoneDark);
      sg.addColorStop(1, C.stone);
      ctx.fillStyle = sg;
      ctx.fillRect(14, 196, fx - 24, 318);
      // brick courses
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      for (let y = 214; y < 512; y += 18) {
        ctx.beginPath();
        ctx.moveTo(14, y);
        ctx.lineTo(fx - 10, y);
        ctx.stroke();
      }
      // gun tower
      ctx.fillStyle = C.stone;
      ctx.fillRect(92, 182, 72, 60);
      ctx.fillStyle = C.stoneDark;
      for (let i = 0; i < 4; i++) ctx.fillRect(92 + i * 20, 170, 13, 14);
      // iron front wall, the line enemies breach against
      const wg = ctx.createLinearGradient(fx - 22, 0, fx, 0);
      wg.addColorStop(0, C.iron);
      wg.addColorStop(1, C.ironLight);
      ctx.fillStyle = wg;
      ctx.fillRect(fx - 22, 196, 22, 318);
      ctx.fillStyle = C.brassDim;
      for (let y = 210; y < 510; y += 26) {
        ctx.beginPath();
        ctx.arc(fx - 11, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      // furnace mouth
      const pulse = reducedMotion ? 0.8 : 0.7 + Math.sin(time * 3) * 0.15;
      const mg = ctx.createRadialGradient(80, 420, 4, 80, 420, 60);
      mg.addColorStop(0, `rgba(255,226,160,${pulse})`);
      mg.addColorStop(0.5, `rgba(255,120,40,${pulse * 0.8})`);
      mg.addColorStop(1, 'rgba(120,30,10,0)');
      ctx.fillStyle = '#120a06';
      ctx.beginPath();
      ctx.moveTo(44, 470);
      ctx.lineTo(44, 410);
      ctx.arc(80, 410, 36, Math.PI, 0);
      ctx.lineTo(116, 470);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = mg;
      ctx.fill();
      // damage cracks
      ctx.strokeStyle = 'rgba(12,8,6,0.9)';
      ctx.lineWidth = 2;
      const cracks = [
        [0.75, [[fx - 20, 250], [fx - 40, 272], [fx - 34, 296], [fx - 58, 318]]],
        [0.5, [[fx - 22, 360], [fx - 50, 352], [fx - 66, 380], [fx - 92, 372]]],
        [0.25, [[30, 220], [52, 250], [44, 282], [70, 300], [64, 330]]],
        [0.25, [[fx - 18, 470], [fx - 44, 452], [fx - 40, 430]]],
      ];
      for (const [threshold, pts] of cracks) {
        if (hpFrac > threshold) continue;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
        ctx.stroke();
      }
      if (foundryFlash > 0) {
        ctx.fillStyle = `rgba(255,60,40,${(foundryFlash / 0.35) * 0.45})`;
        ctx.fillRect(14, 170, fx - 14, 344);
      }
    }

    function drawCannon(run) {
      const px = F.turretX;
      const py = F.turretY;
      const target = run.turret.aim;
      if (reducedMotion) aim = target;
      else {
        let d = target - aim;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        aim += d * Math.min(1, 0.35);
      }
      const recoil = reducedMotion ? 0 : (muzzleFlash / 0.07) * 4;
      ctx.save();
      ctx.translate(px, py);
      if (upgradeGlow > 0) {
        ctx.strokeStyle = `rgba(255,214,120,${upgradeGlow * 0.8})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 26 + (reducedMotion ? 0 : (1 - upgradeGlow) * 22), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.rotate(aim);
      const bg2 = ctx.createLinearGradient(0, -7, 0, 7);
      bg2.addColorStop(0, '#8d9aa2');
      bg2.addColorStop(0.5, '#5b666d');
      bg2.addColorStop(1, '#2f363b');
      ctx.fillStyle = bg2;
      ctx.fillRect(4 - recoil, -7, 38, 14);
      ctx.strokeStyle = '#0d0f11';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(4 - recoil, -7, 38, 14);
      ctx.fillStyle = C.brass;
      ctx.fillRect(14 - recoil, -8, 4, 16);
      ctx.fillRect(34 - recoil, -8.5, 6, 17);
      if (muzzleFlash > 0) {
        ctx.fillStyle = 'rgba(255,230,160,0.95)';
        ctx.beginPath();
        ctx.arc(46, 0, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = C.ironLight;
      ctx.beginPath();
      ctx.arc(px, py, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.brass;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = C.molten;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawEnemy(e) {
      const draw = DRAW[e.type];
      draw(ctx, e.x, e.y, e.radius, time, reducedMotion);
      if (e.hitFlash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${e.hitFlash * 4})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius * 1.05, 0, Math.PI * 2);
        ctx.fill();
      }
      // health bar
      const bw = Math.max(24, e.radius * 2);
      const bx = e.x - bw / 2;
      const by = e.y - e.radius - (e.type === 'ram' ? 20 : 12);
      ctx.fillStyle = C.hpBack;
      ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
      ctx.fillStyle = C.hpFill;
      ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 4);
      if (e.armor > 0) {
        drawShield(ctx, bx - 8, by + 2, 6, C.steel);
        ctx.fillStyle = '#10161a';
        ctx.font = `700 8px ${FONT_NUM}`;
        ctx.textAlign = 'center';
        ctx.fillText(String(e.armor), bx - 8, by + 5);
      }
    }

    function drawTargeting(run) {
      const target = run.enemies.find((e) => e.id === run.turret.targetId);
      if (!target) return;
      const mx = F.turretX + Math.cos(run.turret.aim) * 44;
      const my = F.turretY + Math.sin(run.turret.aim) * 44;
      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(255,214,120,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.restore();
      const s = target.radius + 7;
      const spin = reducedMotion ? 0 : time * 1.6;
      ctx.save();
      ctx.translate(target.x, target.y);
      ctx.rotate(spin);
      ctx.strokeStyle = '#ffd678';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(s, s - 6);
        ctx.lineTo(s, s);
        ctx.lineTo(s - 6, s);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawProjectiles(run) {
      for (const p of run.projectiles) {
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const tail = 18;
        const g = ctx.createLinearGradient(p.x - (dx / d) * tail, p.y - (dy / d) * tail, p.x, p.y);
        g.addColorStop(0, 'rgba(255,138,42,0)');
        g.addColorStop(1, 'rgba(255,170,70,0.9)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(p.x - (dx / d) * tail, p.y - (dy / d) * tail);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.fillStyle = C.hot;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.raw > config.turret.damage ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawParticles(dt) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.9;
        p.vy *= 0.9;
        ctx.globalAlpha = p.life / p.max;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }

    function drawFloaters(dt) {
      ctx.textAlign = 'center';
      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];
        f.life -= dt;
        if (f.life <= 0) {
          floaters.splice(i, 1);
          continue;
        }
        if (!reducedMotion) f.y -= 30 * dt;
        ctx.globalAlpha = Math.min(1, (f.life / f.max) * 1.6);
        ctx.font = `700 ${f.size}px ${FONT_NUM}`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(10,6,4,0.85)';
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
        if (f.blocked) drawShield(ctx, f.x + f.size * 0.55 + 4, f.y - f.size * 0.35, 4, C.steel);
      }
      ctx.globalAlpha = 1;
    }

    function drawBanner(dt) {
      if (!banner) return;
      banner.life -= dt;
      if (banner.life <= 0) {
        banner = null;
        return;
      }
      const a = Math.min(1, banner.life / 0.5, (banner.max - banner.life) / 0.25 + (reducedMotion ? 1 : 0));
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(12,8,6,0.65)';
      ctx.fillRect(W / 2 - 230, 96, 460, 46);
      ctx.strokeStyle = C.brass;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(W / 2 - 230, 96, 460, 46);
      ctx.fillStyle = C.text;
      ctx.font = `700 24px ${FONT_HEAD}`;
      ctx.textAlign = 'center';
      ctx.fillText(banner.text, W / 2, 128);
      ctx.globalAlpha = 1;
    }

    function draw(run, dt) {
      time += dt;
      shake = Math.max(0, shake - dt);
      foundryFlash = Math.max(0, foundryFlash - dt);
      muzzleFlash = Math.max(0, muzzleFlash - dt);
      upgradeGlow = Math.max(0, upgradeGlow - dt * 1.25);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(bg, 0, 0);
      const sx = shake > 0 ? (Math.random() - 0.5) * shake * 18 : 0;
      const sy = shake > 0 ? (Math.random() - 0.5) * shake * 18 : 0;
      ctx.setTransform(scale, 0, 0, scale, sx * scale, sy * scale);

      drawFoundry(run);
      const ordered = run.enemies.slice().sort((a, b) => a.y - b.y);
      for (const e of ordered) drawEnemy(e);
      drawTargeting(run);
      drawProjectiles(run);
      drawParticles(dt);
      drawCannon(run);
      drawFloaters(dt);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawBanner(dt);
    }

    /** Small standalone icon for menus and the legend. */
    function paintIcon(iconCanvas, type) {
      const dpr = Math.min(2, root.devicePixelRatio || 1);
      const size = iconCanvas.clientWidth || 40;
      iconCanvas.width = size * dpr;
      iconCanvas.height = size * dpr;
      const c = iconCanvas.getContext('2d');
      c.scale(dpr, dpr);
      const r = type === 'ram' ? size * 0.3 : type === 'clanker' ? size * 0.3 : size * 0.28;
      DRAW[type](c, size * (type === 'imp' ? 0.42 : 0.52), size * 0.55, r, 0, true);
    }

    resize();
    return { resize, ingest, draw, reset, paintIcon, get reducedMotion() { return reducedMotion; } };
  }

  SF.createRenderer = createRenderer;
})(typeof self !== 'undefined' ? self : this);
