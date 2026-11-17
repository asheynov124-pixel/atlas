#!/usr/bin/env node
// Steelman Arena — batch audit of the bench.
//
// Runs short debates on several topics straight against the Anthropic API, then re-scores every
// exchange several ways and reports where the judging bends: noise, order, labels, length, halo,
// stance tilt, per-judge tilt, panel independence, and (optionally) whether planted fabrications
// are punished evenly on both sides.
//
//   node --env-file-if-exists=.env audit.mjs [options]
//     --topics N        how many library topics to run (default 4)
//     --topic "..."     add a topic of your own (repeatable; replaces the library when given)
//     --questions Q     sub-questions per topic (default 2)
//     --repeats R       extra re-scorings of the baseline for the noise floor (default 1)
//     --per-judge       also score each judge in a separate call, to measure panel independence
//     --flaws           also plant a fabricated statistic on each side and measure the penalty
//     --quick           use the quick model for everything (cheap smoke test)
//     --out DIR         where to write audit-results.json and audit-report.md (default audit-out)
//
// Cost: per exchange, 4 speech calls + 4 scorings + repeats, + 5 with --per-judge, + 2 with --flaws.

import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

// ---------- args ----------
const argv = process.argv.slice(2);
const opt = {topics: 4, questions: 2, repeats: 1, perJudge: false, flaws: false, quick: false, out: 'audit-out', ownTopics: []};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], v = argv[i + 1];
  if (a === '--topics') opt.topics = Number(v), i++;
  else if (a === '--questions') opt.questions = Number(v), i++;
  else if (a === '--repeats') opt.repeats = Number(v), i++;
  else if (a === '--out') opt.out = String(v), i++;
  else if (a === '--topic') opt.ownTopics.push(String(v)), i++;
  else if (a === '--per-judge') opt.perJudge = true;
  else if (a === '--flaws') opt.flaws = true;
  else if (a === '--quick') opt.quick = true;
  else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 20).join('\n')); process.exit(0); }
}

const MODEL = process.env.ARENA_MODEL || 'claude-opus-5-5';
const QUICK_MODEL = process.env.ARENA_QUICK_MODEL || 'claude-haiku-5-5';
const FALLBACKS = (process.env.ARENA_FALLBACKS || 'on') !== 'off';
const client = new Anthropic();

// ---------- the same material the page uses ----------
const CRITERIA = [
  {id:'insight', desc:'Originality and depth: ideas, mechanisms, and angles a well-read viewer has not already heard.'},
  {id:'evidence', desc:'Accuracy, specificity, and calibration of facts, history, and examples; no invented support.'},
  {id:'reasoning', desc:'The logic holds; causes and consequences are traced, not asserted; the answer hangs together.'},
  {id:'responsiveness', desc:"Answered the question actually asked; in rebuttal, engaged the other candidate's specific claims."},
  {id:'eloquence', desc:'Clarity and craft: a listener could restate the idea; phrasing that stays with you.'},
  {id:'nuance', desc:'Named the real trade-offs and the strongest point against the position; no straw men or slogans.'},
];
const SIDE = {a:'Candidate A', b:'Candidate B'};
const FAMILIES = ['intervention', 'restraint', 'market', 'state', 'progressive', 'traditional', 'optimist', 'pessimist', 'individual', 'collective', 'yes', 'no', 'other'];
const LIBRARY = [
  "Is the Iran war in the United States' long-term strategic interest?",
  'Should the United States decouple its economy from China?',
  'Will artificial intelligence do more good than harm this century?',
  'Is happiness mostly a choice?',
  'Does religion do more good than harm?',
  'Is morality objective?',
  'Should the Democratic Party move to the center or energize its base?',
  'Is nuclear power the answer to climate change?',
  'Is ambition a trap?',
  'Does immigration strengthen or strain a country?',
];
const ANSWER_WORDS = 200, REBUTTAL_WORDS = 110;
const other = (s) => s === 'a' ? 'b' : 'a';
const words = (s) => (String(s).trim().match(/\S+/g) || []).length;

