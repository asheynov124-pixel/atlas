/**
 * Approvals Inbox — durable interrupt-and-resume queue for Tier 3 actions.
 *
 * Spec §8.6–8.7, refined in v1.1:
 *  - Payload is a *verification* payload (diff, evidence, state snapshot, alternatives),
 *    never a rationale.
 *  - TTL (default 30 min). Expiry does not silently resume; it re-requests with a fresh snapshot.
 *  - Resume revalidates external state AND approver identity/authority.
 *  - Telemetry flags redesign of the *payload or batching*. It never demotes a Tier 3
 *    action to Tier 1: reversibility is a property of the action, not of how often
 *    reviewers say yes.
 *  - Approval authority can be delegated, with scope, expiry, and an audit trail.
 */
import { makeId, nowIso } from '../core/types.js';
import { EventStream } from '../core/events.js';

export type ApprovalDecision = 'approve' | 'edit' | 'reject';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'invalidated';

export interface Reviewer {
  id: string;
  roles: string[];
}

export interface ApprovalPayload {
  approval_id: string;
  run_id: string;
  task_id?: string;
  action: string;
  tier: 3;
  target: unknown;
  diff: { kind: string; preview: string };
  evidence_refs: string[];
  state_snapshot: Record<string, unknown>;
  alternatives: string[];
  ttl_expires_at: string;
  reviewer_rbac: string[];
  uncertainty_notes: string[];
  status: ApprovalStatus;
  created_at: string;
  opened_at?: string;
  decided_at?: string;
  decision?: ApprovalDecision;
  decided_by?: string;
  decided_via_delegation?: string;
  edited_preview?: string;
  supersedes?: string;
}

export interface Delegation {
  id: string;
  from: string;
  to: string;
  /** Action names covered, or '*' */
  scope: string[];
  expires_at: string;
  created_at: string;
  revoked_at?: string;
}

export interface GateTelemetry {
  action: string;
  items: number;
  approval_rate: number;
  override_rate: number; // edit or reject
  median_time_on_item_ms: number;
  flags: string[];
}

export class ApprovalError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'ApprovalError';
  }
}

export interface DecideResult {
  status: ApprovalStatus;
  payload: ApprovalPayload;
  /** When state changed since snapshot, the replacement request. */
  reissued?: ApprovalPayload;
  /** Body to execute (edited or original). */
  execute_with?: string;
}

export class ApprovalsInbox {
  private items = new Map<string, ApprovalPayload>();
  private delegations: Delegation[] = [];
  readonly auditLog: Array<{ at: string; approval_id: string; actor: string; event: string; detail?: Record<string, unknown> }> = [];

  constructor(readonly events: EventStream, private clock: () => number = () => Date.now(), private defaultTtlMs = 30 * 60 * 1000) {}

  create(input: Omit<ApprovalPayload, 'approval_id' | 'tier' | 'ttl_expires_at' | 'status' | 'created_at' | 'uncertainty_notes'> & { ttl_ms?: number; uncertainty_notes?: string[] }): ApprovalPayload {
    const { ttl_ms, ...rest } = input;
    const p: ApprovalPayload = {
      ...rest,
      approval_id: makeId('apr'),
      tier: 3,
      uncertainty_notes: input.uncertainty_notes ?? [],
      ttl_expires_at: new Date(this.clock() + (ttl_ms ?? this.defaultTtlMs)).toISOString(),
      status: 'pending',
      created_at: new Date(this.clock()).toISOString(),
    };
    this.items.set(p.approval_id, p);
    this.auditLog.push({ at: p.created_at, approval_id: p.approval_id, actor: 'system', event: 'requested' });
    this.events.emit('approval.requested', { approval_id: p.approval_id, action: p.action, target: p.target, ttl_expires_at: p.ttl_expires_at }, p.run_id);
    return p;
  }

  get(approval_id: string): ApprovalPayload {
    const p = this.items.get(approval_id);
    if (!p) throw new ApprovalError(`unknown approval ${approval_id}`, 'not_found');
    return p;
  }

  pending(reviewer?: Reviewer): ApprovalPayload[] {
    this.sweepExpired();
    return [...this.items.values()].filter((p) => p.status === 'pending' && (!reviewer || this.canReview(reviewer, p).ok));
  }

  /** Reviewer opened the item; starts the time-on-item clock (rubber-stamp detector). */
  open(approval_id: string, reviewer: Reviewer): ApprovalPayload {
    const p = this.get(approval_id);
    p.opened_at = new Date(this.clock()).toISOString();
    this.auditLog.push({ at: p.opened_at, approval_id, actor: reviewer.id, event: 'opened' });
    return p;
  }

  delegate(from: Reviewer, to: string, scope: string[], ttl_ms: number): Delegation {
    if (!from.roles.includes('workspace:owner') && !from.roles.includes('role:approver')) {
      throw new ApprovalError('only approvers may delegate', 'delegation_forbidden');
    }
    const d: Delegation = { id: makeId('dlg'), from: from.id, to, scope, expires_at: new Date(this.clock() + ttl_ms).toISOString(), created_at: new Date(this.clock()).toISOString() };
    this.delegations.push(d);
    this.auditLog.push({ at: d.created_at, approval_id: '-', actor: from.id, event: 'delegated', detail: { to, scope, expires_at: d.expires_at } });
    return d;
  }

