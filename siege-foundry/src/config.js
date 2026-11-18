/*
 * Siege Foundry — BALANCE CONFIGURATION
 * =====================================
 * Every number that decides how the game plays lives in this one object.
 * Simulation, rendering and UI all read from here; nothing else hard-codes
 * a balance value. Change a number, reload the page, and run
 * `node tools/balance.js` to see how the change moves each upgrade path.
 *
 * Units: seconds, pixels (on a 960 x 540 logical battlefield), hit points.
 */
(function (root, factory) {
  const config = factory();
  if (typeof module === 'object' && module.exports) module.exports = config;
  else (root.SiegeFoundry = root.SiegeFoundry || {}).CONFIG = config;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  return {
    // ---- Foundry -----------------------------------------------------------
    foundry: {
      maxHealth: 100, // run is lost when this reaches 0
    },

    // ---- Crucible Cannon (the foundry's automatic turret) -----------------
    turret: {
      fireInterval: 0.55, // seconds between shots before upgrades
      damage: 12, // damage per shot before upgrades
      minDamage: 1, // a shot always does at least this much, even into heavy armor
      range: 700, // pixels from the cannon; enemies beyond this are not targeted
      projectileSpeed: 1000, // pixels per second
    },

    // ---- Economy -----------------------------------------------------------
    economy: {
      startingCurrency: 0,
      intermissionAward: 80, // fixed ingots paid at every intermission
      currencyName: 'ingots',
    },

    // ---- Upgrades ----------------------------------------------------------
    // `costs[i]` is the price of rank i+1. The array length is the max rank.
    // One purchase per intermission, so at most two purchases per run.
    // Design intent: two committed strategies of similar strength.
    //   Rate:   buy at both intermissions (60 + 80 = 140 of the 160 earned).
    //   Damage: skip the first intermission to bank 80, then buy at 110.
    // Buying rate first leaves 100 at the second intermission: 10 short of
    // Heavier Shot. The half-and-half plan is deliberately unaffordable.
    upgrades: {
      rate: {
        name: 'Faster Firing',
        flavor: 'Bellows Overdrive',
        costs: [60, 80], // cheap and stackable
        intervalMultiplier: 0.72, // each rank multiplies the fire interval by this
      },
      damage: {
        name: 'Heavier Shot',
        flavor: 'Crucible Slugs',
        costs: [110], // one big purchase: needs the first award banked (80 + 80)
        damageBonus: 16, // each rank adds this much damage per shot
      },
    },

    // ---- Enemies -----------------------------------------------------------
    // armor is subtracted from every hit (down to turret.minDamage).
    // breach is the damage dealt to the foundry when the enemy reaches it
    // (the enemy is destroyed in the breach).
    enemies: {
      imp: {
        name: 'Cinder Imp',
        hp: 12,
        armor: 0,
        speed: 105,
        breach: 4,
        radius: 11,
        trait: 'Fast and fragile. Comes in swarms.',
      },
      clanker: {
        name: 'Rivet Clanker',
        hp: 40,
        armor: 3,
        speed: 62,
        breach: 8,
        radius: 16,
        trait: 'Riveted plating. Shrugs off 3 damage per hit.',
      },
      ram: {
        name: 'Bastion Ram',
        hp: 120,
        armor: 5,
        speed: 46,
        breach: 20,
        radius: 25,
        trait: 'Slow siege beast. Shrugs off 5 damage per hit.',
      },
    },

    // ---- Waves (durations must add up to the 60-second run) ---------------
    // Each spawn group releases `count` enemies, one every `every` seconds,
    // starting `at` seconds into the wave. Enemies still alive when a wave
    // ends stay on the field and resume after the intermission.
    waves: [
      {
        name: 'First Sparks',
        duration: 16,
        blurb: 'Imps probe the walls; a few Clankers follow.',
        spawns: [
          { type: 'imp', at: 0.5, count: 7, every: 1.5 },
          { type: 'clanker', at: 6, count: 2, every: 3 },
        ],
      },
      {
        name: 'The Swarm',
        duration: 20,
        blurb: 'A flood of Imps. Many small targets, little armor.',
        spawns: [
          { type: 'imp', at: 0.5, count: 24, every: 0.45 },
          { type: 'clanker', at: 3, count: 3, every: 4 },
          { type: 'imp', at: 13, count: 8, every: 0.4 },
        ],
      },
      {
        name: 'The Siege',
        duration: 24,
        blurb: 'Bastion Rams lead the assault. Heavy armor.',
        spawns: [
          { type: 'ram', at: 0.5, count: 4, every: 2 },
          { type: 'clanker', at: 2, count: 5, every: 2.2 },
          { type: 'imp', at: 9, count: 10, every: 0.8 },
        ],
      },
    ],

    // ---- Spawn variation ---------------------------------------------------
    spawnJitter: 0.25, // +/- seconds of random timing on each spawn (seeded)

    // ---- Battlefield geometry (affects travel time, so it is balance too) --
    field: {
      width: 960,
      height: 540,
      spawnX: 990, // enemies appear here (just off the right edge)
      foundryFrontX: 182, // enemies breach when they touch this line
      laneTop: 215,
      laneBottom: 470,
      turretX: 132, // cannon pivot
      turretY: 228,
    },
  };
});
