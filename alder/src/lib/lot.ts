import type { Lot, LotFeature, LotFeatureKind } from './types';

export const FEATURE_KINDS: { id: LotFeatureKind; name: string; hex: string; cost: [number, number]; unit: string; counts: boolean; note: string }[] = [
  { id: 'deck', name: 'Deck', hex: '#c4895a', cost: [35, 80], unit: 'sq ft', counts: true, note: 'Cedar or ipe. Low decks can usually step into the rear setback; tall ones cannot.' },
  { id: 'patio', name: 'Patio', hex: '#cfc6ba', cost: [18, 45], unit: 'sq ft', counts: true, note: 'Bluestone, pavers, or a poured slab. At grade, so setback rules are kinder.' },
  { id: 'pool', name: 'Pool', hex: '#8fb3c9', cost: [120, 250], unit: 'sq ft', counts: true, note: 'Needs a fence and usually 10 feet from any line. Ask before you dig.' },
  { id: 'spa', name: 'Spa platform', hex: '#7f8d92', cost: [60, 140], unit: 'sq ft', counts: true, note: 'Counts as a structure once it is tall. Keep it inside the envelope.' },
  { id: 'shed', name: 'Shed', hex: '#8a6a45', cost: [40, 120], unit: 'sq ft', counts: true, note: 'Accessory structures have their own setback, often 5 feet.' },
  { id: 'driveway', name: 'Driveway', hex: '#9a948b', cost: [8, 25], unit: 'sq ft', counts: false, note: 'Impervious, so it may count toward coverage in your town.' },
  { id: 'path', name: 'Path', hex: '#d8cfbf', cost: [12, 40], unit: 'sq ft', counts: false, note: 'Gravel or stone. Three feet wide is a path; four is a walk.' },
  { id: 'planting', name: 'Planting bed', hex: '#6f8f68', cost: [6, 20], unit: 'sq ft', counts: false, note: 'Natives, in drifts of three and five. One shrub species per bed.' },
  { id: 'tree', name: 'Tree', hex: '#3f6b45', cost: [300, 1500], unit: 'each', counts: false, note: 'Plant it where its shade will land on the deck at 4pm.' },
  { id: 'fence', name: 'Fence', hex: '#5c4a3a', cost: [30, 80], unit: 'linear ft', counts: false, note: 'Six feet at the rear and sides; four at the front. Good side out.' },
];

export const featureKind = (id: LotFeatureKind) => FEATURE_KINDS.find((k) => k.id === id) ?? FEATURE_KINDS[0];

export interface LotIssue { level: 'stop' | 'hmm' | 'good'; title: string; body: string; featureId?: string }

