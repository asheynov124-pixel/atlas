/**
 * Mock natural-language interpreter.
 *
 * Turns "warm-lit close-ups with Mira, no outdoor, under 10 min" into
 * structured tags, performers, attribute filters, and a visual target. A real
 * model (LLM + CLIP text encoder) can replace this behind `AIProvider`
 * without changing the `Interpretation` shape.
 */
import { EMBEDDING_DIM, FACET_DIM, FACETS, type AgeBracket, type BodyType, type FacetWeights, type Filters, type HairColor, type PerformerAttrs, type Quality, type SearchQuery, type Taxonomy, type VisualTarget } from '../data/types';
import { normalizeText, fuzzyEq } from '../lib/text';
import { COMP } from '../data/mock/taxonomy';
import { clone } from '../lib/clone';

export type ChipKind = 'tag' | 'exclude' | 'performer' | 'lookalike' | 'studio' | 'series' | 'attr' | 'duration' | 'quality' | 'sort' | 'visual' | 'facet' | 'text';

export interface Chip {
  id: string;
  kind: ChipKind;
  label: string;
}

export interface Interpretation {
  raw: string;
  tagIds: string[];
  excludeTagIds: string[];
  performerIds: string[];
  excludePerformerIds: string[];
  /** Performers named as a look reference ("looks like X"), not a hard filter. */
  lookalikeIds: string[];
  studioIds: string[];
  seriesId?: string;
  attrs: Partial<PerformerAttrs>;
  duration: { min?: number; max?: number };
  quality: Quality[];
  sort?: SearchQuery['sort'];
  /** Composition-dim visual intents ("warm", "dark", "grainy"). */
  visualWords: string[];
  /** Facets the text points at ("this face", "the lighting"). */
  facets: FacetWeights;
  leftover: string[];
  chips: Chip[];
  /** Share of meaningful words that were understood. */
  confidence: number;
  natural: boolean;
}

const STOP = new Set(
  'a an the and or with of for in on at to by from me my show find get give want looking look some something any more lots very really just that this these those who which is are be has have like videos video clips clip scenes scene stuff content please i im id love into kind sort type good nice hot sexy'.split(' '),
);
const NEGATORS = new Set(['no', 'not', 'without', 'except', 'minus', 'skip', 'avoid', 'excluding', 'exclude', 'never', 'nothing', 'zero']);

type Entry =
  | { type: 'tag'; id: string }
  | { type: 'performer'; ids: string[] }
  | { type: 'studio'; id: string }
  | { type: 'series'; id: string }
  | { type: 'hair'; value: HairColor }
  | { type: 'body'; value: BodyType }
  | { type: 'age'; value: AgeBracket }
  | { type: 'tattoos' }
  | { type: 'piercings' }
  | { type: 'quality'; value: Quality[] }
  | { type: 'sort'; value: NonNullable<SearchQuery['sort']> }
  | { type: 'visual'; word: string }
  | { type: 'facet'; facet: keyof FacetWeights }
  | { type: 'lookalike' }
  | { type: 'duration'; min?: number; max?: number; label: string };

