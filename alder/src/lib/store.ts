import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StudioState, SaveItem, Custom, HouseRoom, HouseItem, HouseSettings, Board, Placed, Opening, Surfaces, ItemStatus, Decision, Seat, HistoryEntry, Lot, RoomVersion, Scene, Vote } from './types';
import { STUDIO_TEMPLATES, roomType } from '../data/rooms';
import { piece } from '../data/pieces';
import { normalizeHex } from './color';
import { autoPlace } from './autoplace';

export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export type Theme = 'dark' | 'light';

interface State {
  theme: Theme;
  /** Bumped when the design changes enough that stored preferences should reset. */
  uiVersion?: number;
  studio: StudioState;
  /** A second studio for side-by-side comparison. */
  compare: StudioState | null;
  saves: SaveItem[];
  boards: Board[];
  seenLessons: string[];
  quizScores: Record<string, number>;
  customs: Custom[];
  house: { rooms: HouseRoom[]; items: HouseItem[]; settings: HouseSettings };
  decisions: Decision[];
  seats: Seat[];
  history: HistoryEntry[];
  /** Which seat is voting right now. */
  seatId: string;
  lot: Lot;

  setTheme: (t: Theme) => void;
  patchStudio: (p: Partial<StudioState>) => void;
  loadRoom: (room: string) => void;
  resetRoom: () => void;
  togglePiece: (id: string) => void;
  setCompare: (s: StudioState | null) => void;
  swapCompare: () => void;

  saveItem: (s: Omit<SaveItem, 'id' | 'at'>) => string;
  renameSave: (id: string, title: string) => void;
  removeSave: (id: string) => void;
  moveSave: (id: string, board: string | undefined) => void;
  addBoard: (name: string) => string;
  removeBoard: (id: string) => void;
  markLesson: (id: string) => void;
  setQuizScore: (id: string, score: number) => void;
  addCustom: (c: Custom) => void;
  removeCustom: (id: string) => void;

  addRoom: (type: string, name?: string) => string;
  updateRoom: (id: string, p: Partial<HouseRoom>) => void;
  updateSurfaces: (id: string, p: Partial<Surfaces>) => void;
  removeRoom: (id: string) => void;
  duplicateRoom: (id: string) => string;
  addPlaced: (roomId: string, pieceId: string, at?: { x: number; z: number }) => string;
  updatePlaced: (roomId: string, placedId: string, p: Partial<Placed>) => void;
  removePlaced: (roomId: string, placedId: string) => void;
  addOpening: (roomId: string, o: Omit<Opening, 'id'>) => void;
  updateOpening: (roomId: string, id: string, p: Partial<Opening>) => void;
  removeOpening: (roomId: string, id: string) => void;

  addItem: (i: Omit<HouseItem, 'id' | 'at'>) => string;
  updateItem: (id: string, p: Partial<HouseItem>) => void;
  removeItem: (id: string) => void;
  setItemStatus: (id: string, s: ItemStatus) => void;
  updateSettings: (p: Partial<HouseSettings>) => void;
  importHouse: (h: State['house']) => void;

  addDecision: (d: Omit<Decision, 'id' | 'at' | 'votes' | 'status'> & Partial<Pick<Decision, 'status' | 'votes'>>) => string;
  updateDecision: (id: string, p: Partial<Decision>) => void;
  removeDecision: (id: string) => void;
  vote: (decisionId: string, optionId: string, v: Vote | null) => void;
  decide: (decisionId: string, optionId: string) => void;
  addSeat: (s: Omit<Seat, 'id'>) => string;
  updateSeat: (id: string, p: Partial<Seat>) => void;
  removeSeat: (id: string) => void;
  setSeat: (id: string) => void;
  log: (text: string, extra?: Partial<HistoryEntry>) => void;
  setLot: (p: Partial<Lot>) => void;
  addLotFeature: (f: Omit<Lot['features'][number], 'id'>) => string;
  updateLotFeature: (id: string, p: Partial<Lot['features'][number]>) => void;
  removeLotFeature: (id: string) => void;
  snapshotRoom: (roomId: string, label: string, kind: RoomVersion['kind'], date?: string, note?: string) => string;
  restoreVersion: (roomId: string, versionId: string) => void;
  removeVersion: (roomId: string, versionId: string) => void;
  addScene: (roomId: string, sc: Omit<Scene, 'id'>) => string;
  updateScene: (roomId: string, id: string, p: Partial<Scene>) => void;
  removeScene: (roomId: string, id: string) => void;
}

