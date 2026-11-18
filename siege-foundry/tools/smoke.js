#!/usr/bin/env node
/*
 * End-to-end check of the real page in headless Chromium (Playwright).
 * Drives the game only through the keyboard and mouse, like a player, and
 * reads state from the page to verify each step.
 *
 *   node tools/smoke.js                    # screenshots go to the OS temp dir
 *   SHOTS=./shots node tools/smoke.js      # or wherever you like
 *
 * Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
 */
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const { chromium } = require('playwright');

const SEED = 11; // see tools/balance.js: rate path wins, no-upgrade path loses, damage path wins
const SPEED = 8;
const url = `file://${path.join(__dirname, '..', 'index.html')}?seed=${SEED}&speed=${SPEED}`;
const shots = process.env.SHOTS || path.join(os.tmpdir(), 'siege-foundry-shots');
fs.mkdirSync(shots, { recursive: true });

let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${msg}`);
  if (!cond) failures++;
}

const state = (page) => page.evaluate(() => {
  const r = SiegeFoundry.app.run;
  return {
    state: r.state, wave: r.waveIndex, currency: r.currency, hp: r.foundry.hp, time: r.runTime,
    ranks: { ...r.ranks }, upgrades: r.stats.upgrades.length, defeated: r.stats.defeated,
  };
});
const waitState = (page, s, timeout = 30000) =>
  page.waitForFunction((want) => [].concat(want).includes(SiegeFoundry.app.run.state), s, { timeout });
const text = (page, sel) => page.locator(sel).innerText();

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);

  console.log('Start screen');
  check((await state(page)).state === 'start', 'page opens on the start screen');
  check(await page.locator('#screen-start').isVisible(), 'start overlay visible');
  await page.screenshot({ path: path.join(shots, '01-start.png') });

  console.log('Run 1: favour Faster Firing (expect a win)');
  await page.click('#btn-start');
  check((await state(page)).state === 'wave', 'mouse click starts wave 1');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(shots, '02-wave1.png') });

  await waitState(page, 'intermission');
  let s = await state(page);
  check(s.wave === 0 && s.currency === 80, `intermission 1 after wave 1 with 80 ingots (got ${s.currency})`);
  check((await text(page, '#purse-amount')) === '80', 'purse shows 80');
  check(await page.locator('button[data-key="damage"]').isDisabled(), 'Heavier Shot button disabled (unaffordable)');
  const dmgStatus = await text(page, '#card-damage-status');
  check(/short 30/.test(dmgStatus), `unaffordable reason shown: "${dmgStatus}"`);
  await page.screenshot({ path: path.join(shots, '03-intermission1.png') });

  await page.keyboard.press('2');
  s = await state(page);
  check(s.currency === 80 && s.ranks.damage === 0, 'pressing 2 (unaffordable) changes nothing');
  await page.click('button[data-key="rate"]');
  s = await state(page);
  check(s.currency === 20 && s.ranks.rate === 1, `mouse purchase of Faster Firing: 80 - 60 = ${s.currency}`);
  check(/installed/i.test(await text(page, 'button[data-key="rate"]')), 'rate card shows Installed');
  check(/one upgrade per intermission/i.test(await text(page, '#card-damage-status')), 'other card explains the one-per-intermission rule');
  await page.keyboard.press('1');
  s = await state(page);
  check(s.currency === 20 && s.ranks.rate === 1, 'second purchase in the same intermission refused');
  await page.screenshot({ path: path.join(shots, '04-intermission1-bought.png') });

  await page.keyboard.press('Enter');
  check((await state(page)).state === 'wave', 'Enter continues to wave 2');
  await waitState(page, 'intermission');
  s = await state(page);
  check(s.wave === 1 && s.currency === 100, `intermission 2 with 20 + 80 = ${s.currency}`);
  const dmg2 = await text(page, '#card-damage-status');
  check(/short 10/.test(dmg2) && /spent 60 on Faster Firing/.test(dmg2), `reason traces back to the earlier purchase: "${dmg2}"`);
  await page.keyboard.press('1');
  s = await state(page);
  check(s.currency === 20 && s.ranks.rate === 2, `keyboard purchase of rank 2 for 80 (left ${s.currency})`);
  await page.screenshot({ path: path.join(shots, '05-intermission2.png') });
  await page.click('#btn-continue');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shots, '06-wave3.png') });

  await waitState(page, ['win', 'loss'], 40000);
  s = await state(page);
  check(s.state === 'win', `run ends in a win (hp ${s.hp})`);
  check((await text(page, '#end-title')) === 'The Foundry Holds', 'win screen title');
  const endText = await text(page, '#end-body');
  check(endText.includes('60.0'), 'time survived 60.0 shown');
  check(endText.includes(String(s.defeated)), `enemies defeated (${s.defeated}) shown`);
  check((endText.match(/Faster Firing/g) || []).length >= 2, 'both upgrades listed');
  check(/What decided it/i.test(endText), 'cause section shown');
  await page.screenshot({ path: path.join(shots, '07-win.png') });

  console.log('Restart (R)');
  await page.keyboard.press('r');
  s = await state(page);
  check(s.state === 'wave' && s.wave === 0 && s.currency === 0 && s.hp === 100 && s.upgrades === 0 && s.ranks.rate === 0,
    `restart resets the run into wave 1 (${JSON.stringify(s)})`);

  console.log('Run 2: buy nothing (expect a loss)');
  await waitState(page, 'intermission');
  await page.keyboard.press('Enter');
  await waitState(page, 'intermission');
  check((await state(page)).currency === 160, 'unspent ingots carry over (160)');
  await page.keyboard.press('Enter');
  await waitState(page, ['win', 'loss'], 40000);
  s = await state(page);
  check(s.state === 'loss' && s.hp === 0, 'run ends in a loss at 0 health');
  check((await text(page, '#end-title')) === 'The Foundry Has Fallen', 'loss screen title');
  const lossText = await text(page, '#end-body');
  check(/No upgrades were bought/.test(lossText), 'loss explains the cause');
  check(/None/.test(lossText), 'upgrades chosen: None');
  check(s.time < 60, `time survived below 60 s (${s.time.toFixed(1)})`);
  await page.screenshot({ path: path.join(shots, '08-loss.png') });

  console.log('Run 3: save, then Heavier Shot (expect a win)');
  await page.click('#btn-restart');
  await waitState(page, 'intermission');
  await page.click('#btn-continue');
  await waitState(page, 'intermission');
  await page.click('button[data-key="damage"]');
  s = await state(page);
  check(s.ranks.damage === 1 && s.currency === 50, `Heavier Shot bought with saved ingots (160 - 110 = ${s.currency})`);
  await page.keyboard.press('Enter');
  await waitState(page, ['win', 'loss'], 40000);
  s = await state(page);
  check(s.state === 'win', `damage path wins (hp ${s.hp})`);

  console.log('Narrow screen (390 px)');
  const narrow = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  narrow.on('pageerror', (e) => errors.push(e.message));
  await narrow.goto(url);
  await narrow.click('#btn-start');
  await waitState(narrow, 'intermission');
  const overflow = await narrow.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `no horizontal scroll at 390 px (overflow ${overflow})`);
  await narrow.click('button[data-key="rate"]');
  check((await state(narrow)).ranks.rate === 1, 'purchase works at 390 px');
  await narrow.screenshot({ path: path.join(shots, '09-narrow-intermission.png'), fullPage: true });
  await narrow.close();

  console.log('Reduced motion');
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 860 } });
  const rm = await ctx.newPage();
  rm.on('pageerror', (e) => errors.push(e.message));
  await rm.goto(url);
  await rm.keyboard.press('Enter');
  await rm.waitForTimeout(2500);
  const anim = await rm.evaluate(() => getComputedStyle(document.querySelector('.panel')).animationName);
  check(anim === 'none', `CSS animations off with reduced motion (got ${anim})`);
  await rm.screenshot({ path: path.join(shots, '10-reduced-motion.png') });
  await ctx.close();

  check(errors.length === 0, `no page errors (${errors.join(' | ') || 'none'})`);
  await browser.close();
  console.log(`\nScreenshots: ${shots}`);
  console.log(failures ? `${failures} check(s) FAILED` : 'All browser checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