const HAIR_WORDS: Record<string, HairColor> = {
  blonde: 'blonde', blond: 'blonde', blondes: 'blonde', platinum: 'blonde',
  brunette: 'brown', brunettes: 'brown', 'brown hair': 'brown', 'brown haired': 'brown',
  redhead: 'red', redheads: 'red', ginger: 'red', 'red hair': 'red', auburn: 'red',
  'black hair': 'black', 'dark hair': 'black', raven: 'black',
  'pink hair': 'colored', 'blue hair': 'colored', 'green hair': 'colored', dyed: 'colored', 'colored hair': 'colored', 'coloured hair': 'colored',
};
const BODY_WORDS: Record<string, BodyType> = {
  petite: 'petite', tiny: 'petite', small: 'petite', short: 'petite',
  slim: 'slim', slender: 'slim', skinny: 'slim', lean: 'slim', tall: 'slim',
  athletic: 'athletic', fit: 'athletic', toned: 'athletic', sporty: 'athletic',
  curvy: 'curvy', thick: 'curvy', voluptuous: 'curvy', busty: 'curvy', curves: 'curvy',
  muscular: 'muscular', muscle: 'muscular', muscles: 'muscular', buff: 'muscular', ripped: 'muscular',
};
const AGE_WORDS: Record<string, AgeBracket> = {
  '20s': '20s', twenties: '20s', twentysomething: '20s',
  '30s': '30s', thirties: '30s',
  '40s': '40s+', forties: '40s+', '50s': '40s+', mature: '40s+', older: '40s+', 'silver fox': '40s+', cougar: '40s+',
};
const VISUAL_WORDS: Record<string, [number, number][]> = {
  warm: [[COMP.warmth, 1], [COMP.cool, -0.4]],
  'warm lighting': [[COMP.warmth, 1], [COMP.cool, -0.4]],
  'warm light': [[COMP.warmth, 1], [COMP.cool, -0.4]],
  golden: [[COMP.warmth, 0.9], [COMP.bright, 0.3]],
  amber: [[COMP.warmth, 0.9]],
  candlelit: [[COMP.warmth, 0.9], [COMP.bright, -0.5]],
  cool: [[COMP.cool, 1], [COMP.warmth, -0.4]],
  'cool toned': [[COMP.cool, 1], [COMP.warmth, -0.4]],
  blue: [[COMP.cool, 0.9]],
  icy: [[COMP.cool, 1], [COMP.sat, -0.3]],
  dark: [[COMP.bright, -0.9]],
  moody: [[COMP.bright, -0.7], [COMP.sat, -0.2]],
  dim: [[COMP.bright, -0.8]],
  'low light': [[COMP.bright, -0.9]],
  night: [[COMP.bright, -0.7], [COMP.cool, 0.3]],
  bright: [[COMP.bright, 0.9]],
  sunny: [[COMP.bright, 0.9], [COMP.warmth, 0.4]],
  airy: [[COMP.bright, 0.7], [COMP.sat, -0.3]],
  colorful: [[COMP.sat, 0.9]],
  colourful: [[COMP.sat, 0.9]],
  vivid: [[COMP.sat, 0.9]],
  saturated: [[COMP.sat, 0.9]],
  muted: [[COMP.sat, -0.6]],
  pastel: [[COMP.sat, -0.4], [COMP.bright, 0.5]],
  tight: [[COMP.close, 0.9]],
  intimate: [[COMP.close, 0.6]],
  grainy: [[COMP.grain, 0.9]],
  gritty: [[COMP.grain, 0.8], [COMP.bright, -0.3]],
  crisp: [[COMP.grain, -0.7]],
  clean: [[COMP.grain, -0.6], [COMP.centred, 0.3]],
  calm: [[COMP.motion, -0.7]],
  still: [[COMP.motion, -0.8]],
  fast: [[COMP.motion, 0.9]],
  frantic: [[COMP.motion, 1]],
  symmetrical: [[COMP.centred, 0.9]],
  centered: [[COMP.centred, 0.9]],
};
const FACET_WORDS: Record<string, keyof FacetWeights> = {
  face: 'face', faces: 'face', eyes: 'face', smile: 'face', lips: 'face', hair: 'face', hairstyle: 'face', expression: 'face',
  body: 'body', bodies: 'body', figure: 'body', build: 'body', physique: 'body', legs: 'body', shape: 'body', frame: 'body',
  pose: 'pose', poses: 'pose', position: 'pose', positions: 'pose', posture: 'pose', movement: 'pose', moves: 'pose', motion: 'pose', choreography: 'pose',
  lighting: 'composition', colors: 'composition', colours: 'composition', palette: 'composition', vibe: 'composition', aesthetic: 'composition',
  framing: 'composition', composition: 'composition', background: 'composition', setting: 'composition', atmosphere: 'composition', light: 'composition',
};

interface Lexicon {
  entries: Map<string, Entry>;
  maxLen: number;
  performerNames: { tokens: string[]; id: string }[];
}

const lexCache = new WeakMap<Taxonomy, Lexicon>();

