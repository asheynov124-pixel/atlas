/**
 * One matter: a sealed kernel (its own L2/L3, ledger, approvals, gate audit) plus its
 * documents, workflows, conversation, deadlines and tripwires. Nothing in one matter can
 * retrieve from another; that is the ethical screen, enforced by construction.
 * Every state change is snapshotted to SQLite (debounced), so a restart loses nothing.
 */
import { readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { createKernel, type Kernel } from '../kernel/bootstrap.js';
import type { RunConfig } from '../kernel/run.js';
import type { SpanPointer, KernelEvent } from '../core/types.js';
import { nowIso, makeId } from '../core/types.js';
import { DocumentIndex, SUPPORTED, type DocRecord } from '../ingest/documents.js';
import { makePointer } from '../memory/episodic.js';
import { json } from '../store/db.js';
import type { Firm } from './firm.js';
import type { TemplateContext, WorkflowTemplate } from '../app/context.js';
import { keyFacts, recordSentences, isWorkProduct } from '../app/context.js';
import { reviewTemplate } from '../app/templates/review.js';
import { replyTemplate } from '../app/templates/reply.js';
import { sumfTemplate } from '../app/templates/sumf.js';
import { simulatorTemplate } from '../app/templates/simulator.js';
import { researchTemplate, lawCite } from '../app/templates/research.js';
import { PACK } from '../app/templates/pack/index.js';
import { compile } from '../workflows/definition.js';
import { findTriggers } from '../deadlines/triggers.js';
import { RULES, compute, computeContract, type Computed, parseIso, iso } from '../deadlines/rules.js';
import { toIcs } from '../deadlines/ics.js';

export interface MatterRow { id: string; name: string; client: string | null; docs_dir: string; status: string; created_by: string; created_at: string }
export interface ChatMessage { role: 'user' | 'meridian'; text: string; at: string; by?: string; run_id?: string; meta?: Record<string, unknown> }
export interface DeadlineRow { id: string; matter_id: string; rule_id: string; title: string; due: string; trigger: { kind: string; date: string; label: string; pointer?: string; cite?: string }; math: Computed; status: 'proposed' | 'calendared' | 'rejected' | 'superseded'; approval_id: string | null; source_doc: string | null; created_at: string; decided_by: string | null }
export interface TripwireRow { id: string; matter_id: string; doc: string; paragraph: number; text: string; keys: ReturnType<typeof keyFacts>; status: 'armed' | 'tripped'; tripped_by: string | null; tripped_at: string | null; detail: { pointer: string; cite: string; sentence: string; why: string } | null }

const DISPUTE = /\b(dispute[sd]?|denie[sd]|deny|reject(?:ed|s)?|refused|contrary|never|did not)\b/i;

export class MatterRuntime {
  kernel!: Kernel;
  docs!: DocumentIndex;
  templates: Record<string, WorkflowTemplate> = {};
  conversation: ChatMessage[] = [];
  private saveTimer: NodeJS.Timeout | null = null;
  private watcher: FSWatcher | null = null;
  private syncing: Promise<void> | null = null;
  private lawRecords = new Map<string, SpanPointer>();

  constructor(readonly firm: Firm, readonly row: MatterRow) {}

  get id(): string { return this.row.id; }
  get dataDir(): string { return join(this.firm.dataDir, 'matters', this.id); }

  async init(): Promise<this> {
    this.kernel = createKernel({ provider: this.firm.provider, concurrency: this.firm.concurrency });
    this.docs = new DocumentIndex(this.kernel.l2, this.id, this.firm.provider.transcribePdfPage ? (b64) => this.firm.provider.transcribePdfPage!(b64) : undefined);
    this.restore();
    this.registerTools();
    this.buildTemplates();
    this.reattachRuns();
    this.kernel.events.on((e) => this.onEvent(e));
    await mkdir(this.row.docs_dir, { recursive: true });
    await this.syncDocs();
    if (this.firm.watchFolders) this.startWatch();
    return this;
  }

  // ---------------------------------------------------------------- persistence
  private restore(): void {
    const rows = this.firm.db.prepare('SELECT store, json FROM snapshots WHERE matter_id = ?').all(this.id) as Array<{ store: string; json: string }>;
    const snap = Object.fromEntries(rows.map((r) => [r.store, JSON.parse(r.json)]));
    if (snap['l2']) this.kernel.l2.restore(snap['l2']);
    if (snap['l3']) this.kernel.l3.restore(snap['l3']);
    if (snap['ledger']) this.kernel.ledger.restore(snap['ledger']);
    if (snap['inbox']) this.kernel.inbox.restore(snap['inbox']);
    if (snap['events']) this.kernel.events.restore(snap['events']);
    if (snap['gate']) this.kernel.gate.restoreAudit(snap['gate']);
    if (snap['lead']) this.kernel.lead.restore(snap['lead']);
    if (snap['docs']) this.docs.restore(snap['docs']);
    if (snap['conversation']) this.conversation = snap['conversation'];
    if (snap['law']) this.lawRecords = new Map(snap['law']);
    const maxTool = this.kernel.l2.all().reduce((n, r) => Math.max(n, Number(/^tool_(\d+)$/.exec(r.turn_id)?.[1] ?? 0)), 0);
    this.kernel.tools.setSeq(maxTool);
  }

  scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.saveNow(); }, 250);
  }

  saveNow(): void {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    const stores: Record<string, unknown> = {
      l2: this.kernel.l2.serialize(), l3: this.kernel.l3.serialize(), ledger: this.kernel.ledger.serialize(), inbox: this.kernel.inbox.serialize(),
      events: this.kernel.events.history.slice(-3000), gate: this.kernel.gate.audit.slice(-3000), lead: this.kernel.lead.serialize(),
      docs: this.docs.serialize(), conversation: this.conversation, law: [...this.lawRecords.entries()],
    };
    const db = this.firm.db;
    const at = nowIso();
    db.exec('BEGIN');
    try {
      const st = db.prepare('INSERT INTO snapshots (matter_id, store, json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(matter_id, store) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at');
      for (const [k, v] of Object.entries(stores)) st.run(this.id, k, JSON.stringify(v), at);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  private onEvent(e: KernelEvent): void {
    this.scheduleSave();
    const auditable: Record<string, string> = { 'approval.requested': 'approval.requested', 'approval.decided': 'approval.decided', 'approval.invalidated': 'approval.invalidated', 'approval.expired': 'approval.expired', 'policy.blocked': 'gate.blocked', 'plan.approved': 'plan.approved', 'run.completed': 'run.completed', 'run.failed': 'run.failed', 'memory.quarantined': 'memory.quarantined', 'tripwire.tripped': 'tripwire.tripped', 'deadline.proposed': 'deadline.proposed' };
    const action = auditable[e.event];
    if (action) {
      const actor = String(e.payload['reviewer'] ?? e.payload['approver'] ?? 'system');
      const detail: Record<string, unknown> = { ...e.payload, ...(e.run_id ? { run_id: e.run_id } : {}) };
      if (e.event === 'approval.decided') {
        // Record exactly what the reviewer saw when they decided.
        const p = this.kernel.inbox.get(String(e.payload['approval_id']));
        detail['payload_as_seen'] = { action: p.action, target: p.target, preview: p.diff.preview, edited_preview: p.edited_preview ?? null, evidence_refs: p.evidence_refs, state_snapshot: p.state_snapshot, uncertainty_notes: p.uncertainty_notes, decided_via_delegation: p.decided_via_delegation ?? null };
      }
      this.firm.audit.append(actor, action, detail, this.id);
    }
  }

  // ---------------------------------------------------------------- tools
  private registerTools(): void {
    const outbox = join(this.dataDir, 'outbox');
    this.kernel.tools.register('mail.draft', async (args) => ({ text: `DRAFT to ${String(args['to'])}:\n${String(args['body'] ?? '')}`, source: 'mail.draft' }));
    this.kernel.tools.register('mail.send', async (args) => {
      if (args['__dry_run']) return { text: String(args['body'] ?? ''), state_snapshot: { thread: String(args['thread_id'] ?? 'new'), to: args['to'] }, alternatives: ['save_as_draft', 'edit_then_send', 'reject'] };
      // This build does not deliver mail. The approved message is written to the matter's outbox as an .eml file.
      await mkdir(outbox, { recursive: true });
      const to = Array.isArray(args['target']) ? (args['target'] as string[]).join(', ') : String(args['target']);
      const file = join(outbox, `${new Date().toISOString().replace(/[:.]/g, '-')}.eml`);
      await writeFile(file, `To: ${to}\nSubject: ${this.row.name}\nX-Meridian-Approval: ${String(args['__approved'])}\n\n${String(args['body'])}\n`);
      return { text: `Approved message for ${to} saved to the outbox (${relative(this.firm.dataDir, file)}). Meridian does not deliver mail in this build.`, source: 'mail.send' };
    });
    this.kernel.tools.register('calendar.add_deadline', async (args) => {
      const target = (args['target'] ?? args) as { deadline_id?: string; title?: string; due?: string };
      if (args['__dry_run']) return { text: String(args['body'] ?? ''), state_snapshot: { deadline_id: target.deadline_id, due: target.due }, alternatives: ['reject'] };
      const id = String(target.deadline_id);
      this.firm.db.prepare("UPDATE deadlines SET status = 'calendared', decided_by = ? WHERE id = ?").run(String(args['__approved'] ?? ''), id);
      await this.writeIcs();
      const d = this.deadline(id);
      return { text: `Calendared: ${d?.title} on ${d?.math.due_pretty}. Download the matter calendar (.ics) from the Deadlines view.`, source: 'calendar.add_deadline' };
    });
  }

  lawPointer(case_id: string): SpanPointer | null {
    const hit = this.lawRecords.get(case_id);
    if (hit && this.kernel.l2.resolve(hit)) return hit;
    const c = this.firm.library.getCase(case_id);
    if (!c) return null;
    const turn = `${case_id.replace(/[^a-z0-9]+/gi, '-')}-${this.lawRecords.size + 1}`;
    const ptr = this.kernel.l2.append({ run_id: 'law', turn_id: turn, role: 'tool', text: c.text, trusted: true, source: case_id }, this.id);
    this.lawRecords.set(case_id, ptr);
    this.scheduleSave();
    return ptr;
  }

  /** Human cite for any pointer in this matter: record cite, case pin cite, or null. */
  citeFor(pointer: string): string | null {
    return this.docs.citeFor(pointer) ?? lawCite(this.ctx(), pointer);
  }

  ctx(): TemplateContext {
    return { kernel: this.kernel, docs: this.docs, lib: this.firm.library, agent: this.firm.agent, matter: { id: this.id, name: this.row.name, client: this.row.client }, lawPointer: (id) => this.lawPointer(id), armTripwires: (doc, paras) => this.armTripwires(doc, paras) };
  }

  buildTemplates(): void {
    const ctx = this.ctx();
    const t: Record<string, WorkflowTemplate> = { review: reviewTemplate(ctx), reply: replyTemplate(ctx), sumf: sumfTemplate(ctx), simulate: simulatorTemplate(ctx), research: researchTemplate(ctx) };
    for (const [k, make] of Object.entries(PACK)) t[k] = make(ctx);
    for (const w of this.firm.workflows.list()) t[w.id] = compile(w.def, ctx);
    this.templates = t;
  }

  runConfig(template: string, goal: string, opts: { budget_usd?: number; user?: string } = {}): RunConfig {
    const tpl = this.templates[template];
    if (!tpl) throw new Error(`unknown workflow ${template}`);
    return { workspace_id: this.id, goal, topology: 'hierarchical', budget: { max_tokens: 50_000_000, max_usd: opts.budget_usd ?? tpl.default_budget_usd ?? 25 }, risk_tier_ceiling: tpl.risk_tier_ceiling ?? 1, rubric: tpl.rubric, planner: tpl.planner, executor: tpl.executor, reviewer_rbac: ['workspace:owner', 'role:approver'], template, ...(opts.user ? { started_by: opts.user } : {}) };
  }

  private reattachRuns(): void {
    for (const run of this.kernel.ledger.listRuns()) {
      const meta = this.kernel.lead.runMeta.get(run.run_id);
      if (!meta || this.kernel.lead.hasConfig(run.run_id) || !this.templates[meta.template]) continue;
      const cfg = this.runConfig(meta.template, run.goal, { budget_usd: run.budget.max_usd });
      this.kernel.lead.rehydrate(run.run_id, { ...cfg, budget: run.budget, risk_tier_ceiling: run.risk_tier_ceiling, ...(run.rubric ? { rubric: run.rubric } : {}) });
    }
  }

  // ---------------------------------------------------------------- documents & docket watch
  async syncDocs(): Promise<DocRecord[]> {
    if (this.syncing) { await this.syncing; }
    const created: DocRecord[] = [];
    const run = async () => {
      const walk = async (dir: string): Promise<string[]> => {
        let entries: string[] = [];
        try { entries = await readdir(dir); } catch { return []; }
        const out: string[] = [];
        for (const e of entries) {
          if (e.startsWith('.')) continue;
          const p = join(dir, e);
          const s = await stat(p).catch(() => null);
          if (!s) continue;
          if (s.isDirectory()) out.push(...(await walk(p)));
          else if (SUPPORTED.has(extname(e).toLowerCase())) out.push(p);
        }
        return out;
      };
      for (const abs of (await walk(this.row.docs_dir)).sort()) {
        const rel = relative(this.row.docs_dir, abs);
        const r = await this.docs.ingestIfChanged(abs, rel);
        if (r?.created) created.push(r.doc);
      }
    };
    this.syncing = run();
    try { await this.syncing; } finally { this.syncing = null; }
    for (const d of created) {
      this.kernel.events.emit('doc.ingested', { doc_id: d.id, name: d.name, pages: d.pages, bates_first: d.bates_first ?? null, bates_last: d.bates_last ?? null, scanned_pages: d.scanned_pages });
      this.firm.audit.append('system', 'doc.ingested', { doc: d.rel, sha256: d.sha256, pages: d.pages }, this.id);
      this.scanDeadlines(d);
      this.checkTripwires(d);
    }
    if (created.length) this.scheduleSave();
    return created;
  }

  private startWatch(): void {
    let t: NodeJS.Timeout | null = null;
    try {
      this.watcher = watch(this.row.docs_dir, { recursive: true }, () => { if (t) clearTimeout(t); t = setTimeout(() => { void this.syncDocs().catch(() => {}); }, 600); });
      this.watcher.unref?.();
    } catch { this.watcher = null; }
  }

  close(): void { this.watcher?.close(); this.saveNow(); }

  // ---------------------------------------------------------------- deadlines
  deadlines(): DeadlineRow[] {
    return (this.firm.db.prepare('SELECT * FROM deadlines WHERE matter_id = ? ORDER BY due').all(this.id) as Array<Record<string, unknown>>).map((r) => ({ ...(r as unknown as DeadlineRow), trigger: json(r['trigger'] as string, { kind: '', date: '', label: '' }), math: json(r['math'] as string, {} as Computed) }));
  }
  deadline(id: string): DeadlineRow | undefined { return this.deadlines().find((d) => d.id === id); }

  propose(math: Computed, trigger: DeadlineRow['trigger'], sourceDoc: string | null, title: string): DeadlineRow | null {
    const dup = this.firm.db.prepare("SELECT id FROM deadlines WHERE matter_id = ? AND rule_id = ? AND due = ? AND title = ? AND status IN ('proposed','calendared')").get(this.id, math.rule_id, math.due, title);
    if (dup) return null;
    const id = makeId('ddl');
    const preview = [`${title}: ${math.due_pretty}`, '', ...math.steps.map((s) => `• ${s.text}`), ...(math.warnings.length ? ['', ...math.warnings.map((w) => `⚠ ${w}`)] : []), '', `Verify: ${math.verify}`].join('\n');
    const approval = this.kernel.inbox.create({ run_id: 'docket', action: 'calendar.add_deadline', target: { deadline_id: id, title, due: math.due }, diff: { kind: 'calendar_entry', preview }, evidence_refs: trigger.pointer ? [trigger.pointer] : [], state_snapshot: { deadline_id: id, due: math.due }, alternatives: ['reject'], reviewer_rbac: ['workspace:owner', 'role:approver'], uncertainty_notes: math.warnings, ttl_ms: 7 * 86_400_000 });
    this.firm.db.prepare('INSERT INTO deadlines (id, matter_id, rule_id, title, due, trigger, math, status, approval_id, source_doc, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, this.id, math.rule_id, title, math.due, JSON.stringify(trigger), JSON.stringify(math), 'proposed', approval.approval_id, sourceDoc, nowIso());
    this.kernel.events.emit('deadline.proposed', { deadline_id: id, title, due: math.due, approval_id: approval.approval_id });
    return this.deadline(id)!;
  }

  scanDeadlines(doc: DocRecord): DeadlineRow[] {
    const text = this.docs.text(doc.id);
    const out: DeadlineRow[] = [];
    for (const t of findTriggers(text)) {
      const pointer = makePointer('docs', doc.id, t.start, t.end);
      const cite = this.docs.citeFor(pointer) ?? doc.name;
      if (t.kind === 'contract_event') {
        const stated = /\bby\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2})/.exec(t.sentence)?.[1];
        if (!stated || !t.days) continue;
        const dueIso = iso(new Date(`${stated} UTC`));
        const trig = iso(new Date(parseIso(dueIso).getTime() - t.days * 86_400_000));
        // Find the record event on the back-solved trigger date, so the clock's start is proven, not assumed.
        // Prefer the record document itself over an attorney's description of it.
        const ranked = recordSentences(this.docs).filter((s) => keyFacts(s.text).dates.includes(trig) && !isWorkProduct(this.docs.get(s.doc_id)?.name ?? '')).map((s) => {
          const d = this.docs.get(s.doc_id)!;
          const line = d.lines.find((l) => l.start <= s.start && l.end >= s.start);
          // The notice itself names itself nearby ("Re: Notice of Defect"); a reply only mentions it.
          const near = d.lines.filter((l) => l.page === line?.page && Math.abs(l.line - (line?.line ?? 0)) <= 3).map((l) => this.docs.text(d.id).slice(l.start, l.end)).join(' ');
          const score = (/notice/i.test(s.text) ? 2 : 0) + (/engagement|memo/i.test(d.name) ? 0 : 3) + (/notice of|notice is given|gives notice/i.test(near) ? 3 : 0);
          return { s, score };
        }).filter((x) => x.score >= 2).sort((a, b) => b.score - a.score);
        const evidenceSentence = ranked[0]?.s;
        const math = computeContract(t.label, t.days, trig, { trigger_label: evidenceSentence ? `Notice (${evidenceSentence.text.slice(0, 80)})` : 'Trigger inferred from the stated date', source_cite: evidenceSentence?.cite ?? cite, clause: t.clause ?? 'Contract' });
        math.steps.push({ text: math.due === dueIso ? `Cross-check: matches the date stated in ${doc.name} (${cite}).` : `Cross-check failed: ${doc.name} states ${stated}, but the computation gives ${math.due_pretty}.` });
        if (!evidenceSentence) math.warnings.push('No record document proves the notice date. The trigger was back-solved from the stated deadline.');
        const row = this.propose(math, { kind: t.kind, date: trig, label: t.label, pointer: evidenceSentence?.pointer ?? pointer, cite: evidenceSentence?.cite ?? cite }, doc.id, t.label);
        if (row) out.push(row);
        continue;
      }
      for (const rule of RULES.filter((r) => r.trigger === t.kind)) {
        const math = compute(rule, t.date, { trigger_label: t.label, source_cite: cite });
        const row = this.propose(math, { kind: t.kind, date: t.date, label: t.label, pointer, cite }, doc.id, `${rule.label} (${rule.cite})`);
        if (row) out.push(row);
      }
    }
    return out;
  }

  async writeIcs(): Promise<string> {
    const events = this.deadlines().filter((d) => d.status === 'calendared').map((d) => ({ uid: d.id, date: d.due, title: `${this.row.name}: ${d.title}`, description: `${d.math.steps.map((s) => s.text).join('\n')}\nVerify: ${d.math.verify}` }));
    const ics = toIcs(events, `${this.row.name} deadlines`);
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(join(this.dataDir, 'calendar.ics'), ics);
    return ics;
  }

  // ---------------------------------------------------------------- tripwires
  armTripwires(doc_id: string, paragraphs: Array<{ n: number; text: string }>): void {
    for (const p of paragraphs) {
      const id = `tw_${this.id}_${doc_id}_${p.n}`;
      this.firm.db.prepare("INSERT INTO tripwires (id, matter_id, doc, paragraph, text, keys, status) VALUES (?, ?, ?, ?, ?, ?, 'armed') ON CONFLICT(id) DO UPDATE SET text = excluded.text, keys = excluded.keys, status = 'armed', tripped_by = NULL, tripped_at = NULL, detail = NULL").run(id, this.id, doc_id, p.n, p.text, JSON.stringify(keyFacts(p.text)));
    }
  }

  tripwires(): TripwireRow[] {
    return (this.firm.db.prepare('SELECT * FROM tripwires WHERE matter_id = ? ORDER BY doc, paragraph').all(this.id) as Array<Record<string, unknown>>).map((r) => ({ ...(r as unknown as TripwireRow), keys: json(r['keys'] as string, keyFacts('')), detail: json(r['detail'] as string, null) }));
  }

  checkTripwires(doc: DocRecord): TripwireRow[] {
    const armed = this.tripwires().filter((t) => t.status === 'armed' && t.doc !== doc.id);
    if (!armed.length) return [];
    const tripped: TripwireRow[] = [];
    const sentences = recordSentences(this.docs).filter((s) => s.doc_id === doc.id);
    for (const t of armed) {
      for (const s of sentences) {
        const f = keyFacts(s.text);
        const shared = t.keys.words.filter((w) => f.words.includes(w));
        if (shared.length < 2) continue;
        const dateConflict = f.dates.length > 0 && t.keys.dates.length > 0 && !f.dates.some((d) => t.keys.dates.includes(d));
        const timeConflict = f.times.length > 0 && t.keys.times.length > 0 && !f.times.some((x) => t.keys.times.includes(x));
        const denial = DISPUTE.test(s.text) && !DISPUTE.test(t.text);
        if (!(dateConflict || timeConflict || denial)) continue;
        const why = timeConflict ? `the new document gives ${f.times.join(', ')} for the same event` : dateConflict ? 'the new document ties a different date to the same subject' : 'the new document contests it';
        const detail = { pointer: s.pointer, cite: s.cite, sentence: s.text, why };
        this.firm.db.prepare("UPDATE tripwires SET status = 'tripped', tripped_by = ?, tripped_at = ?, detail = ? WHERE id = ?").run(doc.id, nowIso(), JSON.stringify(detail), t.id);
        this.kernel.events.emit('tripwire.tripped', { tripwire_id: t.id, paragraph: t.paragraph, doc: t.doc, by_doc: doc.name, cite: s.cite, why, sentence: s.text });
        tripped.push({ ...t, status: 'tripped', tripped_by: doc.id, tripped_at: nowIso(), detail });
        break;
      }
    }
    return tripped;
  }
}