export const DEFAULT_LOT: Lot = {
  width: 75, depth: 110, house: { x: 20, y: 40, w: 36, h: 30 }, setbacks: { front: 30, rear: 25, side: 12 }, maxCoverage: 0.3, lowDeckHeight: 2.5, features: [], place: '',
};
export const DEFAULT_SEAT: Seat = { id: 'me', name: 'Me', role: 'Host', leans: 'the whole picture' };

const DEFAULT_SETTINGS: HouseSettings = { name: 'Our house', taxRate: 0.06625, contingency: 0.12, shippingDefault: 0.06, currency: 'USD' };

function defaultOpenings(type: string, L: number, W: number): Opening[] {
  const o: Opening[] = [{ id: uid(), kind: 'door', wall: 2, offset: Math.max(0.5, L / 2 - 1.5), width: 3, height: 6.67 }];
  if (type !== 'powder' && type !== 'hall') o.push({ id: uid(), kind: 'window', wall: 0, offset: Math.max(0.5, L / 2 - 2), width: Math.min(4, L - 1), height: 4.5, sill: 2.5 });
  if (type === 'living' || type === 'bedroom' || type === 'dining') o.push({ id: uid(), kind: 'window', wall: 1, offset: Math.max(0.5, W / 2 - 1.5), width: Math.min(3, W - 1), height: 4.5, sill: 2.5 });
  return o;
}

export function makeRoom(type: string, name?: string): HouseRoom {
  const t = roomType(type);
  const [L, W, H] = t.dims;
  const tpl = STUDIO_TEMPLATES[t.studio] ?? STUDIO_TEMPLATES.living;
  const surfaces: Surfaces = {
    wall: tpl.wall, finish: tpl.finish, ceiling: tpl.ceiling, ceilingColor: 'chalk', floor: tpl.floor, trim: tpl.frame, trimColor: 'chalk',
    metal: tpl.metal, cloth: tpl.cloth, windows: type === 'bath' || type === 'kitchen' ? 'roman' : 'linen-panels',
    ...(type === 'kitchen' ? { counters: 'quartzite', counterSqft: 45, tile: 'zellige', tileSqft: 30, hardware: 'edge-pull' } : {}),
    ...(type === 'bath' ? { counters: 'limestone-top', counterSqft: 14, tile: 'limestone-tile', tileSqft: 120, wainscot: 0.35 } : {}),
    ...(type === 'powder' ? { counters: 'limestone-top', counterSqft: 6 } : {}),
    ...(type === 'mudroom' ? { tile: 'terracotta-tile', wainscot: 0.3 } : {}),
  };
  return {
    id: uid(), name: name ?? t.name, type, length: L, width: W, height: H, facing: 'S', openings: defaultOpenings(type, L, W),
    placed: autoPlace(type, L, W, t.pieces, () => uid()), surfaces, waste: 0.1, warmth: tpl.warmth, hour: tpl.hour, at: Date.now(),
  };
}

