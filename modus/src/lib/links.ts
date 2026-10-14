/**
 * Connections are computed, never hand-written. Each group names the trait shared with the current file.
 */
import type { OffenderRow, Cluster } from './queries';
import { HOW_LABEL } from './format';

export type LinkRow = { name: string; href: string; meta: string; court: number | null; claim: number | null };
export type LinkGroup = { why: string; d: string; rows: LinkRow[] };

const VICTIM_TAGS: [RegExp, string][] = [
  [/sex work|escort|prostitut/i, 'sex_work'], [/\bwomen\b/i, 'women'], [/\bgirls?\b/i, 'girls'], [/\bmen\b|\bboys\b|marines/i, 'men'],
  [/couples?/i, 'couples'], [/famil/i, 'families'], [/motorist|driver|hitchhik/i, 'road'], [/home|suburban/i, 'homes'],
  [/clerk|staff|worker|farm/i, 'workers'], [/transient|poor|marginal|addiction|runaway/i, 'marginalized'],
];
export const tags = (v: string | null) => new Set(VICTIM_TAGS.filter(([re]) => v && re.test(v)).map(([, t]) => t));
const WEAPON_CLASS: Record<string, string> = { strangulation: 'strangulation_or_suffocation', suffocation: 'strangulation_or_suffocation' };

const row = (o: OffenderRow, meta: string): LinkRow => ({ name: o.shortName ?? o.name, href: `/case/${o.slug}`, meta, court: o.legalStatus === 'unidentified' || o.legalStatus === 'died_uncharged' ? null : o.proven, claim: o.attributed });
const span = (o: OffenderRow) => o.firstKillingYear === o.lastKillingYear ? String(o.firstKillingYear) : `${o.firstKillingYear}–${o.lastKillingYear}`;
const place = (o: OffenderRow) => o.statesNote ?? o.states.join(' → ');

export function computeLinks(me: OffenderRow, all: OffenderRow[], clusters: Cluster[]): LinkGroup[] {
  const others = all.filter((o) => o.id !== me.id);
  const myTags = tags(me.victimology);
  const myMethods = new Set(me.methods);
  const groups: LinkGroup[] = [];

  const same = others
    .map((o) => ({ o, m: o.methods.filter((x) => myMethods.has(x)).length, t: [...tags(o.victimology)].filter((x) => myTags.has(x)).length }))
    .filter((x) => x.m > 0 && x.t > 0).sort((a, b) => b.m + b.t - (a.m + a.t) || (b.o.proven - a.o.proven)).slice(0, 4);
  if (same.length) groups.push({ why: 'Same method · same victims', d: `${cap(me.methods.join(', '))} of ${lower(me.victimology)}, elsewhere.`, rows: same.map((x) => row(x.o, `${place(x.o)} · ${span(x.o)}`)) });

  const state = others.filter((o) => o.states.some((st) => me.states.includes(st))).sort((a, b) => b.proven - a.proven).slice(0, 4);
  if (state.length) groups.push({ why: me.states.length > 1 ? 'Same states' : 'Same state', d: `Cases that share ${me.states.length > 1 ? 'a state' : me.states[0]} with this file.`, rows: state.map((o) => row(o, `${place(o)} · ${span(o)}`)) });

  const lab = others.filter((o) => o.howCaught === 'forensic_science' && o.caughtYear != null && o.lastKillingYear != null && o.caughtYear - o.lastKillingYear >= 3)
    .sort((a, b) => (b.caughtYear! - b.lastKillingYear!) - (a.caughtYear! - a.lastKillingYear!)).slice(0, 4);
  if (lab.length) groups.push({ why: 'Old evidence, new science', d: 'Caught years later when a lab method caught up to a sample already on file.', rows: lab.map((o) => row(o, `${o.howCaughtText ?? HOW_LABEL.forensic_science} · ${o.caughtYear}`)) });

  const wc = new Set(me.methods.map((m) => WEAPON_CLASS[m]).filter(Boolean));
  const cl = clusters.filter((c) => c.lens === 'full' && c.weaponClass && wc.has(c.weaponClass) && !me.states.includes(c.state)).slice(0, 2)
    .map((c): LinkRow => ({ name: `${c.county} County, ${c.state} cluster`, href: `/atlas#${slugify(c.county + '-' + c.state)}`, meta: `MAP · ${lower(c.weapon)} · ${c.firstYear}–${c.lastYear}`, court: null, claim: c.victims - c.solved }));
  const unk = others.filter((o) => o.legalStatus === 'unidentified' && o.methods.some((m) => myMethods.has(m))).slice(0, 2).map((o) => row(o, `Unidentified · ${span(o)}`));
  if (cl.length || unk.length) groups.push({ why: 'Same pattern, no name', d: 'Unsolved clusters with this victimology. MAP flags the clusters from FBI data.', rows: [...cl, ...unk] });

  return groups;
}

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lower = (s: string | null) => (s ?? 'not established').charAt(0).toLowerCase() + (s ?? 'not established').slice(1);
