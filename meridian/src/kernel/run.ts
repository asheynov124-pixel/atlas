/**
 * Lead Agent Runtime: owns a Run end to end.
 *   plan → (planning checkpoint) → ledger DAG → schedule specialists → grade →
 *   revise/accept → integrate → archive (L2 record, L3 claims via quarantine).
 */
import type { ActionTier, Budget, EvidenceRef, OutcomeRubric, Run, Task, Topology } from '../core/types.js';
import { makeId, nowIso } from '../core/types.js';
import { EventStream } from '../core/events.js';
import { TaskLedger } from '../ledger/ledger.js';
import { EpisodicStore } from '../memory/episodic.js';
import { SemanticGraph } from '../memory/graph.js';
import type { ModelProvider } from '../models/provider.js';
import type { Deliverable } from './deliverable.js';
import { GraderEnsemble } from './grader.js';
import { BudgetExceededError, Scheduler, Sentinel } from './scheduler.js';
import { ToolRuntime, type ToolOutcome } from './tools.js';

export interface TaskSpec {
  key: string;
  type: string;
  inputs?: Record<string, unknown>;
  depends_on?: string[];       // keys
  budget?: Partial<Budget>;
  risk_tier_ceiling?: ActionTier;
  /** Tools the planner expects this task to call; used for the planning checkpoint. */
  anticipated_tools?: string[];
}

export interface PlanContext {
  run: Run;
  provider: ModelProvider;
}

export interface Planner {
  plan(goal: string, ctx: PlanContext): Promise<TaskSpec[]>;
}

export interface SpecialistContext {
  task: Task;
  run: Run;
  provider: ModelProvider;
  tier_hint: 'fast' | null;
  /** Gate-checked tool call. */
  tool(name: string, args: Record<string, unknown>, opts?: { confidence?: number; topics?: string[] }): Promise<ToolOutcome>;
  /** Deliverables from accepted dependencies. */
  upstream: Array<{ task: Task; deliverable: Deliverable }>;
  critique?: string;
}

export interface SpecialistExecutor {
  execute(ctx: SpecialistContext): Promise<Deliverable>;
}

export interface RunConfig {
  workspace_id: string;
  goal: string;
  topology?: Topology;
  budget: Budget;
  risk_tier_ceiling?: ActionTier;
  rubric: OutcomeRubric;
  planner: Planner;
  executor: SpecialistExecutor;
  /** Projected minutes; triggers planning checkpoint when > 30. */
  projected_minutes?: number;
  reviewer_rbac?: string[];
}

export interface RunResult {
  run: Run;
  artifact_id: string;
  text: string;
  provenance: Array<{ marker: number; pointer: string; quote: string }>;
  deliverables: Map<string, Deliverable>;
  pending_approvals: string[];
  human_questions: Array<{ task_id: string; topic: string; because: string }>;
}

export class LeadRuntime {
  readonly artifacts = new Map<string, { run_id: string; text: string; created_at: string }>();
  private deliverables = new Map<string, Deliverable>();
  private configs = new Map<string, RunConfig>();
  private specs = new Map<string, Map<string, TaskSpec>>();
  private pendingPlans = new Map<string, () => void>();

  constructor(
    readonly ledger: TaskLedger,
    readonly tools: ToolRuntime,
    readonly graders: GraderEnsemble,
    readonly scheduler: Scheduler,
    readonly sentinel: Sentinel,
    readonly l2: EpisodicStore,
    readonly l3: SemanticGraph,
    readonly events: EventStream,
    readonly provider: ModelProvider,
    readonly gateTierOf: (tool: string) => ActionTier | null,
  ) {}

  deliverableOf(task_id: string): Deliverable | undefined {
    return this.deliverables.get(task_id);
  }

