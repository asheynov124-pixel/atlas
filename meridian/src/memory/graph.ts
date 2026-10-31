/**
 * L3 Semantic Knowledge Graph: entities, claims with confidence and evidence
 * pointers, contradiction flags.
 *
 * v1.1: fact quarantine. A claim enters L3 only after the deterministic Evidence
 * Verifier confirms every pointer resolves and the quoted span matches. Claims
 * extracted from untrusted content (tool results, retrieved documents) that fail
 * verification are quarantined and surfaced to the user, never promoted. This closes
 * the injection vector where a poisoned tool result plants a false fact at Tier 1.
 */
import { makeId, nowIso } from '../core/types.js';
import { EventStream } from '../core/events.js';
import { EpisodicStore } from './episodic.js';

export interface Claim {
  id: string;
  entity: string;
  attribute: string;
  value: string;
  confidence: number;
  evidence: Array<{ pointer: string; quote: string }>;
  valid_from: string;
  valid_to?: string;
  contradicted_by: string[];
  status: 'active' | 'contested' | 'retired';
  utility: number; // for Forgetting
  run_id: string;
}

export interface QuarantinedClaim {
  id: string;
  candidate: Omit<Claim, 'id' | 'contradicted_by' | 'status' | 'utility'>;
  reason: string;
  at: string;
}

export class SemanticGraph {
  private claims = new Map<string, Claim>();
  readonly quarantine: QuarantinedClaim[] = [];

  constructor(readonly l2: EpisodicStore, readonly events: EventStream) {}

  /** Stage + verify + promote. Returns the claim or a quarantine record. */
  stage(candidate: Omit<Claim, 'id' | 'contradicted_by' | 'status' | 'utility'>): { promoted?: Claim; quarantined?: QuarantinedClaim } {
    const problems: string[] = [];
    if (candidate.evidence.length === 0) problems.push('no evidence pointer');
    for (const ev of candidate.evidence) {
      if (!this.l2.resolve(ev.pointer)) problems.push(`dangling pointer ${ev.pointer}`);
      else if (!this.l2.verifyQuote(ev.pointer, ev.quote)) problems.push(`quote does not match source at ${ev.pointer}`);
    }
    if (problems.length) {
      const q: QuarantinedClaim = { id: makeId('qrn'), candidate, reason: problems.join('; '), at: nowIso() };
      this.quarantine.push(q);
      this.events.emit('memory.quarantined', { id: q.id, entity: candidate.entity, attribute: candidate.attribute, reason: q.reason }, candidate.run_id);
      return { quarantined: q };
    }
    const claim: Claim = { ...candidate, id: makeId('clm'), contradicted_by: [], status: 'active', utility: 1 };
    this.claims.set(claim.id, claim);
    this.detectContradictions(claim);
    return { promoted: claim };
  }

  private detectContradictions(claim: Claim): void {
    for (const other of this.claims.values()) {
      if (other.id === claim.id || other.status === 'retired') continue;
      if (other.entity === claim.entity && other.attribute === claim.attribute && other.value !== claim.value && !other.valid_to) {
        other.contradicted_by.push(claim.id);
        claim.contradicted_by.push(other.id);
        other.status = 'contested';
        claim.status = 'contested';
      }
    }
  }

  /** Reconciler outcome: keep one, retire the others with an end date. */
  reconcile(keep_id: string, retire_ids: string[]): void {
    const keep = this.claims.get(keep_id);
    if (!keep) throw new Error('unknown claim');
    keep.status = 'active';
    keep.contradicted_by = keep.contradicted_by.filter((id) => !retire_ids.includes(id));
    for (const id of retire_ids) {
      const c = this.claims.get(id);
      if (c) {
        c.status = 'retired';
        c.valid_to = nowIso();
      }
    }
  }

  query(entity?: string, attribute?: string): Claim[] {
    return [...this.claims.values()].filter((c) => (!entity || c.entity.toLowerCase() === entity.toLowerCase()) && (!attribute || c.attribute === attribute));
  }

  all(): Claim[] {
    return [...this.claims.values()];
  }

  contested(): Claim[] {
    return this.all().filter((c) => c.status === 'contested');
  }

  /** Forgetting: demote stale, low-utility nodes. Refuses anything under litigation hold. Never touches L2. */
  forget(olderThanDays: number, utilityBelow: number): { demoted: string[]; held: string[] } {
    const cutoff = Date.now() - olderThanDays * 86_400_000;
    const demoted: string[] = [];
    const held: string[] = [];
    for (const c of this.claims.values()) {
      if (c.status !== 'active' || c.utility >= utilityBelow || Date.parse(c.valid_from) > cutoff) continue;
      if (this.l2.isHeld(c.run_id)) { held.push(c.id); continue; }
      c.status = 'retired';
      c.valid_to = nowIso();
      demoted.push(c.id);
    }
    return { demoted, held };
  }
}
