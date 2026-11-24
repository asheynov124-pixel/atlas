import { hopStatus } from '../hop/policy';
import { NODES, nodeById, type GraphNode } from './corpus';

export type LeadKind = 'learn' | 'capability' | 'build' | 'practice';

export interface LeadMove {
  id: string;
  kind: LeadKind;
  headline: string;
  why: string;
  nodeId: string;
  action: string;
  instrument: string;
}

const KIND_RANK: Record<GraphNode['kind'], number> = {
  knowledge: 0,
  practice: 1,
  capability: 2,
  build: 3,
};

/**
 * Independent lead: pick the highest-leverage safe frontier move.
 * Builds only appear when they raise a named capability already in view.
 */
export function proposeLeads(clock: number, focusId: string | null): LeadMove[] {
  const visible = NODES.filter((n) => hopStatus(n, clock) !== 'unborn');
  const safe = visible.filter((n) => hopStatus(n, clock) === 'safe');
  const sealed = visible.filter((n) => hopStatus(n, clock) === 'sealed');

  const moves: LeadMove[] = [];

  const focus = focusId ? NODES.find((n) => n.id === focusId) : undefined;
  // Builds stay on the capability-qualified path below — never a bare "Press on" build.
  if (focus && focus.kind !== 'build' && hopStatus(focus, clock) === 'safe') {
    moves.push({
      id: `node-${focus.id}`,
      kind: mapKind(focus.kind),
      headline: `Press on ${focus.title}`,
      why: focus.lead,
      nodeId: focus.id,
      action: focus.nextMoves[0] ?? 'Open and extract one durable note',
      instrument: instrumentFor(focus.kind),
    });
  }

  const nextLearn = [...safe]
    .filter((n) => n.kind === 'knowledge' || n.kind === 'practice')
    .sort((a, b) => a.spoil - b.spoil || a.first - b.first)[0];

  if (nextLearn && nextLearn.id !== focus?.id) {
    moves.push({
      id: `node-${nextLearn.id}`,
      kind: mapKind(nextLearn.kind),
      headline: `Expand knowledge: ${nextLearn.title}`,
      why: nextLearn.lead,
      nodeId: nextLearn.id,
      action: nextLearn.nextMoves[0] ?? 'Study and capture one principle',
      instrument: 'Research + note',
    });
  }

  const nextCap = [...safe]
    .filter((n) => n.kind === 'capability')
    .sort((a, b) => a.first - b.first)[0];

  if (nextCap && nextCap.id !== focus?.id) {
    moves.push({
      id: `node-${nextCap.id}`,
      kind: 'capability',
      headline: `Raise capability: ${nextCap.title}`,
      why: nextCap.lead,
      nodeId: nextCap.id,
      action: nextCap.nextMoves[0] ?? 'Practice once with a measurable check',
      instrument: 'Practice / specialist',
    });
  }

  const build =
    focus?.kind === 'build' && hopStatus(focus, clock) === 'safe'
      ? focus
      : [...safe].filter((n) => n.kind === 'build').sort((a, b) => a.first - b.first)[0];

  if (build) {
    const raised = build.raisesCapabilityId ? nodeById(build.raisesCapabilityId) : undefined;
    const raisedSafe = raised && hopStatus(raised, clock) === 'safe';
    if (raised && raisedSafe) {
      moves.push({
        id: `node-${build.id}`,
        kind: 'build',
        headline: `Build only if it raises ${raised.title}`,
        why: `${build.title} is an instrument for ${raised.title} — spawn it when it advances that capability, not as default output.`,
        nodeId: build.id,
        action: build.nextMoves[0] ?? 'Scope the smallest capability-raising cut',
        instrument: 'Idea → build',
      });
    }
  }

  if (sealed[0]) {
    const s = sealed.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind])[0];
    moves.push({
      id: `peek-${s.id}`,
      kind: mapKind(s.kind),
      headline: `Frontier sealed: ${s.title}`,
      why: `Past watermark depth ${clock}. Step past only when you want the frontier moved.`,
      nodeId: s.id,
      action: 'Peek, then stay or step past',
      instrument: 'Watermark hop',
    });
  }

  const seen = new Set<string>();
  return moves
    .filter((m) => {
      if (seen.has(m.nodeId)) return false;
      seen.add(m.nodeId);
      return true;
    })
    .slice(0, 4);
}

function mapKind(kind: GraphNode['kind']): LeadKind {
  if (kind === 'knowledge') return 'learn';
  if (kind === 'capability') return 'capability';
  if (kind === 'build') return 'build';
  return 'practice';
}

function instrumentFor(kind: GraphNode['kind']): string {
  if (kind === 'build') return 'Idea → build';
  if (kind === 'capability') return 'Practice / specialist';
  if (kind === 'practice') return 'Drill';
  return 'Research + note';
}

export function jarvisGreeting(clock: number): string {
  return `Depth ${clock}. I lead on what raises your knowledge and capability next — builds only when they serve that.`;
}