  /** Create the Run and write the DAG. Returns the run; call `execute` to drain it. */
  async start(cfg: RunConfig): Promise<{ run: Run; checkpoint_required: boolean; anticipated_tier3: string[]; task_count: number }> {
    const run = this.ledger.createRun({ workspace_id: cfg.workspace_id, goal: cfg.goal, topology: cfg.topology ?? 'hierarchical', budget: cfg.budget, risk_tier_ceiling: cfg.risk_tier_ceiling ?? 1, rubric: cfg.rubric });
    this.configs.set(run.run_id, cfg);
    const specs = await cfg.planner.plan(cfg.goal, { run, provider: this.provider });
    const byKey = new Map<string, TaskSpec>();
    const ids = new Map<string, string>();
    for (const s of specs) {
      byKey.set(s.key, s);
      const t = this.ledger.addTask({
        run_id: run.run_id, type: s.type, inputs: s.inputs ?? {},
        depends_on: (s.depends_on ?? []).map((k) => { const id = ids.get(k); if (!id) throw new Error(`plan references unknown key ${k}`); return id; }),
        budget: { max_tokens: s.budget?.max_tokens ?? 400_000, max_usd: s.budget?.max_usd ?? 1.2, ...(s.budget?.deadline ? { deadline: s.budget.deadline } : {}) },
        risk_tier_ceiling: s.risk_tier_ceiling ?? (cfg.risk_tier_ceiling ?? 1),
        outcome_rubric_id: cfg.rubric.id,
      });
      ids.set(s.key, t.task_id);
      byKey.set(t.task_id, s);
    }
    this.specs.set(run.run_id, byKey);

    // Planning checkpoint (§8.5): Tier 3 mutations anticipated, >1 external system, or >30 min.
    const anticipated = specs.flatMap((s) => s.anticipated_tools ?? []);
    const tier3 = [...new Set(anticipated.filter((t) => (this.gateTierOf(t) ?? 0) >= 3))];
    const systems = new Set(anticipated.map((t) => t.split('.')[0]));
    const checkpoint_required = tier3.length > 0 || systems.size > 1 || (cfg.projected_minutes ?? 0) > 30;
    const projected_usd = specs.reduce((n, s) => n + (s.budget?.max_usd ?? 1.2), 0);
    this.events.emit('plan.ready', { task_count: specs.length, projected_cost_usd: Math.min(projected_usd, cfg.budget.max_usd), tier3_actions_anticipated: tier3, checkpoint_required }, run.run_id);
    this.ledger.setRunStatus(run.run_id, checkpoint_required ? 'awaiting_plan_approval' : 'running');
    return { run, checkpoint_required, anticipated_tier3: tier3, task_count: specs.length };
  }

  /** Approving the plan confirms scope. It does not pre-approve Tier 3 actions. */
  approvePlan(run_id: string, approver: string): void {
    const run = this.ledger.getRun(run_id);
    if (run.status !== 'awaiting_plan_approval') throw new Error(`run is ${run.status}`);
    this.ledger.setRunStatus(run_id, 'running');
    this.events.emit('plan.approved', { approver, note: 'scope confirmed; Tier 3 actions still require individual approval' }, run_id);
    this.pendingPlans.get(run_id)?.();
  }

  async execute(run_id: string): Promise<RunResult> {
    const run = this.ledger.getRun(run_id);
    const cfg = this.configs.get(run_id)!;
    if (run.status === 'awaiting_plan_approval') {
      await new Promise<void>((resolve) => this.pendingPlans.set(run_id, resolve));
    }
    const pending_approvals: string[] = [];
    const human_questions: RunResult['human_questions'] = [];

    try {
      while (true) {
        const summary = this.ledger.summary(run_id);
        const live = summary.pending + summary.ready + summary.running + summary.awaiting_grade + summary.revising;
        if (live === 0) break;
        const batch = this.scheduler.next(run_id);
        if (batch.length === 0) {
          if (this.scheduler.active(run_id) === 0) break; // only blocked/failed remain
          await new Promise((r) => setTimeout(r, 1));
          continue;
        }
        await Promise.all(batch.map((b) => this.runTask(run, cfg, b.task_id, b.tier_hint, pending_approvals, human_questions)));
      }
    } catch (e) {
      if (e instanceof BudgetExceededError) {
        this.ledger.setRunStatus(run_id, 'failed');
        this.events.emit('run.failed', { reason: e.message, cost_usd: run.spend.usd }, run_id);
        throw e;
      }
      throw e;
    }

    return this.finalize(run_id, pending_approvals, human_questions);
  }

