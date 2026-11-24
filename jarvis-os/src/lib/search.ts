import type { GraphNode } from '../data/corpus';

export function matchesSearch(n: GraphNode, q: string): boolean {
  if (!q) return true;
  return (
    n.title.toLowerCase().includes(q) ||
    n.id.toLowerCase().includes(q) ||
    n.domain.toLowerCase().includes(q) ||
    n.kind.includes(q)
  );
}
