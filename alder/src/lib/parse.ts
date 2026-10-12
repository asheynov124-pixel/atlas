import type { StudioState } from './types';

const PIECE_WORDS: [RegExp, string][] = [
  [/\btubs?\b|\bsoaking\b/, 'tub'], [/\bisland\b/, 'island'], [/\bshel(?:f|ves)\b/, 'shelves'], [/\brugs?\b/, 'rug'],
  [/\bpendants?\b/, 'pendant'], [/\bchandeliers?\b/, 'chandelier'], [/\btable lamps?\b/, 'tablelamp'],
  [/\bfloor lamps?\b|\blamps?\b/, 'floorlamp'], [/\bsconces?\b/, 'sconces'], [/\bpicture lights?\b/, 'picture-light'],
  [/\bart\b|\bpaintings?\b|\bpictures?\b/, 'art'], [/\bsectionals?\b/, 'sectional'], [/\bsofas?\b|\bcouch(?:es)?\b/, 'sofa'],
  [/\barmchairs?\b|\bchairs?\b/, 'chair'], [/\bbenches?\b/, 'bench'], [/\bking\b/, 'bed-king'], [/\bbeds?\b/, 'bed'], [/\bdesks?\b/, 'desk'],
  [/\bvanit(?:y|ies)\b/, 'vanity'], [/\branges?\b|\bstoves?\b/, 'range'], [/\bplants?\b|\bbranches?\b|\bvases?\b|\btrees?\b/, 'plant'],
  [/\bstools?\b/, 'stools'], [/\bcurtains?\b|\bdrapes?\b/, 'curtains'], [/\bdining tables?\b/, 'dining'], [/\bsideboards?\b|\bconsoles?\b/, 'sideboard'],
  [/\bcoffee tables?\b/, 'coffee'], [/\bbookcases?\b|\bbookshel(?:f|ves)\b/, 'bookcase'], [/\bdressers?\b/, 'dresser'], [/\bmirrors?\b/, 'mirror'],
  [/\bnightstands?\b/, 'nightstands'], [/\bshowers?\b/, 'shower'],
];

/** Read a free-text idea and pull out the choices the studio can build. */
export function parseIdea(text: string): Partial<StudioState> {
  const t = text.toLowerCase();
  const out: Partial<StudioState> = {};
  const found = PIECE_WORDS.filter(([re]) => re.test(t)).map(([, id]) => id);
  const pieces = [...new Set(found)].filter((p) => !(p === 'floorlamp' && found.includes('tablelamp')) && !(p === 'bed' && found.includes('bed-king')) && !(p === 'sofa' && found.includes('sectional')) && !(p === 'chair' && found.includes('armchairs')));
  if (pieces.length) out.pieces = pieces;
  if (/\bherringbone\b/.test(t)) out.floor = 'oak-herringbone';
  else if (/\bwalnut\b/.test(t)) out.floor = 'walnut';
  else if (/\bcheckerboard\b|\bchecker\b/.test(t)) out.floor = 'checker';
  else if (/\blimestone\b|\bmarble\b/.test(t)) out.floor = 'limestone';
  else if (/\bterracotta\b|\bterra cotta\b/.test(t)) out.floor = 'terracotta';
  else if (/\bcarpet\b/.test(t)) out.floor = 'wool-carpet';
  else if (/\boak\b/.test(t)) out.floor = 'oak';
  if (/\bvenetian\b/.test(t)) out.finish = 'venetian';
  else if (/\broman clay\b/.test(t)) out.finish = 'roman-clay';
  else if (/\btadelakt\b/.test(t)) out.finish = 'tadelakt';
  else if (/\bv-groove\b|\bshiplap\b|\bbeadboard\b|\bpanel/.test(t)) out.finish = 'vgroove';
  else if (/\blimewash\b|\bplaster\b/.test(t)) out.finish = 'limewash';
  if (/\bblackened\b|\bsteel\b|\biron\b|\bblack metal\b/.test(t)) out.metal = 'blackened';
  else if (/\bbronze\b/.test(t)) out.metal = 'bronze';
  else if (/\bchrome\b/.test(t)) out.metal = 'chrome';
  else if (/\bnickel\b/.test(t)) out.metal = 'nickel';
  else if (/\baged brass\b|\bantique brass\b/.test(t)) out.metal = 'aged-brass';
  else if (/\bbrass\b|\bunlacquered\b/.test(t)) out.metal = 'brass';
  if (/\bcraftsman\b/.test(t)) out.frame = 'craftsman';
  else if (/\bogee\b/.test(t)) out.frame = 'ogee';
  else if (/\bgallery\b/.test(t)) out.frame = 'gallery';
  else if (/\bfloater\b/.test(t)) out.frame = 'floater';
  else if (/\bno casing\b|\bdrywall return\b/.test(t)) out.frame = 'none';
  if (/\bboucle\b/.test(t)) out.cloth = 'boucle';
  else if (/\bleather\b|\bcognac\b/.test(t)) out.cloth = 'cognac';
  else if (/\bmohair\b|\bvelvet\b/.test(t)) out.cloth = 'mohair';
  else if (/\bstripe/.test(t)) out.cloth = 'stripe';
  if (/\bevening\b|\bcandlelight\b|\bnight\b/.test(t)) { out.warmth = 86; out.hour = 21; }
  else if (/\bnorth light\b|\bnorth day\b|\bnorth\b/.test(t)) { out.warmth = 42; out.hour = 11; }
  else if (/\bafternoon\b|\bgolden hour\b|\bwest\b/.test(t)) { out.warmth = 72; out.hour = 17; }
  else if (/\bmorning\b|\beast\b/.test(t)) { out.warmth = 55; out.hour = 8; }
  return out;
}