function buildLexicon(tx: Taxonomy): Lexicon {
  const cached = lexCache.get(tx);
  if (cached) return cached;
  const entries = new Map<string, Entry>();
  const put = (phrase: string, e: Entry, overwrite = false) => {
    const key = normalizeText(phrase).replace(/-/g, ' ');
    if (!key) return;
    if (overwrite || !entries.has(key)) entries.set(key, e);
  };
  for (const [w, v] of Object.entries(HAIR_WORDS)) put(w, { type: 'hair', value: v });
  for (const [w, v] of Object.entries(BODY_WORDS)) put(w, { type: 'body', value: v });
  for (const [w, v] of Object.entries(AGE_WORDS)) put(w, { type: 'age', value: v });
  for (const w of ['tattoo', 'tattoos', 'tattooed', 'inked', 'ink']) put(w, { type: 'tattoos' });
  for (const w of ['pierced', 'piercing', 'piercings']) put(w, { type: 'piercings' });
  for (const w of Object.keys(VISUAL_WORDS)) put(w, { type: 'visual', word: w });
  for (const [w, f] of Object.entries(FACET_WORDS)) put(w, { type: 'facet', facet: f });
  for (const w of ['looks like', 'look like', 'looking like', 'lookalike', 'similar to', 'resembles', 'resembling']) put(w, { type: 'lookalike' });
  for (const w of ['new', 'newest', 'latest', 'recent', 'fresh']) put(w, { type: 'sort', value: 'newest' });
  for (const w of ['popular', 'trending', 'top', 'most viewed']) put(w, { type: 'sort', value: 'popular' });
  for (const w of ['best', 'top rated', 'highest rated', 'best rated']) put(w, { type: 'sort', value: 'rating' });
  put('quick', { type: 'duration', max: 8, label: 'Under 8 min' });
  put('quickie', { type: 'duration', max: 8, label: 'Under 8 min' });
  put('long', { type: 'duration', min: 20, label: 'Over 20 min' });
  put('full length', { type: 'duration', min: 30, label: 'Over 30 min' });
  put('feature length', { type: 'duration', min: 30, label: 'Over 30 min' });

  // Tags (labels, ids, synonyms). Tags win over the visual/attr words they collide with ("neon").
  for (const t of tx.tags) {
    put(t.label, { type: 'tag', id: t.id }, true);
    put(t.id.replace(/-/g, ' '), { type: 'tag', id: t.id }, true);
    for (const s of t.synonyms) put(s, { type: 'tag', id: t.id });
  }
  // Quality words act as a hard quality filter rather than a soft tag.
  put('4k', { type: 'quality', value: ['4K'] }, true);
  put('uhd', { type: 'quality', value: ['4K'] }, true);
  put('ultra hd', { type: 'quality', value: ['4K'] }, true);
  put('hd', { type: 'quality', value: ['HD', '4K'] }, true);
  put('high quality', { type: 'quality', value: ['HD', '4K'] }, true);
  // 'short' as a body word is weaker than as duration.
  put('short', { type: 'duration', max: 8, label: 'Under 8 min' }, true);

  for (const s of tx.studios) put(s.name, { type: 'studio', id: s.id }, true);
  for (const s of tx.series) put(s.title, { type: 'series', id: s.id }, true);

  const byName = new Map<string, string[]>();
  const performerNames: Lexicon['performerNames'] = [];
  for (const p of tx.performers) {
    performerNames.push({ tokens: normalizeText(p.name).split(' '), id: p.id });
    const add = (k: string) => byName.set(k, [...(byName.get(k) ?? []), p.id]);
    add(normalizeText(p.name));
    for (const a of p.aliases) add(normalizeText(a));
    const [first, last] = normalizeText(p.name).split(' ');
    add(first);
    if (last) add(last);
  }
  for (const [k, ids] of byName) {
    // Single names only claim the word if it isn't already a tag/attribute.
    if (k.includes(' ') || !entries.has(k)) entries.set(k, { type: 'performer', ids: [...new Set(ids)] });
  }

  let maxLen = 1;
  for (const k of entries.keys()) maxLen = Math.max(maxLen, k.split(' ').length);
  const lex = { entries, maxLen: Math.min(maxLen, 5), performerNames };
  lexCache.set(tx, lex);
  return lex;
}

function extractDurations(text: string): { text: string; min?: number; max?: number; labels: string[] } {
  let min: number | undefined;
  let max: number | undefined;
  const labels: string[] = [];
  let t = text;
  const unit = '(?:m|min|mins|minute|minutes)';
  t = t.replace(new RegExp(`\\b(?:under|less than|shorter than|below|max|up to|<)\\s*(\\d{1,3})\\s*${unit}?\\b`, 'g'), (_, n) => {
    max = Number(n);
    labels.push(`Under ${n} min`);
    return ' ';
  });
  t = t.replace(new RegExp(`\\b(?:over|more than|longer than|at least|above|min|>)\\s*(\\d{1,3})\\s*${unit}?\\b`, 'g'), (_, n) => {
    min = Number(n);
    labels.push(`Over ${n} min`);
    return ' ';
  });
  t = t.replace(new RegExp(`\\b(\\d{1,3})\\s*(?:-|to)\\s*(\\d{1,3})\\s*${unit}\\b`, 'g'), (_, a, b) => {
    min = Number(a);
    max = Number(b);
    labels.push(`${a}–${b} min`);
    return ' ';
  });
  return { text: t, min, max, labels };
}

