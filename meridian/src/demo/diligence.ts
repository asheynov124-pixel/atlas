/**
 * §9.3 end to end with the mock provider: "Prepare a comparative diligence memo on
 * the N companies in list_7" → research + extraction + synthesis → graders → memo.
 */
import type { Kernel } from '../kernel/bootstrap.js';
import { MockProvider } from '../models/mock.js';
import type { Planner, SpecialistExecutor, TaskSpec } from '../kernel/run.js';
import { evidence } from '../kernel/run.js';
import { estimateTokens } from '../core/tokens.js';

export const COMPANIES = ['Acme', 'Zeta', 'Borealis', 'Cobalt', 'Delta Forge', 'Ember', 'Fathom', 'Granite', 'Halcyon', 'Ionic', 'Juniper', 'Kestrel', 'Lumen', 'Meridian Labs', 'Nimbus', 'Orchid', 'Pinnacle', 'Quartz', 'Rivet', 'Sable', 'Tandem', 'Umbra', 'Vantage', 'Willow', 'Xenon', 'Yarrow', 'Zephyr', 'Alder', 'Basalt', 'Cinder', 'Dune', 'Everest', 'Fjord', 'Gale', 'Harbor', 'Isle', 'Jade', 'Knoll', 'Lagoon', 'Mesa'];

/** Deterministic fake "filings" so pointers and quotes are real. */
export function filing(company: string): { text: string; revenue: number; headcount: number; funding: string } {
  let h = 0;
  for (const c of company) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const revenue = 50 + (h % 900);
  const headcount = 200 + (h % 4000);
  const funding = ['Series B', 'Series C', 'Series D', 'Growth'][h % 4]!;
  const text = `${company} Corp Form 10-K FY25. Total revenues of $${revenue}.0 million for the fiscal year. Headcount at year end was ${headcount.toLocaleString()} employees. Last funding round: ${funding}, closed in 2025.`;
  return { text, revenue, headcount, funding };
}

export function registerDemoTools(kernel: Kernel): void {
  kernel.tools.register('search.web', async (args) => {
    const company = String(args['q'] ?? '').replace(/ filings?$/i, '');
    return { text: filing(company).text, source: `${company} 10-K p.47` };
  });
  kernel.tools.register('mail.send', async (args) => {
    if (args['__dry_run']) {
      const to = args['to'];
      return { text: String(args['body'] ?? ''), state_snapshot: { thread_last_message_at: '2026-10-30T15:41:00Z', to }, alternatives: ['save_as_draft', 'edit_then_send', 'reject'] };
    }
    return { text: `sent to ${JSON.stringify(args['target'])}: ${String(args['body'])}`, source: 'mail.send' };
  });
  kernel.tools.register('mail.draft', async (args) => ({ text: `DRAFT to ${args['to']}: ${args['body']}`, source: 'mail.draft' }));
}

