/*
 * Unit tests for the simulation: state transitions, upgrade costs and
 * refusals, currency bounds, win/loss, restart. Run: node --test tests/
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const sim = require(path.join(__dirname, '..', 'src', 'sim.js'));
const CONFIG = require(path.join(__dirname, '..', 'src', 'config.js'));

const clone = (o) => JSON.parse(JSON.stringify(o));

/** Advance until the state leaves 'wave'. */
function toNextStop(run) {
  let guard = 0;
  while (run.state === 'wave') {
    sim.advance(run, 0.5);
    if (++guard > 1000) throw new Error('wave never ended');
  }
  return run.state;
}

function freshAtIntermission(seed = 1, config = CONFIG) {
  const run = sim.createRun(config, seed);
  sim.startRun(run);
  assert.equal(toNextStop(run), 'intermission');
  return run;
}

// ---------------------------------------------------------------- config
test('config: waves add up to a 60 second run and there are three of them', () => {
  assert.equal(CONFIG.waves.length, 3);
  assert.equal(sim.totalRunSeconds(CONFIG), 60);
});

test('config: every upgrade cost is a positive integer and every spawn names a real enemy', () => {
  for (const u of Object.values(CONFIG.upgrades)) {
    assert.ok(u.costs.length >= 1);
    for (const c of u.costs) assert.ok(Number.isInteger(c) && c > 0);
  }
  for (const w of CONFIG.waves) for (const s of w.spawns) assert.ok(CONFIG.enemies[s.type], s.type);
});

// ----------------------------------------------------------- transitions
test('a new run starts in "start" and only startRun leaves it', () => {
  const run = sim.createRun(CONFIG, 1);
  assert.equal(run.state, 'start');
  assert.equal(sim.continueRun(run).ok, false);
  assert.equal(sim.buyUpgrade(run, 'rate').ok, false);
  assert.equal(sim.restartRun(run).ok, false);
  sim.step(run, 1); // stepping outside a wave does nothing
  assert.equal(run.runTime, 0);
  assert.equal(sim.startRun(run).ok, true);
  assert.equal(run.state, 'wave');
  assert.equal(run.waveIndex, 0);
  assert.equal(sim.startRun(run).ok, false, 'cannot start twice');
});

test('full win follows start -> wave -> intermission -> wave -> intermission -> wave -> win', () => {
  const run = sim.createRun(CONFIG, 11);
  sim.startRun(run);
  for (let i = 0; i < 2; i++) {
    assert.equal(toNextStop(run), 'intermission');
    assert.equal(sim.buyUpgrade(run, 'rate').ok, true);
    assert.equal(sim.continueRun(run).ok, true);
  }
  assert.equal(toNextStop(run), 'win');
  assert.deepEqual(
    run.transitions.map((t) => t.to),
    ['wave', 'intermission', 'wave', 'intermission', 'wave', 'win']
  );
  assert.equal(run.runTime, 60);
  assert.ok(run.foundry.hp > 0);
});

test('every recorded transition is one the state table allows', () => {
  const run = sim.createRun(CONFIG, 5);
  sim.startRun(run);
  while (run.state !== 'win' && run.state !== 'loss') {
    if (run.state === 'wave') sim.advance(run, 1);
    else sim.continueRun(run);
  }
  for (const t of run.transitions) assert.ok(sim.ALLOWED[t.from].includes(t.to), `${t.from}->${t.to}`);
});

test('loss: foundry reaching 0 ends the run in "loss", mid-wave, and nothing advances afterwards', () => {
  const cfg = clone(CONFIG);
  cfg.foundry.maxHealth = 5;
  const run = sim.createRun(cfg, 2);
  sim.startRun(run);
  while (toNextStop(run) === 'intermission') sim.continueRun(run);
  assert.equal(run.state, 'loss');
  assert.equal(run.transitions[run.transitions.length - 1].from, 'wave');
  assert.equal(run.foundry.hp, 0);
  assert.ok(run.runTime < 60);
  const t = run.runTime;
  sim.step(run, 1);
  assert.equal(run.runTime, t);
  assert.equal(sim.continueRun(run).ok, false);
  assert.equal(sim.buyUpgrade(run, 'rate').ok, false);
});

