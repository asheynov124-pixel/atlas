import type { HouseRoom, HouseItem, HouseSettings, Decision, Seat } from './types';
import { STATUS_LABEL, PHASE_LABEL, DECISION_LABEL } from './types';
import { takeoff, ftIn, fmtMoney, fmtRange } from './takeoff';
import { paint } from '../data/palette';
import { FLOORS, FINISHES, FRAMES, METALS, CEILINGS, COUNTERS, TILES, WINDOW_TREATMENTS, opt } from '../data/materials';
import { piece } from '../data/pieces';
import { lineBest, CATEGORY_LABEL } from './budget';
import { critiquePlan } from './critique';

/** A plain-text brief a contractor can read on a phone. */
export function roomBrief(room: HouseRoom, items: HouseItem[], settings: HouseSettings, decisions: Decision[], seats: Seat[]): string {
  const t = takeoff(room);
  const s = room.surfaces;
  const L: string[] = [];
  L.push(`${settings.name.toUpperCase()} — ${room.name}`);
  L.push(`${new Date().toLocaleDateString()} · phase: ${PHASE_LABEL[room.phase ?? 'concept']}`);
  L.push('');
  L.push('ROOM');
  L.push(`${ftIn(room.length)} × ${ftIn(room.width)}, ${ftIn(room.height)} ceiling · ${t.floorSqft} sq ft · main window faces ${room.facing}`);
  for (const o of room.openings) L.push(`- ${o.kind} on the ${['north', 'east', 'south', 'west'][o.wall]} wall, ${ftIn(o.offset)} from the left, ${ftIn(o.width)} wide × ${ftIn(o.height)} high${o.kind === 'window' ? `, sill ${ftIn(o.sill ?? 2.5)}` : ''}`);
  if (room.notes) L.push(`Notes: ${room.notes}`);
  L.push('');
  L.push('SHELL');
  L.push(`Walls: ${paint(s.wall).name} (near ${paint(s.wall).near[0]}), ${opt(FINISHES, s.finish).name.toLowerCase()} · ${Math.round(t.netWallSqft)} sq ft net · ${t.paintGallonsWalls} gal + ${t.primerGallons} gal primer`);
  L.push(`Ceiling: ${opt(CEILINGS, s.ceiling).name}${s.ceiling !== 'same-as-wall' ? ` in ${paint(s.ceilingColor || 'chalk').name}` : ''} · ${t.ceilingSqft} sq ft`);
  L.push(`Trim: ${opt(FRAMES, s.trim).name} in ${paint(s.trimColor || 'chalk').name}, satin · ${Math.round(t.baseboardFt)} ft base + ${Math.round(t.casingFt)} ft casing`);
  L.push(`Floor: ${opt(FLOORS, s.floor).name} · ${t.floorSqft} sq ft, order ${t.flooringSqftWithWaste} with ${Math.round(room.waste * 100)}% waste`);
  if (s.tile) L.push(`Tile: ${opt(TILES, s.tile).name} · ${t.tileSqftWithWaste} sq ft with waste${s.wainscot ? ` (${Math.round(s.wainscot * 100)}% up the wall)` : ''}`);
  if (s.counters) L.push(`Counters: ${opt(COUNTERS, s.counters).name} · ${s.counterSqft ?? '?'} sq ft`);
  if (s.windows) L.push(`Windows: ${opt(WINDOW_TREATMENTS, s.windows).name} · ${t.windowCount} windows${s.windows === 'linen-panels' ? `, ${t.curtainPanels} panels, ${t.curtainRods} rods` : ''}`);
  L.push(`Metal: ${opt(METALS, s.metal).name}. One metal in each view.`);
  L.push('');
  L.push('PLAN');
  for (const p of room.placed) { const d = piece(p.pieceId); if (!d) continue; L.push(`- ${p.label ?? d.name}: ${Math.round(p.w ?? d.w)}″ W × ${Math.round(p.d ?? d.d)}″ D × ${Math.round(p.h ?? d.h)}″ H, center ${ftIn(p.x)} from the west wall, ${ftIn(p.z)} from the north wall${p.rot ? `, turned ${p.rot}°` : ''}`); }
  const plan = critiquePlan(room).filter((n) => n.level !== 'good');
  if (plan.length) { L.push('Clearance flags:'); plan.forEach((n) => L.push(`- ${n.title}. ${n.body}`)); }
  L.push('');
  L.push('LIST');
  const byCat = new Map<string, HouseItem[]>();
  for (const i of items) { const k = CATEGORY_LABEL[i.category]; byCat.set(k, [...(byCat.get(k) ?? []), i]); }
  for (const [k, list] of byCat) {
    L.push(k);
    for (const i of list) L.push(`- ${i.name} · ${i.qty} ${i.unit}${i.price ? ` × ${fmtMoney(i.price)}` : i.estimate ? ` × ${fmtRange(i.estimate)} est.` : ''} = ${fmtMoney(lineBest(i))} · ${STATUS_LABEL[i.status]}${i.retailer ? ` · ${i.retailer}` : ''}${i.sku ? ` · ${i.sku}` : ''}${i.lead ? ` · ${i.lead} wk` : ''}${i.url ? ` · ${i.url}` : ''}`);
  }
  const sub = items.reduce((a, i) => a + lineBest(i), 0);
  L.push(`Subtotal ${fmtMoney(sub)} before tax, delivery and ${Math.round(settings.contingency * 100)}% contingency.`);
  const dec = decisions.filter((d) => d.roomId === room.id);
  if (dec.length) {
    L.push('');
    L.push('DECISIONS');
    for (const d of dec) {
      const chosen = d.options.find((o) => o.id === d.chosen);
      L.push(`- ${d.title} · ${DECISION_LABEL[d.status]} · owner ${d.owner}${d.due ? ` · due ${d.due}` : ''}${chosen ? ` · chose ${chosen.label}` : ''}${d.blocks ? ` · blocks: ${d.blocks}` : ''}`);
      if (!chosen) d.options.forEach((o) => { const loves = seats.filter((s) => d.votes[s.id]?.[o.id] === 'love').map((s) => s.name); const passes = seats.filter((s) => d.votes[s.id]?.[o.id] === 'pass').map((s) => s.name); L.push(`    ${o.label}${o.note ? ` — ${o.note}` : ''}${loves.length ? ` · love: ${loves.join(', ')}` : ''}${passes.length ? ` · pass: ${passes.join(', ')}` : ''}`); });
    }
  }
  L.push('');
  L.push('Nothing ships until the open decisions close. Searches, not single listings, so compare what is for sale.');
  return L.join('\n');
}