  revokeDelegation(id: string, by: Reviewer): void {
    const d = this.delegations.find((x) => x.id === id);
    if (!d) throw new ApprovalError('unknown delegation', 'not_found');
    d.revoked_at = new Date(this.clock()).toISOString();
    this.auditLog.push({ at: d.revoked_at, approval_id: '-', actor: by.id, event: 'delegation_revoked', detail: { id } });
  }

  private canReview(reviewer: Reviewer, p: ApprovalPayload): { ok: boolean; via?: string } {
    if (reviewer.roles.some((r) => p.reviewer_rbac.includes(r))) return { ok: true };
    const now = this.clock();
    const d = this.delegations.find((x) => x.to === reviewer.id && !x.revoked_at && Date.parse(x.expires_at) > now && (x.scope.includes('*') || x.scope.includes(p.action)));
    return d ? { ok: true, via: d.id } : { ok: false };
  }

  private sweepExpired(): void {
    const now = this.clock();
    for (const p of this.items.values()) {
      if (p.status === 'pending' && Date.parse(p.ttl_expires_at) <= now) {
        p.status = 'expired';
        this.auditLog.push({ at: new Date(now).toISOString(), approval_id: p.approval_id, actor: 'system', event: 'expired' });
        this.events.emit('approval.expired', { approval_id: p.approval_id, action: p.action }, p.run_id);
      }
    }
  }

  /**
   * Decide. `currentState` is the live external state at resume time; if it differs
   * from the snapshot the approval is invalidated and reissued with the new snapshot.
   */
  decide(approval_id: string, reviewer: Reviewer, decision: ApprovalDecision, opts: { edited_preview?: string; currentState: Record<string, unknown> }): DecideResult {
    this.sweepExpired();
    const p = this.get(approval_id);
    if (p.status !== 'pending') throw new ApprovalError(`approval is ${p.status}`, 'not_pending');

    const auth = this.canReview(reviewer, p);
    if (!auth.ok) throw new ApprovalError(`reviewer ${reviewer.id} lacks ${p.reviewer_rbac.join('|')} and holds no delegation`, 'rbac');

    const now = new Date(this.clock()).toISOString();
    p.decided_at = now;
    p.decided_by = reviewer.id;
    if (auth.via) p.decided_via_delegation = auth.via;
    p.decision = decision;

    if (decision === 'reject') {
      p.status = 'rejected';
      this.auditLog.push({ at: now, approval_id, actor: reviewer.id, event: 'rejected' });
      this.events.emit('approval.decided', { approval_id, decision, reviewer: reviewer.id }, p.run_id);
      return { status: p.status, payload: p };
    }

    // Revalidate external state before anything executes.
    if (JSON.stringify(opts.currentState) !== JSON.stringify(p.state_snapshot)) {
      p.status = 'invalidated';
      this.auditLog.push({ at: now, approval_id, actor: 'system', event: 'invalidated', detail: { snapshot: p.state_snapshot, current: opts.currentState } });
      this.events.emit('approval.invalidated', { approval_id, reason: 'state changed since snapshot' }, p.run_id);
      const reissued = this.create({
        run_id: p.run_id,
        ...(p.task_id ? { task_id: p.task_id } : {}),
        action: p.action,
        target: p.target,
        diff: p.diff,
        evidence_refs: p.evidence_refs,
        state_snapshot: opts.currentState,
        alternatives: p.alternatives,
        reviewer_rbac: p.reviewer_rbac,
        uncertainty_notes: [...p.uncertainty_notes, 'external state changed while awaiting approval'],
        supersedes: approval_id,
      });
      return { status: p.status, payload: p, reissued };
    }

    p.status = 'approved';
    if (decision === 'edit') p.edited_preview = opts.edited_preview ?? p.diff.preview;
    this.auditLog.push({ at: now, approval_id, actor: reviewer.id, event: decision === 'edit' ? 'edited_and_approved' : 'approved', ...(auth.via ? { detail: { via_delegation: auth.via } } : {}) });
    this.events.emit('approval.decided', { approval_id, decision, reviewer: reviewer.id, via_delegation: auth.via ?? null }, p.run_id);
    return { status: p.status, payload: p, execute_with: p.edited_preview ?? p.diff.preview };
  }

  /** §8.7 telemetry. Flags describe payload/batching redesign; they never propose a tier change. */
  telemetry(action: string, minItems = 200): GateTelemetry {
    const decided = [...this.items.values()].filter((p) => p.action === action && (p.status === 'approved' || p.status === 'rejected'));
    const n = decided.length;
    const approvals = decided.filter((p) => p.decision === 'approve').length;
    const overrides = decided.filter((p) => p.decision === 'edit' || p.decision === 'reject').length;
    const times = decided.filter((p) => p.opened_at && p.decided_at).map((p) => Date.parse(p.decided_at!) - Date.parse(p.opened_at!)).sort((a, b) => a - b);
    const median = times.length ? times[Math.floor(times.length / 2)]! : 0;
    const flags: string[] = [];
    if (n >= minItems) {
      if (approvals / n > 0.95) flags.push('redesign_payload_or_batch: approval rate > 95% — reviewers add no information; batch into a digest with a single consolidated approval, or enrich the verification payload. Tier stays 3.');
      if (overrides / n < 0.01) flags.push('redesign_payload_or_batch: override rate < 1%.');
      if (median > 0 && median < 5000) flags.push('rubber_stamp: median time-on-item < 5 s — payload is not being read; redesign payload.');
    }
    return { action, items: n, approval_rate: n ? approvals / n : 0, override_rate: n ? overrides / n : 0, median_time_on_item_ms: median, flags };
  }
}
