/**
 * Tool Runtime: every call passes the Gate Engine first; every result is written
 * verbatim to L2 as *untrusted* content and handed back with its pointer, so the
 * specialist can cite it and the Evidence Verifier can check the citation.
 */
import type { ActionTier, SpanPointer } from '../core/types.js';
import { GateEngine, type GateResult, type ToolCall } from '../gate/engine.js';
import { ApprovalsInbox, type ApprovalPayload } from '../approvals/inbox.js';
import { EpisodicStore } from '../memory/episodic.js';
import { EventStream } from '../core/events.js';

export type ToolHandler = (args: Record<string, unknown>) => Promise<{ text: string; source?: string; state_snapshot?: Record<string, unknown>; alternatives?: string[] }>;

export interface ToolOutcome {
  status: 'ok' | 'pending_approval' | 'needs_human' | 'blocked';
  gate: GateResult;
  text?: string;
  pointer?: SpanPointer;
  approval?: ApprovalPayload;
  question?: { topic: string; because: string };
}

export class ToolBlockedError extends Error {
  constructor(readonly gate: GateResult) {
    super(`tool blocked by ${gate.rule_id}: ${gate.reasons.join('; ')}`);
    this.name = 'ToolBlockedError';
  }
}

export class ToolRuntime {
  private handlers = new Map<string, ToolHandler>();
  private seq = 0;
  /** Sentinel feed: per-task signatures of calls. */
  readonly callLog: Array<{ task_id?: string; agent_id: string; tool: string; args_sig: string; at: number }> = [];

  constructor(readonly gate: GateEngine, readonly inbox: ApprovalsInbox, readonly l2: EpisodicStore, readonly events: EventStream) {}

  register(tool: string, handler: ToolHandler): this {
    this.handlers.set(tool, handler);
    return this;
  }

  has(tool: string): boolean {
    return this.handlers.has(tool);
  }

  async call(call: Omit<ToolCall, 'tier_ceiling'> & { tier_ceiling: ActionTier; workspace_id?: string; reviewer_rbac?: string[] }): Promise<ToolOutcome> {
    const gate = this.gate.evaluate(call);
    this.callLog.push({ ...(call.task_id ? { task_id: call.task_id } : {}), agent_id: call.agent_id, tool: call.tool, args_sig: JSON.stringify(call.args), at: Date.now() });
    if (gate.decision === 'block') return { status: 'blocked', gate };
    if (gate.decision === 'question') return { status: 'needs_human', gate, question: gate.question_hint! };
    const handler = this.handlers.get(call.tool);
    if (!handler) throw new Error(`no handler for ${call.tool}`);

    if (gate.decision === 'ask') {
      // Tier 3: build a verification payload. The handler's "dry run" supplies preview and state.
      const dry = await handler({ ...call.args, __dry_run: true });
      const approval = this.inbox.create({
        run_id: call.run_id ?? 'adhoc',
        ...(call.task_id ? { task_id: call.task_id } : {}),
        action: call.tool,
        target: gate.approval_hint!.target,
        diff: { kind: call.tool, preview: dry.text },
        evidence_refs: Array.isArray(call.args['evidence_refs']) ? (call.args['evidence_refs'] as string[]) : [],
        state_snapshot: dry.state_snapshot ?? {},
        alternatives: dry.alternatives ?? ['reject'],
        reviewer_rbac: call.reviewer_rbac ?? ['workspace:owner', 'role:approver'],
        uncertainty_notes: gate.reasons.filter((r) => r.startsWith('low confidence')),
      });
      return { status: 'pending_approval', gate, approval };
    }

    const result = await handler(call.args);
    const turn_id = `tool_${++this.seq}`;
    const pointer = this.l2.append({ run_id: call.run_id ?? 'adhoc', turn_id, role: 'tool', text: result.text, trusted: false, ...(result.source ? { source: result.source } : {}) }, call.workspace_id);
    return { status: 'ok', gate, text: result.text, pointer };
  }

  /** Execute an approved Tier 3 action with the (possibly edited) body. */
  async executeApproved(approval: ApprovalPayload, body: string, workspace_id?: string): Promise<{ text: string; pointer: SpanPointer }> {
    const handler = this.handlers.get(approval.action);
    if (!handler) throw new Error(`no handler for ${approval.action}`);
    const result = await handler({ target: approval.target, body, __approved: approval.approval_id });
    const turn_id = `tool_${++this.seq}`;
    const pointer = this.l2.append({ run_id: approval.run_id, turn_id, role: 'tool', text: result.text, trusted: false, source: approval.action }, workspace_id);
    this.events.emit('task.completed', { approval_id: approval.approval_id, action: approval.action, result: result.text }, approval.run_id);
    return { text: result.text, pointer };
  }
}
