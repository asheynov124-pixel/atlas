/**
 * User-built workflows. A definition is data; the compiler turns it into a planner and an
 * executor that run under the same kernel, gates, graders and evidence verifier as the
 * built-in workflows. A user workflow cannot reach a tool its definition does not declare,
 * and anything it sends or calendars still waits for a partner's approval.
 */
import { randomUUID } from 'node:crypto';
import type { Effort, ModelTier, OutcomeRubric, ActionTier } from '../core/types.js';
import type { TaskSpec } from '../kernel/run.js';
import { evidence } from '../kernel/run.js';
import { makePointer, parsePointer } from '../memory/episodic.js';
import { shortCite } from '../research/cites.js';
import type { TemplateContext, WorkflowTemplate } from '../app/context.js';

export type StepKind = 'per_document' | 'once' | 'combine';
export interface StepDef { id: string; title: string; kind: StepKind; instructions: string; model: ModelTier; effort: Effort; tools: string[]; output: 'list' | 'memo' | 'table' | 'letter' }
export interface WorkflowDef {
  id?: string; name: string; description: string; category: string;
  input: { kind: 'documents' | 'question'; filter?: string };
  steps: StepDef[]; rubric: Array<{ id: string; text: string }>; min_score: number; max_revisions: number; budget_usd: number;
  triggers: string[]; tags?: string[]; author?: string; version?: number; source?: 'mine' | 'example' | 'community'; inspired_by?: string;
}

/** Tools a user workflow may declare, with their tiers as the Gate Engine sees them. */
export const WORKFLOW_TOOLS: Array<{ name: string; tier: ActionTier; label: string; note: string }> = [
  { name: 'fs.read', tier: 0, label: 'Read matter documents', note: 'Always on for document steps.' },
  { name: 'memory.query', tier: 0, label: 'Search the matter record', note: 'Pulls the most relevant record passages with pointers.' },
  { name: 'research.search', tier: 0, label: 'Search the research database', note: 'Adds verified case-law passages with pin cites.' },
  { name: 'doc.draft', tier: 1, label: 'Save a draft document', note: 'Drafts stay inside Meridian.' },
  { name: 'mail.draft', tier: 1, label: 'Create an email draft', note: 'Drafts are not sent.' },
  { name: 'mail.send', tier: 3, label: 'Send email', note: 'Every send waits for a partner’s approval.' },
  { name: 'calendar.add_deadline', tier: 3, label: 'Add a calendar deadline', note: 'Every entry waits for approval.' },
];

export interface Validation { ok: boolean; errors: string[]; warnings: string[]; tier_ceiling: ActionTier }

export function validate(def: WorkflowDef): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!def.name?.trim()) errors.push('Give the workflow a name.');
  if (!def.steps?.length) errors.push('Add at least one step.');
  if (def.steps?.length > 8) errors.push('Keep workflows to eight steps or fewer.');
  for (const [i, s] of (def.steps ?? []).entries()) {
    if (!s.instructions?.trim() || s.instructions.trim().length < 15) errors.push(`Step ${i + 1} needs instructions of at least a sentence.`);
    for (const t of s.tools ?? []) if (!WORKFLOW_TOOLS.some((w) => w.name === t)) errors.push(`Step ${i + 1} declares an unknown tool: ${t}.`);
    if (s.kind === 'combine' && i === 0) errors.push('A combine step needs earlier steps to combine.');
  }
  if (def.input?.kind === 'documents' && !(def.steps ?? []).some((s) => s.kind === 'per_document')) warnings.push('The input is documents, but no step runs per document. Every step will see the whole record through search instead.');
  if (!(def.budget_usd > 0 && def.budget_usd <= 200)) errors.push('Set a budget between $0.01 and $200.');
  const tier = Math.max(0, ...(def.steps ?? []).flatMap((s) => s.tools ?? []).map((t) => WORKFLOW_TOOLS.find((w) => w.name === t)?.tier ?? 0)) as ActionTier;
  if (tier >= 3) warnings.push('This workflow can act outside Meridian. Every send or calendar entry will stop for a partner’s approval.');
  if (!def.rubric?.length) warnings.push('No rubric: the grader will only check that every fact cites the record.');
  return { ok: errors.length === 0, errors, warnings, tier_ceiling: tier === 0 ? 1 : tier };
}

