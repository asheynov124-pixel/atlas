/**
 * Public API (§9.2) over node:http. Runs are created from a registry of named
 * workflow templates (planner + executor pairs) so the API stays data-only.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Kernel } from '../kernel/bootstrap.js';
import type { Planner, SpecialistExecutor } from '../kernel/run.js';
import type { OutcomeRubric, Budget, ActionTier } from '../core/types.js';
import { exportBundle } from '../memory/export.js';

export interface WorkflowTemplate {
  planner: Planner;
  executor: SpecialistExecutor;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body, null, 2));
}

export function createApiServer(kernel: Kernel, templates: Record<string, WorkflowTemplate>, workspace_id = 'ws_default') {
  const triggers: Array<{ id: string; source: string; type: string; template: string }> = [];
  const webhooks: Array<{ id: string; url: string; events: string[] }> = [];

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    try {
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, runs: kernel.ledger.listRuns().length });

      if (parts[0] !== 'v1') return send(res, 404, { error: 'not found' });

      // Runs
      if (req.method === 'POST' && parts[1] === 'runs' && parts.length === 2) {
        const body = await readJson(req);
        const tpl = templates[String(body['template'] ?? 'default')];
        if (!tpl) return send(res, 400, { error: `unknown template; known: ${Object.keys(templates).join(', ')}` });
        const started = await kernel.lead.start({
          workspace_id, goal: String(body['goal'] ?? ''), topology: (body['topology'] as never) ?? 'hierarchical',
          budget: (body['budget'] as Budget) ?? { max_tokens: 5_000_000, max_usd: 60 },
          risk_tier_ceiling: ((body['policy'] as { risk_tier_ceiling?: ActionTier } | undefined)?.risk_tier_ceiling ?? 1),
          rubric: (body['outcome'] as OutcomeRubric) ?? { id: 'rub_default', criteria: [{ id: 'evidence', text: 'Every figure resolves to a source span.' }], min_score: 0.9, max_revisions: 3 },
          planner: tpl.planner, executor: tpl.executor,
        });
        void kernel.lead.execute(started.run.run_id).catch((e: Error) => kernel.events.emit('run.failed', { reason: e.message }, started.run.run_id));
        return send(res, 202, { run_id: started.run.run_id, status: started.run.status, checkpoint_required: started.checkpoint_required, events_url: `/v1/runs/${started.run.run_id}/events` });
      }
      if (parts[1] === 'runs' && parts[2]) {
        const run_id = parts[2];
        if (req.method === 'GET' && parts.length === 3) {
          const run = kernel.ledger.getRun(run_id);
          return send(res, 200, { ...run, ledger: kernel.ledger.summary(run_id), tasks: kernel.ledger.tasksForRun(run_id).map((t) => ({ task_id: t.task_id, type: t.type, status: t.status, owner: t.owner_agent_id, tier: t.risk_tier_ceiling, spend: t.spend, grades: kernel.ledger.gradesFor(t.task_id).map((g) => ({ kind: g.kind, score: g.score, decision: g.decision })) })) });
        }
        if (req.method === 'GET' && parts[3] === 'events') {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
          for (const e of kernel.events.forRun(run_id)) res.write(`event: ${e.event}\ndata: ${JSON.stringify(e)}\n\n`);
          const off = kernel.events.on((e) => { if (e.run_id === run_id) res.write(`event: ${e.event}\ndata: ${JSON.stringify(e)}\n\n`); });
          req.on('close', off);
          return;
        }
        if (req.method === 'GET' && parts[3] === 'trace') return send(res, 200, { ledger: kernel.ledger.entries.filter((e) => e.run_id === run_id), events: kernel.events.forRun(run_id), gate_audit: kernel.gate.audit.filter((a) => a.call.run_id === run_id) });
        if (req.method === 'POST' && parts[3] === 'approve-plan') { const b = await readJson(req); kernel.lead.approvePlan(run_id, String(b['approver'] ?? 'api')); return send(res, 200, { ok: true }); }
        if (req.method === 'POST' && parts[3] === 'answer') { const b = await readJson(req); kernel.lead.answerQuestion(String(b['task_id']), String(b['answer'] ?? '')); if (kernel.ledger.getRun(run_id).status === 'paused') void kernel.lead.resume(run_id); return send(res, 200, { ok: true }); }
        if (req.method === 'POST' && parts[3] === 'cancel') {
          for (const t of kernel.ledger.tasksForRun(run_id)) if (['pending', 'ready', 'revising', 'blocked'].includes(t.status)) kernel.ledger.transition(t.task_id, 'cancelled', 'api cancel');
          kernel.ledger.setRunStatus(run_id, 'cancelled');
          return send(res, 200, { ok: true });
        }
        if (req.method === 'GET' && parts[3] === 'artifacts') return send(res, 200, kernel.ledger.getRun(run_id).artifact_ids.map((id) => ({ id, ...kernel.lead.artifacts.get(id) })));
      }

      // Approvals
      if (req.method === 'GET' && parts[1] === 'approvals' && parts.length === 2) return send(res, 200, kernel.inbox.pending());
      if (req.method === 'POST' && parts[1] === 'approvals' && parts[3] === 'decide') {
        const b = await readJson(req);
        const reviewer = (b['reviewer'] as { id: string; roles: string[] }) ?? { id: 'anonymous', roles: [] };
        const r = kernel.inbox.decide(parts[2]!, reviewer, b['decision'] as never, { edited_preview: b['edited_preview'] as string | undefined, currentState: (b['current_state'] as Record<string, unknown>) ?? kernel.inbox.get(parts[2]!).state_snapshot });
        if (r.status === 'approved' && r.execute_with !== undefined) {
          const exec = await kernel.tools.executeApproved(r.payload, r.execute_with, workspace_id);
          if (r.payload.task_id) {
            await kernel.lead.completeBlocked(r.payload.task_id, exec);
            if (kernel.ledger.getRun(r.payload.run_id).status === 'paused') void kernel.lead.resume(r.payload.run_id).catch((e: Error) => kernel.events.emit('run.failed', { reason: e.message }, r.payload.run_id));
          }
          return send(res, 200, { ...r, executed: exec });
        }
        return send(res, 200, r);
      }
      if (req.method === 'GET' && parts[1] === 'approvals' && parts[2] === 'telemetry') return send(res, 200, kernel.inbox.telemetry(url.searchParams.get('action') ?? 'mail.send', Number(url.searchParams.get('min') ?? 200)));

      // Memory
      if (req.method === 'POST' && parts[1] === 'memory' && parts[2] === 'query') {
        const b = await readJson(req);
        const r = await kernel.retriever.retrieve({ query: String(b['query'] ?? ''), entities: (b['entities'] as string[]) ?? [], max_tokens: Number(b['max_tokens'] ?? 4000), ...(b['time_range'] && (b['time_range'] as { after?: string }).after ? { after: (b['time_range'] as { after: string }).after } : {}) });
        return send(res, 200, r);
      }
      if (req.method === 'GET' && parts[1] === 'memory' && parts[2] === 'spans') {
        const pointer = decodeURIComponent(parts.slice(3).join('/'));
        const r = kernel.l2.resolve(pointer);
        return r ? send(res, 200, { pointer, text: r.text, source: r.record.source, trusted: r.record.trusted }) : send(res, 404, { error: 'pointer does not resolve' });
      }
      if (req.method === 'POST' && parts[1] === 'memory' && parts[2] === 'export') { res.writeHead(200, { 'content-type': 'application/x-ndjson' }); return res.end(exportBundle(kernel.l2, kernel.l3)); }
      if (req.method === 'POST' && parts[1] === 'memory' && parts[2] === 'hold') { const b = await readJson(req); return send(res, 201, kernel.l2.placeHold({ workspace_id, ...(b['run_id'] ? { run_id: String(b['run_id']) } : {}) }, String(b['reason'] ?? ''), String(b['placed_by'] ?? 'api'))); }
      if (req.method === 'GET' && parts[1] === 'memory' && parts[2] === 'claims') return send(res, 200, { claims: kernel.l3.query(url.searchParams.get('entity') ?? undefined), quarantine: kernel.l3.quarantine });

      // Triggers, skills, webhooks (registration only in this reference implementation)
      if (req.method === 'POST' && parts[1] === 'triggers') { const b = await readJson(req); const t = { id: `trg_${triggers.length + 1}`, source: String(b['source']), type: String(b['type']), template: String(b['template']) }; triggers.push(t); return send(res, 201, t); }
      if (req.method === 'POST' && parts[1] === 'webhooks') { const b = await readJson(req); const w = { id: `whk_${webhooks.length + 1}`, url: String(b['url']), events: (b['events'] as string[]) ?? ['run.completed'] }; webhooks.push(w); return send(res, 201, w); }
      if (req.method === 'POST' && parts[1] === 'skills') { const b = await readJson(req); if (!b['signature'] || !b['declared_tier']) return send(res, 400, { error: 'skill manifests must be signed and declare a risk tier' }); return send(res, 201, { installed: b['name'], declared_tier: b['declared_tier'] }); }

      return send(res, 404, { error: 'not found' });
    } catch (e) {
      const err = e as Error & { code?: string; rule?: string };
      return send(res, err.name === 'ApprovalError' || err.name === 'LedgerInvariantError' ? 409 : 500, { error: err.message, code: err.code ?? err.rule ?? err.name });
    }
  });
}

if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  const { MockProvider } = await import('../models/mock.js');
  const { createKernel } = await import('../kernel/bootstrap.js');
  const { diligenceTemplate } = await import('../demo/diligence.js');
  const provider = new MockProvider();
  const kernel = createKernel({ provider });
  const tpl = diligenceTemplate(kernel, provider);
  const port = Number(process.env['PORT'] ?? 8787);
  createApiServer(kernel, { default: tpl, diligence: tpl }).listen(port, () => console.log(`meridian api listening on http://localhost:${port}`));
}
