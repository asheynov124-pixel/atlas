#!/usr/bin/env node
/*
 * Automated balance runs. Plays complete headless runs with the real
 * simulation and a fixed purchasing policy, across many seeds.
 *
 *   node tools/balance.js            # summary table, 40 seeds per policy
 *   node tools/balance.js --seeds 200
 *   node tools/balance.js --detail   # one line per run for the named policies
 */
'use strict';
const path = require('path');
const sim = require(path.join(__dirname, '..', 'src', 'sim.js'));
const CONFIG = require(path.join(__dirname, '..', 'src', 'config.js'));

const args = process.argv.slice(2);
const seedCount = Number(args[args.indexOf('--seeds') + 1]) || 40;
const detail = args.includes('--detail');

// A policy is (run, intermissionNumber) -> 'rate' | 'damage' | null
const POLICIES = {
  'Favor rate (rate if affordable, else damage)': (run) =>
    pickFirstAffordable(run, ['rate', 'damage']),
  'Favor damage (damage if affordable, else save)': (run) =>
    pickFirstAffordable(run, ['damage']),
  'No upgrades': () => null,
};

// Also every literal two-step path, skipping when the choice is unaffordable.
for (const a of ['rate', 'damage', null]) {
  for (const b of ['rate', 'damage', null]) {
    POLICIES[`Path ${a || 'skip'} -> ${b || 'skip'}`] = (run, n) => (n === 1 ? a : b);
  }
}

function pickFirstAffordable(run, keys) {
  for (const k of keys) if (sim.upgradeOffer(run, k).canBuy) return k;
  return null;
}

function playRun(policy, seed, config = CONFIG) {
  const run = sim.createRun(config, seed);
  sim.startRun(run);
  const bought = [];
  let guard = 0;
  while (run.state !== 'win' && run.state !== 'loss') {
    if (++guard > 100000) throw new Error('run did not terminate');
    if (run.state === 'wave') sim.advance(run, 1);
    if (run.state === 'intermission') {
      const choice = policy(run, run.intermissionIndex + 1);
      if (choice) {
        const r = sim.buyUpgrade(run, choice);
        bought.push(r.ok ? choice : `${choice}(refused:${r.reason})`);
      } else bought.push('skip');
      if (run.currency < 0) throw new Error('currency went negative');
      sim.continueRun(run);
    }
    run.events.length = 0;
  }
  return { seed, run, summary: sim.summarize(run), bought };
}

function evaluate(policy, seeds, config) {
  const results = seeds.map((s) => playRun(policy, s, config));
  const wins = results.filter((r) => r.run.state === 'win');
  const hp = wins.map((r) => r.run.foundry.hp);
  const lossTimes = results.filter((r) => r.run.state === 'loss').map((r) => r.run.runTime);
  return {
    results,
    wins: wins.length,
    total: results.length,
    avgHp: hp.length ? hp.reduce((a, b) => a + b, 0) / hp.length : 0,
    minHp: hp.length ? Math.min(...hp) : 0,
    maxHp: hp.length ? Math.max(...hp) : 0,
    avgLossTime: lossTimes.length ? lossTimes.reduce((a, b) => a + b, 0) / lossTimes.length : null,
    avgDefeated: results.reduce((a, r) => a + r.run.stats.defeated, 0) / results.length,
  };
}

module.exports = { POLICIES, playRun, evaluate, pickFirstAffordable };

if (require.main === module) {
  const seeds = Array.from({ length: seedCount }, (_, i) => i + 1);
  console.log(`Siege Foundry balance — ${seedCount} seeded headless runs per policy (automated)\n`);
  const rows = [];
  for (const [name, policy] of Object.entries(POLICIES)) {
    const e = evaluate(policy, seeds);
    rows.push([
      name,
      `${e.wins}/${e.total}`,
      e.wins ? e.avgHp.toFixed(1) : '-',
      e.wins ? `${e.minHp}-${e.maxHp}` : '-',
      e.avgLossTime === null ? '-' : e.avgLossTime.toFixed(1) + 's',
      e.avgDefeated.toFixed(1),
      e.results[0].bought.join(', '),
    ]);
    if (detail && !name.startsWith('Path')) {
      console.log(`  ${name}`);
      for (const r of e.results.slice(0, 5)) {
        console.log(
          `    seed ${String(r.seed).padStart(3)}  ${r.run.state.padEnd(4)}  hp ${String(r.run.foundry.hp).padStart(3)}  ` +
            `time ${r.run.runTime.toFixed(1).padStart(4)}s  defeated ${r.run.stats.defeated}  bought [${r.bought.join(', ')}]`
        );
      }
    }
  }
  const head = ['Policy', 'Wins', 'Avg HP (wins)', 'HP range', 'Avg loss time', 'Avg kills', 'Purchases (seed 1)'];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (r) => r.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  console.log(line(head));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  rows.forEach((r) => console.log(line(r)));
}
