import type { HouseRoom, Opening } from './types';
import { opt, FLOORS, FINISHES, FRAMES, CEILINGS, TILES, COUNTERS, WINDOW_TREATMENTS } from '../data/materials';

/** Everything the room's dimensions imply, in real units. */
export interface Takeoff {
  floorSqft: number;
  wallSqft: number;        // gross, four walls
  netWallSqft: number;     // minus openings
  ceilingSqft: number;
  perimeterFt: number;
  baseboardFt: number;     // perimeter minus door widths
  casingFt: number;        // around each opening
  paintGallonsWalls: number;
  paintGallonsCeiling: number;
  paintGallonsTrim: number;
  primerGallons: number;
  flooringSqftWithWaste: number;
  tileSqftWithWaste: number;
  curtainPanels: number;
  curtainRods: number;
  windowCount: number;
  doorCount: number;
  rugSuggestion: string;
  lumensTarget: number;
  volumeCuft: number;
  // costs, low/high
  cost: Record<string, [number, number]>;
}

const COVERAGE = 350; // sq ft per gallon, one coat
const COATS = 2;

export function openingArea(o: Opening) {
  return o.width * o.height;
}

export function takeoff(room: HouseRoom): Takeoff {
  const L = room.length, W = room.width, H = room.height;
  const waste = room.waste ?? 0.1;
  const floorSqft = L * W;
  const perimeterFt = 2 * (L + W);
  const wallSqft = perimeterFt * H;
  const openings = room.openings ?? [];
  const openArea = openings.reduce((a, o) => a + openingArea(o), 0);
  const netWallSqft = Math.max(0, wallSqft - openArea);
  const doors = openings.filter((o) => o.kind !== 'window');
  const windows = openings.filter((o) => o.kind === 'window');
  const baseboardFt = Math.max(0, perimeterFt - doors.reduce((a, o) => a + o.width, 0));
  const casingFt = openings.reduce((a, o) => a + (o.kind === 'window' ? 2 * (o.width + o.height) : o.width + 2 * o.height), 0);
  const wainscot = room.surfaces.wainscot ?? 0;
  const paintableWall = netWallSqft * (1 - wainscot);
  const paintGallonsWalls = Math.ceil((paintableWall * COATS) / COVERAGE * 4) / 4;
  const paintGallonsCeiling = Math.ceil((floorSqft * COATS) / COVERAGE * 4) / 4;
  const trimSqft = (baseboardFt * 0.6) + (casingFt * 0.35);
  const paintGallonsTrim = Math.max(0.25, Math.ceil((trimSqft * COATS) / COVERAGE * 4) / 4);
  const primerGallons = Math.ceil(paintableWall / COVERAGE * 4) / 4;
  const flooringSqftWithWaste = Math.ceil(floorSqft * (1 + waste));
  const tileSqft = room.surfaces.tileSqft ?? (wainscot > 0 ? netWallSqft * wainscot : 0);
  const tileSqftWithWaste = Math.ceil(tileSqft * (1 + Math.max(waste, 0.12)));
  const curtainPanels = windows.reduce((a, w) => a + Math.max(2, Math.ceil((w.width * 2.25 * 12) / 50)), 0);
  const curtainRods = windows.length;

  const shortSide = Math.min(L, W), longSide = Math.max(L, W);
  const rugW = Math.max(5, Math.floor(shortSide - 2.5));
  const rugL = Math.max(7, Math.floor(longSide - 3));
  const std: [number, number][] = [[5, 8], [6, 9], [8, 10], [9, 12], [10, 14], [12, 15]];
  const pick = std.filter(([w, l]) => w <= rugW && l <= rugL).pop() ?? std[0];
  const rugSuggestion = `${pick[0]}×${pick[1]}`;

  const perSqft = room.type === 'kitchen' ? 35 : room.type === 'bath' || room.type === 'powder' ? 40 : room.type === 'office' ? 30 : 15;
  const lumensTarget = Math.round(floorSqft * perSqft / 100) * 100;

  const f = opt(FLOORS, room.surfaces.floor);
  const fin = opt(FINISHES, room.surfaces.finish);
  const fr = opt(FRAMES, room.surfaces.trim);
  const ce = opt(CEILINGS, room.surfaces.ceiling);
  const cost: Record<string, [number, number]> = {};
  const c = (k: string, qty: number, o?: { cost?: [number, number] }) => {
    if (!o?.cost) return;
    cost[k] = [Math.round(qty * o.cost[0]), Math.round(qty * o.cost[1])];
  };
  c('Floor', flooringSqftWithWaste, f);
  c('Walls', paintableWall, fin);
  c('Ceiling', ce.unit?.includes('linear') ? Math.ceil(L / 3) * W : floorSqft, ce);
  c('Trim', baseboardFt + casingFt, fr);
  if (tileSqft > 0 && room.surfaces.tile) c('Tile', tileSqftWithWaste, opt(TILES, room.surfaces.tile));
  if (room.surfaces.counters && room.surfaces.counterSqft) c('Counters', room.surfaces.counterSqft, opt(COUNTERS, room.surfaces.counters));
  if (room.surfaces.windows && windows.length) {
    const wt = opt(WINDOW_TREATMENTS, room.surfaces.windows);
    const qty = wt.unit === 'panel' ? curtainPanels : wt.unit === 'sq ft' ? windows.reduce((a, w) => a + w.width * w.height, 0) : windows.length;
    c('Windows', qty, wt);
  }

  return {
    floorSqft, wallSqft, netWallSqft, ceilingSqft: floorSqft, perimeterFt, baseboardFt, casingFt,
    paintGallonsWalls, paintGallonsCeiling, paintGallonsTrim, primerGallons,
    flooringSqftWithWaste, tileSqftWithWaste, curtainPanels, curtainRods,
    windowCount: windows.length, doorCount: doors.length, rugSuggestion, lumensTarget, volumeCuft: floorSqft * H, cost,
  };
}

export const ftIn = (ft: number) => {
  const whole = Math.floor(ft);
  const inches = Math.round((ft - whole) * 12);
  if (inches === 12) return `${whole + 1}'`;
  return inches ? `${whole}' ${inches}"` : `${whole}'`;
};

export const fmtMoney = (n: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
export const fmtRange = (r: [number, number], currency = 'USD') => `${fmtMoney(r[0], currency)}–${fmtMoney(r[1], currency)}`;