export function normalizeDef(raw: Partial<WorkflowDef>): WorkflowDef {
  const steps = (raw.steps ?? []).map((s, i) => ({ id: s.id || `s${i + 1}`, title: s.title || `Step ${i + 1}`, kind: (['per_document', 'once', 'combine'].includes(s.kind as string) ? s.kind : 'once') as StepKind, instructions: s.instructions ?? '', model: (['fast', 'balanced', 'frontier'].includes(s.model as string) ? s.model : 'balanced') as ModelTier, effort: (['low', 'medium', 'high', 'xhigh', 'max'].includes(s.effort as string) ? s.effort : 'medium') as Effort, tools: s.tools ?? [], output: (['list', 'memo', 'table', 'letter'].includes(s.output as string) ? s.output : 'list') as StepDef['output'] }));
  return {
    ...(raw.id ? { id: raw.id } : {}), name: raw.name ?? '', description: raw.description ?? '', category: raw.category ?? 'other',
    input: { kind: raw.input?.kind === 'question' ? 'question' : 'documents', ...(raw.input?.filter ? { filter: raw.input.filter } : {}) },
    steps, rubric: (raw.rubric ?? []).map((r, i) => ({ id: r.id || `c${i + 1}`, text: r.text })).filter((r) => r.text?.trim()),
    min_score: raw.min_score ?? 0.8, max_revisions: raw.max_revisions ?? 2, budget_usd: raw.budget_usd ?? 10,
    triggers: raw.triggers ?? [], tags: raw.tags ?? [], ...(raw.author ? { author: raw.author } : {}), version: raw.version ?? 1, source: raw.source ?? 'mine', ...(raw.inspired_by ? { inspired_by: raw.inspired_by } : {}),
  };
}

const OUTPUT_HINT: Record<StepDef['output'], string> = {
  list: 'Write a Markdown list, one item per line, each ending with the [[pointer]] of the sentence it relies on.',
  table: 'Write a Markdown table. Put the [[pointer]] for each row in its last cell.',
  memo: 'Write short paragraphs. End every factual sentence with its [[pointer]].',
  letter: 'Write a professional letter. End every factual sentence with its [[pointer]].',
};

