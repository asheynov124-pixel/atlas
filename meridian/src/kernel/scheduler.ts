/**
 * Scheduler & Sentinel (§5.5, §5.8): concurrency cap, cost envelopes (soft 70%,
 * hard 100%), model-tier elasticity hint, and loop detection on identical tool calls.
 */
import type { Run } from '../core/types.js';
import { EventStream } from '../core/events.js';
import { TaskLedger } from '../ledger/ledger.js';
import type { ToolRuntime } from './tools.js';

export class BudgetExceededError extends Error {
  constructor(readonly run_id: string, readonly fraction: number) {
    super(`run ${run_id} budget exceeded (${(fraction * 100).toFixed(0)}%)`);
    this.name = 'BudgetExceededError';
  }
}

export class Sentinel {
  readonly alerts: Array<{ at: string; kind: string; task_id?: string; detail: string }> = [];
  private warned = new Set<string>();
  constructor(private events: EventStream, private tools: ToolRuntime, private loopThreshold = 3) {}

  /** Repeated identical tool calls within a task → loop. */
  checkLoops(task_id: string, run_id: string): boolean {
    const sigs = this.tools.callLog.filter((c) => c.task_id === task_id).map((c) => `${c.tool}|${c.args_sig}`);
    const counts = new Map<string, number>();
    for (const s of sigs) counts.set(s, (counts.get(s) ?? 0) + 1);
    for (const [sig, n] of counts) {
      if (n >= this.loopThreshold) {
        this.alert('loop', `identical call ×${n}: ${sig.slice(0, 120)}`, run_id, task_id);
        return true;
      }
    }
    return false;
  }

  checkBudget(run: Run, fraction: number): void {
    if (fraction >= 1) {
      this.alert('budget_hard_stop', `spend ${(fraction * 100).toFixed(0)}% of envelope`, run.run_id);
      throw new BudgetExceededError(run.run_id, fraction);
    }
    if (fraction >= 0.7 && !this.warned.has(run.run_id)) {
      this.warned.add(run.run_id);
      this.alert('budget_soft_warning', `spend ${(fraction * 100).toFixed(0)}% of envelope`, run.run_id);
    }
  }

  alert(kind: string, detail: string, run_id?: string, task_id?: string): void {
    const a = { at: new Date().toISOString(), kind, detail, ...(task_id ? { task_id } : {}) };
    this.alerts.push(a);
    this.events.emit('sentinel.alert', a, run_id);
  }
}

export interface SchedulerOptions {
  concurrency: number;
  /** Fraction of concurrency above which tolerant tasks are hinted to the Fast tier. */
  elasticity_threshold?: number;
}

export class Scheduler {
  private running = new Map<string, Set<string>>();
  constructor(private ledger: TaskLedger, private opts: SchedulerOptions) {}

  active(run_id: string): number {
    return this.running.get(run_id)?.size ?? 0;
  }

  /** Pick the next ready tasks up to the concurrency cap. Work stealing is implicit: any idle slot takes any ready task. */
  next(run_id: string): Array<{ task_id: string; tier_hint: 'fast' | null }> {
    const slots = this.opts.concurrency - this.active(run_id);
    if (slots <= 0) return [];
    const under = this.active(run_id) / this.opts.concurrency > (this.opts.elasticity_threshold ?? 0.8);
    return this.ledger.tasksForRun(run_id).filter((t) => t.status === 'ready' || t.status === 'revising').slice(0, slots).map((t) => ({ task_id: t.task_id, tier_hint: under && t.inputs['tolerates_fast'] === true ? 'fast' : null }));
  }

  start(run_id: string, task_id: string): void {
    if (!this.running.has(run_id)) this.running.set(run_id, new Set());
    this.running.get(run_id)!.add(task_id);
  }

  finish(run_id: string, task_id: string): void {
    this.running.get(run_id)?.delete(task_id);
  }
}
