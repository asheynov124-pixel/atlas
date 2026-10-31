/**
 * Task Ledger — durable DAG of tasks with status, owner, dependencies, budgets.
 * Invariants (spec §5.4, tightened in v1.1):
 *  1. Exactly one owner at a time; ownership changes are logged.
 *  2. No transition to `accepted` without at least one GraderRecord.
 *  3. `risk_tier_ceiling` bounds the tools a task may invoke (enforced by the Gate Engine at call time).
 *  4. Budgets are hard limits; exceeding one fails the task and escalates to the Lead.
 *  5. A task is `ready` only when every dependency is `accepted`.
 */
import type { ActionTier, Budget, GraderRecord, Run, Task, TaskStatus, Topology, OutcomeRubric } from '../core/types.js';
import { makeId, nowIso } from '../core/types.js';
import { EventStream } from '../core/events.js';

export class LedgerInvariantError extends Error {
  constructor(message: string, readonly rule: string) {
    super(message);
    this.name = 'LedgerInvariantError';
  }
}

export interface LedgerLogEntry {
  seq: number;
  at: string;
  kind: 'run' | 'task' | 'ownership' | 'transition' | 'grade' | 'spend' | 'checkpoint';
  run_id: string;
  task_id?: string;
  detail: Record<string, unknown>;
}

export interface LogSink {
  append(entry: LedgerLogEntry): void;
}

const ALLOWED: Record<TaskStatus, TaskStatus[]> = {
  pending: ['ready', 'cancelled'],
  ready: ['running', 'cancelled'],
  running: ['awaiting_grade', 'blocked', 'failed', 'cancelled'],
  blocked: ['running', 'awaiting_grade', 'revising', 'failed', 'cancelled'],
  awaiting_grade: ['accepted', 'revising', 'blocked', 'failed'],
  revising: ['running', 'failed', 'cancelled'],
  accepted: [],
  failed: [],
  cancelled: [],
};

export class TaskLedger {
  private runs = new Map<string, Run>();
  private tasks = new Map<string, Task>();
  private grades = new Map<string, GraderRecord>();
  private log: LedgerLogEntry[] = [];
  private seq = 0;

  constructor(readonly events: EventStream, private sink?: LogSink) {}

  private record(entry: Omit<LedgerLogEntry, 'seq' | 'at'>): void {
    const full: LedgerLogEntry = { seq: ++this.seq, at: nowIso(), ...entry };
    this.log.push(full);
    this.sink?.append(full);
  }

  get entries(): readonly LedgerLogEntry[] {
    return this.log;
  }

