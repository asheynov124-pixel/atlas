import type { EvidenceRef } from '../core/types.js';

export interface ClaimCandidate {
  entity: string;
  attribute: string;
  value: string;
  confidence: number;
  evidence: Array<{ pointer: string; quote: string }>;
}

export interface Deliverable {
  text: string;
  evidence: EvidenceRef[];
  claims?: ClaimCandidate[];
  tokens_in: number;
  tokens_out: number;
  usd: number;
}
