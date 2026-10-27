/**
 * Deep filters: hard constraints (exclude what doesn't match) plus soft tag
 * weights (reorder what does). Pure functions; used by the mock source and by
 * client-side re-ranking, so a live source can push either half server-side.
 */
import type { Filters, Performer, PerformerAttrs, VideoSummary } from '../data/types';

export function emptyAttrs(): PerformerAttrs {
  return { hair: [], bodyType: [], ageBracket: [], tattoos: 'any', piercings: 'any' };
}

export function emptyFilters(): Filters {
  return {
    performers: { include: [], exclude: [], attrs: emptyAttrs() },
    tags: { all: [], any: [], none: [], weights: {} },
    studios: { include: [], exclude: [] },
    styles: [],
    quality: [],
    duration: {},
    year: {},
    exploration: 0.25,
    preferNew: false,
    source: 'all',
  };
}

/** Fill any missing fields so partial/old persisted filters are safe to read. */
export function normalizeFilters(f?: Partial<Filters>): Filters {
  const base = emptyFilters();
  if (!f) return base;
  return {
    performers: {
      include: f.performers?.include ?? [],
      exclude: f.performers?.exclude ?? [],
      attrs: { ...base.performers.attrs, ...(f.performers?.attrs ?? {}) },
    },
    tags: {
      all: f.tags?.all ?? [],
      any: f.tags?.any ?? [],
      none: f.tags?.none ?? [],
      weights: f.tags?.weights ?? {},
    },
    studios: { include: f.studios?.include ?? [], exclude: f.studios?.exclude ?? [] },
    styles: f.styles ?? [],
    quality: f.quality ?? [],
    duration: f.duration ?? {},
    year: f.year ?? {},
    exploration: f.exploration ?? base.exploration,
    preferNew: f.preferNew ?? false,
    source: f.source === 'catalog' || f.source === 'imports' ? f.source : 'all',
  };
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/**
 * Combine profile-wide filters with a path override. Exclusions union (a
 * global "never" can't be undone locally); positive constraints from the path
 * win when set; weights merge with the path taking precedence.
 */
export function mergeFilters(globalF: Partial<Filters> | undefined, local: Partial<Filters> | undefined): Filters {
  const g = normalizeFilters(globalF);
  if (!local) return g;
  const l = normalizeFilters(local);
  const pickArr = <T,>(a: T[], b: T[]) => (b.length ? b : a);
  const attrs: PerformerAttrs = {
    hair: pickArr(g.performers.attrs.hair, l.performers.attrs.hair),
    bodyType: pickArr(g.performers.attrs.bodyType, l.performers.attrs.bodyType),
    ageBracket: pickArr(g.performers.attrs.ageBracket, l.performers.attrs.ageBracket),
    tattoos: l.performers.attrs.tattoos !== 'any' ? l.performers.attrs.tattoos : g.performers.attrs.tattoos,
    piercings: l.performers.attrs.piercings !== 'any' ? l.performers.attrs.piercings : g.performers.attrs.piercings,
  };
  return {
    performers: {
      include: pickArr(g.performers.include, l.performers.include),
      exclude: uniq([...g.performers.exclude, ...l.performers.exclude]),
      attrs,
    },
    tags: {
      all: uniq([...g.tags.all, ...l.tags.all]),
      any: pickArr(g.tags.any, l.tags.any),
      none: uniq([...g.tags.none, ...l.tags.none]),
      weights: { ...g.tags.weights, ...l.tags.weights },
    },
    studios: {
      include: pickArr(g.studios.include, l.studios.include),
      exclude: uniq([...g.studios.exclude, ...l.studios.exclude]),
    },
    styles: pickArr(g.styles, l.styles),
    quality: pickArr(g.quality, l.quality),
    duration: { min: l.duration.min ?? g.duration.min, max: l.duration.max ?? g.duration.max },
    year: { min: l.year.min ?? g.year.min, max: l.year.max ?? g.year.max },
    exploration: local.exploration ?? g.exploration,
    preferNew: local.preferNew ?? g.preferNew,
    source: l.source !== 'all' ? l.source : g.source,
  };
}

export function countActive(f?: Partial<Filters>): number {
  if (!f) return 0;
  const n = normalizeFilters(f);
  const a = n.performers.attrs;
  let c = 0;
  c += n.performers.include.length + n.performers.exclude.length;
  c += a.hair.length + a.bodyType.length + a.ageBracket.length;
  c += (a.tattoos !== 'any' ? 1 : 0) + (a.piercings !== 'any' ? 1 : 0);
  c += n.tags.all.length + n.tags.any.length + n.tags.none.length + Object.values(n.tags.weights).filter((w) => w !== 0).length;
  c += n.studios.include.length + n.studios.exclude.length + n.styles.length + n.quality.length;
  c += (n.duration.min != null ? 1 : 0) + (n.duration.max != null ? 1 : 0);
  c += (n.year.min != null ? 1 : 0) + (n.year.max != null ? 1 : 0);
  c += n.preferNew ? 1 : 0;
  c += n.source !== 'all' ? 1 : 0;
  return c;
}

function attrsActive(a: PerformerAttrs): boolean {
  return a.hair.length > 0 || a.bodyType.length > 0 || a.ageBracket.length > 0 || a.tattoos !== 'any' || a.piercings !== 'any';
}

function performerMatches(p: Performer, a: PerformerAttrs): boolean {
  if (a.hair.length && !a.hair.includes(p.hair)) return false;
  if (a.bodyType.length && !a.bodyType.includes(p.bodyType)) return false;
  if (a.ageBracket.length && !a.ageBracket.includes(p.ageBracket)) return false;
  if (a.tattoos !== 'any' && p.tattoos !== (a.tattoos === 'yes')) return false;
  if (a.piercings !== 'any' && p.piercings !== (a.piercings === 'yes')) return false;
  return true;
}

export type PerformerLookup = (id: string) => Performer | undefined;

export function matchesFilters(v: VideoSummary, f: Filters, performer: PerformerLookup): boolean {
  if (f.source === 'imports' && v.source !== 'import') return false;
  if (f.source === 'catalog' && v.source === 'import') return false;
  const pf = f.performers;
  if (pf.include.length && !v.performerIds.some((id) => pf.include.includes(id))) return false;
  if (pf.exclude.length && v.performerIds.some((id) => pf.exclude.includes(id))) return false;
  if (attrsActive(pf.attrs)) {
    // At least one performer in the scene must satisfy every attribute constraint.
    const ok = v.performerIds.some((id) => {
      const p = performer(id);
      return p ? performerMatches(p, pf.attrs) : false;
    });
    if (!ok) return false;
  }
  const t = f.tags;
  if (t.all.length && !t.all.every((x) => v.tags.includes(x))) return false;
  if (t.any.length && !t.any.some((x) => v.tags.includes(x))) return false;
  if (t.none.length && t.none.some((x) => v.tags.includes(x))) return false;
  if (f.studios.include.length && !f.studios.include.includes(v.studioId)) return false;
  if (f.studios.exclude.includes(v.studioId)) return false;
  if (f.styles.length && !f.styles.includes(v.style)) return false;
  if (f.quality.length && !f.quality.includes(v.quality)) return false;
  // Length only constrains clips that have one (stills and unprobed imports don't).
  const minutes = v.duration / 60;
  if (v.duration > 0 && f.duration.min != null && minutes < f.duration.min) return false;
  if (v.duration > 0 && f.duration.max != null && minutes > f.duration.max) return false;
  const year = Number(v.releaseDate.slice(0, 4));
  if (f.year.min != null && year < f.year.min) return false;
  if (f.year.max != null && year > f.year.max) return false;
  return true;
}

/** Soft boost from tag weights, scaled so a +2 tag is a strong but not absolute nudge. */
export function filterBoost(v: VideoSummary, f: Filters): number {
  let b = 0;
  for (const t of v.tags) b += (f.tags.weights[t] ?? 0) * 0.35;
  if (f.preferNew) {
    const ageDays = (Date.now() - Date.parse(v.releaseDate)) / 86400000;
    b += Math.max(0, 0.6 - ageDays / 900);
  }
  return b;
}

/**
 * The part of `draft` that differs from `base`, top-level field by field.
 * Path overrides are stored this way so that anything the user didn't touch
 * keeps following the profile-wide value (including the exploration slider).
 */
export function diffFilters(base: Partial<Filters> | undefined, draft: Filters): Partial<Filters> {
  const b = normalizeFilters(base);
  const out: Partial<Filters> = {};
  for (const k of Object.keys(draft) as (keyof Filters)[]) {
    if (JSON.stringify(draft[k]) !== JSON.stringify(b[k])) (out as Record<string, unknown>)[k] = draft[k];
  }
  return out;
}
