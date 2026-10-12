import { piece } from '../data/pieces';
import type { Placed } from './types';

/** Put a list of pieces somewhere sensible in an L×W room (feet). A starting point, not a plan. */
export function autoPlace(type: string, L: number, W: number, ids: string[], mkId: (i: number, id: string) => string = (i, id) => `p-${id}-${i}`): Placed[] {
  const out: Placed[] = [];
  let cursorX = 1.2, loose = 0, sideZ = 1.2;
  const seen = new Set<string>();
  for (const id of ids) {
    const d = piece(id); if (!d) continue;
    const w = d.w / 12, dd = d.d / 12;
    let x = L / 2, z = W / 2, rot = 0;
    const dup = seen.has(id); seen.add(id);
    if (d.shape === 'rug') { x = L / 2; z = W / 2 + 0.5; }
    else if (d.shape === 'sofa' && id !== 'outdoor-sofa') { x = L / 2; z = W - dd / 2 - 1.2; rot = 180; }
    else if (id === 'outdoor-sofa') { x = L / 2; z = W - dd / 2 - 1; rot = 180; }
    else if (d.shape === 'bed') { x = L / 2; z = dd / 2 + 0.3; }
    else if (id === 'coffee') { x = L / 2; z = Math.max(dd / 2 + 1, W - 1.2 - 38 / 12 - 1.6 - dd / 2); }
    else if (id === 'dining' || id === 'round-dining' || d.shape === 'island') { x = L / 2; z = W / 2; }
    else if (id === 'dining-chairs') { x = L / 2; z = W / 2 - 2.6; }
    else if (id === 'stools') { x = L / 2; z = W / 2 + 2.6; }
    else if (id === 'chair' || id === 'armchair-pair' || d.shape === 'chair') { x = 1.6 + w / 2; z = W / 2 - 1; rot = 90; }
    else if (d.ceiling) { x = L / 2; z = W / 2; }
    else if (id === 'curtains') { x = L / 2; z = 0.3; }
    else if (id === 'floorlamp') { x = L - 1.2; z = W - 1.2; }
    else if (id === 'tablelamp') { x = L - 1.5; z = 1.3; }
    else if (d.shape === 'plant') { x = dup ? L - 1.2 : 1.2; z = W - 1.2; }
    else if (id === 'nightstands') { x = L / 2 - 64 / 24 - 1.2; z = 0.8; }
    else if (id === 'art' || id === 'mirror') { x = L / 2 + (dup ? 3 : 0); z = 0.1; }
    else if (id === 'tub') { x = L - w / 2 - 0.6; z = W / 2; rot = 90; }
    else if (id === 'wc') { x = 1.3; z = W - dd / 2 - 0.05; rot = 180; }
    else if (id === 'shower') { x = w / 2 + 0.05; z = dd / 2 + 0.05; }
    else if (id === 'fridge') { x = L - w / 2 - 0.1; z = dd / 2 + 0.05; }
    else if (id === 'range') { x = Math.max(w / 2 + 0.5, L / 2 - 4); z = dd / 2 + 0.05; }
    else if (id === 'shelves') { x = Math.min(L - w / 2 - 0.5, L / 2 + 1.5); z = dd / 2 + 0.05; }
    else if (d.wall) { x = Math.min(L - w / 2 - 0.2, cursorX + w / 2); z = dd / 2 + 0.05; cursorX += w + 1.2; }
    else { x = Math.min(L - w / 2 - 0.5, 1 + w / 2 + (loose % 3) * 3.2); z = Math.min(W - dd / 2, sideZ + dd / 2 + Math.floor(loose / 3) * 2.8); loose++; }
    out.push({ id: mkId(out.length, id), pieceId: id, x: Math.max(w / 2, Math.min(L - w / 2, x)), z: Math.max(dd / 2, Math.min(W - dd / 2, z)), rot });
  }
  return out;
}
