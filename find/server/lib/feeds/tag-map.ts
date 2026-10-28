import { CATEGORIES, COLORS, MATERIALS, ROOMS, STYLE_CUES, priceBand } from "../vocab.js";
import type { CardTags } from "./types.js";

// Deterministic tagging for feed cards: match the controlled vocabulary against the seller's own
// words (title, tags, materials, item aspects) and the search that found the card. No model call,
// so it costs nothing and keeps eBay/Etsy content out of AI tools, as their API terms require.

type Vocab<T extends string> = readonly T[];
type Synonyms<T extends string> = Partial<Record<T, string[]>>;

const CATEGORY_SYNONYMS: Synonyms<(typeof CATEGORIES)[number]> = {
  bed: ["bed frame", "platform bed", "canopy bed", "bed"],
  lamp: ["table lamp", "floor lamp", "desk lamp", "buffet lamp", "lamp"],
  pendant: ["pendant light", "pendant lamp", "pendant"],
  sconce: ["wall sconce", "wall light", "sconce"],
  rug: ["area rug", "rug", "carpet", "kilim"],
  runner: ["runner rug", "hallway runner"],
  sideboard: ["sideboard", "buffet cabinet", "credenza"],
  console: ["console table", "console"],
  dresser: ["dresser", "chest of drawers"],
  nightstand: ["nightstand", "night stand", "bedside table"],
  coffee_table: ["coffee table", "cocktail table"],
  side_table: ["side table", "end table", "accent table"],
  dining_table: ["dining table", "kitchen table"],
  ottoman: ["ottoman", "pouf", "pouffe", "footstool"],
  sofa: ["sofa", "couch", "loveseat", "settee", "sectional"],
  accent_chair: ["accent chair", "armchair", "arm chair", "lounge chair", "club chair", "chair"],
  dining_chair: ["dining chair", "side chair"],
  stool: ["bar stool", "counter stool", "stool"],
  bookcase: ["bookcase", "bookshelf", "etagere"],
  shelf: ["wall shelf", "floating shelf", "shelf", "shelves"],
  cabinet: ["cabinet", "cupboard", "hutch"],
  wall_art: ["wall art", "art print", "print", "painting", "poster", "canvas", "artwork"],
  frame: ["picture frame", "photo frame", "frame"],
  candle_holder: ["candle holder", "candleholder", "candlestick", "candelabra", "hurricane", "taper holder"],
  throw: ["throw blanket", "throw"],
  pillow: ["pillow cover", "cushion cover", "throw pillow", "pillow", "cushion"],
  bedding: ["duvet cover", "duvet", "quilt", "sheet set", "comforter", "coverlet", "bedding"],
  curtain: ["curtain", "drape"],
  dinnerware: ["dinner plate", "dinnerware", "plate", "dish set"],
  glassware: ["wine glass", "glassware", "tumbler", "coupe", "glasses"],
  serveware: ["serving platter", "platter", "serving bowl", "pitcher", "carafe", "serveware"],
  planter: ["planter", "plant pot", "flower pot"],
  sculpture: ["sculpture", "statue", "figurine", "bust"],
  book: ["coffee table book", "book"],
  tabletop_decor: ["decorative object", "objet", "bookend", "trinket box", "decorative box"],
  storage: ["storage basket", "storage box", "organizer", "storage"],
};

const MATERIAL_SYNONYMS: Synonyms<(typeof MATERIALS)[number]> = {
  oak: ["white oak", "oak"],
  reclaimed_wood: ["reclaimed wood", "reclaimed"],
  painted_wood: ["painted wood"],
  cane: ["cane", "caned"],
  seagrass: ["seagrass", "sea grass"],
  boucle: ["boucle"],
  sheepskin: ["sheepskin", "shearling"],
  concrete: ["concrete", "cement"],
  terracotta: ["terracotta", "terra cotta"],
  smoked_glass: ["smoked glass"],
  iron: ["wrought iron", "cast iron", "iron"],
  steel: ["stainless steel", "steel"],
  aluminum: ["aluminum", "aluminium"],
  lacquer: ["lacquered", "lacquer"],
  acrylic: ["acrylic", "lucite"],
  paper: ["rice paper", "paper"],
};

const COLOR_SYNONYMS: Synonyms<(typeof COLORS)[number]> = {
  gray: ["gray", "grey"],
  burgundy: ["burgundy", "maroon", "oxblood"],
  multicolor: ["multicolor", "multicolored", "multi color", "multi colored"],
  slate_blue: ["slate blue"],
};

