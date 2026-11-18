/*
 * Siege Foundry — UI (DOM)
 * ========================
 * HUD, run timeline, and the three menu screens (start, intermission,
 * result). Reads the run and the simulation's helper functions; changes
 * nothing itself. Buttons carry data-action attributes that input.js turns
 * into actions.
 */
(function (root) {
  'use strict';
  const SF = (root.SiegeFoundry = root.SiegeFoundry || {});

  function createUI(doc, config, sim, paintIcon) {
    const $ = (id) => doc.getElementById(id);
    const el = {
      hudWave: $('hud-wave'),
      hudTime: $('hud-time'),
      hudTotal: $('hud-total'),
      hudHp: $('hud-hp'),
      hudHpFill: $('hud-hp-fill'),
      hudHpWrap: $('hud-hp-wrap'),
      hudCur: $('hud-cur'),
      hudCurWrap: $('hud-cur-wrap'),
      hudDmg: $('hud-dmg'),
      hudInt: $('hud-int'),
      timeline: $('timeline'),
      start: $('screen-start'),
      inter: $('screen-intermission'),
      end: $('screen-end'),
      interBody: $('intermission-body'),
      endBody: $('end-body'),
      live: $('live'),
      legend: $('legend'),
      waveList: $('wave-list'),
    };
    const RUN_SECONDS = sim.totalRunSeconds(config);
    const cur = config.economy.currencyName;
    const enemyName = (k, n) => config.enemies[k].name + (n === 1 ? '' : 's');
    const shown = {};

    function setText(node, text) {
      if (node && node.textContent !== text) node.textContent = text;
    }

    function paintIcons(scope) {
      scope.querySelectorAll('canvas[data-enemy]').forEach((c) => paintIcon(c, c.dataset.enemy));
    }

    function pulse(node, cls) {
      if (!node) return;
      node.classList.remove(cls);
      void node.offsetWidth; // restart the animation
      node.classList.add(cls);
    }

    // ------------------------------------------------------- static parts
    function buildTimeline() {
      const parts = [];
      config.waves.forEach((w, i) => {
        parts.push(
          `<div class="tl-seg" data-wave="${i}" style="flex-grow:${w.duration}">` +
            `<span class="tl-label">${i + 1} · ${w.name} <small>${w.duration}s</small></span></div>`
        );
        if (i < config.waves.length - 1) {
          parts.push(`<div class="tl-break" title="Intermission: +${config.economy.intermissionAward} ${cur}">+${config.economy.intermissionAward}</div>`);
        }
      });
      el.timeline.innerHTML = `<div class="tl-track">${parts.join('')}</div><div class="tl-fill" id="tl-fill"></div>`;
      el.tlFill = $('tl-fill');
      setText(el.hudTotal, ` / ${RUN_SECONDS} s`);
    }

    function enemyStatLine(k) {
      const e = config.enemies[k];
      return `HP ${e.hp} · Armor ${e.armor} · Breach −${e.breach}`;
    }

    function buildStart() {
      el.legend.innerHTML = Object.keys(config.enemies)
        .map(
          (k) =>
            `<li><canvas class="icon" data-enemy="${k}" aria-hidden="true"></canvas>` +
            `<div><b>${config.enemies[k].name}</b><span>${config.enemies[k].trait}</span>` +
            `<small>${enemyStatLine(k)}</small></div></li>`
        )
        .join('');
      el.waveList.innerHTML = config.waves
        .map((w, i) => {
          const comp = sim.waveComposition(config, i);
          const what = Object.keys(comp)
            .map((k) => `${comp[k]} ${enemyName(k, comp[k])}`)
            .join(', ');
          return `<li><b>Wave ${i + 1} · ${w.name}</b> <span>${w.duration} s</span><small>${what}</small></li>`;
        })
        .join('');
      paintIcons(el.start);
    }

    // ----------------------------------------------------- intermission
    function pct(a, b) {
      return Math.round((a / b - 1) * 100);
    }

    function fmtS(s) {
      return `${s < 10 ? s.toFixed(2) : s.toFixed(1)} s`;
    }

    function priceLine(run, o) {
      if (o.reason === 'purchased') {
        const paid = run.stats.upgrades[run.stats.upgrades.length - 1].cost;
        return `Paid <b>${paid}</b> ${cur}` + (o.cost === null ? '' : ` <small>· next rank ${o.cost}</small>`);
      }
      return o.cost === null ? 'No further ranks' : `Cost <b>${o.cost}</b> ${cur}`;
    }

    function upgradeCard(run, key, nextWave) {
      const o = sim.upgradeOffer(run, key);
      const isRate = key === 'rate';
      const comp = sim.waveComposition(config, nextWave);
      const showNext = o.rank < o.maxRank && o.reason !== 'purchased';

      const effect = isRate
        ? `Fires every <b>${o.current.interval.toFixed(2)} s</b>` +
          (showNext ? ` → <b>${o.next.interval.toFixed(2)} s</b> <em>+${pct(o.current.interval, o.next.interval)}% shots</em>` : '')
        : `Damage per shot <b>${o.current.damage}</b>` +
          (showNext ? ` → <b>${o.next.damage}</b> <em>armor takes the same flat bite, so big shots lose less</em>` : '');

      const rows = Object.keys(comp)
        .map((k) => {
          const a = sim.timeToKill(config, o.current, k);
          const b = sim.timeToKill(config, o.next, k);
          const armor = config.enemies[k].armor;
          const hitNote = armor > 0 ? ` <small>${a.perHit}${showNext && b.perHit !== a.perHit ? `→${b.perHit}` : ''} per hit</small>` : '';
          const better = showNext && b.seconds < a.seconds - 1e-9;
          return (
            `<tr><th scope="row">${config.enemies[k].name}</th>` +
            `<td>${fmtS(a.seconds)}${showNext ? ` → <b class="${better ? 'up' : 'same'}">${fmtS(b.seconds)}</b>` : ''}${hitNote}</td></tr>`
          );
        })
        .join('');

      let status;
      let statusClass = '';
      switch (o.reason) {
        case null:
          status = `Affordable. You will keep ${run.currency - o.cost} ${cur}.`;
          statusClass = 'ok';
          break;
        case 'insufficient': {
          statusClass = 'bad';
          status = `Not enough ${cur}: costs ${o.cost}, you have ${run.currency} (short ${o.shortfall}).`;
          const remaining = config.waves.length - 2 - run.intermissionIndex;
          if (run.stats.currencySpent > 0) {
            const last = run.stats.upgrades[run.stats.upgrades.length - 1];
            status += ` You spent ${last.cost} on ${last.name} at intermission ${last.intermission}.`;
          } else if (remaining > 0) {
            status += ` Skip buying now and you will have ${run.currency + config.economy.intermissionAward} at the next intermission.`;
          }
          break;
        }
        case 'purchased':
          status = 'Installed. The cannon is upgraded.';
          statusClass = 'ok';
          break;
        case 'one-per-intermission':
          status = 'Locked: one upgrade per intermission, and you already bought one.';
          break;
        case 'maxed':
          status = 'Fully upgraded.';
          break;
        default:
          status = '';
      }

      const keycap = isRate ? '1' : '2';
      const btnLabel =
        o.reason === 'purchased'
          ? 'Installed ✓'
          : o.reason === 'insufficient'
            ? `Need ${o.shortfall} more ${cur}`
            : o.reason === 'maxed'
              ? 'Maxed'
              : o.reason === 'one-per-intermission'
                ? 'Locked this intermission'
                : `Buy for ${o.cost} ${cur}`;
      const classes = ['card', `card-${key}`];
      if (o.reason === 'purchased') classes.push('is-bought');
      else if (!o.canBuy) classes.push('is-locked');

      return (
        `<article class="${classes.join(' ')}" aria-labelledby="card-${key}-title">` +
        `<header><span class="keycap" aria-hidden="true">${keycap}</span>` +
        `<div><h4 id="card-${key}-title">${o.name}</h4><p class="flavor">${o.flavor}</p></div>` +
        `<span class="rank" aria-label="Rank ${o.rank} of ${o.maxRank}">${'◆'.repeat(o.rank)}${'◇'.repeat(o.maxRank - o.rank)}</span></header>` +
        `<p class="effect">${effect}</p>` +
        `<table class="matchup"><caption>Time to destroy one, next wave${showNext ? ' (now → after)' : ''}</caption>${rows}</table>` +
        `<p class="price">${priceLine(run, o)}</p>` +
        `<p class="status ${statusClass}" id="card-${key}-status">${status}</p>` +
        `<button type="button" class="buy" data-action="buy" data-key="${key}" ${o.canBuy ? '' : 'disabled'} ` +
        `aria-describedby="card-${key}-status" aria-keyshortcuts="${keycap}">${btnLabel}</button>` +
        `</article>`
      );
    }

    function renderIntermission(run) {
      const nextWave = run.waveIndex + 1;
      const w = config.waves[nextWave];
      const comp = sim.waveComposition(config, nextWave);
      const threat = Object.keys(comp)
        .map(
          (k) =>
            `<li><canvas class="icon" data-enemy="${k}" aria-hidden="true"></canvas>` +
            `<div><b>${comp[k]} × ${enemyName(k, comp[k])}</b><small>${enemyStatLine(k)}</small></div></li>`
        )
        .join('');
      const carry = {};
      run.enemies.forEach((e) => (carry[e.type] = (carry[e.type] || 0) + 1));
      const carryText = Object.keys(carry).length
        ? `<p class="carry">Still on the field and advancing: ${Object.keys(carry)
            .map((k) => `${carry[k]} ${enemyName(k, carry[k])}`)
            .join(', ')}.</p>`
        : '';
      const bought = run.purchasedThisIntermission;
      const contLabel = bought
        ? `Continue to wave ${nextWave + 1}`
        : `Continue without buying <small>(keep ${run.currency} ${cur})</small>`;

      el.interBody.innerHTML =
        `<p class="kicker">Intermission ${run.intermissionIndex + 1} of ${config.waves.length - 1} · the siege is paused</p>` +
        `<h2 id="intermission-title">The furnace pays <span class="ingots">+${run.lastAward}</span> ${cur}</h2>` +
        `<p class="purse">You have <b id="purse-amount">${run.currency}</b> ${cur}. Buy one upgrade, or keep them for later.</p>` +
        `<section class="threat" aria-labelledby="threat-title"><h3 id="threat-title">Next threat: wave ${nextWave + 1} of ${config.waves.length} · ${w.name} <span>${w.duration} s</span></h3>` +
        `<p>${w.blurb}</p><ul class="threat-list">${threat}</ul>${carryText}</section>` +
        `<div class="cards">${upgradeCard(run, 'rate', nextWave)}${upgradeCard(run, 'damage', nextWave)}</div>` +
        `<div class="actions"><button type="button" class="primary" data-action="continue" id="btn-continue">${contLabel}</button>` +
        `<span class="hint">Enter</span></div>`;
      paintIcons(el.interBody);
    }

    // --------------------------------------------------------------- end
    function renderEnd(run) {
      const s = sim.summarize(run);
      const won = s.outcome === 'win';
      const kills = Object.keys(s.defeatedByType)
        .filter((k) => s.defeatedByType[k] > 0)
        .map((k) => `${s.defeatedByType[k]} ${enemyName(k, s.defeatedByType[k])}`)
        .join(' · ');
      const ups = s.upgrades.length
        ? s.upgrades.map((u) => `<li>${u.name} <small>intermission ${u.intermission}, ${u.cost} ${cur}</small></li>`).join('')
        : '<li>None</li>';
      const maxTaken = Math.max(1, ...Object.values(s.damageTakenByType));
      const bars = Object.keys(s.damageTakenByType)
        .map((k) => {
          const v = s.damageTakenByType[k];
          return (
            `<li><span>${enemyName(k, 2)}</span><span class="dbar"><span style="width:${(v / maxTaken) * 100}%"></span></span>` +
            `<b>${v}</b><small>${s.breachesByType[k]} breach${s.breachesByType[k] === 1 ? '' : 'es'}</small></li>`
          );
        })
        .join('');

      el.end.classList.toggle('won', won);
      el.end.classList.toggle('lost', !won);
      el.endBody.innerHTML =
        `<p class="kicker">${won ? 'Victory' : 'Defeat'} · run seed ${run.seed}</p>` +
        `<h2 id="end-title">${won ? 'The Foundry Holds' : 'The Foundry Has Fallen'}</h2>` +
        `<dl class="stats">` +
        `<div><dt>Time survived</dt><dd>${s.timeSurvived.toFixed(1)} <small>/ ${s.runLength} s</small></dd></div>` +
        `<div><dt>Enemies defeated</dt><dd>${s.defeated}${kills ? `<small>${kills}</small>` : ''}</dd></div>` +
        `<div><dt>Foundry health</dt><dd>${s.hpLeft} <small>/ ${config.foundry.maxHealth}</small></dd></div>` +
        `<div class="ups"><dt>Upgrades chosen</dt><dd><ul>${ups}</ul></dd></div>` +
        `</dl>` +
        `<h3>What decided it</h3><ul class="verdict">${s.verdict.map((v) => `<li>${v}</li>`).join('')}</ul>` +
        `<h3>Damage taken, by attacker</h3><ul class="damage-bars">${bars}</ul>` +
        `<div class="actions"><button type="button" class="primary" data-action="restart" id="btn-restart">Restart run</button>` +
        `<span class="hint">Enter or R</span></div>`;
    }

    // ------------------------------------------------------------ public
    function showState(run) {
      const st = run.state;
      el.start.hidden = st !== 'start';
      el.inter.hidden = st !== 'intermission';
      el.end.hidden = st !== 'win' && st !== 'loss';
      doc.body.dataset.state = st;
      let focus = null;
      if (st === 'start') focus = $('btn-start');
      if (st === 'intermission') {
        renderIntermission(run);
        focus = $('btn-continue');
        announce(`Intermission. ${run.lastAward} ${cur} awarded. You have ${run.currency}.`);
      }
      if (st === 'win' || st === 'loss') {
        renderEnd(run);
        focus = $('btn-restart');
        announce(st === 'win' ? 'Victory. The foundry holds.' : 'Defeat. The foundry has fallen.');
      }
      if (st === 'wave') announce(`Wave ${run.waveIndex + 1}: ${config.waves[run.waveIndex].name}.`);
      if (focus) focus.focus({ preventScroll: true });
    }

    /** Re-render the intermission after a purchase, keeping focus sensible. */
    function refreshIntermission(run) {
      renderIntermission(run);
      $('btn-continue').focus({ preventScroll: true });
    }

    function announce(text) {
      el.live.textContent = text;
    }

    function updateHud(run) {
      const waveNo = Math.max(0, run.waveIndex) + 1;
      setText(el.hudWave, run.state === 'start' ? `– / ${config.waves.length}` : `${waveNo} / ${config.waves.length}`);
      setText(el.hudTime, run.runTime.toFixed(1));
      setText(el.hudHp, String(run.foundry.hp));
      const frac = run.foundry.hp / run.foundry.max;
      el.hudHpFill.style.width = `${frac * 100}%`;
      el.hudHpWrap.classList.toggle('low', frac <= 0.3);
      setText(el.hudCur, String(run.currency));
      setText(el.hudDmg, String(run.turret.damage));
      setText(el.hudInt, run.turret.interval.toFixed(2));
      if (el.tlFill) el.tlFill.style.width = `${(run.runTime / RUN_SECONDS) * 100}%`;
      el.timeline.querySelectorAll('.tl-seg').forEach((seg) => {
        const i = Number(seg.dataset.wave);
        seg.classList.toggle('current', run.state !== 'start' && i === run.waveIndex);
        seg.classList.toggle('next', run.state === 'intermission' && i === run.waveIndex + 1);
      });
    }

    function ingest(events) {
      for (const ev of events) {
        if (ev.type === 'breach') pulse(el.hudHpWrap, 'hit');
        if (ev.type === 'award') pulse(el.hudCurWrap, 'gain');
        if (ev.type === 'upgrade') pulse($('hud-gun-wrap'), 'gain');
      }
    }

    buildTimeline();
    buildStart();
    return { showState, refreshIntermission, updateHud, ingest, announce };
  }

  SF.createUI = createUI;
})(typeof self !== 'undefined' ? self : this);