export function compile(def: WorkflowDef, ctx: TemplateContext): WorkflowTemplate {
  const v = validate(def);
  const rubric: OutcomeRubric = { id: `rub_${def.id ?? 'custom'}`, criteria: [...def.rubric, { id: 'evidence', text: 'Every factual statement cites a record or authority span.' }], min_score: def.min_score, max_revisions: def.max_revisions };
  const filterRx = def.input.filter ? new RegExp(def.input.filter.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'), 'i') : null;
  const triggerRx = def.triggers.length ? new RegExp(`\\b(${def.triggers.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'i') : null;
  return {
    label: def.name, category: def.category, builtin: false,
    description: def.description || def.name,
    match: (g) => (triggerRx?.test(g) ? 3 : 0) + (g.toLowerCase().includes(def.name.toLowerCase()) ? 8 : 0),
    default_budget_usd: def.budget_usd, risk_tier_ceiling: v.tier_ceiling, rubric,
    planner: {
      async plan(goal): Promise<TaskSpec[]> {
        if (!v.ok) throw new Error(`Workflow "${def.name}" is not valid: ${v.errors.join(' ')}`);
        const docs = ctx.docs.list().filter((d) => !filterRx || filterRx.test(d.name) || filterRx.test(d.rel));
        if (def.input.kind === 'documents' && def.steps.some((s) => s.kind === 'per_document') && !docs.length) throw new Error(`No documents in this matter match "${def.input.filter ?? '*'}".`);
        const specs: TaskSpec[] = [];
        let prev: string[] = [];
        for (const s of def.steps) {
          const keys: string[] = [];
          if (s.kind === 'per_document') {
            for (const d of docs) {
              const key = `${s.id}:${d.id}`;
              const dep = prev.find((p) => p.endsWith(`:${d.id}`));
              specs.push({ key, type: `custom.${s.id}`, inputs: { step: s.id, doc_id: d.id, goal, tolerates_fast: s.model === 'fast' }, depends_on: dep ? [dep] : prev.filter((p) => !p.includes(':')), anticipated_tools: ['fs.read', ...s.tools], budget: { max_usd: Math.max(0.2, def.budget_usd / Math.max(4, docs.length * def.steps.length)) } });
              keys.push(key);
            }
          } else {
            specs.push({ key: s.id, type: `custom.${s.id}`, inputs: { step: s.id, goal }, depends_on: prev, anticipated_tools: s.tools, budget: { max_usd: Math.max(0.5, def.budget_usd / def.steps.length) } });
            keys.push(s.id);
          }
          prev = keys;
        }
        return specs;
      },
    },
    executor: {
      async execute(c) {
        const step = def.steps.find((s) => s.id === c.task.inputs['step'])!;
        const goal = String(c.task.inputs['goal'] ?? '');
        const blocks: string[] = [];
        if (c.task.inputs['doc_id']) {
          const d = ctx.docs.get(String(c.task.inputs['doc_id']))!;
          const r = await c.tool('fs.read', { path: d.rel });
          if (r.status === 'ok') blocks.push(`[[${r.pointer}]]\n${r.text}`);
        }
        if (step.tools.includes('memory.query') || (!c.task.inputs['doc_id'] && !c.upstream.length && def.input.kind === 'documents')) {
          const mem = await ctx.kernel.retriever.retrieve({ query: `${goal} ${step.instructions}`, max_tokens: 2500, run_id: 'docs' });
          for (const sp of mem.spans.slice(0, 6)) blocks.push(`[[${sp.pointer}]]\n${sp.text}`);
        }
        if (step.tools.includes('research.search')) {
          const s = await ctx.agent.search(`${goal} ${step.title}`, { external: false });
          for (const r of s.results.slice(0, 3)) {
            const base = ctx.lawPointer(r.case_id);
            if (!base) continue;
            const ptr = makePointer('law', parsePointer(base)!.turn_id, r.start, r.end);
            blocks.push(`[[${ptr}]]\n${r.passage} (${r.short_cite})`);
          }
        }
        const upstream = c.upstream.map((u) => u.deliverable.text).join('\n\n');
        const r = await c.provider.complete({
          tier: c.tier_hint === 'fast' ? 'fast' : step.model, effort: step.effort,
          system: `[[task:custom]] You are running the step "${step.title}" of the workflow "${def.name}" for a New Jersey litigator. ${OUTPUT_HINT[step.output]} Use only the INPUT and EARLIER STEPS. Keep pointers exactly as given, narrowing chars_<start>-<end> to the sentence you rely on (offsets count from the start of that input).${c.critique ? `\nPrevious attempt was rejected: ${c.critique}` : ''}`,
          prompt: `INSTRUCTIONS: ${step.instructions}\n\nGOAL: ${goal}\n\nINPUT:\n${blocks.join('\n\n') || '(none)'}\n\nEND INPUT\n\nEARLIER STEPS:\n${upstream || '(none)'}`,
        });
        let text = `## ${step.title}${c.task.inputs['doc_id'] ? ` · ${ctx.docs.get(String(c.task.inputs['doc_id']))?.name}` : ''}\n${r.text}`;
        if (step.tools.includes('mail.draft')) await c.tool('mail.draft', { to: 'draft', body: r.text });
        if (step.tools.includes('mail.send')) { const to = /[\w.+-]+@[\w.-]+\.\w+/.exec(goal)?.[0] ?? 'counsel@external.example'; const out = await c.tool('mail.send', { to: [to], body: r.text }); text += `\n\nSend to ${to}: ${out.status === 'pending_approval' ? 'waiting for approval' : out.status}.`; }
        const ptrs = [...new Set([...text.matchAll(/\[\[(ep:[^\]\[]+)\]\]/g)].map((m) => m[1]!))].filter((p) => ctx.kernel.l2.resolve(p));
        return { text, evidence: ptrs.map((p) => evidence(p, ctx.kernel.l2.resolve(p)!.text.slice(0, 300))), tokens_in: r.tokens_in, tokens_out: r.tokens_out, usd: r.usd };
      },
    },
  };
}

export function newId(): string { return `wf_${randomUUID().slice(0, 8)}`; }
export { shortCite };
