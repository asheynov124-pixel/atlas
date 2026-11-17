/**
 * Meridian API and web server. Every matter-scoped route resolves the matter through
 * Firm.matterFor (membership and ethical screens), and every approval takes the reviewer's
 * identity and roles from the session, never from the request body.
 */
import { createServer, type ServerResponse } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, normalize, extname, basename } from 'node:path';
import type { Firm } from '../firm/firm.js';
import type { MatterRuntime, ChatMessage } from '../firm/matter.js';
import type { User, Role } from '../firm/auth.js';
import { AuthError } from '../firm/auth.js';
import { nowIso } from '../core/types.js';
import { exportBundle } from '../memory/export.js';
import { cascadeCheck } from '../fastpath/router.js';
import { HttpError, Router, parseCookies, readBody, readJson, send, sendText, type Req } from './http.js';
import { RULES, ruleById, compute, njCourtHolidays } from '../deadlines/rules.js';
import { verifyDraft } from '../research/drafts.js';
import { cleanWithMap, fullCite, shortCite, pinFor, verifyQuote } from '../research/cites.js';
import { WORKFLOW_TOOLS, validate, normalizeDef, type WorkflowDef } from '../workflows/definition.js';
import { designWorkflow, recommendWorkflows } from '../workflows/store.js';
import { recordSentences } from '../app/context.js';
import { parsePointer } from '../memory/episodic.js';
import { SUPPORTED } from '../ingest/documents.js';

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };
const COOKIE = 'mer_session';