test('with default balance, skipping every upgrade loses', () => {
  const run = sim.createRun(CONFIG, 11);
  sim.startRun(run);
  while (run.state !== 'win' && run.state !== 'loss') {
    if (run.state === 'wave') sim.advance(run, 1);
    else sim.continueRun(run);
  }
  assert.equal(run.state, 'loss');
  assert.ok(sim.summarize(run).verdict.some((v) => v.includes('No upgrades')));
});

test('restart from win or loss resets the run completely and starts wave 1', () => {
  const run = sim.createRun(CONFIG, 11);
  sim.startRun(run);
  toNextStop(run);
  sim.buyUpgrade(run, 'rate');
  sim.continueRun(run);
  toNextStop(run);
  sim.buyUpgrade(run, 'rate');
  sim.continueRun(run);
  toNextStop(run);
  assert.equal(run.state, 'win');
  const r = sim.restartRun(run, 11);
  assert.equal(r.ok, true);
  const fresh = r.run;
  assert.equal(fresh.state, 'wave');
  assert.equal(fresh.waveIndex, 0);
  assert.equal(fresh.runTime, 0);
  assert.equal(fresh.currency, CONFIG.economy.startingCurrency);
  assert.equal(fresh.foundry.hp, CONFIG.foundry.maxHealth);
  assert.deepEqual(fresh.ranks, { rate: 0, damage: 0 });
  assert.equal(fresh.turret.damage, CONFIG.turret.damage);
  assert.equal(fresh.turret.interval, CONFIG.turret.fireInterval);
  assert.deepEqual(fresh.stats.upgrades, []);
  assert.equal(fresh.stats.defeated, 0);
  assert.equal(fresh.enemies.length, 0);
});

// ------------------------------------------------------------- economy
test('each intermission awards exactly the configured amount', () => {
  const run = freshAtIntermission();
  assert.equal(run.currency, CONFIG.economy.startingCurrency + CONFIG.economy.intermissionAward);
  sim.continueRun(run);
  toNextStop(run);
  assert.equal(run.currency, CONFIG.economy.startingCurrency + 2 * CONFIG.economy.intermissionAward);
});

test('buying charges the configured cost for the next rank and applies the effect', () => {
  const run = freshAtIntermission();
  const before = run.currency;
  const offer = sim.upgradeOffer(run, 'rate');
  assert.equal(offer.cost, CONFIG.upgrades.rate.costs[0]);
  const r = sim.buyUpgrade(run, 'rate');
  assert.equal(r.ok, true);
  assert.equal(run.currency, before - CONFIG.upgrades.rate.costs[0]);
  assert.equal(run.ranks.rate, 1);
  assert.equal(run.turret.interval, CONFIG.turret.fireInterval * CONFIG.upgrades.rate.intervalMultiplier);
  sim.continueRun(run);
  toNextStop(run);
  assert.equal(sim.upgradeOffer(run, 'rate').cost, CONFIG.upgrades.rate.costs[1], 'rank 2 uses the second price');
});

test('only one upgrade per intermission, and the limit resets at the next one', () => {
  const run = freshAtIntermission();
  run.currency = 10000; // plenty, so only the per-intermission rule can refuse
  assert.equal(sim.buyUpgrade(run, 'rate').ok, true);
  const again = sim.buyUpgrade(run, 'damage');
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'one-per-intermission');
  assert.equal(sim.buyUpgrade(run, 'rate').reason, 'purchased', 'buying the same one again is refused too');
  assert.equal(sim.upgradeOffer(run, 'rate').reason, 'purchased');
  sim.continueRun(run);
  toNextStop(run);
  assert.equal(sim.buyUpgrade(run, 'damage').ok, true);
});

test('insufficient currency is refused, reports the shortfall, and leaves currency untouched', () => {
  const run = freshAtIntermission();
  const have = run.currency;
  const offer = sim.upgradeOffer(run, 'damage');
  assert.ok(offer.cost > have, 'damage should be unaffordable at the first intermission by design');
  assert.equal(offer.canBuy, false);
  assert.equal(offer.reason, 'insufficient');
  assert.equal(offer.shortfall, offer.cost - have);
  const r = sim.buyUpgrade(run, 'damage');
  assert.deepEqual(r, { ok: false, reason: 'insufficient', shortfall: offer.cost - have });
  assert.equal(run.currency, have);
  assert.equal(run.ranks.damage, 0);
  assert.equal(sim.continueRun(run).ok, true, 'continue is always possible');
});