  /** Re-enter the loop after blocked tasks were unblocked (approval executed, question answered). */
  async resume(run_id: string): Promise<RunResult> {
    const run = this.ledger.getRun(run_id);
    if (run.status !== 'paused') throw new Error(`run is ${run.status}, not paused`);
    this.ledger.setRunStatus(run_id, 'running');
    return this.execute(run_id);
  }

  /**
   * An approved Tier 3 action was executed by the Tool Runtime. Fold the result into the
   * blocked task's deliverable and grade it like any other deliverable.
   */
  async completeBlocked(task_id: string, executed: { text: string; pointer: string }): Promise<void> {
    const task = this.ledger.getTask(task_id);
    if (task.status !== 'blocked') throw new Error(`task is ${task.status}, not blocked`);
    const cfg = this.configs.get(task.run_id)!;
    const d = this.deliverables.get(task_id) ?? { text: '', evidence: [], tokens_in: 0, tokens_out: 0, usd: 0 };
    // One sentence, so the evidence verifier sees the pointer beside every figure in the receipt.
    d.text = `${d.text}\nExecuted: ${executed.text.replace(/[.!?]\s+/g, '; ')} [[${executed.pointer}]].`;
    d.evidence.push(evidence(executed.pointer, executed.text));
    this.deliverables.set(task_id, d);
    this.ledger.transition(task_id, 'awaiting_grade', 'approved action executed');
    const verdict = await this.graders.grade(task, d, cfg.rubric);
    for (const r of verdict.records) this.ledger.recordGrade(r);
    this.ledger.addSpend(task_id, verdict.tokens, verdict.usd);
    this.ledger.transition(task_id, verdict.decision === 'accept' ? 'accepted' : 'failed', verdict.critique);
  }

  /** Blocked task whose Tier 2 question was answered: feed the answer back and re-run it. */
  answerQuestion(task_id: string, answer: string): void {
    const task = this.ledger.getTask(task_id);
    if (task.status !== 'blocked') throw new Error(`task is ${task.status}, not blocked`);
    task.inputs = { ...task.inputs, human_answer: answer };
    this.ledger.transition(task_id, 'revising', 'human answered; requeue');
  }

  private async finalize(run_id: string, pending_approvals: string[], human_questions: RunResult['human_questions']): Promise<RunResult> {
    const run = this.ledger.getRun(run_id);
    const cfg = this.configs.get(run_id)!;
    const summary = this.ledger.summary(run_id);
    const accepted = this.ledger.tasksForRun(run_id).filter((t) => t.status === 'accepted');

    if (summary.blocked > 0) {
      this.ledger.setRunStatus(run_id, 'paused');
      this.events.emit('run.paused', { blocked: summary.blocked, pending_approvals, human_questions: human_questions.length, cost_usd: Number(run.spend.usd.toFixed(4)) }, run_id);
      return { run, artifact_id: '', text: '', provenance: [], deliverables: this.deliverables, pending_approvals, human_questions };
    }

    const integrated = await this.integrate(run, cfg, accepted);
    const artifact_id = makeId('art');
    this.artifacts.set(artifact_id, { run_id, text: integrated.text, created_at: nowIso() });
    run.artifact_ids.push(artifact_id);

    // Archive: episodic record of the final artifact, then stage claims through quarantine.
    this.l2.append({ run_id, turn_id: `artifact_${artifact_id}`, role: 'artifact', text: integrated.text, trusted: true }, cfg.workspace_id);
    for (const t of accepted) {
      const d = this.deliverables.get(t.task_id);
      for (const c of d?.claims ?? []) this.l3.stage({ ...c, valid_from: nowIso(), run_id });
    }

    this.ledger.setRunStatus(run_id, summary.failed > 0 && accepted.length === 0 ? 'failed' : 'completed');
    this.events.emit('run.completed', { artifact_id, cost_usd: Number(run.spend.usd.toFixed(4)), tasks: this.ledger.summary(run_id), pending_approvals, human_questions: human_questions.length }, run_id);
    return { run, artifact_id, text: integrated.text, provenance: integrated.provenance, deliverables: this.deliverables, pending_approvals, human_questions };
  }