export function createApiServer(firm: Firm, opts: { static_dir?: string } = {}) {
  const r = new Router();
  const loginAttempts = new Map<string, number[]>();

  const user = (q: Req): User => { const u = firm.auth.userForToken(q.cookies[COOKIE]); if (!u) throw new HttpError(401, 'Sign in to continue.', 'auth'); return u; };
  const matterOf = async (q: Req): Promise<{ u: User; m: MatterRuntime }> => {
    const u = user(q);
    const id = String(q.raw.headers['x-matter'] ?? q.url.searchParams.get('matter') ?? '');
    if (!id) throw new HttpError(400, 'Choose a matter first.', 'matter');
    return { u, m: await firm.matterFor(u, id) };
  };
  const requireRole = (u: User, roles: Role[]) => { if (!roles.includes(u.role)) throw new HttpError(403, `This needs one of: ${roles.join(', ')}.`); };
  const setCookie = (res: ServerResponse, token: string) => res.setHeader('set-cookie', `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${14 * 86400}`);
  const sessionInfo = (u: User | null) => ({
    setup_needed: firm.needsSetup(), user: u, provider: firm.providerLabel, live: !!firm.provider.live, courtlistener: firm.agent.cl.enabled,
    matters: u ? firm.mattersFor(u).map((m) => ({ id: m.id, name: m.name, client: m.client })) : [],
  });

  // ------------------------------------------------------------ session
  r.on('GET', '/v1/session', (q) => sessionInfo(firm.auth.userForToken(q.cookies[COOKIE])));
  r.on('POST', '/v1/setup', async (q) => {
    const b = await readJson<{ email: string; name: string; password: string }>(q.raw);
    const { user: u } = await firm.setup(b);
    const s = firm.auth.login(b.email, b.password);
    setCookie(q.res, s.token);
    return sessionInfo(u);
  });
  r.on('POST', '/v1/login', async (q) => {
    const b = await readJson<{ email: string; password: string }>(q.raw);
    const key = String(b.email ?? '').toLowerCase();
    const recent = (loginAttempts.get(key) ?? []).filter((t) => Date.now() - t < 60_000);
    if (recent.length >= 6) throw new HttpError(429, 'Too many attempts. Wait a minute and try again.');
    try {
      const s = firm.auth.login(b.email, b.password);
      loginAttempts.delete(key);
      setCookie(q.res, s.token);
      firm.audit.append(s.user.id, 'session.login', {});
      return sessionInfo(s.user);
    } catch (e) { loginAttempts.set(key, [...recent, Date.now()]); throw e; }
  });
  r.on('POST', '/v1/logout', (q) => { if (q.cookies[COOKIE]) firm.auth.logout(q.cookies[COOKIE]!); q.res.setHeader('set-cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`); return { ok: true }; });

  // ------------------------------------------------------------ users, matters, audit
  r.on('GET', '/v1/users', (q) => { const u = user(q); requireRole(u, ['admin', 'partner']); return firm.auth.listUsers(); });
  r.on('POST', '/v1/users', async (q) => { const u = user(q); const b = await readJson<{ email: string; name: string; role: Role; password: string }>(q.raw); return firm.createUser(b, u); });
  r.on('PATCH', '/v1/users/:id', async (q) => { const u = user(q); requireRole(u, ['admin']); const b = await readJson<{ role?: Role; disabled?: boolean; name?: string; password?: string }>(q.raw); const out = firm.auth.updateUser(q.params['id']!, b); firm.audit.append(u.id, 'user.updated', { user_id: out.id, role: out.role, disabled: !!out.disabled }); return out; });
  r.on('GET', '/v1/matters', (q) => firm.mattersFor(user(q)));
  r.on('GET', '/v1/matters/all', (q) => { const u = user(q); requireRole(u, ['admin', 'partner']); return firm.allMatters().map((m) => ({ ...m, members: firm.members(m.id) })); });
  r.on('POST', '/v1/matters', async (q) => { const u = user(q); const b = await readJson<{ name: string; client?: string; docs_dir?: string }>(q.raw); return firm.createMatter(b, u); });
  r.on('POST', '/v1/matters/:id/members', async (q) => { const u = user(q); const b = await readJson<{ user_id: string }>(q.raw); firm.addMember(q.params['id']!, b.user_id, u); return firm.members(q.params['id']!); });
  r.on('DELETE', '/v1/matters/:id/members/:uid', (q) => { const u = user(q); firm.removeMember(q.params['id']!, q.params['uid']!, u); return firm.members(q.params['id']!); });
  r.on('POST', '/v1/matters/:id/screens', async (q) => { const u = user(q); const b = await readJson<{ user_id: string; reason: string }>(q.raw); firm.screen(q.params['id']!, b.user_id, b.reason ?? '', u); return firm.members(q.params['id']!); });
  r.on('DELETE', '/v1/matters/:id/screens/:uid', (q) => { const u = user(q); firm.liftScreen(q.params['id']!, q.params['uid']!, u); return firm.members(q.params['id']!); });
  r.on('GET', '/v1/audit', (q) => {
    const u = user(q); requireRole(u, ['admin', 'partner']);
    const mid = q.url.searchParams.get('matter');
    if (mid && u.role !== 'admin' && !firm.mattersFor(u).some((m) => m.id === mid)) throw new HttpError(403, 'You are not on that matter.');
    if (!mid && u.role !== 'admin') throw new HttpError(403, 'Firm-wide audit export is admin only.');
    const rows = firm.audit.rows(mid);
    const fmt = q.url.searchParams.get('format') ?? 'json';
    firm.audit.append(u.id, 'audit.exported', { format: fmt, rows: rows.length }, mid);
    if (fmt === 'csv') { sendText(q.res, 200, firm.audit.toCsv(rows), 'text/csv; charset=utf-8', { 'content-disposition': `attachment; filename="meridian-audit${mid ? `-${mid}` : ''}.csv"` }); return undefined; }
    if (fmt === 'jsonl') { sendText(q.res, 200, rows.map((x) => JSON.stringify(x)).join('\n') + '\n', 'application/x-ndjson', { 'content-disposition': `attachment; filename="meridian-audit${mid ? `-${mid}` : ''}.jsonl"` }); return undefined; }
    return { rows: rows.slice(-500), total: rows.length, chain: firm.audit.verify() };
  });
  r.on('GET', '/v1/audit/verify', (q) => { const u = user(q); requireRole(u, ['admin', 'partner']); return firm.audit.verify(); });

  // ------------------------------------------------------------ matter state
  const runSummary = (m: MatterRuntime, run_id: string) => {
    const run = m.kernel.ledger.getRun(run_id);
    const s = m.kernel.ledger.summary(run_id);
    const pending = m.kernel.inbox.pending().filter((p) => p.run_id === run_id).length;
    const interrupted = m.kernel.ledger.tasksForRun(run_id).some((t) => t.status === 'blocked' && t.inputs['interrupted']);
    return { ...run, ledger: s, percent: s.total ? Math.round(((s.accepted + s.failed + s.cancelled) / s.total) * 100) : 0, pending_approvals: pending, interrupted, template: m.kernel.lead.runMeta.get(run_id)?.template ?? null };
  };
  const runDetail = (m: MatterRuntime, run_id: string) => {
    const base = runSummary(m, run_id);
    const tasks = m.kernel.ledger.tasksForRun(run_id).map((t) => {
      const grades = m.kernel.ledger.gradesFor(t.task_id);
      const cal = grades.filter((g) => g.kind === 'calibration').at(-1);
      const { text: _t, ...inputs } = t.inputs as Record<string, unknown>;
      return { task_id: t.task_id, type: t.type, inputs, status: t.status, owner: t.owner_agent_id ?? null, tier: t.risk_tier_ceiling, attempts: t.attempts, spend: t.spend, score: cal?.score ?? null, critique: cal && cal.decision !== 'accept' ? cal.critique : null, grades: grades.map((g) => ({ kind: g.kind, score: Number(g.score.toFixed(2)), decision: g.decision })) };
    });
    const artifacts = base.artifact_ids.map((id) => { const a = m.kernel.lead.artifacts.get(id)!; return { id, ...a, provenance: (a.provenance ?? []).map((p) => ({ ...p, cite: m.citeFor(p.pointer) })) }; });
    const plan = m.kernel.events.forRun(run_id).find((e) => e.event === 'plan.ready')?.payload ?? null;
    const questions = m.kernel.events.forRun(run_id).filter((e) => e.event === 'task.blocked' && (e.payload['status'] === 'needs_human' || e.payload['reason'] === 'grader_disagreement')).map((e) => e.payload);
    return { ...base, tasks, artifacts, plan, questions, alerts: m.kernel.sentinel.alerts.filter((a) => tasks.some((t) => t.task_id === a.task_id)) };
  };
  const memorySummary = (m: MatterRuntime) => { const c = m.kernel.l3.all(); return { claims: c.length, contested: c.filter((x) => x.status === 'contested').length, quarantined: m.kernel.l3.quarantine.length, holds: m.kernel.l2.activeHolds(), episodic_records: m.kernel.l2.all().length }; };
  const docSummary = (m: MatterRuntime) => m.docs.list().map((d) => ({ id: d.id, name: d.name, rel: d.rel, kind: d.kind, pages: d.pages, bates_first: d.bates_first ?? null, bates_last: d.bates_last ?? null, scanned_pages: d.scanned_pages, ocr_pages: d.ocr_pages, lines: d.lines.length, ingested_at: d.ingested_at }));

  const startRun = async (m: MatterRuntime, u: User, goal: string, explicit?: string, budget?: number) => {
    const ranked = Object.entries(m.templates).map(([k, t]) => [k, t.match(goal)] as const).sort((a, b) => b[1] - a[1]);
    const name = explicit && m.templates[explicit] ? explicit : ranked[0]![0];
    const cfg = m.runConfig(name, goal, { ...(budget ? { budget_usd: budget } : {}), user: u.id });
    const started = await m.kernel.lead.start(cfg);
    if (firm.workflows.get(name)) firm.workflows.used(name);
    firm.audit.append(u.id, 'run.started', { run_id: started.run.run_id, template: name, goal }, m.id);
    void m.kernel.lead.execute(started.run.run_id).catch((e: Error) => { m.kernel.events.emit('run.failed', { reason: e.message }, started.run.run_id); const run = m.kernel.ledger.getRun(started.run.run_id); if (run.status === 'running' || run.status === 'planning') m.kernel.ledger.setRunStatus(started.run.run_id, 'failed'); });
    return { ...started, template: name, label: m.templates[name]!.label ?? name };
  };

  r.on('GET', '/v1/state', async (q) => {
    const { u, m } = await matterOf(q);
    return {
      workspace: { id: m.id, label: m.row.name, client: m.row.client, provider: firm.providerLabel, reviewer: firm.reviewer(u), user: u },
      runs: m.kernel.ledger.listRuns().map((x) => runSummary(m, x.run_id)).reverse(),
      approvals: m.kernel.inbox.pending(), memory: memorySummary(m), conversation: m.conversation,
      templates: Object.entries(m.templates).map(([k, t]) => ({ name: k, label: t.label ?? k, description: t.description, category: t.category ?? 'other', builtin: !!t.builtin })),
      files: docSummary(m).map((d) => d.rel), docs: docSummary(m),
      deadlines: m.deadlines().filter((d) => d.status !== 'superseded').slice(0, 50), tripwires: m.tripwires().filter((t) => t.status === 'tripped'),
    };
  });
  r.on('GET', '/v1/events', async (q) => {
    const { m } = await matterOf(q);
    q.res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    q.res.write('event: hello\ndata: {}\n\n');
    const off = m.kernel.events.on((e) => q.res.write(`event: ${e.event}\ndata: ${JSON.stringify(e)}\n\n`));
    const ping = setInterval(() => q.res.write(': ping\n\n'), 15000);
    q.raw.on('close', () => { off(); clearInterval(ping); });
    return undefined;
  });

  // ------------------------------------------------------------ conversation
  r.on('POST', '/v1/ask', async (q) => {
    const { u, m } = await matterOf(q);
    const b = await readJson<{ text: string; delegate?: boolean; template?: string; budget_usd?: number }>(q.raw);
    const text = String(b.text ?? '').trim();
    if (!text) throw new HttpError(400, 'Type a question or a goal.');
    const userMsg: ChatMessage = { role: 'user', text, at: nowIso(), by: u.name };
    m.conversation.push(userMsg);
    const decision = await m.kernel.router.route(text, `${m.id}:${Object.keys(m.templates).sort().join(',')}`);
    let reply: ChatMessage;
    if (b.delegate || decision.intent === 'agentic') {
      const s = await startRun(m, u, text, b.template, b.budget_usd);
      reply = { role: 'meridian', at: nowIso(), run_id: s.run.run_id, text: `Plan ready: ${s.task_count} tasks using “${s.label}”.${s.checkpoint_required ? ' The plan needs approval before anything leaves the building.' : ' Running now.'}`, meta: { intent: 'agentic', effort: decision.effort, tier: decision.tier, checkpoint_required: s.checkpoint_required, anticipated_tier3: s.anticipated_tier3, template: s.template } };
    } else {
      const context = decision.working_set.map((s) => `[[${s.pointer}]] ${s.text}`).join('\n');
      const out = await firm.provider.complete({ tier: decision.tier, effort: decision.effort, system: '[[task:answer]] Answer from the MEMORY spans below. After every factual sentence, cite the span pointer in [[...]]. If memory does not cover it, say so.', prompt: `QUESTION: ${text}\n\nMEMORY:\n${context || '(empty)'}` });
      const check = cascadeCheck(out.text, (p) => !!m.kernel.l2.resolve(p));
      const cites = [...out.text.matchAll(/\[\[(ep:[^\]\[]+)\]\]/g)].map((x) => ({ pointer: x[1]!, cite: m.citeFor(x[1]!) }));
      reply = { role: 'meridian', at: nowIso(), text: out.text, meta: { intent: decision.intent, effort: decision.effort, tier: decision.tier, provisional: decision.cascade, evidence_ok: check.accept, unsourced: check.unsourced, spans: decision.working_set.length, timings_ms: decision.timings_ms, usd: out.usd, cites } };
    }
    m.conversation.push(reply);
    m.scheduleSave();
    return { user: userMsg, reply };
  });

  // ------------------------------------------------------------ runs
  r.on('GET', '/v1/runs', async (q) => { const { m } = await matterOf(q); return m.kernel.ledger.listRuns().map((x) => runSummary(m, x.run_id)).reverse(); });
  r.on('POST', '/v1/runs', async (q) => {
    const { u, m } = await matterOf(q);
    const b = await readJson<{ goal: string; template?: string; budget?: { max_usd?: number } }>(q.raw);
    const s = await startRun(m, u, String(b.goal ?? ''), b.template, b.budget?.max_usd);
    q.res.statusCode = 202;
    return { run_id: s.run.run_id, status: s.run.status, template: s.template, checkpoint_required: s.checkpoint_required };
  });
  r.on('GET', '/v1/runs/:id', async (q) => { const { m } = await matterOf(q); return runDetail(m, q.params['id']!); });
  r.on('GET', '/v1/runs/:id/trace', async (q) => { const { m } = await matterOf(q); const id = q.params['id']!; return { ledger: m.kernel.ledger.entries.filter((e) => e.run_id === id), events: m.kernel.events.forRun(id), gate_audit: m.kernel.gate.audit.filter((a) => a.call.run_id === id) }; });
  r.on('POST', '/v1/runs/:id/approve-plan', async (q) => { const { u, m } = await matterOf(q); m.kernel.lead.approvePlan(q.params['id']!, u.id); return { ok: true }; });
  r.on('POST', '/v1/runs/:id/answer', async (q) => { const { m } = await matterOf(q); const b = await readJson<{ task_id: string; answer: string }>(q.raw); m.kernel.lead.answerQuestion(b.task_id, b.answer ?? ''); if (m.kernel.ledger.getRun(q.params['id']!).status === 'paused') void m.kernel.lead.resume(q.params['id']!).catch(() => {}); return { ok: true }; });
  r.on('POST', '/v1/runs/:id/resume', async (q) => { const { m } = await matterOf(q); const id = q.params['id']!; if (!m.kernel.lead.hasConfig(id)) throw new HttpError(409, 'This run’s workflow is no longer available.'); void m.kernel.lead.retryInterrupted(id).catch((e: Error) => m.kernel.events.emit('run.failed', { reason: e.message }, id)); return { ok: true }; });
  r.on('POST', '/v1/runs/:id/cancel', async (q) => {
    const { u, m } = await matterOf(q);
    const id = q.params['id']!;
    for (const t of m.kernel.ledger.tasksForRun(id)) if (['pending', 'ready', 'revising', 'blocked'].includes(t.status)) m.kernel.ledger.transition(t.task_id, 'cancelled', `cancelled by ${u.name}`);
    m.kernel.ledger.setRunStatus(id, 'cancelled');
    m.kernel.events.emit('run.failed', { reason: 'cancelled by user' }, id);
    return { ok: true };
  });

  // ------------------------------------------------------------ approvals
  r.on('GET', '/v1/approvals', async (q) => { const { m } = await matterOf(q); return m.kernel.inbox.pending(); });
  r.on('GET', '/v1/approvals/telemetry', async (q) => { const { m } = await matterOf(q); return m.kernel.inbox.telemetry(q.url.searchParams.get('action') ?? 'mail.send', Number(q.url.searchParams.get('min') ?? 200)); });
  r.on('GET', '/v1/approvals/:id', async (q) => { const { m } = await matterOf(q); return m.kernel.inbox.get(q.params['id']!); });
  r.on('POST', '/v1/approvals/:id/open', async (q) => { const { u, m } = await matterOf(q); m.kernel.inbox.open(q.params['id']!, firm.reviewer(u)); return { ok: true }; });
  r.on('POST', '/v1/approvals/delegate', async (q) => { const { u, m } = await matterOf(q); const b = await readJson<{ to: string; scope: string[]; hours: number }>(q.raw); const d = m.kernel.inbox.delegate(firm.reviewer(u), b.to, b.scope ?? ['*'], Math.max(1, b.hours ?? 24) * 3_600_000); firm.audit.append(u.id, 'approval.delegated', { to: b.to, scope: d.scope, expires_at: d.expires_at }, m.id); m.scheduleSave(); return d; });
  r.on('POST', '/v1/approvals/:id/decide', async (q) => {
    const { u, m } = await matterOf(q);
    const b = await readJson<{ decision: 'approve' | 'edit' | 'reject'; edited_preview?: string; current_state?: Record<string, unknown> }>(q.raw);
    const id = q.params['id']!;
    const payload = m.kernel.inbox.get(id);
    let res;
    try { res = m.kernel.inbox.decide(id, firm.reviewer(u), b.decision, { ...(b.edited_preview !== undefined ? { edited_preview: b.edited_preview } : {}), currentState: b.current_state ?? payload.state_snapshot }); }
    catch (e) { if ((e as { code?: string }).code === 'rbac') throw new HttpError(403, u.role === 'associate' || u.role === 'paralegal' ? 'Only a partner can approve this. Ask a partner, or ask one to delegate approval to you.' : (e as Error).message); throw e; }
    if (payload.action === 'calendar.add_deadline') {
      const did = (payload.target as { deadline_id: string }).deadline_id;
      if (res.status === 'rejected') firm.db.prepare("UPDATE deadlines SET status = 'rejected', decided_by = ? WHERE id = ?").run(u.id, did);
      if (res.reissued) firm.db.prepare('UPDATE deadlines SET approval_id = ? WHERE id = ?').run(res.reissued.approval_id, did);
    }
    if (res.status === 'approved' && res.execute_with !== undefined) {
      const exec = await m.kernel.tools.executeApproved(res.payload, res.execute_with, m.id);
      if (res.payload.task_id) {
        await m.kernel.lead.completeBlocked(res.payload.task_id, exec);
        if (m.kernel.ledger.getRun(res.payload.run_id).status === 'paused') void m.kernel.lead.resume(res.payload.run_id).catch((e: Error) => m.kernel.events.emit('run.failed', { reason: e.message }, res.payload.run_id));
      }
      m.scheduleSave();
      return { ...res, executed: exec };
    }
    m.scheduleSave();
    return res;
  });

  // ------------------------------------------------------------ memory
  r.on('POST', '/v1/memory/query', async (q) => { const { m } = await matterOf(q); const b = await readJson<{ query: string; entities?: string[]; max_tokens?: number }>(q.raw); const out = await m.kernel.retriever.retrieve({ query: String(b.query ?? ''), entities: b.entities ?? [], max_tokens: Number(b.max_tokens ?? 4000) }); return { ...out, spans: out.spans.map((s) => ({ ...s, cite: m.citeFor(s.pointer) })) }; });
  r.on('GET', '/v1/memory/spans/:pointer*', async (q) => {
    const { m } = await matterOf(q);
    const pointer = q.params['pointer']!;
    const hit = m.kernel.l2.resolve(pointer);
    if (!hit) throw new HttpError(404, 'That pointer does not resolve. This is the failure the evidence verifier exists to catch.');
    const p = parsePointer(pointer)!;
    const lines = m.docs.linesFor(pointer);
    const law = p.run_id === 'law' ? firm.library.getCase(String(hit.record.source)) : null;
    return { pointer, text: hit.text, full: hit.record.text, start: p.start, end: p.end, source: hit.record.source ?? null, trusted: hit.record.trusted, role: hit.record.role, run_id: hit.record.run_id, created_at: hit.record.created_at, cite: m.citeFor(pointer), doc: lines ? { id: lines.doc.id, name: lines.doc.name, kind: lines.doc.kind, pages: lines.doc.pages, lines: lines.lines } : null, law: law ? { case_id: law.id, name: law.name, cite: fullCite(law, pinFor(law.text, p.start, p.end, law.first_page)) } : null };
  });
  r.on('POST', '/v1/memory/export', async (q) => { const { u, m } = await matterOf(q); firm.audit.append(u.id, 'memory.exported', {}, m.id); sendText(q.res, 200, exportBundle(m.kernel.l2, m.kernel.l3), 'application/x-ndjson', { 'content-disposition': `attachment; filename="${m.id}-memory.jsonl"` }); return undefined; });
  r.on('GET', '/v1/memory/export', async (q) => { const { u, m } = await matterOf(q); firm.audit.append(u.id, 'memory.exported', {}, m.id); sendText(q.res, 200, exportBundle(m.kernel.l2, m.kernel.l3), 'application/x-ndjson', { 'content-disposition': `attachment; filename="${m.id}-memory.jsonl"` }); return undefined; });
  r.on('GET', '/v1/memory/holds', async (q) => { const { m } = await matterOf(q); return m.kernel.l2.activeHolds(); });
  r.on('POST', '/v1/memory/hold', async (q) => { const { u, m } = await matterOf(q); const b = await readJson<{ run_id?: string; reason: string }>(q.raw); const h = m.kernel.l2.placeHold({ workspace_id: m.id, ...(b.run_id ? { run_id: String(b.run_id) } : {}) }, String(b.reason ?? ''), u.name); firm.audit.append(u.id, 'hold.placed', { hold_id: h.id, reason: h.reason, run_id: b.run_id ?? null }, m.id); m.scheduleSave(); q.res.statusCode = 201; return h; });
  r.on('POST', '/v1/memory/hold/:id/release', async (q) => { const { u, m } = await matterOf(q); requireRole(u, ['admin', 'partner']); m.kernel.l2.releaseHold(q.params['id']!); firm.audit.append(u.id, 'hold.released', { hold_id: q.params['id'] }, m.id); m.scheduleSave(); return { ok: true }; });
  r.on('GET', '/v1/memory/claims', async (q) => { const { m } = await matterOf(q); return { claims: m.kernel.l3.query(q.url.searchParams.get('entity') ?? undefined).map((c) => ({ ...c, cites: c.evidence.map((e) => m.citeFor(e.pointer)) })), quarantine: m.kernel.l3.quarantine, summary: memorySummary(m) }; });
  r.on('POST', '/v1/memory/claims/:id/dispute', async (q) => { const { u, m } = await matterOf(q); const c = m.kernel.l3.dispute(q.params['id']!, u.id); m.scheduleSave(); return c; });
  r.on('POST', '/v1/memory/claims/:id/reconcile', async (q) => { const { m } = await matterOf(q); const b = await readJson<{ retire: string[] }>(q.raw); m.kernel.l3.reconcile(q.params['id']!, b.retire ?? []); m.scheduleSave(); return { ok: true }; });

  // ------------------------------------------------------------ documents
  r.on('GET', '/v1/docs', async (q) => { const { m } = await matterOf(q); return docSummary(m); });
  r.on('POST', '/v1/docs/sync', async (q) => { const { m } = await matterOf(q); const created = await m.syncDocs(); return { created: created.map((d) => d.name), docs: docSummary(m) }; });
  r.on('POST', '/v1/docs/upload', async (q) => {
    const { u, m } = await matterOf(q);
    const name = basename(String(q.url.searchParams.get('name') ?? '')).replace(/[^\w.() -]/g, '_');
    if (!name || !SUPPORTED.has(extname(name).toLowerCase())) throw new HttpError(400, `Upload PDF, text, email or HTML files. ${name || 'That file'} is not supported yet.`);
    const bytes = await readBody(q.raw);
    const folder = join(m.row.docs_dir, q.url.searchParams.get('folder') === 'incoming' ? 'incoming' : '');
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, name), bytes);
    const created = await m.syncDocs();
    firm.audit.append(u.id, 'doc.uploaded', { name, bytes: bytes.length }, m.id);
    return { created: created.map((d) => ({ id: d.id, name: d.name, pages: d.pages, bates_first: d.bates_first ?? null, scanned_pages: d.scanned_pages })), deadlines: m.deadlines().filter((d) => created.some((c) => c.id === d.source_doc)), tripwires: m.tripwires().filter((t) => created.some((c) => c.id === t.tripped_by)) };
  });
  r.on('GET', '/v1/docs/:id', async (q) => {
    const { m } = await matterOf(q);
    const d = m.docs.get(q.params['id']!);
    if (!d) throw new HttpError(404, 'No such document in this matter.');
    const text = m.docs.text(d.id);
    return { ...d, lines: d.lines.map((l) => ({ ...l, text: text.slice(l.start, l.end) })) };
  });
  r.on('GET', '/v1/record/cites', async (q) => {
    const { m } = await matterOf(q);
    const qs = (q.url.searchParams.get('q') ?? '').toLowerCase();
    const terms = qs.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
    const all = recordSentences(m.docs);
    const scored = all.map((s) => ({ s, n: terms.length ? terms.reduce((k, t) => k + (s.text.toLowerCase().includes(t) ? 1 : 0), 0) : 0 })).filter((x) => !terms.length || x.n > 0).sort((a, b) => b.n - a.n);
    return scored.slice(0, 40).map(({ s }) => ({ pointer: s.pointer, text: s.text, cite: s.cite, doc_id: s.doc_id }));
  });

  // ------------------------------------------------------------ deadlines & tripwires
  r.on('GET', '/v1/deadlines', async (q) => { const { m } = await matterOf(q); return { deadlines: m.deadlines(), tripwires: m.tripwires() }; });
  r.on('GET', '/v1/deadlines/rules', () => ({ rules: RULES, holidays: [...njCourtHolidays(new Date().getUTCFullYear()), ...njCourtHolidays(new Date().getUTCFullYear() + 1)].map(([date, name]) => ({ date, name })) }));
  r.on('POST', '/v1/deadlines/compute', async (q) => {
    const { m } = await matterOf(q);
    const b = await readJson<{ rule_id: string; date: string; mail_service?: boolean; propose?: boolean; label?: string }>(q.raw);
    const rule = ruleById(b.rule_id);
    if (!rule) throw new HttpError(400, 'Unknown rule.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date ?? '')) throw new HttpError(400, 'Give the trigger date as YYYY-MM-DD.');
    const math = compute(rule, b.date, { mail_service: !!b.mail_service, trigger_label: b.label ?? 'Entered by hand' });
    const proposed = b.propose ? m.propose(math, { kind: rule.trigger, date: b.date, label: b.label ?? 'Entered by hand' }, null, `${rule.label} (${rule.cite})`) : null;
    return { math, proposed };
  });
  r.on('POST', '/v1/deadlines/scan', async (q) => { const { m } = await matterOf(q); const out = m.docs.list().flatMap((d) => m.scanDeadlines(d)); m.scheduleSave(); return { proposed: out }; });
  r.on('GET', '/v1/deadlines/calendar.ics', async (q) => { const { m } = await matterOf(q); const ics = await m.writeIcs(); sendText(q.res, 200, ics, 'text/calendar; charset=utf-8', { 'content-disposition': `attachment; filename="${m.row.name.replace(/[^\w]+/g, '-').slice(0, 40)}-deadlines.ics"` }); return undefined; });
  r.on('GET', '/v1/tripwires', async (q) => { const { m } = await matterOf(q); return m.tripwires(); });

  // ------------------------------------------------------------ research (firm-wide)
  r.on('GET', '/v1/research/status', (q) => { user(q); return { courtlistener: firm.agent.cl.enabled, cases: firm.library.listCases().length, quotes: firm.library.listQuotes().length }; });
  r.on('POST', '/v1/research/search', async (q) => { const u = user(q); const b = await readJson<{ query: string; external?: boolean }>(q.raw); if (!String(b.query ?? '').trim()) throw new HttpError(400, 'Type a question or a citation.'); return firm.agent.search(String(b.query), { user: u.id, external: b.external !== false }); });
  r.on('POST', '/v1/research/ask', async (q) => { const u = user(q); const b = await readJson<{ message: string }>(q.raw); return firm.agent.ask(String(b.message ?? ''), { user: u.id }); });
  r.on('GET', '/v1/research/cases', (q) => { user(q); return firm.library.listCases({ starred: q.url.searchParams.get('starred') === '1' }); });
  r.on('GET', '/v1/research/cases/:id', (q) => { user(q); const c = firm.library.getCase(q.params['id']!); if (!c) throw new HttpError(404, 'Not in the research database.'); firm.library.opened(c.id); return { ...c, full_cite: fullCite(c), short_cite: shortCite(c), quotes: firm.library.listQuotes({ case_id: c.id }), cites: firm.library.cites(c.id), cited_by: firm.library.citedBy(c.id) }; });
  r.on('PATCH', '/v1/research/cases/:id', async (q) => { user(q); const b = await readJson<{ starred?: boolean; tags?: string[]; notes?: string }>(q.raw); return firm.library.update(q.params['id']!, b); });
  r.on('POST', '/v1/research/cases/:id/treatment', async (q) => { user(q); return firm.agent.treatment(q.params['id']!); });
  r.on('POST', '/v1/research/cases/import', async (q) => {
    const u = user(q);
    const b = await readJson<{ courtlistener_id?: number; name?: string; citation?: string; court?: string; date?: string; text?: string; url?: string }>(q.raw);
    if (b.courtlistener_id) {
      const o = await firm.agent.cl.fetchOpinion(Number(b.courtlistener_id));
      const { citation, ...rest } = o;
      const c = firm.library.importCase({ ...rest, source: 'courtlistener', ...(citation ? { citation } : {}), imported_by: u.id });
      firm.audit.append(u.id, 'research.imported', { case_id: c.id, name: c.name });
      return c;
    }
    if (!b.name || !b.text) throw new HttpError(400, 'Give the case name and the opinion text (or a CourtListener opinion id).');
    const c = firm.library.importCase({ name: b.name, ...(b.citation ? { citation: b.citation } : {}), ...(b.court ? { court: b.court } : {}), ...(b.date ? { date: b.date } : {}), ...(b.url ? { url: b.url } : {}), text: b.text, source: 'manual', imported_by: u.id });
    firm.audit.append(u.id, 'research.imported', { case_id: c.id, name: c.name });
    return c;
  });
  r.on('GET', '/v1/research/quotes', (q) => { user(q); const s = q.url.searchParams.get('q'); return firm.library.listQuotes(s ? { q: s } : {}); });
  r.on('POST', '/v1/research/quotes', async (q) => {
    const u = user(q);
    const b = await readJson<{ case_id: string; text?: string; start?: number; end?: number; proposition?: string; tags?: string[]; note?: string; matter_id?: string }>(q.raw);
    let text = b.text ?? '';
    if (!text && b.start !== undefined && b.end !== undefined) { const c = firm.library.getCase(b.case_id); text = c ? cleanWithMap(c.text.slice(b.start, b.end)).clean : ''; }
    try { return firm.library.saveQuote({ case_id: b.case_id, text, ...(b.proposition ? { proposition: b.proposition } : {}), ...(b.tags ? { tags: b.tags } : {}), ...(b.note ? { note: b.note } : {}), matter_id: b.matter_id ?? null, user: u.id }); }
    catch (e) { throw new HttpError(422, (e as Error).message); }
  });
  r.on('PATCH', '/v1/research/quotes/:id', async (q) => { user(q); const b = await readJson<{ proposition?: string; tags?: string[]; note?: string }>(q.raw); return firm.library.updateQuote(q.params['id']!, b); });
  r.on('DELETE', '/v1/research/quotes/:id', (q) => { user(q); firm.library.deleteQuote(q.params['id']!); return { ok: true }; });
  r.on('POST', '/v1/research/quotes/:id/use', (q) => { user(q); firm.library.useQuote(q.params['id']!); return { ok: true }; });
  r.on('POST', '/v1/research/verify', async (q) => { user(q); const b = await readJson<{ case_id: string; quote: string }>(q.raw); const c = firm.library.getCase(b.case_id); if (!c) throw new HttpError(404, 'Not in the research database.'); const v = verifyQuote(c.text, b.quote); return { ...v, pin: v.ok ? pinFor(c.text, v.start, v.end, c.first_page) : null, short: v.ok ? shortCite(c, pinFor(c.text, v.start, v.end, c.first_page)) : null }; });

  // ------------------------------------------------------------ drafts (matter-scoped)
  r.on('GET', '/v1/drafts', async (q) => { const { m } = await matterOf(q); return firm.drafts.list(m.id); });
  r.on('POST', '/v1/drafts', async (q) => { const { u, m } = await matterOf(q); const b = await readJson<{ title?: string; body?: string }>(q.raw); return firm.drafts.create(m.id, b.title ?? 'Untitled draft', u.id, b.body ?? ''); });
  r.on('GET', '/v1/drafts/:id', async (q) => { const { m } = await matterOf(q); const d = firm.drafts.get(q.params['id']!, m.id); if (!d) throw new HttpError(404, 'Draft not found.'); return d; });
  r.on('PUT', '/v1/drafts/:id', async (q) => { const { m } = await matterOf(q); const b = await readJson<{ title?: string; body?: string }>(q.raw); return firm.drafts.save(q.params['id']!, m.id, b); });
  r.on('DELETE', '/v1/drafts/:id', async (q) => { const { m } = await matterOf(q); firm.drafts.remove(q.params['id']!, m.id); return { ok: true }; });
  r.on('POST', '/v1/drafts/:id/verify', async (q) => { const { m } = await matterOf(q); const d = firm.drafts.get(q.params['id']!, m.id); if (!d) throw new HttpError(404, 'Draft not found.'); return verifyDraft(d.body, firm.library, { resolve: (p) => m.kernel.l2.resolve(p), citeFor: (p) => m.citeFor(p) }); });
  r.on('GET', '/v1/drafts/:id/export.doc', async (q) => {
    const { m } = await matterOf(q);
    const d = firm.drafts.get(q.params['id']!, m.id);
    if (!d) throw new HttpError(404, 'Draft not found.');
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${d.title}</title><style>body{font-family:'Times New Roman',serif;font-size:12pt;line-height:2}h1,h2,h3{font-family:'Times New Roman',serif}.cite{background:none}</style></head><body><h1>${d.title}</h1>${d.body}</body></html>`;
    sendText(q.res, 200, html, 'application/msword', { 'content-disposition': `attachment; filename="${d.title.replace(/[^\w]+/g, '-').slice(0, 60)}.doc"` });
    return undefined;
  });

  // ------------------------------------------------------------ workflows
  r.on('GET', '/v1/workflows', async (q) => {
    const u = user(q);
    const mid = String(q.raw.headers['x-matter'] ?? q.url.searchParams.get('matter') ?? '');
    const mine = firm.workflows.list();
    const examples = firm.workflows.examples();
    const community = await firm.workflows.community();
    let recommendations: Array<{ id: string; name: string; reason: string }> = [];
    let builtins: Array<{ id: string; name: string; description: string; category: string }> = [];
    if (mid) {
      const m = await firm.matterFor(u, mid);
      builtins = Object.entries(m.templates).filter(([, t]) => t.builtin).map(([id, t]) => ({ id, name: t.label ?? id, description: t.description, category: t.category ?? 'other' }));
      const candidates = [...builtins.map((b) => ({ ...b, source: 'builtin' })), ...examples.map((e) => ({ id: e.id!, name: e.name, source: 'example', category: e.category })), ...community.map((c) => ({ id: c.id!, name: c.name, source: 'community', category: c.category }))];
      recommendations = recommendWorkflows(m.docs.list().map((d) => d.name), m.docs.list().slice(0, 12).map((d) => m.docs.text(d.id).slice(0, 2000)), candidates, Object.fromEntries(mine.map((w) => [w.id, w.uses])));
    }
    return { builtins, mine, examples, community, recommendations, tools: WORKFLOW_TOOLS, community_dir: firm.workflows.communityDir };
  });
  r.on('POST', '/v1/workflows/validate', async (q) => { user(q); const b = await readJson<Partial<WorkflowDef>>(q.raw); const def = normalizeDef(b); return { def, validation: validate(def) }; });
  r.on('POST', '/v1/workflows/design', async (q) => { user(q); const b = await readJson<{ description: string }>(q.raw); if (!String(b.description ?? '').trim()) throw new HttpError(400, 'Describe what the workflow should do.'); return designWorkflow(String(b.description), firm.provider); });
  r.on('POST', '/v1/workflows', async (q) => { const u = user(q); const b = await readJson<Partial<WorkflowDef>>(q.raw); const out = firm.workflows.save(b, u.id); if (out.workflow) { firm.audit.append(u.id, 'workflow.saved', { id: out.workflow.id, name: out.workflow.def.name }); await firm.workflowsChanged(); } else q.res.statusCode = 422; return out; });
  r.on('PUT', '/v1/workflows/:id', async (q) => { const u = user(q); const b = await readJson<Partial<WorkflowDef>>(q.raw); const out = firm.workflows.save({ ...b, id: q.params['id']! }, u.id); if (out.workflow) await firm.workflowsChanged(); else q.res.statusCode = 422; return out; });
  r.on('DELETE', '/v1/workflows/:id', async (q) => { const u = user(q); firm.workflows.remove(q.params['id']!); firm.audit.append(u.id, 'workflow.deleted', { id: q.params['id'] }); await firm.workflowsChanged(); return { ok: true }; });
  r.on('POST', '/v1/workflows/:id/publish', async (q) => { const u = user(q); const file = await firm.workflows.publish(q.params['id']!, u.name); firm.audit.append(u.id, 'workflow.published', { id: q.params['id'], file }); return { ok: true, file }; });
  r.on('GET', '/v1/workflows/:id/export', (q) => { user(q); const w = firm.workflows.get(q.params['id']!); if (!w) throw new HttpError(404, 'Workflow not found.'); sendText(q.res, 200, JSON.stringify(w.def, null, 2), 'application/json', { 'content-disposition': `attachment; filename="${w.def.name.replace(/[^\w]+/g, '-')}.json"` }); return undefined; });

  // ------------------------------------------------------------ server
  const serveStatic = async (pathname: string, res: ServerResponse): Promise<boolean> => {
    if (!opts.static_dir) return false;
    const rel = pathname === '/' ? '/index.html' : pathname;
    const target = normalize(join(opts.static_dir, rel));
    if (!target.startsWith(normalize(opts.static_dir))) return false;
    try { const s = await stat(target); if (!s.isFile()) return false; res.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' }); res.end(await readFile(target)); return true; } catch { return false; }
  };

  return createServer(async (raw, res) => {
    const url = new URL(raw.url ?? '/', 'http://localhost');
    const method = raw.method ?? 'GET';
    try {
      if (!url.pathname.startsWith('/v1/')) {
        if (method === 'GET' && (await serveStatic(url.pathname, res))) return;
        if (method === 'GET' && opts.static_dir && !extname(url.pathname) && (await serveStatic('/', res))) return;
        return send(res, 404, { error: 'not found' });
      }
      if (url.pathname === '/v1/health') return send(res, 200, { ok: true });
      const hit = r.match(method, url.pathname);
      if (!hit) return send(res, 404, { error: 'not found' });
      const out = await hit.handler({ raw, res, method, path: url.pathname, url, params: hit.params, cookies: parseCookies(raw.headers.cookie) });
      if (out !== undefined && !res.headersSent) send(res, res.statusCode && res.statusCode !== 200 ? res.statusCode : 200, out);
    } catch (e) {
      const err = e as Error & { status?: number; code?: string; rule?: string };
      const status = e instanceof HttpError ? e.status : e instanceof AuthError ? err.status ?? 401 : err.name === 'ApprovalError' || err.name === 'LedgerInvariantError' ? 409 : 500;
      if (status === 500) console.error(e);
      send(res, status, { error: err.message, code: err.code ?? err.rule ?? err.name });
    }
  });
}