/** Coverage, setbacks, and the warnings a borough would raise. The street is the bottom edge. */
export function checkLot(lot: Lot): { coverage: number; coveredSqft: number; issues: LotIssue[]; envelope: { x: number; y: number; w: number; h: number } } {
  const { width: W, depth: D, setbacks: sb } = lot;
  const envelope = { x: sb.side, y: sb.rear, w: Math.max(0, W - sb.side * 2), h: Math.max(0, D - sb.rear - sb.front) };
  const issues: LotIssue[] = [];
  let covered = lot.house.w * lot.house.h;
  const inside = (f: { x: number; y: number; w: number; h: number }, margin = 0) => f.x >= envelope.x - margin && f.y >= envelope.y - margin && f.x + f.w <= envelope.x + envelope.w + margin && f.y + f.h <= envelope.y + envelope.h + margin;
  if (!inside(lot.house)) issues.push({ level: 'stop', title: 'The house sits outside its envelope', body: 'Drag the house inside the dashed lines, or fix the setbacks to match your survey.' });
  for (const f of lot.features) {
    const k = featureKind(f.kind);
    if (k.counts) covered += f.w * f.h;
    if (f.x < 0 || f.y < 0 || f.x + f.w > W || f.y + f.h > D) { issues.push({ level: 'stop', title: `${f.label ?? k.name} is over the property line`, body: 'Part of it is on the neighbor. Move it.', featureId: f.id }); continue; }
    if (f.kind === 'deck' && (f.height ?? 1.5) <= lot.lowDeckHeight) {
      // low decks may enter the rear setback by half, common in NJ boroughs
      const relaxed = { ...envelope, y: envelope.y - sb.rear / 2, h: envelope.h + sb.rear / 2 };
      const ok = f.x >= relaxed.x && f.y >= relaxed.y && f.x + f.w <= relaxed.x + relaxed.w && f.y + f.h <= relaxed.y + relaxed.h;
      if (!ok) issues.push({ level: 'hmm', title: `${f.label ?? 'Deck'} steps past the low-deck line`, body: `Under ${lot.lowDeckHeight} ft it may come halfway into the rear setback. It is past that. Shorten it or ask for a variance.`, featureId: f.id });
    } else if (k.counts && !inside(f)) {
      issues.push({ level: 'stop', title: `${f.label ?? k.name} is in the setback`, body: f.kind === 'deck' ? `A deck above ${lot.lowDeckHeight} ft is a structure. Lower it under the line or pull it in.` : f.kind === 'pool' ? 'Pools usually need 10 ft from every line and a fence. Pull it in.' : 'Structures stay inside the envelope. Pull it in or ask the borough.', featureId: f.id });
    }
    if (f.kind === 'pool') { const margin = 10; if (f.x < margin || f.y < margin || f.x + f.w > W - margin || f.y + f.h > D - margin) issues.push({ level: 'hmm', title: 'Pool is within 10 ft of a line', body: 'Most towns want 10 ft. Check yours before the excavator comes.', featureId: f.id }); }
    // overlaps the house
    const h = lot.house;
    if (k.counts && f.x < h.x + h.w && f.x + f.w > h.x && f.y < h.y + h.h && f.y + f.h > h.y && f.kind !== 'deck' && f.kind !== 'patio') issues.push({ level: 'hmm', title: `${f.label ?? k.name} overlaps the house`, body: 'Unless it is a deck or a patio against the wall, slide it off the footprint.', featureId: f.id });
  }
  const coverage = covered / (W * D);
  if (coverage > lot.maxCoverage) issues.push({ level: 'stop', title: `Coverage ${(coverage * 100).toFixed(1)}% is over ${Math.round(lot.maxCoverage * 100)}%`, body: 'Shrink the deck or the patio, or check whether your town counts decks.' });
  else if (coverage > lot.maxCoverage * 0.9) issues.push({ level: 'hmm', title: `Coverage ${(coverage * 100).toFixed(1)}%, close to the limit`, body: 'Room for little else. A future pool would not fit.' });
  if (issues.length === 0) issues.push({ level: 'good', title: 'The lot clears', body: `Coverage ${(coverage * 100).toFixed(1)}%. Everything sits inside its lines.` });
  return { coverage, coveredSqft: covered, issues, envelope };
}

export function lotCost(lot: Lot): [number, number] {
  return lot.features.reduce((a, f) => {
    const k = featureKind(f.kind);
    const qty = k.unit === 'each' ? 1 : k.unit === 'linear ft' ? Math.max(f.w, f.h) : f.w * f.h;
    const lo = f.cost ?? k.cost[0], hi = f.cost ?? k.cost[1];
    return [a[0] + qty * lo, a[1] + qty * hi] as [number, number];
  }, [0, 0] as [number, number]);
}

export const makeFeature = (kind: LotFeatureKind, lot: Lot): Omit<LotFeature, 'id'> => {
  const h = lot.house;
  switch (kind) {
    case 'deck': return { kind, x: h.x + 2, y: h.y - 12, w: Math.min(20, h.w - 4), h: 12, height: 1.5, material: 'cedar' };
    case 'patio': return { kind, x: h.x + h.w - 16, y: h.y - 14, w: 16, h: 14, material: 'bluestone' };
    case 'pool': { const w = 16, d = 32; const fits = h.x + h.w + 12 + w <= lot.width - lot.setbacks.side; return { kind, x: fits ? h.x + h.w + 12 : Math.max(lot.setbacks.side + 1, h.x), y: lot.setbacks.rear + 1, w, h: Math.min(d, Math.max(12, h.y - lot.setbacks.rear - 12)) }; }
    case 'spa': return { kind, x: h.x + h.w - 10, y: h.y - 10, w: 8, h: 8, height: 3 };
    case 'shed': return { kind, x: lot.width - 18, y: 6, w: 10, h: 12, height: 9 };
    case 'driveway': return { kind, x: lot.width - 24, y: lot.depth - 40, w: 12, h: 40 };
    case 'path': return { kind, x: h.x + h.w / 2 - 2, y: h.y + h.h, w: 4, h: lot.depth - h.y - h.h };
    case 'planting': return { kind, x: 2, y: h.y, w: Math.max(4, h.x - 4), h: h.h };
    case 'tree': return { kind, x: 8, y: 10, w: 14, h: 14 };
    case 'fence': return { kind, x: 0, y: 0, w: lot.width, h: 1 };
  }
};