  private async runTask(run: Run, cfg: RunConfig, task_id: string, tier_hint: 'fast' | null, pending_approvals: string[], human_questions: RunResult['human_questions']): Promise<void> {
    const task = this.ledger.getTask(task_id);
    const agent_id = `agt_${task.type.split('.')[0]}_${task_id.slice(-4)}`;
    this.scheduler.start(run.run_id, task_id);
    try {
      this.ledger.claim(task_id, agent_id);
      this.events.emit('task.started', { task_id, type: task.type, owner: agent_id, attempt: task.attempts }, run.run_id);
      const upstream = task.depends_on.map((d) => ({ task: this.ledger.getTask(d), deliverable: this.deliverables.get(d)! })).filter((u) => u.deliverable);
      const lastCritique = this.ledger.gradesFor(task_id).filter((g) => g.kind === 'calibration').at(-1)?.critique;
      let blockedByGate: ToolOutcome | null = null;

      const ctx: SpecialistContext = {
        task, run, provider: this.provider, tier_hint, upstream, ...(lastCritique ? { critique: lastCritique } : {}),
        tool: async (name, args, opts = {}) => {
          const out = await this.tools.call({ tool: name, args, agent_id, task_id, run_id: run.run_id, tier_ceiling: task.risk_tier_ceiling, workspace_id: cfg.workspace_id, ...(cfg.reviewer_rbac ? { reviewer_rbac: cfg.reviewer_rbac } : {}), ...(opts.confidence !== undefined ? { confidence: opts.confidence } : {}), ...(opts.topics ? { topics: opts.topics } : {}), inside_sandbox: true });
          if (out.status !== 'ok') blockedByGate = out;
          if (this.sentinel.checkLoops(task_id, run.run_id)) throw new Error('sentinel: loop detected');
          return out;
        },
      };

      const d = await cfg.executor.execute(ctx);
      const spend = this.ledger.addSpend(task_id, d.tokens_in + d.tokens_out, d.usd);
      this.sentinel.checkBudget(run, spend.run_fraction);
      this.ledger.checkpoint(task_id, { stage: 'executed', text_len: d.text.length });

      if (blockedByGate) {
        const g = blockedByGate as ToolOutcome;
        if (g.status === 'pending_approval' && g.approval) pending_approvals.push(g.approval.approval_id);
        if (g.status === 'needs_human' && g.question) human_questions.push({ task_id, ...g.question });
        this.deliverables.set(task_id, d);
        if (task.status === 'running') this.ledger.transition(task_id, 'blocked', g.status === 'pending_approval' ? 'awaiting Tier 3 approval' : g.status === 'needs_human' ? 'awaiting human answer (Tier 2)' : `blocked: ${g.gate.rule_id}`);
        this.events.emit('task.blocked', { task_id, reason: g.gate.rule_id, status: g.status }, run.run_id);
        return;
      }
      if (task.status !== 'running') return; // failed on budget inside addSpend

      this.ledger.transition(task_id, 'awaiting_grade');
      const verdict = await this.graders.grade(task, d, cfg.rubric);
      for (const r of verdict.records) this.ledger.recordGrade(r);
      const gs = this.ledger.addSpend(task_id, verdict.tokens, verdict.usd);
      this.sentinel.checkBudget(run, gs.run_fraction);
      this.deliverables.set(task_id, d);

      if (verdict.decision === 'accept') {
        this.ledger.transition(task_id, 'accepted', `score ${verdict.score.toFixed(2)}`);
        this.events.emit('task.completed', { task_id, score: verdict.score, confidence: verdict.confidence, cost_usd: Number(task.spend.usd.toFixed(4)) }, run.run_id);
      } else if (verdict.decision === 'escalate') {
        this.ledger.transition(task_id, 'blocked', 'grader disagreement → Tier 2 human question');
        human_questions.push({ task_id, topic: 'grader_disagreement', because: verdict.critique });
        this.events.emit('task.blocked', { task_id, reason: 'grader_disagreement' }, run.run_id);
      } else if (task.attempts >= cfg.rubric.max_revisions + 1) {
        this.ledger.transition(task_id, 'failed', `revision cap (${cfg.rubric.max_revisions}) reached`);
      } else {
        this.ledger.transition(task_id, 'revising', verdict.critique);
        this.events.emit('task.progress', { task_id, status: 'revising', critique: verdict.critique, attempt: task.attempts }, run.run_id);
      }
    } finally {
      this.scheduler.finish(run.run_id, task_id);
    }
  }