export function sanitizeCustoms(list: unknown): Custom[] {
  if (!Array.isArray(list)) return [];
  const out: Custom[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const c = raw as Record<string, unknown>;
    if ((c.kind !== 'idea' && c.kind !== 'color' && c.kind !== 'option') || typeof c.id !== 'string' || typeof c.text !== 'string' || !c.text.trim()) continue;
    const hex = typeof c.hex === 'string' ? normalizeHex(c.hex) : null;
    if (c.kind === 'color' && !hex) continue;
    out.push({ id: c.id, kind: c.kind, text: c.text.trim().slice(0, 140), ...(hex ? { hex } : {}) });
  }
  return out.slice(0, 60);
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      theme: 'light',
      uiVersion: 3,
      studio: STUDIO_TEMPLATES.living,
      compare: null,
      saves: [],
      boards: [],
      seenLessons: [],
      quizScores: {},
      customs: [],
      house: { rooms: [], items: [], settings: DEFAULT_SETTINGS },
      decisions: [],
      seats: [DEFAULT_SEAT],
      history: [],
      seatId: 'me',
      lot: DEFAULT_LOT,

      setTheme: (theme) => set({ theme }),
      patchStudio: (p) => set({ studio: { ...get().studio, ...p } }),
      loadRoom: (room) => set({ studio: { ...get().studio, room, pieces: (STUDIO_TEMPLATES[room] ?? STUDIO_TEMPLATES.living).pieces } }),
      resetRoom: () => set({ studio: { ...(STUDIO_TEMPLATES[get().studio.room] ?? STUDIO_TEMPLATES.living) } }),
      togglePiece: (id) => {
        const ps = get().studio.pieces;
        set({ studio: { ...get().studio, pieces: ps.includes(id) ? ps.filter((p) => p !== id) : [...ps, id] } });
      },
      setCompare: (compare) => set({ compare }),
      swapCompare: () => { const { studio, compare } = get(); if (compare) set({ studio: compare, compare: studio }); },

      saveItem: (s) => { const id = `save-${uid()}`; set({ saves: [{ ...s, id, at: Date.now() }, ...get().saves].slice(0, 200) }); return id; },
      renameSave: (id, title) => set({ saves: get().saves.map((s) => (s.id === id ? { ...s, title: title.trim() || s.title } : s)) }),
      removeSave: (id) => set({ saves: get().saves.filter((s) => s.id !== id) }),
      moveSave: (id, board) => set({ saves: get().saves.map((s) => (s.id === id ? { ...s, board } : s)) }),
      addBoard: (name) => { const id = `board-${uid()}`; set({ boards: [...get().boards, { id, name: name.trim() || 'Board' }] }); return id; },
      removeBoard: (id) => set({ boards: get().boards.filter((b) => b.id !== id), saves: get().saves.map((s) => (s.board === id ? { ...s, board: undefined } : s)) }),
      markLesson: (id) => set({ seenLessons: get().seenLessons.includes(id) ? get().seenLessons : [...get().seenLessons, id] }),
      setQuizScore: (id, score) => set({ quizScores: { ...get().quizScores, [id]: score } }),
      addCustom: (c) => {
        const cs = get().customs;
        if (cs.length >= 60 || cs.some((x) => x.kind === c.kind && x.text.toLowerCase() === c.text.toLowerCase())) return;
        set({ customs: [c, ...cs] });
      },
      removeCustom: (id) => {
        const s = get().studio;
        set({ customs: get().customs.filter((c) => c.id !== id), studio: { ...s, wall: s.wall === id ? 'bone' : s.wall, cloth: s.cloth === id ? 'oat-linen' : s.cloth } });
      },

      addRoom: (type, name) => { const r = makeRoom(type, name); set({ house: { ...get().house, rooms: [...get().house.rooms, r] } }); return r.id; },
      updateRoom: (id, p) => set({ house: { ...get().house, rooms: get().house.rooms.map((r) => (r.id === id ? { ...r, ...p } : r)) } }),
      updateSurfaces: (id, p) => set({ house: { ...get().house, rooms: get().house.rooms.map((r) => (r.id === id ? { ...r, surfaces: { ...r.surfaces, ...p } } : r)) } }),
      removeRoom: (id) => set({ house: { ...get().house, rooms: get().house.rooms.filter((r) => r.id !== id), items: get().house.items.filter((i) => i.roomId !== id) } }),
      duplicateRoom: (id) => {
        const r = get().house.rooms.find((x) => x.id === id); if (!r) return '';
        const nid = uid();
        const copy: HouseRoom = { ...r, id: nid, name: `${r.name} copy`, at: Date.now(), openings: r.openings.map((o) => ({ ...o, id: uid() })), placed: r.placed.map((p) => ({ ...p, id: uid() })) };
        const items = get().house.items.filter((i) => i.roomId === id).map((i) => ({ ...i, id: uid(), roomId: nid, pieceId: undefined, at: Date.now() }));
        set({ house: { ...get().house, rooms: [...get().house.rooms, copy], items: [...get().house.items, ...items] } });
        return nid;
      },
      addPlaced: (roomId, pieceId, at) => {
        const r = get().house.rooms.find((x) => x.id === roomId); const d = piece(pieceId); if (!r || !d) return '';
        const id = uid();
        // Smart pieces go where they work: cameras in a corner looking in, mesh at a wall mid-point, sensors off the pendant's spot.
        const spot = (): { x: number; z: number; rot: number } => {
          const n = r.placed.filter((q) => q.pieceId === pieceId).length;
          if (pieceId === 'camera') return [{ x: 0.4, z: 0.4, rot: 135 }, { x: r.length - 0.4, z: 0.4, rot: 225 }, { x: r.length - 0.4, z: r.width - 0.4, rot: 315 }, { x: 0.4, z: r.width - 0.4, rot: 45 }][n % 4];
          if (pieceId === 'mesh' || pieceId === 'shelf-speaker') return { x: r.length / 2 + n * 2, z: 0.6, rot: 0 };
          if (pieceId === 'presence' || pieceId === 'ceiling-speaker' || pieceId === 'recessed') return { x: r.length / 2 + (n % 2 ? 3 : -3), z: r.width / 2 + (n > 1 ? 3 : -3), rot: 0 };
          if (pieceId === 'thermostat' || pieceId === 'smart-switch') return { x: 1 + n * 1.5, z: r.width - 0.2, rot: 0 };
          if (pieceId === 'leak-sensor') return { x: r.length - 1.5, z: r.width - 1, rot: 0 };
          return { x: Math.min(r.length - d.w / 24, r.length / 2), z: Math.min(r.width - d.d / 24, r.width / 2), rot: 0 };
        };
        const auto = spot();
        const p: Placed = { id, pieceId, x: at?.x ?? auto.x, z: at?.z ?? auto.z, rot: at ? 0 : auto.rot };
        get().updateRoom(roomId, { placed: [...r.placed, p] });
        return id;
      },
      updatePlaced: (roomId, placedId, p) => { const r = get().house.rooms.find((x) => x.id === roomId); if (!r) return; get().updateRoom(roomId, { placed: r.placed.map((x) => (x.id === placedId ? { ...x, ...p } : x)) }); },
      removePlaced: (roomId, placedId) => { const r = get().house.rooms.find((x) => x.id === roomId); if (!r) return; get().updateRoom(roomId, { placed: r.placed.filter((x) => x.id !== placedId) }); set({ house: { ...get().house, items: get().house.items.map((i) => (i.pieceId === placedId ? { ...i, pieceId: undefined } : i)) } }); },
      addOpening: (roomId, o) => { const r = get().house.rooms.find((x) => x.id === roomId); if (!r) return; get().updateRoom(roomId, { openings: [...r.openings, { ...o, id: uid() }] }); },
      updateOpening: (roomId, id, p) => { const r = get().house.rooms.find((x) => x.id === roomId); if (!r) return; get().updateRoom(roomId, { openings: r.openings.map((o) => (o.id === id ? { ...o, ...p } : o)) }); },
      removeOpening: (roomId, id) => { const r = get().house.rooms.find((x) => x.id === roomId); if (!r) return; get().updateRoom(roomId, { openings: r.openings.filter((o) => o.id !== id) }); },

      addItem: (i) => { const id = uid(); set({ house: { ...get().house, items: [...get().house.items, { ...i, id, at: Date.now() }] } }); return id; },
      updateItem: (id, p) => set({ house: { ...get().house, items: get().house.items.map((i) => (i.id === id ? { ...i, ...p } : i)) } }),
      removeItem: (id) => set({ house: { ...get().house, items: get().house.items.filter((i) => i.id !== id) } }),
      setItemStatus: (id, status) => set({ house: { ...get().house, items: get().house.items.map((i) => (i.id === id ? { ...i, status, orderedAt: status === 'ordered' && !i.orderedAt ? Date.now() : i.orderedAt } : i)) } }),
      updateSettings: (p) => set({ house: { ...get().house, settings: { ...get().house.settings, ...p } } }),
      importHouse: (h) => {
        const x = h as State['house'] & Partial<Pick<State, 'decisions' | 'seats' | 'history' | 'lot'>>;
        set({ house: { rooms: Array.isArray(h.rooms) ? h.rooms : [], items: Array.isArray(h.items) ? h.items : [], settings: { ...DEFAULT_SETTINGS, ...(h.settings ?? {}) } }, ...(Array.isArray(x.decisions) ? { decisions: x.decisions } : {}), ...(Array.isArray(x.seats) && x.seats.length ? { seats: x.seats } : {}), ...(Array.isArray(x.history) ? { history: x.history } : {}), ...(x.lot ? { lot: { ...DEFAULT_LOT, ...x.lot } } : {}) });
      },

      addDecision: (d) => { const id = uid(); set({ decisions: [{ status: 'open', votes: {}, ...d, id, at: Date.now() }, ...get().decisions] }); get().log(`Opened “${d.title}”`, { decisionId: id, roomId: d.roomId }); return id; },
      updateDecision: (id, p) => set({ decisions: get().decisions.map((d) => (d.id === id ? { ...d, ...p } : d)) }),
      removeDecision: (id) => set({ decisions: get().decisions.filter((d) => d.id !== id) }),
      vote: (decisionId, optionId, v) => {
        const seat = get().seatId;
        set({ decisions: get().decisions.map((d) => { if (d.id !== decisionId) return d; const mine = { ...(d.votes[seat] ?? {}) }; if (v) mine[optionId] = v; else delete mine[optionId]; return { ...d, votes: { ...d.votes, [seat]: mine } }; }) });
        const d = get().decisions.find((x) => x.id === decisionId); const o = d?.options.find((x) => x.id === optionId); const who = get().seats.find((x) => x.id === seat)?.name ?? 'Someone';
        if (d && o && v) get().log(`${who} ${v === 'love' ? 'loves' : v === 'pass' ? 'passed on' : 'can live with'} ${o.label} for ${d.title}`, { seatId: seat, decisionId, roomId: d.roomId });
      },
      decide: (decisionId, optionId) => {
        const d = get().decisions.find((x) => x.id === decisionId); if (!d) return;
        get().updateDecision(decisionId, { status: 'decided', chosen: optionId });
        get().log(`Decided ${d.title}: ${d.options.find((o) => o.id === optionId)?.label ?? ''}`, { decisionId, roomId: d.roomId, seatId: get().seatId });
      },
      addSeat: (st) => { const id = uid(); set({ seats: [...get().seats, { ...st, id }] }); return id; },
      updateSeat: (id, p) => set({ seats: get().seats.map((x) => (x.id === id ? { ...x, ...p } : x)) }),
      removeSeat: (id) => set({ seats: get().seats.filter((x) => x.id !== id), seatId: get().seatId === id ? get().seats[0]?.id ?? 'me' : get().seatId }),
      setSeat: (seatId) => set({ seatId }),
      log: (text, extra) => set({ history: [{ id: uid(), at: Date.now(), text, ...extra }, ...get().history].slice(0, 300) }),
      setLot: (p) => set({ lot: { ...get().lot, ...p } }),
      addLotFeature: (f) => { const id = uid(); set({ lot: { ...get().lot, features: [...get().lot.features, { ...f, id }] } }); return id; },
      updateLotFeature: (id, p) => set({ lot: { ...get().lot, features: get().lot.features.map((f) => (f.id === id ? { ...f, ...p } : f)) } }),
      removeLotFeature: (id) => set({ lot: { ...get().lot, features: get().lot.features.filter((f) => f.id !== id) } }),
      snapshotRoom: (roomId, label, kind, date, note) => {
        const r = get().house.rooms.find((x) => x.id === roomId); if (!r) return '';
        const id = uid();
        const v: RoomVersion = { id, label, kind, date: date ?? new Date().toISOString().slice(0, 10), note, at: Date.now(), snapshot: { length: r.length, width: r.width, height: r.height, surfaces: { ...r.surfaces }, placed: r.placed.map((p) => ({ ...p })), openings: r.openings.map((o) => ({ ...o })) } };
        const versions = (r.versions ?? []).map((x) => (kind === 'current' && x.kind === 'current' ? { ...x, kind: 'past' as const } : x));
        get().updateRoom(roomId, { versions: [...versions, v] });
        get().log(`Recorded ${r.name} as “${label}”`, { roomId });
        return id;
      },
      restoreVersion: (roomId, versionId) => {
        const r = get().house.rooms.find((x) => x.id === roomId); const v = r?.versions?.find((x) => x.id === versionId); if (!r || !v) return;
        get().updateRoom(roomId, { ...v.snapshot, surfaces: { ...v.snapshot.surfaces }, placed: v.snapshot.placed.map((p) => ({ ...p })), openings: v.snapshot.openings.map((o) => ({ ...o })) });
        get().log(`Opened ${r.name} as “${v.label}”`, { roomId });
      },
      removeVersion: (roomId, versionId) => { const r = get().house.rooms.find((x) => x.id === roomId); if (!r) return; get().updateRoom(roomId, { versions: (r.versions ?? []).filter((v) => v.id !== versionId) }); },
      addScene: (roomId, sc) => { const r = get().house.rooms.find((x) => x.id === roomId); if (!r) return ''; const id = uid(); get().updateRoom(roomId, { scenes: [...(r.scenes ?? []), { ...sc, id }] }); return id; },
      updateScene: (roomId, id, p) => { const r = get().house.rooms.find((x) => x.id === roomId); if (!r) return; get().updateRoom(roomId, { scenes: (r.scenes ?? []).map((x) => (x.id === id ? { ...x, ...p } : x)) }); },
      removeScene: (roomId, id) => { const r = get().house.rooms.find((x) => x.id === roomId); if (!r) return; get().updateRoom(roomId, { scenes: (r.scenes ?? []).filter((x) => x.id !== id) }); },
    }),
    {
      name: 'alder-atelier-v2',
      version: 2,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        return {
          ...current,
          theme: p.uiVersion === 3 && p.theme === 'dark' ? 'dark' : 'light',
          uiVersion: 3,
          studio: { ...current.studio, ...(p.studio ?? {}) },
          compare: p.compare ?? null,
          saves: Array.isArray(p.saves) ? p.saves : [],
          boards: Array.isArray(p.boards) ? p.boards : [],
          seenLessons: Array.isArray(p.seenLessons) ? p.seenLessons : [],
          quizScores: p.quizScores ?? {},
          customs: sanitizeCustoms(p.customs),
          house: {
            rooms: Array.isArray(p.house?.rooms) ? p.house!.rooms : [],
            items: Array.isArray(p.house?.items) ? p.house!.items : [],
            settings: { ...DEFAULT_SETTINGS, ...(p.house?.settings ?? {}) },
          },
          decisions: Array.isArray(p.decisions) ? p.decisions : [],
          seats: Array.isArray(p.seats) && p.seats.length ? p.seats : [DEFAULT_SEAT],
          history: Array.isArray(p.history) ? p.history : [],
          seatId: typeof p.seatId === 'string' ? p.seatId : 'me',
          lot: { ...DEFAULT_LOT, ...(p.lot ?? {}), features: Array.isArray(p.lot?.features) ? p.lot!.features : [] },
        };
      },
    },
  ),
);

/** Migrate the Grok-era saves if someone has them. */
export function migrateV1() {
  try {
    const raw = localStorage.getItem('alder-atelier-v1');
    if (!raw) return;
    const v1 = JSON.parse(raw)?.state;
    if (!v1) return;
    const s = useStore.getState();
    if (s.saves.length === 0 && Array.isArray(v1.saves)) useStore.setState({ saves: v1.saves });
    if (s.customs.length === 0) useStore.setState({ customs: sanitizeCustoms(v1.customs) });
    localStorage.removeItem('alder-atelier-v1');
  } catch { /* ignore */ }
}