export function diligenceTemplate(kernel: Kernel, provider: MockProvider, companies = COMPANIES): { planner: Planner; executor: SpecialistExecutor } {
  registerDemoTools(kernel);
  provider
    .on('grade', (req) => {
      // Rubric grader: coverage/consistency/evidence. Penalize when a sentence lacks a pointer.
      const deliverable = req.prompt.split('DELIVERABLE:')[1] ?? '';
      const unsourced = deliverable.split(/(?<=[.!?])\s+/).filter((s) => /\d/.test(s) && !/\[\[ep:/.test(s)).length;
      const ev = unsourced ? 0.5 : 1;
      return JSON.stringify({ scores: { coverage: 1, consistency: 0.95, evidence: ev }, justifications: { evidence: unsourced ? `${unsourced} figures lack source pointers` : 'all figures sourced' } });
    })
    .on('critic', () => JSON.stringify({ severity: 0.1, issues: [] }))
    .on('synthesize', (req) => req.prompt)
    .on('integrate', (req) => `# Comparative Diligence Memo\n\n${req.prompt.split('SECTIONS:\n')[1] ?? ''}`);

  const planner: Planner = {
    async plan(): Promise<TaskSpec[]> {
      const specs: TaskSpec[] = [];
      for (const c of companies) {
        specs.push({ key: `research:${c}`, type: 'research.company_profile', inputs: { company: c, tolerates_fast: true }, anticipated_tools: ['search.web'], budget: { max_usd: 0.4 } });
        specs.push({ key: `extract:${c}`, type: 'extract.financials', inputs: { company: c }, depends_on: [`research:${c}`], budget: { max_usd: 0.4 } });
      }
      const sectors = ['software', 'health', 'industrial', 'consumer', 'fintech', 'energy', 'media', 'logistics'];
      sectors.forEach((s, i) => {
        const members = companies.filter((_, j) => j % sectors.length === i);
        specs.push({ key: `synth:${s}`, type: 'synth.sector', inputs: { sector: s, companies: members }, depends_on: members.map((c) => `extract:${c}`), budget: { max_usd: 2 } });
      });
      return specs;
    },
  };

  const executor: SpecialistExecutor = {
    async execute(ctx) {
      const t = ctx.task;
      if (t.type === 'research.company_profile') {
        const company = String(t.inputs['company']);
        const out = await ctx.tool('search.web', { q: `${company} filings` });
        if (out.status !== 'ok') return { text: '', evidence: [], tokens_in: 50, tokens_out: 0, usd: 0 };
        const text = `${company}: profile retrieved from the FY25 10-K [[${out.pointer}]].`;
        return { text, evidence: [evidence(out.pointer!, out.text!)], tokens_in: 1200, tokens_out: 300, usd: 0.0003 };
      }
      if (t.type === 'extract.financials') {
        const up = ctx.upstream[0]!.deliverable;
        const ptr = up.evidence[0]!.pointer;
        const src = up.evidence[0]!.quote;
        const rev = /\$(\d+)\.0 million/.exec(src)?.[1];
        const hc = /was ([\d,]+) employees/.exec(src)?.[1];
        const fund = /round: ([^,]+),/.exec(src)?.[1];
        const company = String(t.inputs['company']);
        // Revision path: attempt 1 for "Zeta" deliberately omits a pointer so graders reject once.
        const sloppy = company === 'Zeta' && t.attempts === 1;
        const line = sloppy
          ? `${company}: revenue $${rev}M, headcount ${hc}, last round ${fund}.`
          : `${company}: revenue $${rev}M [[${ptr}]], headcount ${hc} [[${ptr}]], last round ${fund} [[${ptr}]].`;
        return {
          text: line,
          evidence: [evidence(ptr, `Total revenues of $${rev}.0 million`), evidence(ptr, `${hc} employees`)],
          claims: [
            { entity: `${company} Corp`, attribute: 'revenue_fy25_usd_m', value: String(rev), confidence: 0.94, evidence: [{ pointer: ptr, quote: `Total revenues of $${rev}.0 million` }] },
            { entity: `${company} Corp`, attribute: 'headcount', value: String(hc), confidence: 0.9, evidence: [{ pointer: ptr, quote: `${hc} employees` }] },
          ],
          tokens_in: 900, tokens_out: 120, usd: 0.0021,
        };
      }
      if (t.type === 'synth.sector') {
        const rows = ctx.upstream.map((u) => `| ${u.deliverable.text} |`).join('\n');
        const r = await ctx.provider.complete({ tier: 'balanced', effort: 'medium', system: '[[task:synthesize]]', prompt: `## Sector: ${t.inputs['sector']}\n\n${rows}` });
        return { text: r.text, evidence: ctx.upstream.flatMap((u) => u.deliverable.evidence), tokens_in: r.tokens_in, tokens_out: r.tokens_out, usd: r.usd + 0.05 };
      }
      throw new Error(`unknown task type ${t.type}`);
    },
  };
  return { planner, executor };
}

export async function runDiligenceDemo(n = 40): Promise<void> {
  const { createKernel } = await import('../kernel/bootstrap.js');
  const provider = new MockProvider();
  const kernel = createKernel({ provider, concurrency: 16 });
  const companies = COMPANIES.slice(0, n);
  const tpl = diligenceTemplate(kernel, provider, companies);
  const started = await kernel.lead.start({
    workspace_id: 'ws_diligence_q4',
    goal: `Prepare a comparative diligence memo on the ${companies.length} companies in list_7.`,
    budget: { max_tokens: 50_000_000, max_usd: 60 },
    risk_tier_ceiling: 1,
    rubric: { id: 'rub_profile_v3', criteria: [{ id: 'coverage', text: 'Every company has revenue, headcount, and last funding with sources.' }, { id: 'consistency', text: 'Figures are in the same currency and fiscal basis.' }, { id: 'evidence', text: 'Every number resolves to a source span.' }], min_score: 0.9, max_revisions: 3 },
    planner: tpl.planner, executor: tpl.executor,
  });
  console.log(`run ${started.run.run_id}: ${started.task_count} tasks, checkpoint_required=${started.checkpoint_required}`);
  const t0 = performance.now();
  const result = await kernel.lead.execute(started.run.run_id);
  const ms = performance.now() - t0;
  const s = kernel.ledger.summary(started.run.run_id);
  console.log(`status=${result.run.status} accepted=${s.accepted}/${s.total} failed=${s.failed} blocked=${s.blocked} cost=$${result.run.spend.usd.toFixed(2)} wall=${ms.toFixed(0)}ms`);
  const revisions = kernel.events.forRun(started.run.run_id).filter((e) => e.event === 'task.progress' && e.payload['status'] === 'revising');
  console.log(`revisions=${revisions.length} (${revisions.map((e) => String(e.payload['critique']).slice(0, 70)).join(' / ')})`);
  console.log(`claims promoted=${kernel.l3.all().length} quarantined=${kernel.l3.quarantine.length} contested=${kernel.l3.contested().length}`);
  console.log(`memo: ${estimateTokens(result.text)} tokens, ${result.provenance.length} provenance markers`);
  console.log('\n' + result.text.split('\n').slice(0, 8).join('\n') + '\n…');
  const q = await kernel.retriever.retrieve({ query: 'Acme revenue', entities: ['Acme Corp'], max_tokens: 400 });
  console.log(`\nmemory query "Acme revenue": ${q.spans.length} spans, top pointer ${q.spans[0]?.pointer} → "${q.spans[0]?.text.slice(0, 60)}…"`);
}

if (process.argv[1]?.endsWith('diligence.ts') || process.argv[1]?.endsWith('diligence.js')) {
  await runDiligenceDemo(Number(process.argv[2] ?? 40));
}
