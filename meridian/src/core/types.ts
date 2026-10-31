/**
 * Core vocabulary for the Meridian kernel (PAS-001 v1.1).
 *
 * v1.1 change: Tier 2 is no longer an *action class*. Action classes carry an
 * ActionTier of 0, 1, 3 or 4, chosen by blast radius and reversibility alone.
 * Confidence is an orthogonal modifier that can only *raise* the effective
 * oversight level: a Tier 0/1 action under low confidence becomes a Tier 2
 * "human-as-a-tool" question; a Tier 3/4 action is unaffected (it already asks
 * or blocks). The numbering 0–4 is kept so the UI and telemetry stay stable.
 */

export type ActionTier = 0 | 1 | 3 | 4;
export type EffectiveTier = 0 | 1 | 2 | 3 | 4;

export type GateDecision = 'allow' | 'question' | 'ask' | 'block';

export type ModelTier = 'frontier' | 'balanced' | 'fast';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type AgentRole =
  | 'lead'
  | 'planner'
  | 'specialist'
  | 'grader'
  | 'critic'
  | 'sentinel'
  | 'archivist';

/** v1.1: the status enum the original spec used but never declared. */
export type TaskStatus =
  | 'pending'        // created, dependencies unmet
  | 'ready'          // dependencies met, unclaimed
  | 'running'        // claimed by exactly one owner
  | 'blocked'        // waiting on tool outage, approval, or human question
  | 'awaiting_grade' // specialist returned; grader has not recorded a verdict
  | 'revising'       // grader rejected; attempt counter incremented
  | 'accepted'       // grader record exists and calibration said accept
  | 'failed'         // budget, cap or hard error
  | 'cancelled';

export interface Budget {
  max_tokens: number;
  max_usd: number;
  deadline?: string;
}

export interface Spend {
  tokens: number;
  usd: number;
}

export interface RubricCriterion {
  id: string;
  text: string;
  weight?: number;
}

export interface OutcomeRubric {
  id: string;
  criteria: RubricCriterion[];
  min_score: number;
  max_revisions: number;
}

export interface Task {
  task_id: string;
  run_id: string;
  parent_task_id?: string;
  type: string;
  status: TaskStatus;
  owner_agent_id?: string;
  depends_on: string[];
  inputs: Record<string, unknown>;
  outcome_rubric_id?: string;
  budget: Budget;
  spend: Spend;
  risk_tier_ceiling: ActionTier;
  attempts: number;
  artifacts: string[];
  evidence_refs: string[];
  grader_record_ids: string[];
  checkpoint?: unknown;
  created_at: string;
  updated_at: string;
}

export type Topology = 'hierarchical' | 'team' | 'scripted' | 'market';

export type RunStatus = 'planning' | 'awaiting_plan_approval' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface Run {
  run_id: string;
  workspace_id: string;
  goal: string;
  topology: Topology;
  status: RunStatus;
  budget: Budget;
  spend: Spend;
  risk_tier_ceiling: ActionTier;
  rubric?: OutcomeRubric;
  artifact_ids: string[];
  created_at: string;
  updated_at: string;
}

export type MessageKind = 'finding' | 'request' | 'handoff' | 'blocker' | 'question_for_human' | 'status';

export interface AgentMessage {
  msg_id: string;
  from: string;
  to: string;
  run_id: string;
  kind: MessageKind;
  payload: Record<string, unknown>;
  requires_ack: boolean;
  created_at: string;
}

/** A resolvable pointer into the episodic store: ep:<run>/<turn>/chars_<a>-<b> */
export type SpanPointer = `ep:${string}`;

export interface EvidenceRef {
  id: string;
  pointer: SpanPointer;
  quote: string;
}

export interface GraderRecord {
  id: string;
  task_id: string;
  kind: 'rubric' | 'critic' | 'evidence' | 'calibration';
  scores: Record<string, number>;
  score: number;
  confidence: number;
  decision: 'accept' | 'revise' | 'escalate';
  critique: string;
  created_at: string;
}

export type EventName =
  | 'plan.ready'
  | 'plan.approved'
  | 'task.started'
  | 'task.progress'
  | 'task.completed'
  | 'task.blocked'
  | 'agent.message'
  | 'compaction.boundary'
  | 'grader.result'
  | 'approval.requested'
  | 'approval.decided'
  | 'approval.expired'
  | 'approval.invalidated'
  | 'policy.blocked'
  | 'policy.question'
  | 'run.paused'
  | 'run.completed'
  | 'run.failed'
  | 'memory.quarantined'
  | 'sentinel.alert';

export interface KernelEvent {
  event: EventName;
  run_id?: string;
  at: string;
  payload: Record<string, unknown>;
}

export function nowIso(): string {
  return new Date().toISOString();
}

let counter = 0;
export function makeId(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${counter.toString(36)}${rand}`;
}
