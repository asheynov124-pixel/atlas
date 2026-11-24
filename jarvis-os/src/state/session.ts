import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { HOP_CLOCK, hopStatus, type HopStatus } from '../hop/policy';
import { NODES, nodeById, type GraphNode } from '../data/corpus';
import { proposeLeads, type LeadMove } from '../data/lead';

export interface ActivityItem {
  id: string;
  at: number;
  text: string;
  tone: 'info' | 'lead' | 'warn';
}

export type Mode = 'explore' | 'lead' | 'build';

interface SessionState {
  clock: number;
  selectedId: string | null;
  peekId: string | null;
  query: string;
  mode: Mode;
  activity: ActivityItem[];
  acceptedLeadId: string | null;
  setClock: (n: number) => void;
  advanceTo: (n: number) => void;
  select: (id: string | null) => void;
  requestOpen: (id: string) => void;
  closePeek: () => void;
  confirmPeek: (action: 'stay' | 'extra' | 'stepPast') => void;
  setQuery: (q: string) => void;
  setMode: (m: Mode) => void;
  acceptLead: (move: LeadMove) => void;
  runCommand: (raw: string) => void;
  pushActivity: (text: string, tone?: ActivityItem['tone']) => void;
  leads: () => LeadMove[];
  selected: () => GraphNode | undefined;
  statusOf: (id: string) => HopStatus;
}

function clampClock(n: number) {
  return Math.min(HOP_CLOCK.max, Math.max(HOP_CLOCK.min, Math.round(n)));
}

/** Keep selectedId honest when the watermark moves. */
function reconcileSelection(
  selectedId: string | null,
  clock: number,
  peekId: string | null,
): { selectedId: string | null; peekId: string | null } {
  if (!selectedId) return { selectedId, peekId };
  const node = nodeById(selectedId);
  const status = hopStatus(node, clock);
  if (status === 'unborn') {
    return { selectedId: null, peekId: peekId === selectedId ? null : peekId };
  }
  if (status === 'sealed') {
    return { selectedId: null, peekId: selectedId };
  }
  return { selectedId, peekId };
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      clock: HOP_CLOCK.default,
      selectedId: 'product-sense',
      peekId: null,
      query: '',
      mode: 'lead',
      activity: [
        {
          id: 'boot',
          at: Date.now(),
          text: 'Jarvis OS Mark I online — mock graph, hop gate, independent lead loop.',
          tone: 'info',
        },
      ],
      acceptedLeadId: null,

      setClock: (n) => {
        const clock = clampClock(n);
        const { selectedId, peekId } = reconcileSelection(get().selectedId, clock, get().peekId);
        set({ clock, selectedId, peekId });
      },

      advanceTo: (n) => {
        const next = clampClock(n);
        if (next > get().clock) {
          const { selectedId, peekId } = reconcileSelection(get().selectedId, next, get().peekId);
          set({ clock: next, selectedId, peekId });
          get().pushActivity(`Watermark advanced to depth ${next}.`, 'warn');
        }
      },

      select: (id) => set({ selectedId: id, peekId: null }),

      requestOpen: (id) => {
        const node = nodeById(id);
        if (!node) return;
        const status = hopStatus(node, get().clock);
        if (status === 'safe') {
          set({ selectedId: id, peekId: null });
          get().pushActivity(`Opened ${node.title}.`, 'info');
          return;
        }
        if (status === 'unborn') {
          set({ peekId: id });
          get().pushActivity(`${node.title} is unborn at this depth.`, 'warn');
          return;
        }
        set({ peekId: id });
      },

      closePeek: () => set({ peekId: null }),

      confirmPeek: (action) => {
        const id = get().peekId;
        if (!id) return;
        const node = nodeById(id);
        if (!node) {
          set({ peekId: null });
          return;
        }
        if (action === 'stay') {
          set({ peekId: null });
          get().pushActivity(`Stayed short of ${node.title}.`, 'info');
          return;
        }
        if (action === 'stepPast') {
          get().advanceTo(node.spoil);
          set({ selectedId: id, peekId: null });
          get().pushActivity(`Stepped past into ${node.title}.`, 'lead');
          return;
        }
        // open as extra — view without advancing watermark
        set({ selectedId: id, peekId: null });
        get().pushActivity(`Opened ${node.title} as Extra (watermark unchanged).`, 'warn');
      },

      setQuery: (q) => set({ query: q }),
      setMode: (m) => set({ mode: m }),

      acceptLead: (move) => {
        set({ acceptedLeadId: move.id, mode: move.kind === 'build' ? 'build' : 'lead' });
        get().pushActivity(`Accepted lead: ${move.headline}`, 'lead');
        get().requestOpen(move.nodeId);
      },

      runCommand: (raw) => {
        const cmd = raw.trim();
        if (!cmd) return;
        get().pushActivity(`Command: ${cmd}`, 'info');
        const lower = cmd.toLowerCase();
        if (lower.startsWith('/depth ')) {
          const n = Number(lower.replace('/depth ', ''));
          if (!Number.isNaN(n)) get().setClock(n);
          return;
        }
        if (lower === '/lead') {
          set({ mode: 'lead' });
          const top = get().leads()[0];
          if (top) get().acceptLead(top);
          return;
        }
        set({ query: cmd });
        const match = NODES.find(
          (n) =>
            hopStatus(n, get().clock) !== 'unborn' &&
            (n.title.toLowerCase().includes(lower) || n.id.includes(lower)),
        );
        if (match) get().requestOpen(match.id);
      },

      pushActivity: (text, tone = 'info') =>
        set((s) => ({
          activity: [{ id: `${Date.now()}-${Math.random()}`, at: Date.now(), text, tone }, ...s.activity].slice(
            0,
            40,
          ),
        })),

      leads: () => proposeLeads(get().clock, get().selectedId),
      selected: () => (get().selectedId ? nodeById(get().selectedId!) : undefined),
      statusOf: (id) => {
        const n = nodeById(id);
        return hopStatus(n, get().clock);
      },
    }),
    {
      name: 'jarvis-os-session',
      partialize: (s) => ({ clock: s.clock, selectedId: s.selectedId, mode: s.mode }),
    },
  ),
);
