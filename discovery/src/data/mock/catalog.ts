/**
 * Deterministic mock catalog.
 *
 * Fictional performers, studios, and series; ~900 videos. Embeddings are
 * built from semantic parts (performer identity, body type, acts, setting,
 * style), and the procedural renderer draws them, so similarity results look
 * the way the numbers say they should.
 */
import { FACET_DIM, type Performer, type ProductionStyle, type Quality, type Series, type Studio, type Tag, type VideoSummary, type Vec, type BodyType, type HairColor, type AgeBracket } from '../types';
import { gaussian, mulberry32, pick, pickWeighted, randInt, sample, type Rng } from '../../lib/prng';
import { clamp } from '../../lib/vec';
import { COMP, MOODS, SETTINGS, STYLES, TAGS, TAG_BY_ID, THEME_ACTS } from './taxonomy';

export const MOCK_ORIGIN = 'https://videos.example';
export const DEFAULT_SEED = 20261027;

export interface Catalog {
  seed: number;
  tags: Tag[];
  performers: Performer[];
  studios: Studio[];
  series: Series[];
  videos: VideoSummary[];
  videoById: Map<string, VideoSummary>;
  performerById: Map<string, Performer>;
  studioById: Map<string, Studio>;
  seriesById: Map<string, Series>;
  tagById: Map<string, Tag>;
  /** Videos whose every playback option fails, to exercise the open-original fallback. */
  broken: Set<string>;
}

const FIRST = [
  'Mira', 'Jett', 'Sloane', 'Remy', 'Indie', 'Cass', 'Juno', 'Arlo', 'Wren', 'Theo', 'Noor', 'Sasha', 'Kai', 'Lux',
  'Odette', 'Rafe', 'Selene', 'Bastian', 'Elodie', 'Dax', 'Inez', 'Lior', 'Marisol', 'Quinn', 'Romy', 'Soren', 'Talia',
  'Vesper', 'Zara', 'Anouk', 'Caspian', 'Delphine', 'Ezra', 'Fleur', 'Gideon', 'Halle', 'Isolde', 'Jasper', 'Liv', 'Maeve',
];
const LAST = [
  'Vale', 'Calloway', 'Thorne', 'Ashby', 'Quill', 'Marlowe', 'Fairweather', 'Lennox', 'Rook', 'Hollis', 'Devereux',
  'Kingsley', 'Laurent', 'Moreau', 'Sinclair', 'Winslow', 'Yardley', 'Crane', 'Halloway', 'Arden', 'Blythe', 'Corwin',
  'Dunmore', 'Everly', 'Faraday', 'Greer', 'Hartigan', 'Iverson', 'Juniper', 'Kestrel', 'Larkspur', 'Mercer',
];

interface StudioDef {
  name: string;
  style: ProductionStyle;
  comp: Partial<Record<keyof typeof COMP, number>>;
  settings: string[];
  styles: string[];
  /** Weights for SD, HD, 4K. */
  quality: [number, number, number];
}

