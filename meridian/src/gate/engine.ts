/**
 * Risk-Tier Gate Engine — deterministic deny → ask → allow evaluation on runtime
 * tool arguments. Prompts advise; this module enforces.
 *
 * v1.1 semantics:
 *  - Action classes carry a Tier of 0, 1, 3 or 4 (blast radius × reversibility).
 *  - Confidence and "deterministic topic triggers" (money, identity, legal
 *    commitments) are modifiers. They can raise a Tier 0/1 action to a Tier 2
 *    question. They never lower anything, and they never touch Tier 3/4.
 *  - Order of evaluation is fixed: static deny → ceiling → tier → modifiers.
 */
import type { ActionTier, EffectiveTier, GateDecision } from '../core/types.js';
import { nowIso } from '../core/types.js';
import { EventStream } from '../core/events.js';
import { analyzeShell } from './shell.js';

export interface ActionClass {
  name: string;               // e.g. "mail.send"
  tier: ActionTier;
  description: string;
  reversible_locally: boolean;
  /** Which argument, if any, names an external target (used by revalidation payloads). */
  target_arg?: string;
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  agent_id: string;
  task_id?: string;
  run_id?: string;
  /** Task's risk_tier_ceiling from the Ledger. */
  tier_ceiling: ActionTier;
  /** Calibrated confidence (0–1) from the grader/planner; undefined = not applicable. */
  confidence?: number;
  /** Deterministic topic tags the planner attached (e.g. "money", "legal_commitment"). */
  topics?: string[];
  inside_sandbox?: boolean;
}

export interface GateResult {
  decision: GateDecision;
  action_tier: ActionTier | null;
  effective_tier: EffectiveTier;
  rule_id: string;
  reasons: string[];
  /** For 'ask': the approval payload skeleton the Inbox will complete. */
  approval_hint?: { action: string; target: unknown; reversible_locally: false };
  /** For 'question': the targeted question the Lead must ask (Tier 2). */
  question_hint?: { topic: string; because: string };
}

export interface GatePolicy {
  /** Workspace-level overrides: raise (never lower) an action's tier. */
  tier_overrides?: Record<string, ActionTier>;
  /** Shell binaries allowed at Tier 0/1 inside a sandbox. */
  shell_allowlist?: string[];
  /** Static deny list of path globs; any read/write hits Tier 4. */
  secret_paths?: RegExp[];
  /** Confidence below this raises Tier 0/1 to Tier 2. */
  confidence_floor?: number;
  /** Topics that always raise Tier 0/1 to Tier 2. */
  question_topics?: string[];
  /** Egress allowlist for fetch-class tools (hostnames). */
  egress_allowlist?: string[];
}

export interface AuditEntry {
  at: string;
  call: Omit<ToolCall, 'args'> & { args_hash: string };
  result: GateResult;
}

