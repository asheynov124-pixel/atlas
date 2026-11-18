/*
 * Siege Foundry — SIMULATION
 * ==========================
 * Pure game logic. No DOM, no canvas, no timers: everything advances only
 * when `step(run, dt)` is called. The same file runs in the browser and in
 * Node (tests and the balance harness).
 *
 * States (explicit, and the only legal moves between them):
 *
 *   start ──startRun──▶ wave ──(timer ends, more waves)──▶ intermission
 *                        │  ▲                                    │
 *                        │  └──────────continueRun───────────────┘
 *                        ├──(final timer ends)──▶ win
 *                        └──(foundry hp 0)──────▶ loss
 *   win / loss ──restartRun──▶ (fresh run) wave
 *
 * The simulation reports what happened through `run.events` (shots, hits,
 * kills, breaches...). The renderer and UI drain that list each frame; the
 * simulation never cares whether anyone is listening.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.SiegeFoundry = root.SiegeFoundry || {}).sim = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STATES = Object.freeze({
    START: 'start',
    WAVE: 'wave',
    INTERMISSION: 'intermission',
    WIN: 'win',
    LOSS: 'loss',
  });

  const ALLOWED = Object.freeze({
    start: ['wave'],
    wave: ['intermission', 'win', 'loss'],
    intermission: ['wave'],
    win: [],
    loss: [],
  });

  const FIXED_DT = 1 / 60;

  // ---- Seeded RNG (mulberry32) ------------------------------------------
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- Derived numbers (shared by sim and UI, so they can never disagree)
  function turretStats(config, ranks) {
    const t = config.turret;
    return {
      interval: t.fireInterval * Math.pow(config.upgrades.rate.intervalMultiplier, ranks.rate),
      damage: t.damage + config.upgrades.damage.damageBonus * ranks.damage,
    };
  }

  function damagePerHit(config, shotDamage, armor) {
    return Math.max(config.turret.minDamage, shotDamage - armor);
  }

  /** Shots and seconds of continuous fire needed to destroy one enemy. */
  function timeToKill(config, stats, enemyType) {
    const e = config.enemies[enemyType];
    const perHit = damagePerHit(config, stats.damage, e.armor);
    const shots = Math.ceil(e.hp / perHit);
    return { perHit, shots, seconds: shots * stats.interval };
  }

  function waveComposition(config, waveIndex) {
    const counts = {};
    for (const g of config.waves[waveIndex].spawns) counts[g.type] = (counts[g.type] || 0) + g.count;
    return counts;
  }

  function totalRunSeconds(config) {
    return config.waves.reduce((s, w) => s + w.duration, 0);
  }

  // ---- Run creation -------------------------------------------------------
  function createRun(config, seed) {
    if (seed === undefined || seed === null) seed = (Math.random() * 2 ** 32) >>> 0;
    const ranks = { rate: 0, damage: 0 };
    const stats = turretStats(config, ranks);
    const zeroByType = () => Object.fromEntries(Object.keys(config.enemies).map((k) => [k, 0]));
    return {
      config,
      seed,
      rng: makeRng(seed),
      state: STATES.START,
      transitions: [],
      waveIndex: -1,
      waveTime: 0,
      runTime: 0,
      intermissionIndex: -1,
      purchasedThisIntermission: null,
      lastAward: 0,
      currency: config.economy.startingCurrency,
      ranks,
      foundry: { hp: config.foundry.maxHealth, max: config.foundry.maxHealth },
      turret: {
        interval: stats.interval,
        damage: stats.damage,
        cooldown: 0,
        targetId: null,
        aim: 0, // radians; 0 points right
      },
      enemies: [],
      projectiles: [],
      spawnQueue: [],
      nextId: 1,
      events: [],
      stats: {
        defeated: 0,
        defeatedByType: zeroByType(),
        shots: 0,
        hits: 0,
        damageDealt: 0, // damage that actually came off enemy hp
        armorBlocked: 0, // shot damage soaked by armor
        overkill: 0, // damage beyond what was needed to finish an enemy
        damageTaken: 0,
        damageTakenByType: zeroByType(),
        breachesByType: zeroByType(),
        upgrades: [], // { intermission, key, name, rank, cost }
        currencyEarned: 0,
        currencySpent: 0,
      },
    };
  }

  function setState(run, next) {
    if (!ALLOWED[run.state].includes(next)) {
      throw new Error(`Illegal transition ${run.state} -> ${next}`);
    }
    run.transitions.push({ from: run.state, to: next, at: run.runTime });
    run.state = next;
    run.events.push({ type: 'state', state: next });
  }

  function buildSpawnQueue(run, waveIndex) {
    const { config, rng } = run;
    const f = config.field;
    const wave = config.waves[waveIndex];
    const queue = [];
    for (const g of wave.spawns) {
      for (let i = 0; i < g.count; i++) {
        const jitter = (rng() * 2 - 1) * config.spawnJitter;
        const t = Math.max(0, Math.min(wave.duration, g.at + i * g.every + jitter));
        const r = config.enemies[g.type].radius;
        const y = f.laneTop + r + rng() * (f.laneBottom - f.laneTop - 2 * r);
        queue.push({ t, type: g.type, y });
      }
    }
    queue.sort((a, b) => a.t - b.t);
    return queue;
  }

  function beginWave(run, index) {
    run.waveIndex = index;
    run.waveTime = 0;
    run.spawnQueue = buildSpawnQueue(run, index);
    run.purchasedThisIntermission = null;
    setState(run, STATES.WAVE);
    run.events.push({ type: 'waveStart', index, name: run.config.waves[index].name });
  }

  // ---- Player actions (each returns { ok, reason? }) ---------------------
  function startRun(run) {
    if (run.state !== STATES.START) return { ok: false, reason: 'not-start' };
    beginWave(run, 0);
    return { ok: true };
  }

  function continueRun(run) {
    if (run.state !== STATES.INTERMISSION) return { ok: false, reason: 'not-intermission' };
    beginWave(run, run.waveIndex + 1);
    return { ok: true };
  }

  /** Fresh run with the same config, started immediately. Only from win/loss. */
  function restartRun(run, seed) {
    if (run.state !== STATES.WIN && run.state !== STATES.LOSS) return { ok: false, reason: 'not-ended' };
    const fresh = createRun(run.config, seed);
    startRun(fresh);
    return { ok: true, run: fresh };
  }

  /**
   * Everything the UI needs to present an upgrade card, including why it
   * cannot be bought. buyUpgrade() uses the same function, so the reason a
   * card shows is exactly the reason a purchase would be refused.
   */
  function upgradeOffer(run, key) {
    const { config } = run;
    const def = config.upgrades[key];
    if (!def) throw new Error(`Unknown upgrade ${key}`);
    const rank = run.ranks[key];
    const maxRank = def.costs.length;
    const cost = rank < maxRank ? def.costs[rank] : null;
    const current = turretStats(config, run.ranks);
    const next = turretStats(config, { ...run.ranks, [key]: Math.min(rank + 1, maxRank) });

    let reason = null;
    if (run.state !== STATES.INTERMISSION) reason = 'not-intermission';
    else if (run.purchasedThisIntermission) reason = run.purchasedThisIntermission === key ? 'purchased' : 'one-per-intermission';
    else if (cost === null) reason = 'maxed';
    else if (run.currency < cost) reason = 'insufficient';

    return {
      key,
      name: def.name,
      flavor: def.flavor,
      rank,
      maxRank,
      cost,
      currency: run.currency,
      shortfall: cost === null ? 0 : Math.max(0, cost - run.currency),
      canBuy: reason === null,
      reason,
      current,
      next,
    };
  }

  function buyUpgrade(run, key) {
    const offer = upgradeOffer(run, key);
    if (!offer.canBuy) return { ok: false, reason: offer.reason, shortfall: offer.shortfall };
    run.currency -= offer.cost;
    run.stats.currencySpent += offer.cost;
    run.ranks[key] += 1;
    const s = turretStats(run.config, run.ranks);
    run.turret.interval = s.interval;
    run.turret.damage = s.damage;
    run.purchasedThisIntermission = key;
    run.stats.upgrades.push({
      intermission: run.intermissionIndex + 1,
      key,
      name: offer.name,
      rank: run.ranks[key],
      cost: offer.cost,
    });
    run.events.push({ type: 'upgrade', key, rank: run.ranks[key] });
    return { ok: true, cost: offer.cost };
  }

  // ---- Simulation step ----------------------------------------------------
  function spawnEnemy(run, type, y) {
    const def = run.config.enemies[type];
    run.enemies.push({
      id: run.nextId++,
      type,
      x: run.config.field.spawnX,
      y,
      hp: def.hp,
      maxHp: def.hp,
      armor: def.armor,
      speed: def.speed,
      radius: def.radius,
      pending: 0, // damage already in flight toward this enemy
      hitFlash: 0,
    });
  }

  function chooseTarget(run) {
    const f = run.config.field;
    const range = run.config.turret.range;
    let best = null;
    for (const e of run.enemies) {
      if (e.hp - e.pending <= 0) continue; // already doomed by shots in the air
      const dx = e.x - f.turretX;
      const dy = e.y - f.turretY;
      if (dx * dx + dy * dy > range * range) continue;
      // Most dangerous first: the enemy closest to the wall.
      if (!best || e.x - e.radius < best.x - best.radius) best = e;
    }
    return best;
  }

  function step(run, dt) {
    if (run.state !== STATES.WAVE) return;
    const { config } = run;
    const f = config.field;
    const wave = config.waves[run.waveIndex];

    run.waveTime += dt;
    run.runTime += dt;

    // Spawns
    while (run.spawnQueue.length && run.spawnQueue[0].t <= run.waveTime) {
      const s = run.spawnQueue.shift();
      spawnEnemy(run, s.type, s.y);
    }

    // Enemy movement and breaches
    for (let i = run.enemies.length - 1; i >= 0; i--) {
      const e = run.enemies[i];
      e.x -= e.speed * dt;
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.x - e.radius <= f.foundryFrontX) {
        const dmg = config.enemies[e.type].breach;
        run.foundry.hp = Math.max(0, run.foundry.hp - dmg);
        run.stats.damageTaken += dmg;
        run.stats.damageTakenByType[e.type] += dmg;
        run.stats.breachesByType[e.type] += 1;
        run.events.push({ type: 'breach', enemy: e.type, damage: dmg, x: f.foundryFrontX, y: e.y, hp: run.foundry.hp });
        run.enemies.splice(i, 1);
      }
    }

    if (run.foundry.hp <= 0) {
      setState(run, STATES.LOSS);
      return;
    }

    // Turret: aim and fire
    const t = run.turret;
    const target = chooseTarget(run);
    t.targetId = target ? target.id : null;
    if (target) t.aim = Math.atan2(target.y - f.turretY, target.x - f.turretX);
    t.cooldown -= dt;
    if (t.cooldown <= 0) {
      if (target) {
        const perHit = damagePerHit(config, t.damage, target.armor);
        target.pending += perHit;
        const muzzle = 34;
        run.projectiles.push({
          id: run.nextId++,
          targetId: target.id,
          x: f.turretX + Math.cos(t.aim) * muzzle,
          y: f.turretY + Math.sin(t.aim) * muzzle,
          tx: target.x,
          ty: target.y,
          perHit,
          raw: t.damage,
        });
        run.stats.shots += 1;
        run.events.push({ type: 'shot', x: f.turretX, y: f.turretY, aim: t.aim });
        t.cooldown += t.interval;
        if (t.cooldown < 0) t.cooldown = 0;
      } else {
        t.cooldown = 0; // ready the instant something comes into range
      }
    }

    // Projectiles
    const speed = config.turret.projectileSpeed;
    for (let i = run.projectiles.length - 1; i >= 0; i--) {
      const p = run.projectiles[i];
      const target = run.enemies.find((e) => e.id === p.targetId);
      if (target) {
        p.tx = target.x;
        p.ty = target.y;
      }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      const stepLen = speed * dt;
      if (dist > stepLen) {
        p.x += (dx / dist) * stepLen;
        p.y += (dy / dist) * stepLen;
        continue;
      }
      run.projectiles.splice(i, 1);
      if (!target) {
        run.events.push({ type: 'fizzle', x: p.tx, y: p.ty });
        continue;
      }
      target.pending = Math.max(0, target.pending - p.perHit);
      const applied = Math.min(target.hp, p.perHit);
      run.stats.hits += 1;
      run.stats.damageDealt += applied;
      run.stats.armorBlocked += p.raw - p.perHit;
      run.stats.overkill += p.perHit - applied;
      target.hp -= p.perHit;
      target.hitFlash = 0.12;
      run.events.push({
        type: 'hit',
        x: target.x,
        y: target.y,
        damage: p.perHit,
        blocked: p.raw - p.perHit,
        enemy: target.type,
      });
      if (target.hp <= 0) {
        run.enemies.splice(run.enemies.indexOf(target), 1);
        run.stats.defeated += 1;
        run.stats.defeatedByType[target.type] += 1;
        run.events.push({ type: 'kill', x: target.x, y: target.y, enemy: target.type, radius: target.radius });
      }
    }

    // Wave timer
    if (run.waveTime >= wave.duration) {
      if (run.waveIndex >= config.waves.length - 1) {
        run.runTime = totalRunSeconds(config); // remove floating-point drift
        setState(run, STATES.WIN);
      } else {
        const award = config.economy.intermissionAward;
        run.currency += award;
        run.lastAward = award;
        run.stats.currencyEarned += award;
        run.intermissionIndex += 1;
        setState(run, STATES.INTERMISSION);
        run.events.push({ type: 'award', amount: award });
      }
    }
  }

  /** Advance by an arbitrary span using fixed sub-steps (deterministic). */
  function advance(run, seconds) {
    let left = seconds;
    while (left > 1e-9 && run.state === STATES.WAVE) {
      const dt = Math.min(FIXED_DT, left);
      step(run, dt);
      left -= dt;
    }
  }

  // ---- End-of-run report ------------------------------------------------
  function summarize(run) {
    const { config, stats } = run;
    const names = (k) => config.enemies[k].name;
    const plural = (k) => names(k) + 's';
    const raw = stats.damageDealt + stats.armorBlocked + stats.overkill;
    const armorShare = raw > 0 ? stats.armorBlocked / raw : 0;
    const overkillShare = raw > 0 ? stats.overkill / raw : 0;
    const worstDmg = Math.max(...Object.values(stats.damageTakenByType));
    const worst = Object.keys(stats.damageTakenByType).filter((k) => stats.damageTakenByType[k] === worstDmg);

    const verdict = [];
    if (run.state === STATES.WIN) {
      verdict.push(`The foundry held with ${run.foundry.hp} of ${run.foundry.max} health.`);
    } else if (run.state === STATES.LOSS) {
      verdict.push(
        `The walls fell during wave ${run.waveIndex + 1} (${config.waves[run.waveIndex].name}), ` +
          `${(totalRunSeconds(config) - run.runTime).toFixed(1)} s short of the end.`
      );
    }
    if (worstDmg > 0 && worst.length === 1) {
      const n = stats.breachesByType[worst[0]];
      verdict.push(
        `${plural(worst[0])} did the most harm: ${n} breach${n === 1 ? '' : 'es'} for ${worstDmg} of ${stats.damageTaken} damage taken.`
      );
    } else if (worstDmg > 0) {
      verdict.push(
        `${worst.map(plural).join(' and ')} did the most harm, ${worstDmg} damage each, of ${stats.damageTaken} taken.`
      );
    } else if (run.state === STATES.WIN) {
      verdict.push('Nothing reached the walls.');
    }
    if (stats.upgrades.length === 0 && run.state === STATES.LOSS) {
      verdict.push('No upgrades were bought; the cannon fought the siege at its starting strength.');
    }
    if (armorShare >= 0.3 && run.ranks.damage === 0) {
      verdict.push(
        `Armor soaked ${Math.round(armorShare * 100)}% of your shot damage. Heavier Shot punches through plating.`
      );
    } else if (armorShare >= 0.3) {
      verdict.push(`Armor still soaked ${Math.round(armorShare * 100)}% of your shot damage.`);
    }
    if (stats.breachesByType.imp >= 4 && run.ranks.rate === 0) {
      verdict.push('Imps slipped through between shots. Faster Firing covers swarms.');
    }
    return {
      outcome: run.state,
      timeSurvived: run.runTime,
      runLength: totalRunSeconds(config),
      defeated: stats.defeated,
      defeatedByType: { ...stats.defeatedByType },
      upgrades: stats.upgrades.map((u) => ({ ...u })),
      hpLeft: run.foundry.hp,
      damageTaken: stats.damageTaken,
      damageTakenByType: { ...stats.damageTakenByType },
      breachesByType: { ...stats.breachesByType },
      armorShare,
      overkillShare,
      verdict,
    };
  }

  return {
    STATES,
    ALLOWED,
    FIXED_DT,
    makeRng,
    turretStats,
    damagePerHit,
    timeToKill,
    waveComposition,
    totalRunSeconds,
    createRun,
    startRun,
    continueRun,
    restartRun,
    upgradeOffer,
    buyUpgrade,
    step,
    advance,
    summarize,
  };
});