export function emptyInterpretation(raw = ''): Interpretation {
  return {
    raw,
    tagIds: [],
    excludeTagIds: [],
    performerIds: [],
    excludePerformerIds: [],
    lookalikeIds: [],
    studioIds: [],
    attrs: {},
    duration: {},
    quality: [],
    visualWords: [],
    facets: {},
    leftover: [],
    chips: [],
    confidence: 0,
    natural: false,
  };
}

const pushUniq = <T,>(arr: T[], ...xs: T[]) => {
  for (const x of xs) if (!arr.includes(x)) arr.push(x);
};

export function interpretQuery(raw: string, tx: Taxonomy): Interpretation {
  const out = emptyInterpretation(raw);
  const lex = buildLexicon(tx);
  const d = extractDurations(normalizeText(raw).replace(/-/g, ' '));
  if (d.min != null) out.duration.min = d.min;
  if (d.max != null) out.duration.max = d.max;
  const tokens = d.text.split(' ').filter(Boolean);

  let meaningful = d.labels.length;
  let understood = d.labels.length;
  let negate = false;
  let lookalike = false;
  let i = 0;

  while (i < tokens.length) {
    const tok = tokens[i];
    if (NEGATORS.has(tok)) {
      negate = true;
      i++;
      continue;
    }
    let matched: Entry | undefined;
    let len = 0;
    for (let n = Math.min(lex.maxLen, tokens.length - i); n >= 1; n--) {
      const phrase = tokens.slice(i, i + n).join(' ');
      // Plurals ("close-ups", "showers") match their singular entry.
      const e = lex.entries.get(phrase) ?? (phrase.length > 3 && phrase.endsWith('s') ? lex.entries.get(phrase.slice(0, -1)) : undefined);
      if (e) {
        matched = e;
        len = n;
        break;
      }
    }
    // Fuzzy fallback for performer full names and long single words ("calloway", "massge").
    if (!matched && tok.length >= 5) {
      const next = tokens[i + 1];
      const full = lex.performerNames.find((p) => p.tokens.length === 2 && next && fuzzyEq(p.tokens[0], tok) && fuzzyEq(p.tokens[1], next));
      if (full) {
        matched = { type: 'performer', ids: [full.id] };
        len = 2;
      } else {
        for (const [k, e] of lex.entries) {
          if (!k.includes(' ') && e.type !== 'performer' && fuzzyEq(k, tok)) {
            matched = e;
            len = 1;
            break;
          }
        }
      }
    }
    if (!matched) {
      if (!STOP.has(tok)) {
        meaningful++;
        out.leftover.push(tok);
        negate = false;
      }
      i++;
      continue;
    }
    meaningful++;
    understood++;
    apply(out, matched, negate, lookalike, tx);
    lookalike = matched.type === 'lookalike';
    if (matched.type !== 'lookalike') negate = false;
    i += len;
  }

  if (d.labels.length) out.chips.push({ id: 'duration', kind: 'duration', label: d.labels.join(', ') });
  out.confidence = meaningful ? understood / meaningful : 0;
  out.natural =
    tokens.length >= 3 ||
    out.visualWords.length > 0 ||
    Object.keys(out.attrs).length > 0 ||
    out.excludeTagIds.length > 0 ||
    out.lookalikeIds.length > 0 ||
    out.duration.min != null ||
    out.duration.max != null;
  for (const w of out.leftover) out.chips.push({ id: `text:${w}`, kind: 'text', label: `“${w}”` });
  return out;
}

