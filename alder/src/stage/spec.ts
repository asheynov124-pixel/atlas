import type { StageSpec, StagePlaced } from './scene';
import type { StudioState, HouseRoom, Custom, Scene } from '../lib/types';
import { paint } from '../data/palette';
import { FLOORS, METALS, CLOTHS, opt } from '../data/materials';
import { makeRoom } from '../lib/store';
import { STUDIO_ROOMS } from '../data/rooms';
import { autoPlace } from '../lib/autoplace';

const cache = new Map<string, HouseRoom>();

export function colorOf(id: string, customs: Custom[]): string {
  const c = customs.find((x) => x.id === id && x.hex);
  if (c?.hex) return c.hex;
  const cl = CLOTHS.find((x) => x.id === id);
  if (cl?.hex) return cl.hex;
  return paint(id).hex;
}

/** A stage spec from the free-form studio: a template room, with the chosen pieces auto-placed. */
export function studioSpec(s: StudioState, customs: Custom[], highlight?: string): StageSpec {
  const key = `${s.room}|${s.pieces.join(',')}`;
  let r = cache.get(key);
  if (!r) {
    const type = STUDIO_ROOMS.find((x) => x.id === s.room)?.id ?? 'living';
    const base = makeRoom(type);
    // rebuild placements for the chosen pieces using the same auto-placement
    r = { ...base, placed: autoPlace(type, base.length, base.width, s.pieces) };
    cache.set(key, r);
    if (cache.size > 40) cache.delete(cache.keys().next().value!);
  }
  const floor = opt(FLOORS, s.floor);
  return {
    length: r.length, width: r.width, height: r.height,
    wallHex: colorOf(s.wall, customs), floorId: s.floor, floorHex: floor.hex ?? '#c9a673', finish: s.finish, frame: s.frame,
    metalHex: opt(METALS, s.metal).hex ?? '#b08d57', clothHex: colorOf(s.cloth, customs),
    ceilingHex: s.ceiling === 'same-as-wall' ? colorOf(s.wall, customs) : paint(s.ceiling === 'flat-white' ? 'chalk' : 'candle').hex,
    trimHex: s.trim ? paint(s.trim).hex : '#f6f3ee',
    warmth: s.warmth, hour: s.hour ?? 15, openings: r.openings, placed: r.placed as StagePlaced[], highlight,
  };
}

/** A stage spec from a real room in My House. */
export function houseSpec(r: HouseRoom, highlight?: string, scene?: Scene | null): StageSpec {
  const s = r.surfaces;
  const floor = opt(FLOORS, s.floor);
  return {
    length: r.length, width: r.width, height: r.height,
    wallHex: paint(s.wall).hex, floorId: s.floor, floorHex: floor.hex ?? '#c9a673', finish: s.finish, frame: s.trim,
    metalHex: opt(METALS, s.metal).hex ?? '#b08d57', clothHex: opt(CLOTHS, s.cloth).hex ?? '#e7dcc8',
    ceilingHex: s.ceiling === 'same-as-wall' ? paint(s.wall).hex : paint(s.ceilingColor || 'chalk').hex,
    trimHex: paint(s.trimColor || 'chalk').hex,
    warmth: scene ? scene.warmth : r.warmth, hour: scene ? scene.hour : r.hour, openings: r.openings, placed: r.placed, highlight,
    ...(scene ? { lampLevel: scene.level, off: scene.off } : {}),
  };
}