const DEFAULT_SECRET_PATHS = [/(^|\/)\.env(\.|$)/, /(^|\/)\.ssh\//, /(^|\/)\.aws\//, /id_rsa/, /\.pem$/, /secrets?\//i, /credentials/i, /\/proc\/self\/environ/];

export const DEFAULT_ACTIONS: ActionClass[] = [
  { name: 'search.web', tier: 0, description: 'Web search', reversible_locally: true },
  { name: 'fs.read', tier: 0, description: 'Read a file', reversible_locally: true, target_arg: 'path' },
  { name: 'http.fetch', tier: 0, description: 'Fetch a URL', reversible_locally: true, target_arg: 'url' },
  { name: 'calendar.read', tier: 0, description: 'Read calendar', reversible_locally: true },
  { name: 'mail.read', tier: 0, description: 'Read mail', reversible_locally: true },
  { name: 'memory.query', tier: 0, description: 'Query Continuum Memory', reversible_locally: true },
  { name: 'fs.write', tier: 1, description: 'Write a file inside the sandbox', reversible_locally: true, target_arg: 'path' },
  { name: 'shell.run', tier: 1, description: 'Run an allowlisted command in the sandbox', reversible_locally: true },
  { name: 'tests.run', tier: 1, description: 'Run tests', reversible_locally: true },
  { name: 'doc.draft', tier: 1, description: 'Create a draft document', reversible_locally: true },
  { name: 'mail.draft', tier: 1, description: 'Create a draft email (not sent)', reversible_locally: true },
  { name: 'git.branch', tier: 1, description: 'Create a branch', reversible_locally: true },
  // v1.1: memory writes are *staged* (Tier 1) into a quarantine; promotion into the
  // append-only L2/L3 stores is a separate verified step (see memory/graph.ts).
  { name: 'memory.stage', tier: 1, description: 'Stage a memory candidate for verification', reversible_locally: true },
  { name: 'mail.send', tier: 3, description: 'Send email externally', reversible_locally: false, target_arg: 'to' },
  { name: 'chat.send_external', tier: 3, description: 'Send message to external party', reversible_locally: false, target_arg: 'to' },
  { name: 'git.merge_protected', tier: 3, description: 'Merge to protected branch', reversible_locally: false, target_arg: 'branch' },
  { name: 'deploy', tier: 3, description: 'Deploy', reversible_locally: false, target_arg: 'environment' },
  { name: 'calendar.create_external', tier: 3, description: 'Create event with external attendees', reversible_locally: false, target_arg: 'attendees' },
  { name: 'payment.send', tier: 3, description: 'Move money', reversible_locally: false, target_arg: 'to' },
  { name: 'publish', tier: 3, description: 'Publish content', reversible_locally: false, target_arg: 'destination' },
  { name: 'fs.delete_outside_sandbox', tier: 4, description: 'Destructive op outside sandbox', reversible_locally: false },
  { name: 'secrets.read', tier: 4, description: 'Read secrets or keys', reversible_locally: false },
  { name: 'credential.exfiltrate', tier: 4, description: 'Move credentials off-host', reversible_locally: false },
  { name: 'safety.disable_hooks', tier: 4, description: 'Disable safety hooks', reversible_locally: false },
];

function hashArgs(args: Record<string, unknown>): string {
  const s = JSON.stringify(args, Object.keys(args).sort());
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export class GateEngine {
  private actions = new Map<string, ActionClass>();
  readonly audit: AuditEntry[] = [];

  constructor(readonly events: EventStream, private policy: GatePolicy = {}, actions: ActionClass[] = DEFAULT_ACTIONS) {
    for (const a of actions) this.actions.set(a.name, a);
    this.policy = {
      secret_paths: DEFAULT_SECRET_PATHS,
      shell_allowlist: ['ls', 'cat', 'grep', 'rg', 'find', 'node', 'npm', 'npx', 'git', 'pytest', 'tsc', 'echo', 'head', 'tail', 'wc'],
      confidence_floor: 0.6,
      question_topics: ['money', 'identity', 'legal_commitment'],
      ...policy,
    };
  }

  register(action: ActionClass): void {
    this.actions.set(action.name, action);
  }

  /** Workspace policy may raise a tier. Lowering is rejected: reversibility is a fact, not a preference. */
  override(action: string, tier: ActionTier): void {
    const a = this.actions.get(action);
    if (!a) throw new Error(`unknown action ${action}`);
    if (tier < a.tier) throw new Error(`override cannot lower ${action} from Tier ${a.tier} to Tier ${tier}`);
    this.policy.tier_overrides = { ...(this.policy.tier_overrides ?? {}), [action]: tier };
  }

  tierOf(action: string): ActionTier | null {
    const a = this.actions.get(action);
    if (!a) return null;
    return this.policy.tier_overrides?.[action] ?? a.tier;
  }

  evaluate(call: ToolCall): GateResult {
    const result = this.decide(call);
    this.audit.push({ at: nowIso(), call: { ...stripArgs(call), args_hash: hashArgs(call.args) }, result });
    if (result.decision === 'block') {
      this.events.emit('policy.blocked', { tool: call.tool, args_hash: hashArgs(call.args), rule_id: result.rule_id, reasons: result.reasons, agent_id: call.agent_id }, call.run_id);
    } else if (result.decision === 'question') {
      this.events.emit('policy.question', { tool: call.tool, rule_id: result.rule_id, reasons: result.reasons, agent_id: call.agent_id }, call.run_id);
    }
    return result;
  }

  private decide(call: ToolCall): GateResult {
    const action = this.actions.get(call.tool);
    const reasons: string[] = [];

    // 1. Unknown tools are not "probably fine". They are blocked until classified.
    if (!action) {
      return { decision: 'block', action_tier: null, effective_tier: 4, rule_id: 'unknown_action', reasons: [`no action class registered for ${call.tool}`] };
    }
    let tier: ActionTier = this.tierOf(call.tool)!;

    // 2. Static deny list: secret paths, egress outside allowlist, shell operators.
    const pathArg = typeof call.args['path'] === 'string' ? (call.args['path'] as string) : undefined;
    if (pathArg && this.policy.secret_paths!.some((re) => re.test(pathArg))) {
      return { decision: 'block', action_tier: 4, effective_tier: 4, rule_id: 'static_deny.secret_path', reasons: [`path ${pathArg} matches secret-path deny list`] };
    }
    if (call.tool === 'http.fetch' && this.policy.egress_allowlist) {
      const url = String(call.args['url'] ?? '');
      let host = '';
      try { host = new URL(url).hostname; } catch { host = ''; }
      if (!host || !this.policy.egress_allowlist.some((h) => host === h || host.endsWith(`.${h}`))) {
        return { decision: 'block', action_tier: 4, effective_tier: 4, rule_id: 'static_deny.egress', reasons: [`host "${host}" not in egress allowlist`] };
      }
    }
    if (call.tool === 'shell.run') {
      const cmd = String(call.args['command'] ?? '');
      const sh = analyzeShell(cmd);
      if (!sh.simple) {
        const why = sh.wraps_interpreter ? 'interpreter wrapper does not inherit allow status' : `operators ${sh.operators.join(' ')} do not inherit allow status`;
        return { decision: 'block', action_tier: 4, effective_tier: 4, rule_id: 'static_deny.shell_compound', reasons: [why] };
      }
      if (!this.policy.shell_allowlist!.includes(sh.binary!)) {
        return { decision: 'block', action_tier: 4, effective_tier: 4, rule_id: 'static_deny.shell_binary', reasons: [`binary ${sh.binary} not allowlisted`] };
      }
      if (!call.inside_sandbox) {
        return { decision: 'block', action_tier: 4, effective_tier: 4, rule_id: 'static_deny.shell_outside_sandbox', reasons: ['shell only runs inside an ephemeral sandbox'] };
      }
    }

    // 3. Tier 4 is a hard block regardless of anything else.
    if (tier === 4) {
      return { decision: 'block', action_tier: 4, effective_tier: 4, rule_id: 'tier4.hard_block', reasons: [`${action.description} is Tier 4`] };
    }

    // 4. Task ceiling (Ledger invariant 3). A task may not reach above its ceiling.
    if (tier > call.tier_ceiling) {
      return { decision: 'block', action_tier: tier, effective_tier: 4, rule_id: 'ceiling.exceeded', reasons: [`action Tier ${tier} exceeds task ceiling ${call.tier_ceiling}`] };
    }

    // 5. Tier 3: synchronous interrupt and resume. Confidence cannot change this.
    if (tier === 3) {
      const target = action.target_arg ? call.args[action.target_arg] : undefined;
      if (call.confidence !== undefined && call.confidence < this.policy.confidence_floor!) reasons.push(`low confidence ${call.confidence.toFixed(2)} noted in payload`);
      reasons.push(`${action.description}: hard to reverse`);
      return { decision: 'ask', action_tier: 3, effective_tier: 3, rule_id: 'tier3.ask', reasons, approval_hint: { action: call.tool, target, reversible_locally: false } };
    }

    // 6. Tier 0/1 with modifiers → Tier 2 question (human-as-a-tool).
    const lowConf = call.confidence !== undefined && call.confidence < this.policy.confidence_floor!;
    const topic = (call.topics ?? []).find((t) => this.policy.question_topics!.includes(t));
    if (lowConf || topic) {
      const because = lowConf ? `confidence ${call.confidence!.toFixed(2)} below floor ${this.policy.confidence_floor}` : `topic "${topic}" always requires a targeted question`;
      return { decision: 'question', action_tier: tier, effective_tier: 2, rule_id: lowConf ? 'tier2.low_confidence' : 'tier2.topic', reasons: [because], question_hint: { topic: topic ?? 'ambiguity', because } };
    }

    if (tier === 1 && !call.inside_sandbox && action.name !== 'memory.stage' && action.name !== 'doc.draft' && action.name !== 'mail.draft' && action.name !== 'git.branch') {
      return { decision: 'block', action_tier: 1, effective_tier: 4, rule_id: 'tier1.requires_sandbox', reasons: ['Tier 1 mutations run inside the sandbox boundary'] };
    }

    return { decision: 'allow', action_tier: tier, effective_tier: tier, rule_id: tier === 0 ? 'tier0.allow' : 'tier1.allow_sandboxed', reasons: [action.description] };
  }
}

function stripArgs(call: ToolCall): Omit<ToolCall, 'args'> {
  const { args: _args, ...rest } = call;
  return rest;
}
