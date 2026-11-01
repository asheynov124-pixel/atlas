/**
 * Public API (§9.2) plus the endpoints the Canvas Workspace needs, over node:http.
 * Runs are created from named workflow templates so the API stays data-only.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import type { Kernel } from '../kernel/bootstrap.js';
import type { Planner, SpecialistExecutor } from '../kernel/run.js';
import type { OutcomeRubric, Budget, ActionTier } from '../core/types.js';
import { nowIso } from '../core/types.js';
import { exportBundle } from '../memory/export.js';
import { cascadeCheck } from '../fastpath/router.js';

export interface WorkflowTemplate {
  planner: Planner;
  executor: SpecialistExecutor;
  rubric: OutcomeRubric;
  description: string;
  /** Picks this template for a free-text goal. Higher wins. */
  match: (goal: string) => number;
  default_budget_usd?: number;
  risk_tier_ceiling?: ActionTier;
}

export interface ApiOptions {
  workspace_id?: string;
  workspace_label?: string;
  provider_label?: string;
  static_dir?: string;
  reviewer?: { id: string; roles: string[] };
  files?: () => Promise<string[]>;
}

interface ChatMessage { role: 'user' | 'meridian'; text: string; at: string; run_id?: string; meta?: Record<string, unknown> }

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function createApiServer(kernel: Kernel, templates: Record<string, WorkflowTemplate>, opts: ApiOptions = {}) {
  const workspace_id = opts.workspace_id ?? 'ws_default';
  const reviewer = opts.reviewer ?? { id: 'user:owner', roles: ['workspace:owner'] };
  const conversation: ChatMessage[] = [];
  const triggers: Array<{ id: string; source: string; type: string; template: string }> = [];
  const webhooks: Array<{ id: string; url: string; events: string[] }> = [];
  const fingerprint = `${workspace_id}:${Object.keys(templates).sort().join(',')}`;

  function pickTemplate(goal: string, explicit?: string): [string, WorkflowTemplate] {
    if (explicit && templates[explicit]) return [explicit, templates[explicit]!];
    const ranked = Object.entries(templates).map(([k, t]) => [k, t, t.match(goal)] as const).sort((a, b) => b[2] - a[2]);
    const best = ranked[0];
    if (!best) throw new Error('no templates registered');
    return [best[0], best[1]];
  }

  function runSummary(run_id: string) {
    const run = kernel.ledger.getRun(run_id);
    const s = kernel.ledger.summary(run_id);
    const pending = kernel.inbox.pending().filter((p) => p.run_id === run_id).length;
    return { ...run, ledger: s, percent: s.total ? Math.round(((s.accepted + s.failed + s.cancelled) / s.total) * 100) : 0, pending_approvals: pending };
  }

  function runDetail(run_id: string) {
    const base = runSummary(run_id);
    const tasks = kernel.ledger.tasksForRun(run_id).map((t) => {
      const grades = kernel.ledger.gradesFor(t.task_id);
      const cal = grades.filter((g) => g.kind === 'calibration').at(-1);
      return { task_id: t.task_id, type: t.type, inputs: t.inputs, status: t.status, owner: t.owner_agent_id ?? null, tier: t.risk_tier_ceiling, attempts: t.attempts, spend: t.spend, score: cal?.score ?? null, critique: cal && cal.decision !== 'accept' ? cal.critique : null, grades: grades.map((g) => ({ kind: g.kind, score: Number(g.score.toFixed(2)), decision: g.decision })) };
    });
    const artifacts = base.artifact_ids.map((id) => ({ id, ...kernel.lead.artifacts.get(id)! }));
    const plan = kernel.events.forRun(run_id).find((e) => e.event === 'plan.ready')?.payload ?? null;
    const questions = kernel.events.forRun(run_id).filter((e) => e.event === 'task.blocked' && (e.payload['status'] === 'needs_human' || e.payload['reason'] === 'grader_disagreement')).map((e) => e.payload);
    return { ...base, tasks, artifacts, plan, questions, alerts: kernel.sentinel.alerts.filter((a) => tasks.some((t) => t.task_id === a.task_id)) };
  }

  function memorySummary() {
    const claims = kernel.l3.all();
    return { claims: claims.length, contested: claims.filter((c) => c.status === 'contested').length, quarantined: kernel.l3.quarantine.length, holds: kernel.l2.activeHolds(), episodic_records: kernel.l2.all().length };
  }

  async function startRun(goal: string, explicit?: string, budget_usd?: number) {
    const [name, tpl] = pickTemplate(goal, explicit);
    const started = await kernel.lead.start({
      workspace_id, goal, topology: 'hierarchical',
      budget: { max_tokens: 50_000_000, max_usd: budget_usd ?? tpl.default_budget_usd ?? 25 },
      risk_tier_ceiling: tpl.risk_tier_ceiling ?? 1, rubric: tpl.rubric, planner: tpl.planner, executor: tpl.executor,
      reviewer_rbac: ['workspace:owner', 'role:approver'],
    });
    void kernel.lead.execute(started.run.run_id).catch((e: Error) => { kernel.events.emit('run.failed', { reason: e.message }, started.run.run_id); if (kernel.ledger.getRun(started.run.run_id).status === 'running') kernel.ledger.setRunStatus(started.run.run_id, 'failed'); });
    return { ...started, template: name };
  }

  async function ask(text: string): Promise<ChatMessage> {
    const decision = await kernel.router.route(text, fingerprint);
    if (decision.intent === 'agentic') {
      const started = await startRun(text);
      const msg: ChatMessage = { role: 'meridian', at: nowIso(), run_id: started.run.run_id, text: `Plan ready — ${started.task_count} tasks using the "${started.template}" workflow${started.checkpoint_required ? '. The plan needs your approval before anything mutates.' : '. Running now.'}`, meta: { intent: decision.intent, effort: decision.effort, tier: decision.tier, checkpoint_required: started.checkpoint_required, anticipated_tier3: started.anticipated_tier3 } };
      return msg;
    }
    const context = decision.working_set.map((s) => `[[${s.pointer}]] ${s.text}`).join('\n');
    const r = await kernel.provider.complete({ tier: decision.tier, effort: decision.effort, system: '[[task:answer]] Answer from the MEMORY spans below. After every factual sentence, cite the span pointer in [[...]]. If memory does not cover it, say so.', prompt: `QUESTION: ${text}\n\nMEMORY:\n${context || '(empty)'}` });
    const check = cascadeCheck(r.text, (p) => !!kernel.l2.resolve(p));
    return { role: 'meridian', at: nowIso(), text: r.text, meta: { intent: decision.intent, effort: decision.effort, tier: decision.tier, provisional: decision.cascade, evidence_ok: check.accept, unsourced: check.unsourced, spans: decision.working_set.length, timings_ms: decision.timings_ms, usd: r.usd } };
  }

  async function serveStatic(pathname: string, res: ServerResponse): Promise<boolean> {
    if (!opts.static_dir) return false;
    const rel = pathname === '/' ? '/index.html' : pathname;
    const target = normalize(join(opts.static_dir, rel));
    if (!target.startsWith(normalize(opts.static_dir))) return false;
    try {
      const s = await stat(target);
      if (!s.isFile()) return false;
      res.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(await readFile(target));
      return true;
    } catch { return false; }
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    try {
      if (req.method === 'GET' && parts[0] !== 'v1') {
        if (await serveStatic(url.pathname, res)) return;
        return send(res, 404, { error: 'not found' });
      }
      if (req.method === 'GET' && url.pathname === '/v1/health') return send(res, 200, { ok: true, runs: kernel.ledger.listRuns().length });

      // Workspace bootstrap for the UI
      if (req.method === 'GET' && url.pathname === '/v1/state') {
        return send(res, 200, {
          workspace: { id: workspace_id, label: opts.workspace_label ?? workspace_id, provider: opts.provider_label ?? 'unknown', reviewer },
          runs: kernel.ledger.listRuns().map((r) => runSummary(r.run_id)).reverse(),
          approvals: kernel.inbox.pending(),
          memory: memorySummary(),
          conversation,
          templates: Object.entries(templates).map(([k, t]) => ({ name: k, description: t.description })),
          files: opts.files ? await opts.files() : [],
        });
      }
      if (req.method === 'GET' && url.pathname === '/v1/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
        res.write(`event: hello\ndata: {}\n\n`);
        const off = kernel.events.on((e) => res.write(`event: ${e.event}\ndata: ${JSON.stringify(e)}\n\n`));
        const ping = setInterval(() => res.write(': ping\n\n'), 15000);
        req.on('close', () => { off(); clearInterval(ping); });
        return;
      }

      // Conversation
      if (req.method === 'POST' && url.pathname === '/v1/ask') {
        const b = await readJson(req);
        const text = String(b['text'] ?? '').trim();
        if (!text) return send(res, 400, { error: 'text required' });
        const user: ChatMessage = { role: 'user', text, at: nowIso() };
        conversation.push(user);
        const reply = b['delegate'] ? await (async () => { const s = await startRun(text, b['template'] as string | undefined, b['budget_usd'] as number | undefined); return { role: 'meridian', at: nowIso(), run_id: s.run.run_id, text: `Plan ready — ${s.task_count} tasks using the "${s.template}" workflow${s.checkpoint_required ? '. The plan needs your approval before anything mutates.' : '. Running now.'}`, meta: { intent: 'agentic', checkpoint_required: s.checkpoint_required, anticipated_tier3: s.anticipated_tier3 } } as ChatMessage; })() : await ask(text);
        conversation.push(reply);
        return send(res, 200, { user, reply });
      }

      // Runs
      if (req.method === 'GET' && url.pathname === '/v1/runs') return send(res, 200, kernel.ledger.listRuns().map((r) => runSummary(r.run_id)).reverse());
      if (req.method === 'POST' && url.pathname === '/v1/runs') {
        const b = await readJson(req);
        const started = await startRun(String(b['goal'] ?? ''), b['template'] as string | undefined, (b['budget'] as Budget | undefined)?.max_usd);
        return send(res, 202, { run_id: started.run.run_id, status: started.run.status, template: started.template, checkpoint_required: started.checkpoint_required, events_url: `/v1/runs/${started.run.run_id}/events` });
      }
      if (parts[1] === 'runs' && parts[2]) {
        const run_id = parts[2];
        if (req.method === 'GET' && parts.length === 3) return send(res, 200, runDetail(run_id));
        if (req.method === 'GET' && parts[3] === 'events') {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
          for (const e of kernel.events.forRun(run_id)) res.write(`event: ${e.event}\ndata: ${JSON.stringify(e)}\n\n`);
          const off = kernel.events.on((e) => { if (e.run_id === run_id) res.write(`event: ${e.event}\ndata: ${JSON.stringify(e)}\n\n`); });
          req.on('close', off);
          return;
        }
        if (req.method === 'GET' && parts[3] === 'trace') return send(res, 200, { ledger: kernel.ledger.entries.filter((e) => e.run_id === run_id), events: kernel.events.forRun(run_id), gate_audit: kernel.gate.audit.filter((a) => a.call.run_id === run_id) });
        if (req.method === 'POST' && parts[3] === 'approve-plan') { const b = await readJson(req); kernel.lead.approvePlan(run_id, String(b['approver'] ?? reviewer.id)); return send(res, 200, { ok: true }); }
        if (req.method === 'POST' && parts[3] === 'answer') { const b = await readJson(req); kernel.lead.answerQuestion(String(b['task_id']), String(b['answer'] ?? '')); if (kernel.ledger.getRun(run_id).status === 'paused') void kernel.lead.resume(run_id).catch(() => {}); return send(res, 200, { ok: true }); }
        if (req.method === 'POST' && parts[3] === 'cancel') {
          for (const t of kernel.ledger.tasksForRun(run_id)) if (['pending', 'ready', 'revising', 'blocked'].includes(t.status)) kernel.ledger.transition(t.task_id, 'cancelled', 'cancelled by user');
          kernel.ledger.setRunStatus(run_id, 'cancelled');
          kernel.events.emit('run.failed', { reason: 'cancelled by user' }, run_id);
          return send(res, 200, { ok: true });
        }
        if (req.method === 'GET' && parts[3] === 'artifacts') return send(res, 200, kernel.ledger.getRun(run_id).artifact_ids.map((id) => ({ id, ...kernel.lead.artifacts.get(id) })));
      }

      // Approvals
      if (req.method === 'GET' && url.pathname === '/v1/approvals') return send(res, 200, kernel.inbox.pending());
      if (req.method === 'GET' && url.pathname === '/v1/approvals/telemetry') return send(res, 200, kernel.inbox.telemetry(url.searchParams.get('action') ?? 'mail.send', Number(url.searchParams.get('min') ?? 200)));
      if (req.method === 'GET' && parts[1] === 'approvals' && parts[2] && parts.length === 3) return send(res, 200, kernel.inbox.get(parts[2]));
      if (req.method === 'POST' && parts[1] === 'approvals' && parts[2] && parts[3] === 'open') { kernel.inbox.open(parts[2], reviewer); return send(res, 200, { ok: true }); }
      if (req.method === 'POST' && parts[1] === 'approvals' && parts[2] && parts[3] === 'decide') {
        const b = await readJson(req);
        const who = (b['reviewer'] as { id: string; roles: string[] }) ?? reviewer;
        const payload = kernel.inbox.get(parts[2]);
        const r = kernel.inbox.decide(parts[2], who, b['decision'] as never, { edited_preview: b['edited_preview'] as string | undefined, currentState: (b['current_state'] as Record<string, unknown>) ?? payload.state_snapshot });
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

      // Memory
      if (req.method === 'POST' && url.pathname === '/v1/memory/query') {
        const b = await readJson(req);
        const r = await kernel.retriever.retrieve({ query: String(b['query'] ?? ''), entities: (b['entities'] as string[]) ?? [], max_tokens: Number(b['max_tokens'] ?? 4000), ...(b['time_range'] && (b['time_range'] as { after?: string }).after ? { after: (b['time_range'] as { after: string }).after } : {}) });
        return send(res, 200, r);
      }
      if (req.method === 'GET' && parts[1] === 'memory' && parts[2] === 'spans') {
        const pointer = decodeURIComponent(parts.slice(3).join('/'));
        const r = kernel.l2.resolve(pointer);
        return r ? send(res, 200, { pointer, text: r.text, full: r.record.text, source: r.record.source ?? null, trusted: r.record.trusted, role: r.record.role, run_id: r.record.run_id, created_at: r.record.created_at }) : send(res, 404, { error: 'pointer does not resolve' });
      }
      if (req.method === 'POST' && url.pathname === '/v1/memory/export') { res.writeHead(200, { 'content-type': 'application/x-ndjson' }); return res.end(exportBundle(kernel.l2, kernel.l3)); }
      if (req.method === 'GET' && url.pathname === '/v1/memory/holds') return send(res, 200, kernel.l2.activeHolds());
      if (req.method === 'POST' && url.pathname === '/v1/memory/hold') { const b = await readJson(req); return send(res, 201, kernel.l2.placeHold({ workspace_id, ...(b['run_id'] ? { run_id: String(b['run_id']) } : {}) }, String(b['reason'] ?? ''), String(b['placed_by'] ?? reviewer.id))); }
      if (req.method === 'POST' && parts[1] === 'memory' && parts[2] === 'hold' && parts[3] && parts[4] === 'release') { kernel.l2.releaseHold(parts[3]); return send(res, 200, { ok: true }); }
      if (req.method === 'GET' && url.pathname === '/v1/memory/claims') return send(res, 200, { claims: kernel.l3.query(url.searchParams.get('entity') ?? undefined), quarantine: kernel.l3.quarantine, summary: memorySummary() });
      if (req.method === 'POST' && parts[1] === 'memory' && parts[2] === 'claims' && parts[3] && parts[4] === 'dispute') return send(res, 200, kernel.l3.dispute(parts[3], reviewer.id));
      if (req.method === 'POST' && parts[1] === 'memory' && parts[2] === 'claims' && parts[3] && parts[4] === 'reconcile') { const b = await readJson(req); kernel.l3.reconcile(parts[3], (b['retire'] as string[]) ?? []); return send(res, 200, { ok: true }); }

      // Registration-only surfaces in this reference implementation
      if (req.method === 'GET' && url.pathname === '/v1/templates') return send(res, 200, Object.entries(templates).map(([k, t]) => ({ name: k, description: t.description })));
      if (req.method === 'POST' && url.pathname === '/v1/triggers') { const b = await readJson(req); const t = { id: `trg_${triggers.length + 1}`, source: String(b['source']), type: String(b['type']), template: String(b['template']) }; triggers.push(t); return send(res, 201, t); }
      if (req.method === 'POST' && url.pathname === '/v1/webhooks') { const b = await readJson(req); const w = { id: `whk_${webhooks.length + 1}`, url: String(b['url']), events: (b['events'] as string[]) ?? ['run.completed'] }; webhooks.push(w); return send(res, 201, w); }
      if (req.method === 'POST' && url.pathname === '/v1/skills') { const b = await readJson(req); if (!b['signature'] || !b['declared_tier']) return send(res, 400, { error: 'skill manifests must be signed and declare a risk tier' }); return send(res, 201, { installed: b['name'], declared_tier: b['declared_tier'] }); }

      return send(res, 404, { error: 'not found' });
    } catch (e) {
      const err = e as Error & { code?: string; rule?: string };
      return send(res, err.name === 'ApprovalError' || err.name === 'LedgerInvariantError' ? 409 : 500, { error: err.message, code: err.code ?? err.rule ?? err.name });
    }
  });
}
