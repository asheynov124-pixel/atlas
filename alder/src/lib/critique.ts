import type { StudioState, HouseRoom } from './types';
import { paint } from '../data/palette';
import { piece } from '../data/pieces';
import { lrv, isWarm } from './color';

export interface Note {
  level: 'good' | 'hmm' | 'stop';
  title: string;
  body: string;
  fix?: Partial<StudioState>;
}

/** The atelier reads your choices and tells you what it sees. */
export function critique(s: StudioState, customHex?: Record<string, string>): Note[] {
  const notes: Note[] = [];
  const wallHex = customHex?.[s.wall] ?? paint(s.wall).hex;
  const wallLrv = lrv(wallHex);
  const warmWall = isWarm(wallHex);
  const darkCount = [s.floor === 'walnut', wallLrv < 25, s.cloth === 'ink-wool' || s.cloth === 'cognac', s.metal === 'blackened' || s.metal === 'bronze'].filter(Boolean).length;

  // Metal vs undertone
  if (s.metal === 'nickel' && warmWall && s.floor !== 'limestone' && s.floor !== 'mineral') {
    notes.push({ level: 'hmm', title: 'Nickel on a warm wall', body: 'Soft nickel wants cool stone and Slate Milk. Against this warm wall and a wood floor it will look like the wrong house. Brass or bronze would settle in.', fix: { metal: 'brass' } });
  }
  if (s.metal === 'chrome') {
    notes.push({ level: 'hmm', title: 'Chrome', body: 'Chrome only lives in a bath that is entirely cool and glossy. Everywhere else it makes the wood look dated.', fix: { metal: 'brass' } });
  }
  if (s.metal === 'brass' && !warmWall && s.floor === 'limestone') {
    notes.push({ level: 'hmm', title: 'Brass against a cool shell', body: 'This can work, but only if the brass is the deliberate warm note. Keep the lamps at 2700K so it reads as warm, not yellow.' });
  }

  // Dark count
  if (darkCount >= 3) {
    notes.push({ level: 'stop', title: `${darkCount} dark things`, body: 'A light room wants one dark. The floor, the wall, the cloth and the metal are all pulling down at once. Lift one.', fix: { floor: 'oak' } });
  } else if (darkCount === 0 && wallLrv > 60) {
    notes.push({ level: 'hmm', title: 'Nothing is dark', body: 'Everything here is the same lightness. The eye needs one place to rest: a walnut table, an ink throw, a soot door.', fix: { cloth: 'ink-wool' } });
  } else if (darkCount === 1) {
    notes.push({ level: 'good', title: 'One dark, deliberately', body: 'The room has a single anchor. That is the quiet kind of contrast.' });
  }

  // Deep wall, daytime room
  if (wallLrv < 20 && (s.room === 'kitchen' || s.room === 'bath') && s.hour >= 8 && s.hour <= 17) {
    notes.push({ level: 'hmm', title: 'A deep wall in a working room', body: 'Pressed Fig and Soft Soot belong to rooms you visit after dark. In a kitchen at noon you will feel like you are cooking in a cellar. Try it on the island only.', fix: { wall: 'linen' } });
  }
  if (wallLrv < 20 && s.warmth < 40) {
    notes.push({ level: 'hmm', title: 'Deep color, cold light', body: 'A deep wall under north light goes flat and sad. Warm the lamps before you change the paint.', fix: { warmth: 78 } });
  }

  // Slate in evening
  if (s.wall === 'slate' && s.warmth > 70) {
    notes.push({ level: 'hmm', title: 'Slate Milk after dark', body: 'The one cool white looks blue-gray and tired under evening lamps. If this room lives at night, Bone Milk will hold.', fix: { wall: 'bone' } });
  }

  // Floor and wall undertone
  if (s.floor === 'walnut' && s.wall === 'slate') {
    notes.push({ level: 'hmm', title: 'Walnut under a cool white', body: 'Walnut is red-brown. Slate Milk is blue-gray. Together the wood looks purple. Oat Plaster or Bone Milk would let the walnut be warm.', fix: { wall: 'oat' } });
  }

  // Texture count
  const textures = new Set<string>();
  if (s.finish === 'limewash' || s.finish === 'venetian' || s.finish === 'roman-clay') textures.add('mineral');
  if (s.floor === 'oak' || s.floor === 'walnut' || s.floor === 'oak-herringbone') textures.add('grain');
  if (s.floor === 'limestone' || s.floor === 'mineral' || s.floor === 'terracotta') textures.add('stone');
  if (s.cloth) textures.add('cloth');
  if (s.pieces.includes('rug')) textures.add('wool');
  if (s.cloth === 'boucle') textures.add('boucle');
  if (textures.size >= 3) {
    notes.push({ level: 'good', title: 'Three textures', body: `${[...textures].join(', ')}. That is a room. Pattern is optional now.` });
  }
  if (s.finish === 'smooth' && s.cloth === 'bone-linen' && s.floor === 'mineral') {
    notes.push({ level: 'hmm', title: 'Everything is smooth', body: 'Flat paint, flat floor, flat cloth. Nothing for the light to catch. Limewash the wall or put wool on the floor.', fix: { finish: 'limewash' } });
  }

  // Frame and wall
  if (s.frame === 'gallery' && wallLrv > 70) {
    notes.push({ level: 'hmm', title: 'Gallery frame on a pale wall', body: 'Thin metal disappears on Soft Soot and looks underfed on Bone Milk. A wide oak frame would belong here.' });
  }
  if (s.frame === 'craftsman' && s.room === 'kitchen') {
    notes.push({ level: 'hmm', title: 'Craftsman casing in a kitchen', body: 'Heavy casing fights flat cabinet doors. Square casing keeps the kitchen one idea.', fix: { frame: 'square' } });
  }
  if (s.frame === 'none') {
    notes.push({ level: 'hmm', title: 'Drywall returns', body: 'Beautiful when the drywall is perfect. Ask the contractor to show you one they have done. If they hesitate, choose square casing.' });
  }

  // Light layers
  const lamps = s.pieces.filter((p) => ['floorlamp', 'tablelamp', 'sconces', 'picture-light'].includes(p)).length;
  const overhead = s.pieces.filter((p) => ['pendant', 'chandelier'].includes(p)).length;
  if (lamps === 0 && s.room !== 'bath' && s.room !== 'kitchen') {
    notes.push({ level: 'stop', title: 'No light at eye level', body: 'Only a ceiling light. Every material will look cheaper. Add a floor lamp or a table lamp with a shade.', fix: { pieces: [...s.pieces, 'floorlamp'] } });
  } else if (lamps >= 1 && (overhead >= 1 || s.room === 'living' || s.room === 'bedroom')) {
    notes.push({ level: 'good', title: 'Light from two heights', body: 'You can turn the ceiling off and the room still works.' });
  }

  // Rug
  if ((s.room === 'living' || s.room === 'bedroom' || s.room === 'dining') && !s.pieces.includes('rug')) {
    notes.push({ level: 'hmm', title: 'No rug', body: 'The rug is the floor plan. Without it the furniture floats. Front legs of every seat on it.', fix: { pieces: [...s.pieces, 'rug'] } });
  }

  // Seating
  if (s.pieces.includes('sofa') && s.pieces.includes('loveseat')) {
    notes.push({ level: 'hmm', title: 'Sofa and loveseat', body: 'The matching-set diagram. One large sofa and one good chair is a room; a sofa and a loveseat is a waiting area.', fix: { pieces: s.pieces.filter((p) => p !== 'loveseat').concat('chair') } });
  }
  if (s.pieces.includes('sectional') && s.pieces.includes('chair') && s.pieces.includes('armchair-pair')) {
    notes.push({ level: 'hmm', title: 'Too many seats', body: 'A sectional seats five. The chairs are furniture for furniture. Pick the pair or the single.' });
  }

  // Pieces that are too much
  const bigCount = s.pieces.filter((p) => { const d = piece(p); return d && d.w * d.d > 2500; }).length;
  if (bigCount >= 4) {
    notes.push({ level: 'hmm', title: `${bigCount} large pieces`, body: 'Count the footprints. Rooms want one thing that is confidently large and air around it, not four things that are each a bit big.' });
  }

  // Warmth and metal
  if (s.warmth < 30 && s.metal === 'brass') {
    notes.push({ level: 'hmm', title: 'Brass under cool light', body: 'Unlacquered brass looks right under warm light and cheap under cool. Either warm the lamps or accept that this is a daytime metal.', fix: { warmth: 65 } });
  }

  // Ceiling same as wall
  if (s.ceiling === 'same-as-wall' && wallLrv > 60 && s.room !== 'powder' && s.room !== 'bath') {
    notes.push({ level: 'hmm', title: 'Ceiling the same as a light wall', body: 'Works as a jewel box in a deep color. In a light color it just means you forgot to paint the ceiling. A half-step lighter reads as intentional.', fix: { ceiling: 'flat-white' } });
  }
  if (s.ceiling === 'same-as-wall' && wallLrv < 30) {
    notes.push({ level: 'good', title: 'A jewel box', body: 'Deep wall, deep ceiling. In a small room you leave, this is the move.' });
  }

  if (notes.length === 0) notes.push({ level: 'good', title: 'Nothing to say', body: 'Which is the highest praise. Save it.' });
  return notes;
}