  /** Hierarchical fan-in: the Lead reads at most ~50 summaries; anything bigger is pre-synthesized. */
  private async integrate(run: Run, cfg: RunConfig, accepted: Task[]): Promise<{ text: string; provenance: RunResult['provenance'] }> {
    const leaves = accepted.filter((t) => !accepted.some((o) => o.depends_on.includes(t.task_id)));
    const inputs = leaves.map((t) => this.deliverables.get(t.task_id)!).filter(Boolean);
    const chunks: Deliverable[] = inputs.length > 50 ? await this.fanIn(inputs) : inputs;
    const provenance: RunResult['provenance'] = [];
    let marker = 0;
    const body = chunks.map((d) => {
      let text = d.text;
      const seen = new Map<string, number>();
      for (const ev of d.evidence) {
        if (!seen.has(ev.pointer)) {
          marker += 1;
          seen.set(ev.pointer, marker);
          provenance.push({ marker, pointer: ev.pointer, quote: ev.quote });
        }
        text = text.replaceAll(`[[${ev.pointer}]]`, `⟦${seen.get(ev.pointer)}⟧`);
      }
      return text;
    }).join('\n\n');
    const r = await this.provider.complete({ tier: 'frontier', effort: 'high', system: '[[task:integrate]] You are the Lead. Integrate the accepted section drafts into one coherent deliverable. Preserve every provenance marker ⟦n⟧ exactly.', prompt: `GOAL: ${run.goal}\n\nSECTIONS:\n${body}` });
    this.ledger.getRun(run.run_id).spend.usd += r.usd;
    return { text: r.text, provenance };
  }

  private async fanIn(inputs: Deliverable[]): Promise<Deliverable[]> {
    const groups: Deliverable[][] = [];
    for (let i = 0; i < inputs.length; i += 25) groups.push(inputs.slice(i, i + 25));
    const out: Deliverable[] = [];
    for (const g of groups) {
      const r = await this.provider.complete({ tier: 'balanced', effort: 'medium', system: '[[task:synthesize]] Merge these section drafts, preserving every [[ep:...]] pointer.', prompt: g.map((d) => d.text).join('\n\n') });
      out.push({ text: r.text, evidence: g.flatMap((d) => d.evidence), tokens_in: r.tokens_in, tokens_out: r.tokens_out, usd: r.usd });
    }
    return out.length > 50 ? this.fanIn(out) : out;
  }
}

export function evidence(pointer: string, quote: string): EvidenceRef {
  return { id: makeId('ev'), pointer: pointer as EvidenceRef['pointer'], quote };
}
