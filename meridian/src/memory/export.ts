/** Portable bundle (§7.6): JSONL of L2 records, L3 claims, quarantine, and active holds. */
import { EpisodicStore } from './episodic.js';
import { SemanticGraph } from './graph.js';

export function exportBundle(l2: EpisodicStore, l3: SemanticGraph): string {
  const lines: string[] = [];
  for (const r of l2.all()) lines.push(JSON.stringify({ kind: 'episodic', ...r }));
  for (const c of l3.all()) lines.push(JSON.stringify({ kind: 'claim', ...c }));
  for (const q of l3.quarantine) lines.push(JSON.stringify({ kind: 'quarantined', ...q }));
  for (const h of l2.activeHolds()) lines.push(JSON.stringify({ kind: 'hold', ...h }));
  return lines.join('\n') + '\n';
}