  createRun(input: {
    workspace_id: string;
    goal: string;
    topology?: Topology;
    budget: Budget;
    risk_tier_ceiling?: ActionTier;
    rubric?: OutcomeRubric;
  }): Run {
    const run: Run = {
      run_id: makeId('run'),
      workspace_id: input.workspace_id,
      goal: input.goal,
      topology: input.topology ?? 'hierarchical',
      status: 'planning',
      budget: input.budget,
      spend: { tokens: 0, usd: 0 },
      risk_tier_ceiling: input.risk_tier_ceiling ?? 1,
      ...(input.rubric ? { rubric: input.rubric } : {}),
      artifact_ids: [],
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    this.runs.set(run.run_id, run);
    this.record({ kind: 'run', run_id: run.run_id, detail: { goal: run.goal, budget: run.budget } });
    return run;
  }

  getRun(run_id: string): Run {
    const r = this.runs.get(run_id);
    if (!r) throw new Error(`unknown run ${run_id}`);
    return r;
  }

  listRuns(): Run[] {
    return [...this.runs.values()];
  }

  setRunStatus(run_id: string, status: Run['status']): Run {
    const r = this.getRun(run_id);
    r.status = status;
    r.updated_at = nowIso();
    this.record({ kind: 'run', run_id, detail: { status } });
    return r;
  }

  addTask(input: {
    run_id: string;
    type: string;
    inputs?: Record<string, unknown>;
    depends_on?: string[];
    budget: Budget;
    risk_tier_ceiling?: ActionTier;
    outcome_rubric_id?: string;
    parent_task_id?: string;
  }): Task {
    const run = this.getRun(input.run_id);
    const ceiling = input.risk_tier_ceiling ?? run.risk_tier_ceiling;
    if (ceiling > run.risk_tier_ceiling) {
      throw new LedgerInvariantError(
        `task ceiling ${ceiling} exceeds run ceiling ${run.risk_tier_ceiling}`,
        'ceiling_within_run',
      );
    }
    for (const dep of input.depends_on ?? []) {
      if (!this.tasks.has(dep)) throw new LedgerInvariantError(`unknown dependency ${dep}`, 'dependency_exists');
    }
    const task: Task = {
      task_id: makeId('tsk'),
      run_id: input.run_id,
      ...(input.parent_task_id ? { parent_task_id: input.parent_task_id } : {}),
      type: input.type,
      status: 'pending',
      depends_on: input.depends_on ?? [],
      inputs: input.inputs ?? {},
      ...(input.outcome_rubric_id ? { outcome_rubric_id: input.outcome_rubric_id } : {}),
      budget: input.budget,
      spend: { tokens: 0, usd: 0 },
      risk_tier_ceiling: ceiling,
      attempts: 0,
      artifacts: [],
      evidence_refs: [],
      grader_record_ids: [],
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    this.tasks.set(task.task_id, task);
    this.record({ kind: 'task', run_id: task.run_id, task_id: task.task_id, detail: { type: task.type, depends_on: task.depends_on } });
    this.refreshReadiness(task.run_id);
    return task;
  }

  getTask(task_id: string): Task {
    const t = this.tasks.get(task_id);
    if (!t) throw new Error(`unknown task ${task_id}`);
    return t;
  }

  tasksForRun(run_id: string): Task[] {
    return [...this.tasks.values()].filter((t) => t.run_id === run_id);
  }

  /** Invariant 5: readiness is derived, never set by hand. */
  refreshReadiness(run_id: string): void {
    for (const t of this.tasksForRun(run_id)) {
      if (t.status !== 'pending') continue;
      const ok = t.depends_on.every((d) => this.getTask(d).status === 'accepted');
      if (ok) this.transition(t.task_id, 'ready', 'dependencies met');
    }
  }

  readyTasks(run_id: string): Task[] {
    return this.tasksForRun(run_id).filter((t) => t.status === 'ready');
  }

  /** Invariant 1: single owner, logged. */
  claim(task_id: string, agent_id: string): Task {
    const t = this.getTask(task_id);
    if (t.status !== 'ready' && t.status !== 'revising' && t.status !== 'blocked') {
      throw new LedgerInvariantError(`cannot claim task in status ${t.status}`, 'claim_requires_ready');
    }
    const previous = t.owner_agent_id;
    t.owner_agent_id = agent_id;
    t.attempts += 1;
    this.record({ kind: 'ownership', run_id: t.run_id, task_id, detail: { from: previous ?? null, to: agent_id } });
    this.transition(task_id, 'running', `claimed by ${agent_id}`);
    return t;
  }

  transition(task_id: string, to: TaskStatus, reason = ''): Task {
    const t = this.getTask(task_id);
    const from = t.status;
    if (!ALLOWED[from].includes(to)) {
      throw new LedgerInvariantError(`illegal transition ${from} → ${to}`, 'legal_transition');
    }
    if (to === 'accepted' && t.grader_record_ids.length === 0) {
      throw new LedgerInvariantError('accepted requires a grader record', 'accepted_requires_grade');
    }
    t.status = to;
    t.updated_at = nowIso();
    this.record({ kind: 'transition', run_id: t.run_id, task_id, detail: { from, to, reason } });
    if (to === 'accepted') this.refreshReadiness(t.run_id);
    return t;
  }

  recordGrade(record: GraderRecord): void {
    const t = this.getTask(record.task_id);
    this.grades.set(record.id, record);
    t.grader_record_ids.push(record.id);
    this.record({ kind: 'grade', run_id: t.run_id, task_id: t.task_id, detail: { id: record.id, kind: record.kind, score: record.score, decision: record.decision } });
    this.events.emit('grader.result', { task_id: t.task_id, kind: record.kind, score: record.score, decision: record.decision, critique: record.critique }, t.run_id);
  }

  gradesFor(task_id: string): GraderRecord[] {
    return this.getTask(task_id).grader_record_ids.map((id) => this.grades.get(id)!).filter(Boolean);
  }

  /** Invariant 4: budgets are hard. Returns the fraction of run budget consumed. */
  addSpend(task_id: string, tokens: number, usd: number): { task_fraction: number; run_fraction: number } {
    const t = this.getTask(task_id);
    const run = this.getRun(t.run_id);
    t.spend.tokens += tokens;
    t.spend.usd += usd;
    run.spend.tokens += tokens;
    run.spend.usd += usd;
    this.record({ kind: 'spend', run_id: run.run_id, task_id, detail: { tokens, usd } });
    const task_fraction = Math.max(t.spend.tokens / t.budget.max_tokens, t.spend.usd / t.budget.max_usd);
    const run_fraction = Math.max(run.spend.tokens / run.budget.max_tokens, run.spend.usd / run.budget.max_usd);
    if (task_fraction > 1 && t.status === 'running') {
      this.transition(task_id, 'failed', 'task budget exceeded');
    }
    return { task_fraction, run_fraction };
  }

  checkpoint(task_id: string, state: unknown): void {
    const t = this.getTask(task_id);
    t.checkpoint = state;
    this.record({ kind: 'checkpoint', run_id: t.run_id, task_id, detail: { bytes: JSON.stringify(state).length } });
  }

  attachArtifact(task_id: string, artifact_id: string): void {
    this.getTask(task_id).artifacts.push(artifact_id);
  }

  attachEvidence(task_id: string, evidence_id: string): void {
    this.getTask(task_id).evidence_refs.push(evidence_id);
  }

  summary(run_id: string): Record<TaskStatus, number> & { total: number } {
    const out = { pending: 0, ready: 0, running: 0, blocked: 0, awaiting_grade: 0, revising: 0, accepted: 0, failed: 0, cancelled: 0, total: 0 };
    for (const t of this.tasksForRun(run_id)) {
      out[t.status] += 1;
      out.total += 1;
    }
    return out;
  }
}