function apply(out: Interpretation, e: Entry, negate: boolean, lookalike: boolean, tx: Taxonomy) {
  const tagLabel = (id: string) => tx.tags.find((t) => t.id === id)?.label ?? id;
  switch (e.type) {
    case 'tag':
      if (negate) {
        pushUniq(out.excludeTagIds, e.id);
        out.chips.push({ id: `exclude:${e.id}`, kind: 'exclude', label: `No ${tagLabel(e.id)}` });
      } else if (!out.tagIds.includes(e.id)) {
        out.tagIds.push(e.id);
        out.chips.push({ id: `tag:${e.id}`, kind: 'tag', label: tagLabel(e.id) });
      }
      break;
    case 'performer': {
      const names = e.ids.map((id) => tx.performers.find((p) => p.id === id)?.name ?? id);
      if (lookalike) {
        pushUniq(out.lookalikeIds, ...e.ids);
        out.chips.push({ id: `lookalike:${e.ids.join(',')}`, kind: 'lookalike', label: `Looks like ${names.join(' / ')}` });
      } else if (negate) {
        pushUniq(out.excludePerformerIds, ...e.ids);
        out.chips.push({ id: `xperformer:${e.ids.join(',')}`, kind: 'exclude', label: `No ${names.join(' / ')}` });
      } else {
        pushUniq(out.performerIds, ...e.ids);
        out.chips.push({ id: `performer:${e.ids.join(',')}`, kind: 'performer', label: names.join(' / ') });
      }
      break;
    }
    case 'studio': {
      const name = tx.studios.find((s) => s.id === e.id)?.name ?? e.id;
      pushUniq(out.studioIds, e.id);
      out.chips.push({ id: `studio:${e.id}`, kind: 'studio', label: name });
      break;
    }
    case 'series': {
      out.seriesId = e.id;
      out.chips.push({ id: `series:${e.id}`, kind: 'series', label: tx.series.find((s) => s.id === e.id)?.title ?? e.id });
      break;
    }
    case 'hair':
      out.attrs.hair = [...new Set([...(out.attrs.hair ?? []), e.value])];
      out.chips.push({ id: `hair:${e.value}`, kind: 'attr', label: `${e.value === 'colored' ? 'Coloured' : e.value[0].toUpperCase() + e.value.slice(1)} hair` });
      break;
    case 'body':
      out.attrs.bodyType = [...new Set([...(out.attrs.bodyType ?? []), e.value])];
      out.chips.push({ id: `body:${e.value}`, kind: 'attr', label: e.value[0].toUpperCase() + e.value.slice(1) });
      break;
    case 'age':
      out.attrs.ageBracket = [...new Set([...(out.attrs.ageBracket ?? []), e.value])];
      out.chips.push({ id: `age:${e.value}`, kind: 'attr', label: `In their ${e.value}` });
      break;
    case 'tattoos':
      out.attrs.tattoos = negate ? 'no' : 'yes';
      out.chips.push({ id: 'tattoos', kind: 'attr', label: negate ? 'No tattoos' : 'Tattoos' });
      break;
    case 'piercings':
      out.attrs.piercings = negate ? 'no' : 'yes';
      out.chips.push({ id: 'piercings', kind: 'attr', label: negate ? 'No piercings' : 'Piercings' });
      break;
    case 'quality':
      out.quality = e.value;
      out.chips.push({ id: 'quality', kind: 'quality', label: e.value.length === 1 ? e.value[0] : 'HD+' });
      break;
    case 'sort':
      out.sort = e.value;
      out.chips.push({ id: 'sort', kind: 'sort', label: e.value === 'newest' ? 'Newest first' : e.value === 'popular' ? 'Most popular' : 'Top rated' });
      break;
    case 'visual':
      if (!out.visualWords.includes(e.word)) {
        out.visualWords.push(e.word);
        out.chips.push({ id: `visual:${e.word}`, kind: 'visual', label: `${e.word[0].toUpperCase()}${e.word.slice(1)} look` });
      }
      break;
    case 'facet':
      out.facets[e.facet] = (out.facets[e.facet] ?? 0) + 1;
      if (!out.chips.some((c) => c.id === `facet:${e.facet}`)) out.chips.push({ id: `facet:${e.facet}`, kind: 'facet', label: `Focus: ${e.facet}` });
      break;
    case 'duration':
      if (e.min != null) out.duration.min = e.min;
      if (e.max != null) out.duration.max = e.max;
      out.chips.push({ id: `duration:${e.label}`, kind: 'duration', label: e.label });
      break;
    case 'lookalike':
      break;
  }
}

