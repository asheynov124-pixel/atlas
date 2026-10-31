/**
 * Outcome grading loop (§5.7): rubric grader → adversarial critic (sampled) →
 * deterministic evidence verifier → calibration layer.
 */
import type { GraderRecord, OutcomeRubric, Task } from '../core/types.js';
import { makeId, nowIso } from '../core/types.js';
import { EpisodicStore } from '../memory/episodic.js';
import type { ModelProvider } from '../models/provider.js';
import type { Deliverable } from './deliverable.js';

export interface EnsembleVerdict {
  records: GraderRecord[];
  decision: 'accept' | 'revise' | 'escalate';
  score: number;
  confidence: number;
  critique: string;
  usd: number;
  tokens: number;
}

export interface EnsembleOptions {
  /** Fraction of deliverables the critic reviews when the task is not high-stakes. */
  critic_sampling?: number;
  /** Variance between rubric and critic above which we escalate to a human question. */
  disagreement_threshold?: number;
}

function parseJson<T>(text: string, fallback: T): T {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return fallback;
  try { return JSON.parse(m[0]) as T; } catch { return fallback; }
}

export class EvidenceVerifier {
  constructor(private l2: EpisodicStore) {}

  verify(task: Task, d: Deliverable): GraderRecord {
    const problems: string[] = [];
    for (const ev of d.evidence) {
      if (!this.l2.resolve(ev.pointer)) problems.push(`dangling ${ev.pointer}`);
      else if (!this.l2.verifyQuote(ev.pointer, ev.quote)) problems.push(`quote mismatch at ${ev.pointer}`);
    }
    const inline = [...d.text.matchAll(/\[\[(ep:[^\]\[]+)\]\]/g)].map((m) => m[1]!);
    for (const p of inline) if (!this.l2.resolve(p)) problems.push(`inline pointer ${p} does not resolve`);
    // Numbers in the deliverable must be near a pointer (same sentence).
    for (const sentence of d.text.split(/(?<=[.!?])\s+/)) {
      if (/\$?\d[\d,.]*\s?(m|bn|million|billion|%|employees|k)?/i.test(sentence) && /\d/.test(sentence) && !/\[\[ep:/.test(sentence) && !/^\s*[#|-]/.test(sentence)) {
        problems.push(`figure without pointer: "${sentence.trim().slice(0, 80)}"`);
      }
    }
    const ok = problems.length === 0;
    return { id: makeId('grd'), task_id: task.task_id, kind: 'evidence', scores: { evidence: ok ? 1 : 0 }, score: ok ? 1 : 0, confidence: 1, decision: ok ? 'accept' : 'revise', critique: ok ? 'all pointers resolve and quotes match' : problems.join('; '), created_at: nowIso() };
  }
}

export class GraderEnsemble {
  private opts: Required<EnsembleOptions>;
  constructor(private provider: ModelProvider, private verifier: EvidenceVerifier, opts: EnsembleOptions = {}) {
    this.opts = { critic_sampling: 0.2, disagreement_threshold: 0.35, ...opts };
  }

  private sampled(task: Task): boolean {
    if (task.risk_tier_ceiling >= 3 || task.type.startsWith('synth')) return true;
    let h = 0;
    for (const c of task.task_id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return (h % 100) / 100 < this.opts.critic_sampling;
  }

  async grade(task: Task, d: Deliverable, rubric: OutcomeRubric): Promise<EnsembleVerdict> {
    const records: GraderRecord[] = [];
    let usd = 0, tokens = 0;

    // 1. Rubric grader (Balanced). Sees deliverable + rubric only.
    const rub = await this.provider.complete({
      tier: 'balanced', effort: 'medium', json: true,
      system: '[[task:grade]] You are a rubric grader. Score each criterion 0–1 with a quoted justification. Return JSON {"scores": {id: number}, "justifications": {id: string}}.',
      prompt: `RUBRIC:\n${rubric.criteria.map((c) => `${c.id}: ${c.text}`).join('\n')}\n\nDELIVERABLE:\n${d.text}`,
    });
    usd += rub.usd; tokens += rub.tokens_in + rub.tokens_out;
    const parsed = parseJson<{ scores: Record<string, number>; justifications?: Record<string, string> }>(rub.text, { scores: {} });
    const weights = rubric.criteria.map((c) => c.weight ?? 1);
    const total = weights.reduce((a, b) => a + b, 0);
    const score = rubric.criteria.reduce((acc, c, i) => acc + (Math.min(1, Math.max(0, parsed.scores[c.id] ?? 0)) * weights[i]!) / total, 0);
    records.push({ id: makeId('grd'), task_id: task.task_id, kind: 'rubric', scores: parsed.scores, score, confidence: 0.8, decision: score >= rubric.min_score ? 'accept' : 'revise', critique: Object.values(parsed.justifications ?? {}).join(' | '), created_at: nowIso() });

    // 2. Adversarial critic (Frontier, sampled). Sees deliverable + sources.
    let criticScore: number | null = null;
    if (this.sampled(task)) {
      const cr = await this.provider.complete({
        tier: 'frontier', effort: 'high', json: true,
        system: '[[task:critic]] You are an adversarial critic. Find omissions, contradictions and unsupported claims. Return JSON {"severity": 0-1, "issues": [string]}.',
        prompt: `DELIVERABLE:\n${d.text}\n\nEVIDENCE:\n${d.evidence.map((e) => `${e.pointer}: ${e.quote}`).join('\n')}`,
      });
      usd += cr.usd; tokens += cr.tokens_in + cr.tokens_out;
      const c = parseJson<{ severity: number; issues: string[] }>(cr.text, { severity: 0, issues: [] });
      criticScore = 1 - Math.min(1, Math.max(0, c.severity));
      records.push({ id: makeId('grd'), task_id: task.task_id, kind: 'critic', scores: { severity: c.severity }, score: criticScore, confidence: 0.7, decision: c.severity > 0.4 ? 'revise' : 'accept', critique: c.issues.join('; '), created_at: nowIso() });
    }

    // 3. Deterministic evidence verifier.
    const ev = this.verifier.verify(task, d);
    records.push(ev);

    // 4. Calibration.
    const disagreement = criticScore === null ? 0 : Math.abs(criticScore - score);
    const confidence = Math.max(0, Math.min(1, (0.6 * score + 0.4 * (criticScore ?? score)) * (ev.score ? 1 : 0.5) * (1 - disagreement)));
    let decision: EnsembleVerdict['decision'];
    if (disagreement > this.opts.disagreement_threshold) decision = 'escalate';
    else if (ev.decision === 'revise' || score < rubric.min_score || (criticScore !== null && criticScore < 0.6)) decision = 'revise';
    else decision = 'accept';
    const critique = records.filter((r) => r.decision !== 'accept').map((r) => `${r.kind}: ${r.critique}`).join('\n') || 'accepted';
    records.push({ id: makeId('grd'), task_id: task.task_id, kind: 'calibration', scores: { rubric: score, critic: criticScore ?? -1, evidence: ev.score, disagreement }, score, confidence, decision, critique, created_at: nowIso() });
    return { records, decision, score, confidence, critique, usd, tokens };
  }
}
