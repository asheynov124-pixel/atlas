/**
 * Mock capability + knowledge graph for Jarvis OS Mark I.
 * Sample fixtures so the HUD runs without Cortex Index.
 */

export type NodeKind = 'knowledge' | 'capability' | 'build' | 'practice';

export interface GraphNode {
  id: string;
  title: string;
  kind: NodeKind;
  description: string;
  /** Watermark: first depth this node becomes nameable */
  first: number;
  /** Watermark: spoil depth after which detail is sealed until advanced */
  spoil: number;
  domain: string;
  lead: string;
  nextMoves: string[];
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

export const DOMAINS = [
  'Systems',
  'Law',
  'Product',
  'Agents',
  'Craft',
] as const;

export const NODES: GraphNode[] = [
  {
    id: 'systems-map',
    title: 'Systems map',
    kind: 'knowledge',
    domain: 'Systems',
    description: 'See forces, delays, and leverage before acting.',
    first: 1,
    spoil: 1,
    lead: 'You already name stocks and flows. The next gain is spotting delayed feedback before it hits.',
    nextMoves: ['Sketch one causal loop for a live project', 'Name the slowest feedback in your week'],
    x: 18,
    y: 28,
  },
  {
    id: 'decision-log',
    title: 'Decision log',
    kind: 'practice',
    domain: 'Systems',
    description: 'Write decisions with assumed outcomes; review weekly.',
    first: 2,
    spoil: 3,
    lead: 'Logging is safe. The sealed layer is reviewing wrong bets without rewriting history.',
    nextMoves: ['Add assumptions column', 'Schedule a 20-min review'],
    x: 32,
    y: 18,
  },
  {
    id: 'nj-practice',
    title: 'NJ practice spine',
    kind: 'knowledge',
    domain: 'Law',
    description: 'Deadlines, local rules, and matter hygiene as a system.',
    first: 1,
    spoil: 2,
    lead: 'You know the docket shape. Capability rises when calendar sources are cited, never invented.',
    nextMoves: ['Cite one rule for an open deadline', 'Hand sealed procedure to Court Calendar desk'],
    x: 12,
    y: 58,
  },
  {
    id: 'brief-craft',
    title: 'Brief craft',
    kind: 'capability',
    domain: 'Law',
    description: 'Argument structure that survives a hostile read.',
    first: 3,
    spoil: 5,
    lead: 'Structure is reachable. Sealed work is the opponent’s best counter — invite Opposing Counsel when ready.',
    nextMoves: ['Outline claim → evidence → relief', 'Run a 15-min hostile pass'],
    x: 28,
    y: 72,
  },
  {
    id: 'product-sense',
    title: 'Product sense',
    kind: 'knowledge',
    domain: 'Product',
    description: 'Who hurts, what changes, how you know.',
    first: 1,
    spoil: 2,
    lead: 'Problem framing is safe. Sealed territory is kill criteria before you build.',
    nextMoves: ['Write a one-page problem brief', 'Define a stop/go metric'],
    x: 55,
    y: 22,
  },
  {
    id: 'ship-loop',
    title: 'Ship loop',
    kind: 'capability',
    domain: 'Product',
    description: 'Idea → scoped build → evidence → next cut.',
    first: 3,
    spoil: 6,
    lead: 'Builds are instruments. Only spawn them when they raise a named capability.',
    nextMoves: ['Pick one capability this build must raise', 'Refuse a build that only produces output'],
    x: 70,
    y: 34,
  },
  {
    id: 'hud-mark-i',
    title: 'Jarvis HUD Mark I',
    kind: 'build',
    domain: 'Product',
    description: 'This shell — graph, lead loop, hop gate.',
    first: 4,
    spoil: 4,
    lead: 'Alive as a mock. Next capability: wire Cortex Index without losing the lead loop.',
    nextMoves: ['Keep mock graph honest', 'Add citation contract for Oracle'],
    x: 82,
    y: 18,
  },
  {
    id: 'agent-orchestra',
    title: 'Agent orchestra',
    kind: 'knowledge',
    domain: 'Agents',
    description: 'When to lead vs dispatch a specialist.',
    first: 2,
    spoil: 4,
    lead: 'You know the roster. Sealed skill is refusing work that belongs to a specialist.',
    nextMoves: ['Name anti-jobs for Jarvis', 'Dispatch one sealed topic'],
    x: 58,
    y: 55,
  },
  {
    id: 'open-loop-memory',
    title: 'Open-loop memory',
    kind: 'capability',
    domain: 'Agents',
    description: 'Never re-brief from zero across sessions.',
    first: 4,
    spoil: 7,
    lead: 'Partial memory is here. Full loop closes when every lead writes what changed.',
    nextMoves: ['End session with a 3-line delta', 'Store domain watermarks'],
    x: 74,
    y: 68,
  },
  {
    id: 'writing-edge',
    title: 'Writing edge',
    kind: 'practice',
    domain: 'Craft',
    description: 'Clear prose under time pressure.',
    first: 1,
    spoil: 3,
    lead: 'Short sentences are safe. Sealed craft is cutting favorite lines that do not serve.',
    nextMoves: ['Cut 20% from one draft', 'Read aloud once'],
    x: 42,
    y: 48,
  },
  {
    id: 'deep-work',
    title: 'Deep work blocks',
    kind: 'capability',
    domain: 'Craft',
    description: 'Protected focus as a renewable asset.',
    first: 2,
    spoil: 4,
    lead: 'You can schedule blocks. Sealed layer is defending them against polite interrupts.',
    nextMoves: ['Protect one 90-min block tomorrow', 'Name the interrupt you will refuse'],
    x: 48,
    y: 78,
  },
  {
    id: 'unit-econ',
    title: 'Unit economics',
    kind: 'knowledge',
    domain: 'Product',
    description: 'Assumptions-labeled CAC / LTV sketches.',
    first: 5,
    spoil: 8,
    lead: 'Unborn until depth 5. Jarvis will unlock when ship-loop evidence exists.',
    nextMoves: ['Gather Adelin-supplied assumptions only', 'Hand math to Unit Economics desk'],
    x: 88,
    y: 48,
  },
  {
    id: 'voice-ring',
    title: 'Voice Ring',
    kind: 'build',
    domain: 'Agents',
    description: 'Voice I/O reflecting real assistant states.',
    first: 6,
    spoil: 9,
    lead: 'Not yet. Capability watermark must clear open-loop memory first.',
    nextMoves: ['Define ring state contract with HUD', 'Keep silent until states are real'],
    x: 90,
    y: 78,
  },
];

export const EDGES: GraphEdge[] = [
  { id: 'e1', from: 'systems-map', to: 'decision-log', label: 'practices' },
  { id: 'e2', from: 'systems-map', to: 'product-sense', label: 'informs' },
  { id: 'e3', from: 'product-sense', to: 'ship-loop', label: 'scopes' },
  { id: 'e4', from: 'ship-loop', to: 'hud-mark-i', label: 'builds' },
  { id: 'e5', from: 'nj-practice', to: 'brief-craft', label: 'feeds' },
  { id: 'e6', from: 'agent-orchestra', to: 'open-loop-memory', label: 'requires' },
  { id: 'e7', from: 'ship-loop', to: 'agent-orchestra', label: 'dispatches' },
  { id: 'e8', from: 'writing-edge', to: 'brief-craft', label: 'sharpens' },
  { id: 'e9', from: 'deep-work', to: 'ship-loop', label: 'fuels' },
  { id: 'e10', from: 'open-loop-memory', to: 'voice-ring', label: 'unlocks' },
  { id: 'e11', from: 'ship-loop', to: 'unit-econ', label: 'needs evidence' },
  { id: 'e12', from: 'hud-mark-i', to: 'open-loop-memory', label: 'writes' },
];

export function nodeById(id: string): GraphNode | undefined {
  return NODES.find((n) => n.id === id);
}
