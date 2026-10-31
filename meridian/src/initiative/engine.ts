/**
 * Initiative Engine (§8): Sense → Hypothesize → Plan → Gate → Act → Verify → Learn.
 * Trigger sources publish to the Event Bus; the ranker turns events into ranked
 * hypotheses; hypotheses above threshold become Runs on the Swarm Kernel, whose
 * tool calls pass the Gate Engine like anyone else's. Tier 3 ends in the Inbox.
 */
import type { ActionTier, Budget, OutcomeRubric } from '../core/types.js';
import { nowIso } from '../core/types.js';
import { LeadRuntime, type Planner, type RunResult, type SpecialistExecutor } from '../kernel/run.js';

export interface BusEvent {
  source: 'calendar' | 'mail' | 'repo' | 'document' | 'data' | 'world' | 'schedule' | 'webhook';
  type: string;              // e.g. "mail.thread.stale"
  payload: Record<string, unknown>;
  at: string;
}

export interface Hypothesis {
  id: string;
  event: BusEvent;
  summary: string;
  rank: number;              // 0–1
  goal: string;
  anticipated_tier: ActionTier;
  planner: Planner;
  executor: SpecialistExecutor;
  rubric: OutcomeRubric;
  budget: Budget;
}

export type HypothesisRule = (e: BusEvent) => Omit<Hypothesis, 'id' | 'event'> | null;

export class EventBus {
  private subs: Array<(e: BusEvent) => void | Promise<void>> = [];
  readonly log: BusEvent[] = [];
  subscribe(fn: (e: BusEvent) => void | Promise<void>): () => void {
    this.subs.push(fn);
    return () => { this.subs = this.subs.filter((s) => s !== fn); };
  }
  async publish(e: Omit<BusEvent, 'at'>): Promise<void> {
    const full = { ...e, at: nowIso() };
    this.log.push(full);
    for (const s of this.subs) await s(full);
  }
}

export interface InitiativeOutcome {
  hypothesis: Hypothesis;
  result?: RunResult;
  skipped_reason?: string;
}

export class InitiativeEngine {
  private rules: HypothesisRule[] = [];
  readonly outcomes: InitiativeOutcome[] = [];
  private seq = 0;

  constructor(private lead: LeadRuntime, private bus: EventBus, private workspace_id: string, private threshold = 0.6) {
    bus.subscribe((e) => this.handle(e));
  }

  addRule(rule: HypothesisRule): this {
    this.rules.push(rule);
    return this;
  }

  hypothesize(e: BusEvent): Hypothesis[] {
    return this.rules.map((r) => r(e)).filter((h): h is NonNullable<typeof h> => !!h).map((h) => ({ ...h, id: `hyp_${++this.seq}`, event: e })).sort((a, b) => b.rank - a.rank);
  }

  private async handle(e: BusEvent): Promise<void> {
    for (const h of this.hypothesize(e)) {
      if (h.rank < this.threshold) {
        this.outcomes.push({ hypothesis: h, skipped_reason: `rank ${h.rank} below threshold ${this.threshold}` });
        continue;
      }
      // Tier 4 hypotheses are never planned. Tier 3 ones run at Tier 3 ceiling so the
      // final action lands in the Approvals Inbox rather than being silently blocked.
      if (h.anticipated_tier === 4) {
        this.outcomes.push({ hypothesis: h, skipped_reason: 'anticipated Tier 4 action' });
        continue;
      }
      const started = await this.lead.start({ workspace_id: this.workspace_id, goal: h.goal, budget: h.budget, risk_tier_ceiling: h.anticipated_tier, rubric: h.rubric, planner: h.planner, executor: h.executor });
      if (started.checkpoint_required) {
        // Proactive runs don't get to approve their own plans; the user does. We auto-approve
        // only when nothing above Tier 1 is anticipated (the checkpoint fired on breadth/time).
        if (started.anticipated_tier3.length === 0) this.lead.approvePlan(started.run.run_id, 'initiative-engine:auto(no-tier3)');
      }
      const result = await this.lead.execute(started.run.run_id);
      this.outcomes.push({ hypothesis: h, result });
    }
  }
}
