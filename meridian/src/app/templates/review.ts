/**
 * Document review template: one task per file in the workspace folder, then a
 * chronology that merges every dated event. Every event carries a span pointer
 * into the verbatim document text, so the Evidence Verifier can check it.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative, extname, join } from 'node:path';
import type { Kernel } from '../../kernel/bootstrap.js';
import type { Planner, SpecialistExecutor, TaskSpec } from '../../kernel/run.js';
import { evidence } from '../../kernel/run.js';
import type { OutcomeRubric } from '../../core/types.js';
import { parsePointer } from '../../memory/episodic.js';

export const REVIEW_RUBRIC: OutcomeRubric = {
  id: 'rub_review_v1',
  criteria: [
    { id: 'coverage', text: 'Every dated event in the document appears in the extraction.' },
    { id: 'dates', text: 'Every event has an ISO date.' },
    { id: 'evidence', text: 'Every event line carries a span pointer that resolves to the source sentence.' },
  ],
  min_score: 0.9,
  max_revisions: 2,
};

const TEXT_EXT = new Set(['.txt', '.md', '.eml', '.csv', '.json', '.html']);

export async function listWorkspaceFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: string[] = [];
    try { entries = await readdir(dir); } catch { return; }
    for (const e of entries) {
      if (e.startsWith('.')) continue;
      const p = join(dir, e);
      const s = await stat(p);
      if (s.isDirectory()) await walk(p);
      else if (TEXT_EXT.has(extname(e).toLowerCase()) && s.size < 2_000_000) out.push(relative(root, p));
    }
  }
  await walk(root);
  return out.sort();
}

export function registerReviewTools(kernel: Kernel, root: string): void {
  const abs = resolve(root);
  kernel.tools.register('fs.read', async (args) => {
    const rel = String(args['path'] ?? '');
    const target = resolve(abs, rel);
    if (!target.startsWith(abs + '/') && target !== abs) throw new Error(`path ${rel} escapes the workspace`);
    const text = await readFile(target, 'utf8');
    return { text, source: rel };
  });
}

export function reviewTemplate(kernel: Kernel, root: string, goalFilter?: (file: string) => boolean): { planner: Planner; executor: SpecialistExecutor; rubric: OutcomeRubric } {
  registerReviewTools(kernel, root);
  const planner: Planner = {
    async plan(): Promise<TaskSpec[]> {
      const files = (await listWorkspaceFiles(root)).filter(goalFilter ?? (() => true));
      if (files.length === 0) throw new Error(`no reviewable files under ${root} (txt, md, eml, csv, json, html)`);
      const specs: TaskSpec[] = files.map((f) => ({ key: `review:${f}`, type: 'review.document', inputs: { path: f, tolerates_fast: true }, anticipated_tools: ['fs.read'], budget: { max_usd: 0.6 } }));
      specs.push({ key: 'synth:chronology', type: 'synth.chronology', depends_on: files.map((f) => `review:${f}`), budget: { max_usd: 3 } });
      return specs;
    },
  };
  const executor: SpecialistExecutor = {
    async execute(ctx) {
      if (ctx.task.type === 'review.document') {
        const doc = await ctx.tool('fs.read', { path: ctx.task.inputs['path'] });
        if (doc.status !== 'ok') return { text: '', evidence: [], tokens_in: 0, tokens_out: 0, usd: 0 };
        const r = await ctx.provider.complete({
          tier: ctx.tier_hint === 'fast' ? 'fast' : 'balanced', effort: 'medium',
          system: `[[task:review]] You are a litigation paralegal. Extract every dated event from the document as a Markdown list, one per line: "- YYYY-MM-DD — what happened [[pointer]]". The pointer must be the document pointer given, with chars_<start>-<end> narrowed to the sentence you relied on. Do not invent events.${ctx.critique ? `\nPrevious attempt was rejected: ${ctx.critique}` : ''}`,
          prompt: `DOCUMENT ${ctx.task.inputs['path']} [[${doc.pointer}]]\n\n${doc.text}`,
        });
        const events = [...r.text.matchAll(/^- (\S+) — (.+?) \[\[(ep:[^\]\[]+)\]\]/gm)].map((m) => {
          const p = parsePointer(m[3]!);
          const quote = (p ? kernel.l2.resolve(m[3]!)?.text ?? m[2]! : m[2]!).slice(0, 300);
          return { date: m[1]!, what: m[2]!, pointer: m[3]!, quote };
        });
        const file = String(ctx.task.inputs['path']);
        return {
          text: `## ${file}\n${r.text}`,
          evidence: events.map((e) => evidence(e.pointer, e.quote)),
          // Each event becomes an L3 claim keyed by date + a short slug, so the memory explorer and graph retrieval see it.
          claims: events.map((e) => ({ entity: 'Matter chronology', attribute: `${e.date} ${e.what.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).slice(0, 4).join('-')}`, value: e.what, confidence: 0.85, evidence: [{ pointer: e.pointer, quote: e.quote }] })),
          tokens_in: r.tokens_in, tokens_out: r.tokens_out, usd: r.usd,
        };
      }
      if (ctx.task.type === 'synth.chronology') {
        const lines = ctx.upstream.flatMap((u) => u.deliverable.text.split('\n').filter((l) => l.startsWith('- ')));
        const r = await ctx.provider.complete({ tier: 'frontier', effort: 'high', system: '[[task:chronology]] Merge these dated events into one chronology sorted by date. Keep every [[pointer]] exactly. Flag conflicting dates for the same event.', prompt: lines.join('\n') });
        return { text: r.text, evidence: ctx.upstream.flatMap((u) => u.deliverable.evidence), tokens_in: r.tokens_in, tokens_out: r.tokens_out, usd: r.usd };
      }
      throw new Error(`unknown task type ${ctx.task.type}`);
    },
  };
  return { planner, executor, rubric: REVIEW_RUBRIC };
}