const STUDIO_DEFS: StudioDef[] = [
  { name: 'Lumen House', style: 'cinematic', comp: { warmth: 0.5, bright: -0.2, grain: 0.2 }, settings: ['bedroom', 'hotel'], styles: ['natural-light', 'close-up', 'slow-motion'], quality: [0, 0.4, 0.6] },
  { name: 'Velvet Static', style: 'pro', comp: { sat: 0.5, cool: 0.3, centred: 0.3 }, settings: ['studio-set', 'bedroom'], styles: ['neon', 'close-up'], quality: [0, 0.5, 0.5] },
  { name: 'Northlight Films', style: 'cinematic', comp: { cool: 0.5, bright: 0.2, sat: -0.3 }, settings: ['outdoor', 'shower'], styles: ['natural-light', 'wide-shot'], quality: [0, 0.3, 0.7] },
  { name: 'Porchlight Amateurs', style: 'amateur', comp: { grain: 0.6, warmth: 0.3, motion: 0.4 }, settings: ['bedroom', 'kitchen', 'car'], styles: ['handheld', 'pov', 'vertical'], quality: [0.4, 0.55, 0.05] },
  { name: 'Cinder & Rose', style: 'pro', comp: { warmth: 0.7, sat: 0.3 }, settings: ['sauna', 'bedroom', 'hotel'], styles: ['close-up', 'slow-motion'], quality: [0, 0.6, 0.4] },
  { name: 'Afterhours Collective', style: 'amateur', comp: { bright: -0.5, grain: 0.4, motion: 0.3 }, settings: ['hotel', 'car'], styles: ['handheld', 'neon'], quality: [0.3, 0.6, 0.1] },
  { name: 'Halcyon Pictures', style: 'cinematic', comp: { bright: 0.3, sat: -0.2, motion: -0.4 }, settings: ['beach', 'pool', 'outdoor'], styles: ['slow-motion', 'wide-shot', 'natural-light'], quality: [0, 0.2, 0.8] },
  { name: 'Neon Parlor', style: 'pro', comp: { sat: 0.9, cool: 0.4, bright: -0.5 }, settings: ['studio-set', 'hotel'], styles: ['neon', 'pov'], quality: [0, 0.55, 0.45] },
  { name: 'Saltwater Studio', style: 'pro', comp: { cool: 0.6, bright: 0.5, sat: 0.4 }, settings: ['pool', 'beach', 'shower'], styles: ['wide-shot', 'natural-light'], quality: [0, 0.5, 0.5] },
  { name: 'Room 9', style: 'amateur', comp: { grain: 0.3, centred: -0.3 }, settings: ['bedroom', 'hotel', 'office'], styles: ['pov', 'handheld'], quality: [0.35, 0.6, 0.05] },
  { name: 'Gilded Frame', style: 'cinematic', comp: { grain: 0.8, warmth: 0.5, sat: -0.4 }, settings: ['bedroom', 'studio-set'], styles: ['vintage', 'black-and-white', 'cinematic'], quality: [0.1, 0.6, 0.3] },
  { name: 'Static Bloom', style: 'pro', comp: { bright: 0.4, sat: 0.4, motion: 0.3 }, settings: ['kitchen', 'office', 'studio-set'], styles: ['pov', 'close-up'], quality: [0.05, 0.65, 0.3] },
  { name: 'Fieldnotes', style: 'amateur', comp: { bright: 0.5, warmth: 0.3, sat: -0.2 }, settings: ['outdoor', 'beach'], styles: ['natural-light', 'handheld', 'vertical'], quality: [0.3, 0.6, 0.1] },
  { name: 'Moonlit Co.', style: 'pro', comp: { cool: 0.7, bright: -0.4, sat: 0.2 }, settings: ['pool', 'hotel', 'bedroom'], styles: ['slow-motion', 'neon'], quality: [0, 0.5, 0.5] },
];

const PHRASES = [
  'Afterglow', 'Slow Burn', 'Golden Hour', 'Room Service', 'Late Checkout', 'Night Swim', 'Velvet Hours', 'Heatwave',
  'Weekend Away', 'Soft Focus', 'Second Take', 'Blue Hour', 'Off the Clock', 'Saltwater', 'Midnight Rehearsal',
  'Paper Moon', 'Undertow', 'Fever Dream', 'Sunday Morning', 'Encore', 'Polaroid', 'Long Exposure', 'Open House',
  'Rain Check', 'Night Shift', 'Pillow Talk', 'Daydream', 'Overtime', 'Last Call', 'Low Tide', 'Static Hearts',
  'Something Borrowed', 'Do Not Disturb', 'Slow Dance', 'Wildfire', 'Mirror, Mirror', 'Housewarming', 'First Light',
];

const SERIES_TITLES = [
  'Checked In', 'The Rehearsals', 'Postcards', 'Night Owls', 'Studio Diaries', 'The Long Weekend',
  'Tidal', 'Neon Confessions', 'Afterparty', 'Room 9 Tapes', 'Golden Hour Sessions', 'Slow Mornings', 'Fever',
  'Velvet Rooms', 'Open Water', 'The Understudy', 'Couch Sessions', 'Field Trips', 'The Lens', 'Overnight',
  'Mirror Hall', 'Undercurrent', 'The Encore Tour', 'Cabin Fever',
];

const HAIR: HairColor[] = ['black', 'brown', 'blonde', 'red', 'colored'];
const HAIR_W = [0.25, 0.32, 0.25, 0.1, 0.08];
const BODY: BodyType[] = ['petite', 'slim', 'athletic', 'curvy', 'muscular'];
const AGE: AgeBracket[] = ['20s', '30s', '40s+'];
const AGE_W = [0.45, 0.35, 0.2];