test('the half-and-half plan: rate first leaves the second intermission short of Heavier Shot', () => {
  const run = freshAtIntermission();
  sim.buyUpgrade(run, 'rate');
  sim.continueRun(run);
  toNextStop(run);
  const o = sim.upgradeOffer(run, 'damage');
  assert.equal(o.reason, 'insufficient');
  assert.equal(o.shortfall, 10);
});

test('saving the first award makes Heavier Shot affordable at the second intermission', () => {
  const run = freshAtIntermission();
  sim.continueRun(run);
  toNextStop(run);
  const r = sim.buyUpgrade(run, 'damage');
  assert.equal(r.ok, true);
  assert.equal(run.currency, 2 * CONFIG.economy.intermissionAward - CONFIG.upgrades.damage.costs[0]);
  assert.equal(run.turret.damage, CONFIG.turret.damage + CONFIG.upgrades.damage.damageBonus);
});

test('an upgrade at max rank is refused as maxed', () => {
  const run = freshAtIntermission();
  run.currency = 10000;
  run.ranks.damage = CONFIG.upgrades.damage.costs.length;
  const o = sim.upgradeOffer(run, 'damage');
  assert.equal(o.reason, 'maxed');
  assert.equal(o.cost, null);
  assert.equal(sim.buyUpgrade(run, 'damage').ok, false);
});

test('currency never goes negative under random play (300 seeded runs)', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const rng = sim.makeRng(seed * 7919);
    const run = sim.createRun(CONFIG, seed);
    sim.startRun(run);
    let guard = 0;
    while (run.state !== 'win' && run.state !== 'loss') {
      if (++guard > 10000) throw new Error('stuck');
      if (run.state === 'wave') sim.advance(run, 0.25 + rng() * 2);
      else {
        // hammer the shop with random purchase attempts, including repeats
        for (let i = 0; i < 4; i++) {
          sim.buyUpgrade(run, rng() < 0.5 ? 'rate' : 'damage');
          assert.ok(run.currency >= 0, `seed ${seed}: currency ${run.currency}`);
        }
        sim.continueRun(run);
      }
      assert.ok(run.currency >= 0);
      assert.equal(run.stats.currencyEarned - run.stats.currencySpent + CONFIG.economy.startingCurrency, run.currency);
    }
  }
});

// ------------------------------------------------------------- combat
test('armor reduces each hit but never below the minimum', () => {
  assert.equal(sim.damagePerHit(CONFIG, 12, 5), 7);
  assert.equal(sim.damagePerHit(CONFIG, 3, 50), CONFIG.turret.minDamage);
});

test('same seed gives an identical run (deterministic simulation)', () => {
  const a = sim.createRun(CONFIG, 99);
  const b = sim.createRun(CONFIG, 99);
  sim.startRun(a);
  sim.startRun(b);
  sim.advance(a, 12.3);
  sim.advance(b, 12.3);
  assert.equal(a.stats.shots, b.stats.shots);
  assert.equal(a.stats.defeated, b.stats.defeated);
  assert.deepEqual(a.enemies.map((e) => [e.x, e.hp]), b.enemies.map((e) => [e.x, e.hp]));
});

test('enemies alive when a wave ends stay on the field through the intermission', () => {
  const run = sim.createRun(CONFIG, 3);
  sim.startRun(run);
  sim.advance(run, CONFIG.waves[0].duration - 0.01);
  // force a straggler so the check does not depend on balance
  run.enemies.push({ id: 9999, type: 'ram', x: 900, y: 300, hp: 120, maxHp: 120, armor: 5, speed: 46, radius: 25, pending: 0, hitFlash: 0 });
  sim.advance(run, 0.05);
  assert.equal(run.state, 'intermission');
  const straggler = run.enemies.find((e) => e.id === 9999);
  assert.ok(straggler);
  const x = straggler.x;
  sim.step(run, 1);
  assert.equal(straggler.x, x, 'nothing moves during an intermission');
});

test('end report names every attacker tied for most damage, not just the first', () => {
  const run = sim.createRun(CONFIG, 1);
  sim.startRun(run);
  run.stats.damageTakenByType = { imp: 20, clanker: 40, ram: 40 };
  run.stats.damageTaken = 100;
  const v = sim.summarize(run).verdict.join(' ');
  assert.match(v, /Rivet Clankers and Bastion Rams did the most harm/);
});