/** Clearance checks for a real room with placed furniture. */
export interface PlanNote { level: 'good' | 'hmm' | 'stop'; title: string; body: string; placedId?: string }

export function critiquePlan(room: HouseRoom): PlanNote[] {
  const out: PlanNote[] = [];
  const L = room.length, W = room.width;
  for (const p of room.placed) {
    const def = piece(p.pieceId);
    if (!def) continue;
    const w = (p.w ?? def.w) / 12, d = (p.d ?? def.d) / 12;
    const rot = ((p.rot % 180) + 180) % 180;
    const fw = rot === 90 ? d : w, fd = rot === 90 ? w : d;
    const x0 = p.x - fw / 2, x1 = p.x + fw / 2, z0 = p.z - fd / 2, z1 = p.z + fd / 2;
    if (x0 < -0.05 || z0 < -0.05 || x1 > L + 0.05 || z1 > W + 0.05) {
      out.push({ level: 'stop', title: `${def.name} is through the wall`, body: 'Part of it sits outside the room. Nudge it in or choose a smaller one.', placedId: p.id });
      continue;
    }
    // Path checks for the big seats
    if (['sofa', 'sectional', 'bed', 'bed-king', 'dining', 'island'].includes(p.pieceId)) {
      const gaps = [x0, L - x1, z0, W - z1];
      const need = p.pieceId === 'island' ? 3.5 : p.pieceId.startsWith('bed') ? 2 : p.pieceId === 'dining' ? 3 : 2.5;
      const tight = gaps.filter((g) => g > 0.2 && g < need).length;
      if (tight >= 2) out.push({ level: 'hmm', title: `${def.name}: tight on ${tight} sides`, body: `${def.clearance ?? `Leave about ${need * 12}" to walk.`}`, placedId: p.id });
    }
    // Overlaps
    for (const q of room.placed) {
      if (q.id <= p.id) continue;
      const qd = piece(q.pieceId); if (!qd) continue;
      if (def.shape === 'rug' || qd.shape === 'rug' || def.ceiling || qd.ceiling) continue;
      const qw = (q.w ?? qd.w) / 12, qdd = (q.d ?? qd.d) / 12;
      const qrot = ((q.rot % 180) + 180) % 180;
      const qfw = qrot === 90 ? qdd : qw, qfd = qrot === 90 ? qw : qdd;
      const ox = Math.min(x1, q.x + qfw / 2) - Math.max(x0, q.x - qfw / 2);
      const oz = Math.min(z1, q.z + qfd / 2) - Math.max(z0, q.z - qfd / 2);
      if (ox > 0.3 && oz > 0.3) out.push({ level: 'stop', title: `${def.name} overlaps ${qd.name}`, body: 'Two things in one place. Move one.', placedId: p.id });
    }
  }
  const rug = room.placed.find((p) => piece(p.pieceId)?.shape === 'rug' && p.pieceId !== 'runner');
  const sofa = room.placed.find((p) => ['sofa', 'sectional', 'loveseat'].includes(p.pieceId));
  if (rug && sofa) {
    const rd = piece(rug.pieceId)!;
    const rw = (rug.w ?? rd.w) / 12, rl = (rug.d ?? rd.d) / 12;
    const rrot = ((rug.rot % 180) + 180) % 180;
    const rfw = rrot === 90 ? rl : rw, rfd = rrot === 90 ? rw : rl;
    const inside = Math.abs(sofa.x - rug.x) < rfw / 2 && Math.abs(sofa.z - rug.z) < rfd / 2 + 1.2;
    out.push(inside ? { level: 'good', title: 'The rug catches the sofa', body: 'Front legs on. The furniture has a floor plan.' } : { level: 'hmm', title: 'The rug misses the sofa', body: 'Slide the rug until the front legs of the sofa land on it. Or buy the bigger rug.', placedId: rug.id });
  }
  const lamps = room.placed.filter((p) => ['floorlamp', 'tablelamp', 'sconces'].includes(p.pieceId)).length;
  if (['living', 'bedroom', 'lounge', 'office'].includes(room.type) && lamps === 0) out.push({ level: 'hmm', title: 'No lamp on the plan', body: 'Put a floor lamp where the ceiling light cannot reach. Then an outlet near it.' });
  if (room.facing === 'N' && lrv(paint(room.surfaces.wall).hex) < 55) out.push({ level: 'hmm', title: 'North room, a color under LRV 55', body: 'North light is blue and steady. This wall will read ten points darker than the chip. Sample it at 3pm.' });
  if (room.height < 8.5 && room.placed.some((p) => p.pieceId === 'chandelier')) out.push({ level: 'hmm', title: 'Chandelier under a low ceiling', body: 'At under 8½ feet, a 20-inch fixture hangs at forehead height. A flush mount or a wide shallow pendant.' });
  if (out.length === 0) out.push({ level: 'good', title: 'The plan clears', body: 'Nothing through a wall, nothing on top of anything. Walk it with tape on the floor before you order.' });
  return out;
}