/** Drop one chip and everything it contributed. */
export function withoutChip(interp: Interpretation, chipId: string): Interpretation {
  const next: Interpretation = clone(interp);
  next.chips = next.chips.filter((c) => c.id !== chipId);
  const [kind, value = ''] = chipId.split(/:(.*)/s);
  const ids = value.split(',');
  switch (kind) {
    case 'tag': next.tagIds = next.tagIds.filter((t) => t !== value); break;
    case 'exclude': next.excludeTagIds = next.excludeTagIds.filter((t) => t !== value); break;
    case 'performer': next.performerIds = next.performerIds.filter((p) => !ids.includes(p)); break;
    case 'xperformer': next.excludePerformerIds = next.excludePerformerIds.filter((p) => !ids.includes(p)); break;
    case 'lookalike': next.lookalikeIds = next.lookalikeIds.filter((p) => !ids.includes(p)); break;
    case 'studio': next.studioIds = next.studioIds.filter((s) => s !== value); break;
    case 'series': next.seriesId = undefined; break;
    case 'hair': next.attrs.hair = next.attrs.hair?.filter((h) => h !== value); break;
    case 'body': next.attrs.bodyType = next.attrs.bodyType?.filter((b) => b !== value); break;
    case 'age': next.attrs.ageBracket = next.attrs.ageBracket?.filter((a) => a !== value); break;
    case 'tattoos': delete next.attrs.tattoos; break;
    case 'piercings': delete next.attrs.piercings; break;
    case 'quality': next.quality = []; break;
    case 'sort': next.sort = undefined; break;
    case 'visual': next.visualWords = next.visualWords.filter((w) => w !== value); break;
    case 'facet': delete next.facets[value as keyof FacetWeights]; break;
    case 'duration': next.duration = {}; next.chips = next.chips.filter((c) => c.kind !== 'duration'); break;
    case 'text': next.leftover = next.leftover.filter((w) => w !== value); break;
  }
  return next;
}

/** Composition-facet target for visual words, plus face/body targets for lookalikes. */
export function visualTarget(interp: Interpretation, tx: Taxonomy): VisualTarget | undefined {
  if (!interp.visualWords.length && !interp.lookalikeIds.length) return undefined;
  const vector = new Array(EMBEDDING_DIM).fill(0);
  const mask = new Array(EMBEDDING_DIM).fill(0);
  const compOffset = FACETS.indexOf('composition') * FACET_DIM;
  const counts = new Array(FACET_DIM).fill(0);
  for (const w of interp.visualWords) {
    for (const [dim, v] of VISUAL_WORDS[w] ?? []) {
      vector[compOffset + dim] += v;
      counts[dim]++;
      mask[compOffset + dim] = 1;
    }
  }
  for (let dim = 0; dim < FACET_DIM; dim++) if (counts[dim] > 1) vector[compOffset + dim] /= counts[dim];
  const labels = [...interp.visualWords];
  const refs = interp.lookalikeIds.map((id) => tx.performers.find((p) => p.id === id)).filter(Boolean);
  if (refs.length) {
    const faceOffset = FACETS.indexOf('face') * FACET_DIM;
    const bodyOffset = FACETS.indexOf('body') * FACET_DIM;
    for (const p of refs) {
      for (let k = 0; k < FACET_DIM; k++) {
        vector[faceOffset + k] += p!.face[k] / refs.length;
        vector[bodyOffset + k] += p!.body[k] / refs.length;
        mask[faceOffset + k] = 1.4;
        mask[bodyOffset + k] = 0.6;
      }
    }
    labels.push(`like ${refs.map((p) => p!.name.split(' ')[0]).join('/')}`);
  }
  return { vector, mask, label: labels.join(', ') };
}

/** Convert an interpretation into the data-layer contract. */
export function toSearch(interp: Interpretation, tx: Taxonomy): { query: SearchQuery; filters: Partial<Filters> } {
  const query: SearchQuery = {
    text: interp.leftover.length ? interp.leftover.join(' ') : undefined,
    mode: interp.natural ? 'natural' : 'keyword',
    performerIds: interp.performerIds.length ? interp.performerIds : undefined,
    studioIds: interp.studioIds.length ? interp.studioIds : undefined,
    tagIds: interp.tagIds.length ? interp.tagIds : undefined,
    excludeTagIds: interp.excludeTagIds.length ? interp.excludeTagIds : undefined,
    seriesId: interp.seriesId,
    visual: visualTarget(interp, tx),
    sort: interp.sort,
  };
  const filters: Partial<Filters> = {};
  const a = interp.attrs;
  if (Object.keys(a).length || interp.excludePerformerIds.length) {
    filters.performers = {
      include: [],
      exclude: interp.excludePerformerIds,
      attrs: {
        hair: a.hair ?? [],
        bodyType: a.bodyType ?? [],
        ageBracket: a.ageBracket ?? [],
        tattoos: a.tattoos ?? 'any',
        piercings: a.piercings ?? 'any',
      },
    };
  }
  if (interp.quality.length) filters.quality = interp.quality;
  if (interp.duration.min != null || interp.duration.max != null) filters.duration = { ...interp.duration };
  return { query, filters };
}

/** True when the interpretation carries nothing beyond plain keywords. */
export function isKeywordOnly(interp: Interpretation): boolean {
  return interp.chips.every((c) => c.kind === 'text');
}