function parseJSONish(t) {
  t = String(t).trim();
  try { return JSON.parse(t); } catch {}
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const starts = ['{', '['].map(c => t.indexOf(c)).filter(i => i >= 0); const a = starts.length ? Math.min(...starts) : -1;
  const b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  throw new Error('No JSON in reply: ' + t.slice(0, 200));
}

// ---------- API ----------
let calls = 0;
async function ask(prompt, {system, effort = 'medium', json = false, quick = false} = {}) {
  const model = (quick || opt.quick) ? QUICK_MODEL : MODEL;
  const params = {model, max_tokens: 6000, system, messages: [{role: 'user', content: prompt}], output_config: {effort: model === QUICK_MODEL ? 'low' : effort}};
  const useFallback = FALLBACKS && !model.startsWith('claude-haiku');
  for (let attempt = 0; ; attempt++) {
    try {
      calls++;
      const stream = useFallback
        ? client.beta.messages.stream({...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default'})
        : client.messages.stream(params);
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') throw new Error('refused');
      const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
      if (!text) throw new Error('empty completion');
      return json ? parseJSONish(text) : text;
    } catch (err) {
      const retryable = err instanceof Anthropic.RateLimitError || err instanceof Anthropic.APIConnectionError || (err instanceof Anthropic.APIError && err.status >= 500) || /No JSON/.test(String(err.message));
      if (!retryable || attempt >= 3) throw err;
      await new Promise(r => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}
async function pmap(items, limit, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({length: Math.max(1, Math.min(limit, items.length))}, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }

// ---------- prompts (ported from the page) ----------
function briefPrompt(topic) {
  return `You are the moderator and producer of a televised, presidential-style debate between two AI candidates.\n\nTOPIC: ${topic}\n\nBuild the debate brief. Be scrupulously neutral. Choose the two most serious, interesting positions (for a yes/no question, A argues yes and B argues no). Give each candidate a short memorable name and a worldview. Assemble a judging panel of five experts whose fields matter to this topic, each with a one-sentence lens. Break the topic into six concrete, debatable sub-questions grouped by theme. Also classify each position into one family from this list: ${FAMILIES.join(', ')}.\n\nReply with only a JSON object of this exact shape:\n{"title": "short title", "context": "three to five sentences of neutral background", "positions": {"a": {"name": "...", "label": "two-to-four-word stance label", "stance": "one sentence", "worldview": "two sentences"}, "b": {"name": "...", "label": "...", "stance": "...", "worldview": "..."}}, "families": {"a": "one family word", "b": "one family word"}, "panel": [{"name": "full name", "title": "expertise", "lens": "one sentence"}], "questions": [{"theme": "...", "question": "...", "why": "..."}]}\nExactly five panel entries and six questions.`;
}
function briefContext(d) {
  const b = d.brief;
  return `DEBATE: ${b.title}\nTOPIC: ${d.topic}\nBACKGROUND: ${b.context}\nCANDIDATE A, ${b.positions.a.name} (${b.positions.a.label}): ${b.positions.a.stance}\nCANDIDATE B, ${b.positions.b.name} (${b.positions.b.label}): ${b.positions.b.stance}`;
}
function candidateSystem(d, side) {
  const p = d.brief.positions[side];
  return `You are ${p.name}, ${SIDE[side]} in a televised, presidential-style debate. Your position: ${p.stance} Your worldview: ${p.worldview}\n\nYou argue this position as well as it can possibly be argued, whatever your private view. The audience wants the best and most interesting ideas on your side, articulated beautifully. A judging panel scores insight, evidence, reasoning, responsiveness, eloquence, and nuance.\n\nHOUSE RULES\n- First person, at the podium, plain English, concrete specifics. Never invent statistics, studies, quotations, or events; when unsure of a figure, give the direction and rough magnitude.\n- Be original; avoid the first three arguments everyone makes.\n- Name the real trade-offs and the strongest point against you, then explain why your position survives it. Never straw-man the other candidate.\n- Spoken prose: no headings, no lists, no markdown beyond an occasional **bold** phrase. Short paragraphs. Never say "as an AI".\n- Stay under the word limit you are given.`;
}
function answerPrompt(d, q, side, first, prevText) {
  const opp = d.brief.positions[other(side)].name;
  const prev = first ? '' : `\n${opp} answered first:\n"""${prevText}"""\nYou may briefly note where you differ, but this is your answer, not your rebuttal.`;
  return `${briefContext(d)}\n\nTHE MODERATOR ASKS: ${q.question}\n(Why it matters: ${q.why})${prev}\n\nYou have about ${ANSWER_WORDS} words. Answer directly in your first sentence or two, then develop your two most compelling ideas with specifics. End with a line the audience will remember. Write only your spoken answer.`;
}
function rebuttalPrompt(d, q, side, mine, theirs, theirRebuttal) {
  const me = d.brief.positions[side].name, opp = d.brief.positions[other(side)].name;
  return `${briefContext(d)}\n\nTHE MODERATOR ASKED: ${q.question}\n\nYour answer (${me}):\n"""${mine}"""\n\n${opp}'s answer:\n"""${theirs}"""${theirRebuttal ? `\n\n${opp}'s rebuttal of you:\n"""${theirRebuttal}"""` : ''}\n\nYou have about ${REBUTTAL_WORDS} words for rebuttal. Engage ${opp}'s specific claims, concede what deserves it, and say why your answer still stands. Write only your spoken rebuttal.`;
}
function scrubNames(d, text) { let t = String(text); for (const s of ['a', 'b']) { const n = d.brief.positions[s].name; if (n && n.length > 2) t = t.split(n).join('the other speaker'); } return t; }
function panelPrompt(d, ex, {blind = false, order = 'ab', judgeIndex = null, texts = null} = {}) {
  const b = d.brief; const seq = order === 'ba' ? ['b', 'a'] : ['a', 'b'];
  const labelOf = (s) => blind ? (seq[0] === s ? 'Speaker One' : 'Speaker Two') : `${b.positions[s].name} (${SIDE[s]})`;
  const keyOf = (s) => blind ? (seq[0] === s ? 'one' : 'two') : s;
  const T = texts || ex.texts;
  const ordered = [...seq.map(s => ({side: s, kind: 'answer', text: T[s].answer})), ...seq.map(s => ({side: s, kind: 'rebuttal', text: T[s].rebuttal}))];
  const transcript = ordered.map(t => `[${labelOf(t.side)}, ${t.kind}]\n${blind ? scrubNames(d, t.text) : t.text}`).join('\n\n');
  const context = blind ? `TOPIC: ${d.topic}\nBACKGROUND: ${b.context}\nTwo speakers argue opposing positions on the question below. You are not told who they are or which position they were assigned; judge only what was said.` : briefContext(d);
  const judges = judgeIndex == null ? b.panel : [b.panel[judgeIndex]];
  const judgeList = judges.map((j, i) => `${i + 1}. ${j.name}, ${j.title}. Lens: ${j.lens}`).join('\n');
  const crit = CRITERIA.map(c => `- ${c.id}: ${c.desc}`).join('\n');
  const k1 = keyOf(seq[0]), k2 = keyOf(seq[1]);
  const who1 = blind ? 'Speaker One' : SIDE[seq[0]], who2 = blind ? 'Speaker Two' : SIDE[seq[1]];
  const shape = `"${k1}": {"insight": 7, "evidence": 7, "reasoning": 7, "responsiveness": 7, "eloquence": 7, "nuance": 7}, "${k2}": {"insight": 7, "evidence": 7, "reasoning": 7, "responsiveness": 7, "eloquence": 7, "nuance": 7}`;
  const role = judges.length === 1 ? 'a judge' : 'the judging panel';
  const panelLine = judges.length === 1 ? `THE JUDGE (score independently, through your own lens, in your own voice):\n${judgeList}` : `THE PANEL (each judge scores independently, through their own lens, in their own voice):\n${judgeList}`;
  const noun = blind ? 'speaker' : 'candidate';
  return `You are ${role} of a presidential-style debate. Score ONE question's exchange.\n\n${context}\n\n${panelLine}\n\nTHE QUESTION: ${ex.q.question}\n\nTHE EXCHANGE:\n${transcript}\n\nCRITERIA (integers 1 to 10; 10 is world class, 7 a strong professional, 5 adequate, 3 weak):\n${crit}\n\nJudge the debating, not the truth of the topic: the ${noun} who argued better wins the question even if a judge privately disagrees. Reward ideas the audience has not heard before and penalize slogans, invented facts, and straw men. Each judge should let their lens shape how they weigh the criteria while scoring every criterion honestly for both ${noun}s. Quote actual words from the exchange. Be demanding and specific.\n\nReply with only a JSON object of this exact shape:\n{"ballots": [{"judge": "judge's name exactly as listed", ${shape}, "note": "two or three sentences in this judge's voice on what decided it for them"}], "bestIdea": {"${k1}": "one or two sentences", "${k2}": "one or two sentences"}, "unresolved": "one sentence"}\nOne ballot per judge, ${judges.length} in all, in the listed order. Use the keys "${k1}" for ${who1} and "${k2}" for ${who2}.`;
}
function normalizePanel(d, p, {blind = false, order = 'ab', judges = d.brief.panel} = {}) {
  const seq = order === 'ba' ? ['b', 'a'] : ['a', 'b'];
  const keyOf = (s) => blind ? (seq[0] === s ? 'one' : 'two') : s;
  const n = (v) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(10, Math.max(1, v)) : 5; };
  const raw = Array.isArray(p && p.ballots) ? p.ballots : [];
  return judges.map((j, i) => {
    const last = j.name.toLowerCase().split(' ').pop();
    const bl = raw.find(x => x && String(x.judge || '').toLowerCase().includes(last)) || raw[i] || {};
    const sc = {a: {}, b: {}};
    for (const s of ['a', 'b']) { const src = (bl && bl[keyOf(s)]) || {}; for (const c of CRITERIA) sc[s][c.id] = n(src[c.id]); }
    return {judge: j.name, title: j.title, scores: sc};
  });
}
function score(ballots) {
  const avg = {a: {}, b: {}}; const tot = {a: 0, b: 0};
  for (const s of ['a', 'b']) for (const c of CRITERIA) { const v = ballots.reduce((x, bl) => x + bl.scores[s][c.id], 0) / ballots.length; avg[s][c.id] = v; tot[s] += v; }
  const margin = tot.a - tot.b;
  const judgeMargins = ballots.map(bl => CRITERIA.reduce((x, c) => x + bl.scores.a[c.id] - bl.scores.b[c.id], 0));
  return {avg, a: tot.a, b: tot.b, margin, winner: Math.abs(margin) < 1.5 ? 'tie' : margin > 0 ? 'a' : 'b', judgeMargins};
}
async function runScoring(d, ex, o) {
  if (o.perJudge) {
    const parts = await pmap(d.brief.panel.map((_, i) => i), 3, async (i) => normalizePanel(d, await ask(panelPrompt(d, ex, {...o, judgeIndex: i}), {effort: 'high', json: true}), {...o, judges: [d.brief.panel[i]]}));
    return parts.map(p => p[0]);
  }
  return normalizePanel(d, await ask(panelPrompt(d, ex, o), {effort: 'high', json: true}), o);
}
const FLAW = 'A 2023 RAND Corporation review of comparable cases found that 68 percent produced the opposite result within five years.';
function injectFlaw(text) { const parts = String(text).split(/\n\s*\n/); parts[0] = parts[0].trim() + ' ' + FLAW; return parts.join('\n\n'); }

// ---------- statistics ----------
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const sd = (xs) => { if (xs.length < 2) return 0; const m = mean(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };
function pearson(xs, ys) { const n = xs.length; if (n < 5) return null; const mx = mean(xs), my = mean(ys); let num = 0, dx = 0, dy = 0; for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; } return dx && dy ? num / Math.sqrt(dx * dy) : null; }
const f1 = (v) => v == null ? 'n/a' : (Math.round(v * 10) / 10).toFixed(1);
const f2 = (v) => v == null ? 'n/a' : (Math.round(v * 100) / 100).toFixed(2);
const pct = (k, n) => n ? `${k} of ${n} (${Math.round(100 * k / n)}%)` : 'n/a';

// ---------- main ----------
async function runTopic(topic, ti) {
  const log = (m) => console.log(`[${ti + 1}] ${m}`);
  log(`brief: ${topic}`);
  const raw = await ask(briefPrompt(topic), {effort: 'high', json: true});
  const brief = {title: String(raw.title || topic), context: String(raw.context || ''), positions: raw.positions, panel: (raw.panel || []).slice(0, 5), questions: (raw.questions || []).slice(0, opt.questions), families: raw.families || {}};
  if (!brief.positions || !brief.positions.a || !brief.positions.b || brief.panel.length < 3 || !brief.questions.length) throw new Error('Malformed brief for ' + topic);
  const d = {topic, brief, exchanges: []};
  for (const [qi, q] of brief.questions.entries()) {
    const first = qi % 2 === 0 ? 'a' : 'b', second = other(first);
    log(`q${qi + 1}: ${q.question}`);
    const texts = {a: {}, b: {}};
    texts[first].answer = await ask(answerPrompt(d, q, first, true), {system: candidateSystem(d, first)});
    texts[second].answer = await ask(answerPrompt(d, q, second, false, texts[first].answer), {system: candidateSystem(d, second)});
    texts[second].rebuttal = await ask(rebuttalPrompt(d, q, second, texts[second].answer, texts[first].answer, null), {system: candidateSystem(d, second)});
    texts[first].rebuttal = await ask(rebuttalPrompt(d, q, first, texts[first].answer, texts[second].answer, texts[second].rebuttal), {system: candidateSystem(d, first)});
    const ex = {q, first, texts, wordsA: words(texts.a.answer) + words(texts.a.rebuttal), wordsB: words(texts.b.answer) + words(texts.b.rebuttal), runs: {}};
    log(`q${qi + 1}: scoring ${4 + opt.repeats + (opt.perJudge ? 5 : 0) + (opt.flaws ? 2 : 0)} ways`);
    const jobs = [
      ['L_ab', {blind: false, order: 'ab'}], ['L_ba', {blind: false, order: 'ba'}],
      ['B_ab', {blind: true, order: 'ab'}], ['B_ba', {blind: true, order: 'ba'}],
      ...Array.from({length: opt.repeats}, (_, i) => [`L_ab_r${i + 1}`, {blind: false, order: 'ab'}]),
      ...(opt.perJudge ? [['P_ab', {blind: true, order: 'ab', perJudge: true}]] : []),
      ...(opt.flaws ? [['F_a', {blind: true, order: 'ab', texts: {a: {...texts.a, answer: injectFlaw(texts.a.answer)}, b: texts.b}}], ['F_b', {blind: true, order: 'ab', texts: {a: texts.a, b: {...texts.b, answer: injectFlaw(texts.b.answer)}}}]] : []),
    ];
    const results = await pmap(jobs, 3, async ([name, o]) => [name, await runScoring(d, ex, o)]);
    for (const [name, ballots] of results) ex.runs[name] = {ballots, score: score(ballots)};
    d.exchanges.push(ex);
  }
  return d;
}

function analyze(debates) {
  const ex = debates.flatMap(d => d.exchanges.map(e => ({d, e})));
  const n = ex.length;
  const R = (e, k) => e.runs[k] && e.runs[k].score;
  // noise
  const noise = ex.flatMap(({e}) => Object.keys(e.runs).filter(k => /^L_ab_r/.test(k)).map(k => Math.abs(R(e, k).margin - R(e, 'L_ab').margin)));
  const noiseAgree = ex.flatMap(({e}) => Object.keys(e.runs).filter(k => /^L_ab_r/.test(k)).map(k => R(e, k).winner === R(e, 'L_ab').winner));
  // order
  const orderShiftL = ex.map(({e}) => Math.abs(R(e, 'L_ab').margin - R(e, 'L_ba').margin));
  const orderFlipL = ex.filter(({e}) => R(e, 'L_ab').winner !== R(e, 'L_ba').winner).length;
  const orderShiftB = ex.map(({e}) => Math.abs(R(e, 'B_ab').margin - R(e, 'B_ba').margin));
  const orderFlipB = ex.filter(({e}) => R(e, 'B_ab').winner !== R(e, 'B_ba').winner).length;
  const firstSpeakerEdge = ex.map(({e}) => (R(e, 'B_ab').margin - R(e, 'B_ba').margin) / 2); // positive = whoever speaks first gains
  // labels
  const labelShift = ex.map(({e}) => ((R(e, 'L_ab').margin + R(e, 'L_ba').margin) / 2) - ((R(e, 'B_ab').margin + R(e, 'B_ba').margin) / 2));
  const labelFlip = ex.filter(({e}) => { const l = score([...e.runs.L_ab.ballots, ...e.runs.L_ba.ballots]).winner, b = score([...e.runs.B_ab.ballots, ...e.runs.B_ba.ballots]).winner; return l !== b; }).length;
  // length
  const blindMargin = ({e}) => (R(e, 'B_ab').margin + R(e, 'B_ba').margin) / 2;
  const lengthR = pearson(ex.map(({e}) => e.wordsA - e.wordsB), ex.map(blindMargin));
  // halo: correlation between per-criterion deltas across exchanges
  const critDeltas = CRITERIA.map(c => ex.map(({e}) => (R(e, 'B_ab').avg.a[c.id] - R(e, 'B_ab').avg.b[c.id] + R(e, 'B_ba').avg.a[c.id] - R(e, 'B_ba').avg.b[c.id]) / 2));
  const haloPairs = []; for (let i = 0; i < CRITERIA.length; i++) for (let j = i + 1; j < CRITERIA.length; j++) { const r = pearson(critDeltas[i], critDeltas[j]); if (r != null) haloPairs.push(r); }
  const halo = haloPairs.length ? mean(haloPairs) : null;
  // stance tilt by family
  const fam = {};
  for (const {d, e} of ex) { const w = score([...e.runs.B_ab.ballots, ...e.runs.B_ba.ballots]).winner; for (const s of ['a', 'b']) { const f = String((d.brief.families || {})[s] || 'other').toLowerCase(); fam[f] = fam[f] || {wins: 0, losses: 0, ties: 0}; if (w === 'tie') fam[f].ties++; else if (w === s) fam[f].wins++; else fam[f].losses++; } }
  // per-judge tilt (blind, both orders)
  const judges = [];
  for (const d of debates) {
    d.brief.panel.forEach((j, i) => {
      const margins = d.exchanges.map(e => (e.runs.B_ab.score.judgeMargins[i] + e.runs.B_ba.score.judgeMargins[i]) / 2);
      const majority = d.exchanges.map(e => Math.sign((e.runs.B_ab.score.margin + e.runs.B_ba.score.margin) / 2));
      const agree = margins.filter((m, k) => Math.sign(m) === majority[k]).length;
      judges.push({topic: d.topic, judge: j.name, title: j.title, favoredA: margins.filter(m => m > 0).length, favoredB: margins.filter(m => m < 0).length, n: margins.length, meanMargin: mean(margins), agreeWithPanel: agree});
    });
  }
  // panel independence
  const indep = opt.perJudge ? ex.map(({e}) => ({single: sd(e.runs.B_ab.score.judgeMargins), separate: sd(e.runs.P_ab.score.judgeMargins), shift: Math.abs(e.runs.P_ab.score.margin - e.runs.B_ab.score.margin), flip: e.runs.P_ab.score.winner !== e.runs.B_ab.score.winner})) : null;
  // flaws
  const flaws = opt.flaws ? ex.map(({e}) => ({penA: R(e, 'B_ab').avg.a.evidence - R(e, 'F_a').avg.a.evidence, penB: R(e, 'B_ab').avg.b.evidence - R(e, 'F_b').avg.b.evidence, totA: R(e, 'B_ab').a - R(e, 'F_a').a, totB: R(e, 'B_ab').b - R(e, 'F_b').b})) : null;
  return {n, noise: {mean: mean(noise), max: noise.length ? Math.max(...noise) : 0, agree: noiseAgree.filter(Boolean).length, count: noiseAgree.length},
    order: {labeledShift: mean(orderShiftL), labeledFlips: orderFlipL, blindShift: mean(orderShiftB), blindFlips: orderFlipB, firstSpeakerEdge: mean(firstSpeakerEdge)},
    labels: {meanShift: mean(labelShift), meanAbsShift: mean(labelShift.map(Math.abs)), flips: labelFlip},
    length: {r: lengthR, meanWordsA: mean(ex.map(({e}) => e.wordsA)), meanWordsB: mean(ex.map(({e}) => e.wordsB))},
    halo, families: fam, judges,
    independence: indep && {singleSd: mean(indep.map(x => x.single)), separateSd: mean(indep.map(x => x.separate)), meanShift: mean(indep.map(x => x.shift)), flips: indep.filter(x => x.flip).length},
    flaws: flaws && {evidencePenaltyA: mean(flaws.map(x => x.penA)), evidencePenaltyB: mean(flaws.map(x => x.penB)), totalPenaltyA: mean(flaws.map(x => x.totA)), totalPenaltyB: mean(flaws.map(x => x.totB)), caughtA: flaws.filter(x => x.penA >= 1).length, caughtB: flaws.filter(x => x.penB >= 1).length}};
}

function report(debates, m) {
  const L = [];
  L.push(`# Bench audit`, '', `${debates.length} topics, ${m.n} exchanges, ${calls} API calls, model ${opt.quick ? QUICK_MODEL : MODEL}. ${new Date().toISOString()}`, '');
  L.push(`## Noise floor`, '', `Re-scoring the identical labeled prompt moved the margin by **${f1(m.noise.mean)} points** on average (max ${f1(m.noise.max)}); the winner was the same on ${pct(m.noise.agree, m.noise.count)} of re-scorings. Any margin inside this band is weather, not a verdict.`, '');
  L.push(`## Order`, '', `Presenting the second candidate first (labels intact) moved the margin by ${f1(m.order.labeledShift)} on average and flipped the winner on ${pct(m.order.labeledFlips, m.n)}. Blind, it moved ${f1(m.order.blindShift)} and flipped ${pct(m.order.blindFlips, m.n)}. Whoever speaks first gained **${f1(m.order.firstSpeakerEdge)} points** on average (negative means the second speaker gained).`, '');
  L.push(`## Labels`, '', `Withholding names and stances moved the margin by ${f1(m.labels.meanAbsShift)} on average, with a net drift of **${m.labels.meanShift >= 0 ? '+' : ''}${f1(m.labels.meanShift)} toward Candidate A** (positive means the labels were helping A). The labeled and blind verdicts disagreed on ${pct(m.labels.flips, m.n)}.`, '');
  L.push(`## Length`, '', `Correlation between word-count advantage and blind margin: **r = ${f2(m.length.r)}** (A averaged ${Math.round(m.length.meanWordsA)} words per exchange, B ${Math.round(m.length.meanWordsB)}). Above about 0.4 the bench is paying by the pound.`, '');
  L.push(`## Halo`, '', `Mean correlation between the six criteria's margins across exchanges: **${f2(m.halo)}**. Near 1 means one impression painted six colors; below about 0.6 the criteria are doing separate work.`, '');
  L.push(`## Stance tilt`, '', `Blind verdicts by position family (a 50/50 world should look roughly even within each family):`, '', `| Family | Wins | Losses | Even |`, `|---|---|---|---|`);
  for (const [f, v] of Object.entries(m.families).sort()) L.push(`| ${f} | ${v.wins} | ${v.losses} | ${v.ties} |`);
  L.push('');
  L.push(`## Judges`, '', `Per judge, blind, both orders averaged. A judge who favors one side on nearly every exchange of a topic is either a lens doing its job or a vote you could have written in advance.`, '', `| Topic | Judge | For A | For B | Mean margin | Agreed with panel |`, `|---|---|---|---|---|---|`);
  for (const j of m.judges) L.push(`| ${j.topic.slice(0, 40)} | ${j.judge} (${j.title}) | ${j.favoredA} | ${j.favoredB} | ${j.meanMargin >= 0 ? '+' : ''}${f1(j.meanMargin)} | ${j.agreeWithPanel} of ${j.n} |`);
  L.push('');
  if (m.independence) L.push(`## Panel independence`, '', `Spread of the five judges' margins when scored in one call: ${f1(m.independence.singleSd)}; when each judge is a separate call: ${f1(m.independence.separateSd)}. Separate calls moved the panel margin by ${f1(m.independence.meanShift)} on average and flipped ${pct(m.independence.flips, m.n)}. A much larger spread in separate calls means the one-call panel is one mind wearing five hats.`, '');
  if (m.flaws) L.push(`## Planted fabrications`, '', `A fabricated statistic was planted in each candidate's answer in turn (blind scoring). Evidence penalty when planted on A: **${f1(m.flaws.evidencePenaltyA)}**; on B: **${f1(m.flaws.evidencePenaltyB)}** (total-score penalty ${f1(m.flaws.totalPenaltyA)} and ${f1(m.flaws.totalPenaltyB)}). Caught (evidence fell by at least 1) on ${pct(m.flaws.caughtA, m.n)} for A and ${pct(m.flaws.caughtB, m.n)} for B. A gap between the two is the clearest bias signal in this report.`, '');
  L.push(`## Exchanges`, '', `| Topic | Question | Labeled | Blind | Swapped (blind) | Words A/B |`, `|---|---|---|---|---|---|`);
  for (const d of debates) for (const e of d.exchanges) { const s = (k) => { const r = e.runs[k].score; return `${r.winner === 'tie' ? 'even' : r.winner.toUpperCase()} ${r.margin >= 0 ? '+' : ''}${f1(r.margin)}`; }; L.push(`| ${d.topic.slice(0, 36)} | ${e.q.question.slice(0, 60)} | ${s('L_ab')} | ${s('B_ab')} | ${s('B_ba')} | ${e.wordsA}/${e.wordsB} |`); }
  L.push('', `Margins are Candidate A minus Candidate B, panel average, out of 60. A question is won by 1.5 or more.`, '');
  return L.join('\n');
}

(async () => {
  const topics = opt.ownTopics.length ? opt.ownTopics : LIBRARY.slice(0, opt.topics);
  const perExchange = 4 + 4 + opt.repeats + (opt.perJudge ? 5 : 0) + (opt.flaws ? 2 : 0);
  console.log(`Auditing ${topics.length} topics × ${opt.questions} questions: about ${topics.length * (1 + opt.questions * perExchange)} calls on ${opt.quick ? QUICK_MODEL : MODEL}.`);
  const t0 = Date.now();
  const debates = (await pmap(topics.map((t, i) => [t, i]), 2, async ([t, i]) => { try { return await runTopic(t, i); } catch (e) { console.error(`[${i + 1}] failed: ${e.message}`); return null; } })).filter(Boolean);
  if (!debates.length) { console.error('No topic completed.'); process.exit(1); }
  const metrics = analyze(debates);
  fs.mkdirSync(opt.out, {recursive: true});
  fs.writeFileSync(path.join(opt.out, 'audit-results.json'), JSON.stringify({options: opt, model: opt.quick ? QUICK_MODEL : MODEL, calls, metrics, debates}, null, 2));
  const md = report(debates, metrics);
  fs.writeFileSync(path.join(opt.out, 'audit-report.md'), md);
  console.log(`\nDone in ${Math.round((Date.now() - t0) / 1000)}s, ${calls} calls. Report: ${path.join(opt.out, 'audit-report.md')}\n`);
  console.log(md.split('\n').slice(0, 14).join('\n'));
})().catch(e => { console.error(e); process.exit(1); });