const STYLE_SYNONYMS: Synonyms<(typeof STYLE_CUES)[number]> = {
  mid_century: ["mid century modern", "midcentury modern", "mid century", "midcentury", "mcm"],
  wabi_sabi: ["wabi sabi"],
  organic_modern: ["organic modern"],
  scandinavian: ["scandinavian", "scandi", "nordic", "danish modern"],
  minimalist: ["minimalist", "minimal"],
  coastal: ["coastal", "nautical", "beach house"],
  spanish_revival: ["spanish revival", "spanish colonial"],
  bohemian: ["bohemian", "boho"],
  art_deco: ["art deco", "deco"],
  hollywood_regency: ["hollywood regency", "regency"],
  brutalist: ["brutalist", "brutalism"],
  postmodern: ["postmodern", "post modern"],
  arts_and_crafts: ["arts and crafts", "mission style", "craftsman"],
  california_casual: ["california casual"],
  desert_modern: ["desert modern"],
  grandmillennial: ["grandmillennial", "grandmillenial"],
  curved: ["curved", "rounded", "arched", "arch"],
  scalloped: ["scalloped", "scallop"],
  fluted: ["fluted", "reeded", "ribbed"],
  checkered: ["checkered", "checkerboard", "checked"],
  striped: ["striped", "stripe"],
  floral: ["floral", "flower"],
  handmade: ["handmade", "handcrafted", "hand made", "hand thrown", "hand carved", "artisan"],
  slim_profile: ["slim profile", "slim"],
  oversized: ["oversized", "oversize"],
};

const ROOM_SYNONYMS: Synonyms<(typeof ROOMS)[number]> = {
  living: ["living room", "lounge"],
  dining: ["dining room"],
  bathroom: ["bathroom", "bath"],
  entry: ["entryway", "foyer", "hallway", "entry"],
  office: ["home office", "office", "study"],
  nursery: ["nursery", "kids room"],
  outdoor: ["outdoor", "patio", "garden"],
};

// Where a category clearly implies a room.
const CATEGORY_ROOM: Partial<Record<(typeof CATEGORIES)[number], (typeof ROOMS)[number]>> = {
  nightstand: "bedroom",
  bed: "bedroom",
  headboard: "bedroom",
  bedding: "bedroom",
  dresser: "bedroom",
  dining_table: "dining",
  dining_chair: "dining",
  dinnerware: "dining",
  glassware: "dining",
  serveware: "dining",
  sofa: "living",
  coffee_table: "living",
  desk: "office",
};

export function normalize(text: string): string {
  return ` ${text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

interface Match<T extends string> {
  value: T;
  index: number;
}

// Longest phrases first; each match is blanked out so "mid century modern" doesn't also count as "modern".
function matchAll<T extends string>(text: string, vocab: Vocab<T>, synonyms: Synonyms<T>): Match<T>[] {
  const phrases: { value: T; phrase: string }[] = [];
  for (const value of vocab) {
    const words = new Set([value.replace(/_/g, " "), ...(synonyms[value] ?? [])]);
    for (const w of words) phrases.push({ value, phrase: normalize(w).trim() });
  }
  phrases.sort((a, b) => b.phrase.length - a.phrase.length);

  let work = text;
  const out: Match<T>[] = [];
  for (const { value, phrase } of phrases) {
    for (const suffix of ["", "s", "es"]) {
      const needle = ` ${phrase}${suffix} `;
      let i = work.indexOf(needle);
      while (i !== -1) {
        out.push({ value, index: i });
        work = work.slice(0, i + 1) + " ".repeat(needle.length - 2) + work.slice(i + needle.length - 1);
        i = work.indexOf(needle);
      }
    }
  }
  return out;
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

export interface TagInput {
  title: string;
  query: string;
  sellerTags?: string[];
  materials?: string[];
  aspects?: Record<string, string[]>;
  price: number | null;
}

export function tagsFromListing(input: TagInput): CardTags {
  const aspectText = Object.entries(input.aspects ?? {})
    .map(([k, vs]) => `${k} ${vs.join(" ")}`)
    .join(" | ");
  const everything = normalize(
    [input.title, input.query, ...(input.sellerTags ?? []), ...(input.materials ?? []), aspectText].join(" | "),
  );

  // Category: the head noun of the title (last match before "with/for/and"), then the query.
  const head = normalize(input.title.split(/\s(?:with|for|and|in|by|w\/)\s/i)[0] ?? input.title);
  const titleCats = matchAll(head, CATEGORIES, CATEGORY_SYNONYMS).sort((a, b) => a.index - b.index);
  const queryCats = matchAll(normalize(input.query), CATEGORIES, CATEGORY_SYNONYMS);
  const category = titleCats.at(-1)?.value ?? queryCats[0]?.value ?? null;

  const rooms: CardTags["rooms"] = uniq(matchAll(everything, ROOMS, ROOM_SYNONYMS).map((m) => m.value)).filter(
    (r) => r !== "any",
  );
  const implied = category ? CATEGORY_ROOM[category] : undefined;
  if (implied && !rooms.includes(implied)) rooms.push(implied);

  return {
    category,
    rooms,
    materials: uniq(matchAll(everything, MATERIALS, MATERIAL_SYNONYMS).map((m) => m.value)),
    // "white oak" is a wood, not a white piece.
    colors: uniq(matchAll(everything.replace(/ white oak /g, " oak "), COLORS, COLOR_SYNONYMS).map((m) => m.value)),
    style_cues: uniq(matchAll(everything, STYLE_CUES, STYLE_SYNONYMS).map((m) => m.value)),
    price_band: priceBand(input.price),
  };
}