const HAIR_BRIGHT: Record<HairColor, number> = { black: -0.9, brown: -0.3, blonde: 0.9, red: 0.2, colored: 0.5 };
const HAIR_WARM: Record<HairColor, number> = { black: -0.2, brown: 0.2, blonde: 0.3, red: 0.9, colored: -0.6 };
const BODY_SHAPE: Record<BodyType, [number, number, number]> = {
  petite: [-0.7, -0.3, -0.6],
  slim: [-0.1, -0.6, 0.3],
  athletic: [0.2, 0.1, 0.4],
  curvy: [0.2, 0.7, -0.1],
  muscular: [0.6, 0.6, 0.5],
};

interface PerformerSeed extends Performer {
  favStudios: number[];
  favActs: string[];
  favSettings: string[];
  partners: number[];
  popularity: number;
}

function hexId(rng: Rng, prefix: string, used: Set<string>): string {
  for (;;) {
    let s = prefix;
    for (let i = 0; i < 10; i++) s += Math.floor(rng() * 16).toString(16);
    if (!used.has(s)) {
      used.add(s);
      return s;
    }
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function makePerformers(rng: Rng, count: number, studioCount: number): PerformerSeed[] {
  const names = new Set<string>();
  const out: PerformerSeed[] = [];
  while (out.length < count) {
    const name = `${pick(rng, FIRST)} ${pick(rng, LAST)}`;
    if (names.has(name)) continue;
    names.add(name);
    const hair = pickWeighted(rng, HAIR, HAIR_W);
    const bodyType = pick(rng, BODY);
    const hue = rng() * Math.PI * 2;
    const face: Vec = [Math.cos(hue), Math.sin(hue), HAIR_BRIGHT[hair], HAIR_WARM[hair]];
    while (face.length < FACET_DIM) face.push(gaussian(rng) * 0.7);
    const shape = BODY_SHAPE[bodyType];
    const body: Vec = shape.map((x) => x + gaussian(rng) * 0.08);
    while (body.length < FACET_DIM) body.push(gaussian(rng) * 0.6);
    const idx = out.length;
    out.push({
      id: `p-${slug(name)}`,
      name,
      aliases: rng() < 0.25 ? [name.split(' ')[0]] : [],
      hair,
      bodyType,
      ageBracket: pickWeighted(rng, AGE, AGE_W),
      tattoos: rng() < 0.4,
      piercings: rng() < 0.35,
      face,
      body,
      videoCount: 0,
      favStudios: sample(rng, Array.from({ length: studioCount }, (_, i) => i), randInt(rng, 2, 3)),
      favActs: sample(rng, THEME_ACTS, randInt(rng, 2, 3)),
      favSettings: sample(rng, SETTINGS, 2),
      partners: [],
      // Zipf-ish: a few performers carry a lot of the catalog.
      popularity: 1 / Math.pow(idx + 3, 0.7),
    });
  }
  for (const p of out) {
    p.partners = sample(rng, out.map((_, i) => i).filter((i) => out[i] !== p), randInt(rng, 2, 4));
  }
  return out;
}

function addSparse(target: Vec, parts: [number, number][] | undefined, k: number) {
  if (!parts) return;
  for (const [dim, v] of parts) target[dim] += v * k;
}

function buildEmbedding(rng: Rng, cast: PerformerSeed[], studio: StudioDef, tags: string[]): Vec {
  const face = new Array(FACET_DIM).fill(0);
  const body = new Array(FACET_DIM).fill(0);
  const w = cast.map((_, i) => (i === 0 ? 0.65 : 0.35 / Math.max(1, cast.length - 1)));
  if (cast.length === 1) w[0] = 1;
  cast.forEach((p, i) => {
    for (let d = 0; d < FACET_DIM; d++) {
      face[d] += p.face[d] * w[i];
      body[d] += p.body[d] * w[i];
    }
  });
  for (let d = 0; d < FACET_DIM; d++) {
    face[d] += gaussian(rng) * 0.1;
    body[d] += gaussian(rng) * 0.1;
  }
  const pose = new Array(FACET_DIM).fill(0);
  const comp = new Array(FACET_DIM).fill(0);
  for (const [k, v] of Object.entries(studio.comp)) comp[COMP[k as keyof typeof COMP]] += (v ?? 0) * 0.6;
  for (const t of tags) {
    const def = TAG_BY_ID[t];
    addSparse(pose, def?.pose, 1);
    addSparse(comp, def?.comp, 0.7);
  }
  for (let d = 0; d < FACET_DIM; d++) {
    pose[d] = clamp(pose[d] + gaussian(rng) * 0.22, -1.4, 1.4);
    comp[d] = clamp(comp[d] + gaussian(rng) * 0.18, -1.4, 1.4);
  }
  return [...face, ...body, ...pose, ...comp].map((x) => Math.round(x * 1000) / 1000);
}

function castTag(n: number): string {
  return n === 1 ? 'solo' : n === 2 ? 'couple' : n === 3 ? 'threesome' : 'group';
}

function moodFor(rng: Rng, acts: string[]): string {
  if (acts.includes('cuddling') || acts.includes('massage')) return pickWeighted(rng, MOODS, [3, 1, 0.5, 3, 0.5, 2]);
  if (acts.includes('dance') || acts.includes('striptease')) return pickWeighted(rng, MOODS, [1, 3, 3, 2, 1, 0.5]);
  return pick(rng, MOODS);
}

function makeTitle(rng: Rng, cast: PerformerSeed[], setting: string): string {
  const phrase = pick(rng, PHRASES);
  const p1 = cast[0].name;
  const r = rng();
  if (r < 0.28) return `${phrase} with ${p1}`;
  if (r < 0.48 && cast.length > 1) return `${p1.split(' ')[0]} & ${cast[1].name.split(' ')[0]}: ${phrase}`;
  if (r < 0.68) return `${phrase} — ${TAG_BY_ID[setting].label}`;
  if (r < 0.84) return `${p1.split(' ')[0]}'s ${phrase}`;
  return phrase;
}

function releaseDate(rng: Rng): string {
  // Skew towards recent: u^0.6 pushes mass to the end of the range.
  const start = Date.UTC(2015, 0, 1);
  const end = Date.UTC(2026, 9, 20);
  const t = start + Math.pow(rng(), 0.6) * (end - start);
  return new Date(t).toISOString().slice(0, 10);
}

export function generateCatalog(seed = DEFAULT_SEED, size = 900): Catalog {
  const rng = mulberry32(seed);
  const studios: Studio[] = STUDIO_DEFS.map((s) => ({ id: `s-${slug(s.name)}`, name: s.name, style: s.style, videoCount: 0 }));
  const performers = makePerformers(rng, 64, STUDIO_DEFS.length);
  const popularity = performers.map((p) => p.popularity);
  const usedIds = new Set<string>();
  const videos: VideoSummary[] = [];
  const series: Series[] = [];

  const makeVideo = (opts: {
    lead: PerformerSeed;
    studioIdx: number;
    castSize?: number;
    setting?: string;
    styleTags?: string[];
    acts?: string[];
    seriesId?: string;
    episode?: number;
    date?: string;
    title?: string;
  }): VideoSummary => {
    const studio = STUDIO_DEFS[opts.studioIdx];
    const n = opts.castSize ?? pickWeighted(rng, [1, 2, 3, 4], [0.55, 0.33, 0.09, 0.03]);
    const cast: PerformerSeed[] = [opts.lead];
    while (cast.length < n) {
      const candidate = rng() < 0.55 ? performers[pick(rng, opts.lead.partners)] : pickWeighted(rng, performers, popularity);
      if (!cast.includes(candidate)) cast.push(candidate);
    }
    const acts = opts.acts ?? (rng() < 0.7 ? sample(rng, opts.lead.favActs, randInt(rng, 1, 2)) : sample(rng, THEME_ACTS, randInt(rng, 1, 2)));
    const setting = opts.setting ?? (rng() < 0.6 ? pick(rng, studio.settings) : rng() < 0.5 ? pick(rng, opts.lead.favSettings) : pick(rng, SETTINGS));
    const styleTags = opts.styleTags ?? (rng() < 0.65 ? sample(rng, studio.styles, randInt(rng, 1, 2)) : sample(rng, STYLES, 1));
    const styleTag = studio.style === 'pro' ? 'professional' : studio.style;
    const quality: Quality = pickWeighted(rng, ['SD', 'HD', '4K'] as Quality[], studio.quality);
    const vertical = styleTags.includes('vertical') || rng() < 0.25;
    const tags = new Set<string>([castTag(n), ...acts, setting, ...styleTags.filter((t) => t !== 'vertical'), styleTag, moodFor(rng, acts)]);
    if (quality === '4K') tags.add('4k');
    if (quality === 'HD') tags.add('hd');
    if (vertical) tags.add('vertical');
    if (rng() < 0.05) tags.add('behind-the-scenes');
    const tagList = [...tags].filter((t) => TAG_BY_ID[t]);
    const id = hexId(rng, 'vk', usedIds);
    const duration = Math.round(clamp(Math.exp(6.6 + gaussian(rng) * 0.6), 150, 3400));
    return {
      id,
      title: opts.title ?? makeTitle(rng, cast, setting),
      performerIds: cast.map((p) => p.id),
      studioId: studios[opts.studioIdx].id,
      seriesId: opts.seriesId,
      episode: opts.episode,
      tags: tagList,
      duration,
      clipDuration: randInt(rng, 14, 36),
      quality,
      style: studio.style,
      orientation: vertical ? 'vertical' : 'horizontal',
      releaseDate: opts.date ?? releaseDate(rng),
      views: Math.round(clamp(Math.exp(9.5 + gaussian(rng) * 1.6), 300, 48_000_000)),
      rating: Math.round(clamp(0.78 + gaussian(rng) * 0.08, 0.55, 0.99) * 100) / 100,
      thumbnail: { kind: 'procedural', seed: Math.floor(rng() * 2 ** 31) },
      embedding: buildEmbedding(rng, cast, studio, tagList),
      originalUrl: `${MOCK_ORIGIN}/view_video?viewkey=${id}`,
    };
  };

  // Series first, so episodes share a look.
  SERIES_TITLES.forEach((title, i) => {
    const studioIdx = i % STUDIO_DEFS.length;
    const lead = pickWeighted(rng, performers, popularity);
    const studio = STUDIO_DEFS[studioIdx];
    const setting = pick(rng, studio.settings);
    const styleTags = sample(rng, studio.styles, 1);
    const count = randInt(rng, 3, 8);
    const first = new Date(releaseDate(rng)).getTime();
    const sId = `sr-${slug(title)}`;
    const episodes: string[] = [];
    for (let e = 1; e <= count; e++) {
      const date = new Date(Math.min(first + (e - 1) * 1000 * 86400 * randInt(rng, 7, 30), Date.UTC(2026, 9, 20))).toISOString().slice(0, 10);
      const v = makeVideo({
        lead,
        studioIdx,
        setting: rng() < 0.75 ? setting : undefined,
        styleTags,
        seriesId: sId,
        episode: e,
        date,
        title: `${title} · Ep. ${e}`,
      });
      videos.push(v);
      episodes.push(v.id);
    }
    series.push({ id: sId, studioId: studios[studioIdx].id, title, episodes });
  });

  while (videos.length < size) {
    const lead = pickWeighted(rng, performers, popularity);
    const studioIdx = rng() < 0.7 ? pick(rng, lead.favStudios) : randInt(rng, 0, STUDIO_DEFS.length - 1);
    videos.push(makeVideo({ lead, studioIdx }));
  }

  const performerById = new Map<string, Performer>();
  const cleanPerformers: Performer[] = performers.map((p) => {
    const { favStudios, favActs, favSettings, partners, popularity: _pop, ...rest } = p;
    void favStudios; void favActs; void favSettings; void partners; void _pop;
    return rest;
  });
  for (const p of cleanPerformers) performerById.set(p.id, p);
  const studioById = new Map(studios.map((s) => [s.id, s]));
  for (const v of videos) {
    for (const pid of v.performerIds) performerById.get(pid)!.videoCount++;
    studioById.get(v.studioId)!.videoCount++;
  }

  const broken = new Set<string>();
  for (const v of videos) if (rng() < 0.015) broken.add(v.id);

  return {
    seed,
    tags: TAGS,
    performers: cleanPerformers.filter((p) => p.videoCount > 0),
    studios,
    series,
    videos,
    videoById: new Map(videos.map((v) => [v.id, v])),
    performerById,
    studioById,
    seriesById: new Map(series.map((s) => [s.id, s])),
    tagById: new Map(TAGS.map((t) => [t.id, t])),
    broken,
  };
}

export function describe(v: VideoSummary, catalog: Catalog): string {
  const names = v.performerIds.map((id) => catalog.performerById.get(id)?.name ?? 'Unknown');
  const studio = catalog.studioById.get(v.studioId)?.name ?? 'An independent studio';
  const labels = v.tags.map((t) => catalog.tagById.get(t)).filter(Boolean) as Tag[];
  const setting = labels.find((t) => t.category === 'setting')?.label.toLowerCase() ?? 'private';
  const mood = labels.find((t) => t.category === 'mood')?.label.toLowerCase() ?? 'easygoing';
  const styles = labels.filter((t) => t.category === 'style').map((t) => t.label.toLowerCase());
  const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return `${studio} presents ${who} in a ${mood} ${setting} scene${styles.length ? `, shot ${styles.join(' and ')}` : ''}. Mock metadata — all performers are fictional adults.`;
}
