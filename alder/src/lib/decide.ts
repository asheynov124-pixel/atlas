import type { Decision, DecisionOption, Seat, Vote, HouseItem } from './types';

export interface Tally { option: DecisionOption; loves: Seat[]; oks: Seat[]; passes: Seat[]; score: number }

export function tally(d: Decision, seats: Seat[]): Tally[] {
  return d.options.map((o) => {
    const loves = seats.filter((s) => d.votes[s.id]?.[o.id] === 'love');
    const oks = seats.filter((s) => d.votes[s.id]?.[o.id] === 'ok');
    const passes = seats.filter((s) => d.votes[s.id]?.[o.id] === 'pass');
    return { option: o, loves, oks, passes, score: loves.length * 2 + oks.length - passes.length * 3 };
  }).sort((a, b) => b.score - a.score);
}

export type Split = 'aligned' | 'split' | 'quiet' | 'decided';

export function splitOf(d: Decision, seats: Seat[]): Split {
  if (d.status === 'decided') return 'decided';
  const t = tally(d, seats);
  const voted = seats.filter((s) => d.votes[s.id] && Object.keys(d.votes[s.id]).length);
  if (voted.length === 0) return 'quiet';
  const lead = t[0];
  if (lead && lead.passes.length === 0 && lead.loves.length >= Math.max(1, Math.ceil(voted.length / 2))) return 'aligned';
  return 'split';
}

const names = (xs: Seat[]) => xs.map((s) => s.name).join(xs.length === 2 ? ' and ' : ', ').replace(/, ([^,]*)$/, ' and $1');

/** The mediator. It does not pick a winner. It names the objection to answer first. */
export function mediate(d: Decision, seats: Seat[]): string[] {
  const t = tally(d, seats);
  const out: string[] = [];
  const voted = seats.filter((s) => d.votes[s.id] && Object.keys(d.votes[s.id]).length);
  if (voted.length === 0) return ['Nobody has voted. Take a seat and love, pass, or live with each option.'];
  const lead = t[0];
  if (!lead) return [];
  if (lead.passes.length === 0 && lead.loves.length) {
    out.push(`${lead.option.label} clears the room. ${names(lead.loves)} love${lead.loves.length === 1 ? 's' : ''} it and nobody passes.`);
    const quiet = seats.filter((s) => !voted.includes(s));
    if (quiet.length) out.push(`${names(quiet)} ${quiet.length === 1 ? 'has' : 'have'} not voted. Ask before you call it.`);
    return out;
  }
  // The leading option has a pass
  if (lead.passes.length) {
    const passer = lead.passes[0];
    out.push(`${names(lead.loves)} want${lead.loves.length === 1 ? 's' : ''} ${lead.option.label}. ${names(lead.passes)} would pass.${passer.leans ? ` ${passer.name} leans ${passer.leans}, so the objection is probably about that, not the look.` : ''}`);
    const alt = t.find((x) => x !== lead && x.passes.length === 0 && (x.loves.length || x.oks.length));
    if (alt) out.push(`${alt.option.label} has no passes. ${names([...alt.loves, ...alt.oks])} can live with it. That is the quiet compromise.`);
    else out.push('Every option has a pass. Split the decision: keep what everyone loves about the leader and change the one part the passer named.');
    if (lead.option.note) out.push(`Note on the leader: ${lead.option.note}`);
  }
  if (d.blocks) out.push(`Until this closes: ${d.blocks}`);
  return out;
}

export function myVote(d: Decision, seatId: string, optionId: string): Vote | undefined {
  return d.votes[seatId]?.[optionId];
}

/** Items whose care or warranty is coming up. */
export function careSchedule(items: HouseItem[], today = new Date()) {
  const out: { item: HouseItem; kind: 'care' | 'warranty'; when: Date; text: string }[] = [];
  for (const i of items) {
    if (i.status === 'returned') continue;
    const base = i.lastCare ?? i.installedAt;
    if (i.careEvery && base) {
      const when = new Date(base); when.setMonth(when.getMonth() + i.careEvery);
      out.push({ item: i, kind: 'care', when, text: i.careNote ?? `Care: ${i.name}` });
    }
    if (i.warrantyMonths && i.installedAt) {
      const when = new Date(i.installedAt); when.setMonth(when.getMonth() + i.warrantyMonths);
      out.push({ item: i, kind: 'warranty', when, text: `Warranty ends: ${i.name}` });
    }
  }
  return out.sort((a, b) => a.when.getTime() - b.when.getTime()).map((x) => ({ ...x, days: Math.round((x.when.getTime() - today.getTime()) / 86400000) }));
}

export const CARE_PRESETS: Record<string, { every: number; note: string; warranty?: number }> = {
  surfaces: { every: 12, note: 'Reseal stone, re-oil wood, touch up paint' },
  plumbing: { every: 6, note: 'Check for drips, clean aerators, descale', warranty: 12 },
  appliances: { every: 3, note: 'Clean filters and gaskets', warranty: 12 },
  textiles: { every: 12, note: 'Professional clean, rotate the rug' },
  lighting: { every: 24, note: 'Dust shades, check dimmers', warranty: 24 },
  furniture: { every: 12, note: 'Oil the wood, tighten the legs', warranty: 12 },
  millwork: { every: 24, note: 'Touch up paint, adjust hinges' },
  hardware: { every: 12, note: 'Wax unlacquered brass if you want it slower' },
  art: { every: 36, note: 'Check the hangers' },
  labor: { every: 0, note: '' },
  other: { every: 12, note: 'Look at it honestly' },
};
