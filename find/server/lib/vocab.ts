// The controlled tag vocabulary. The taste profile is a weighted score over exactly these
// values, so tags must come from these lists (Claude is constrained to them by schema).
// Deliberately broad: she is still discovering her style, so the vocabulary spans styles
// she may never pick, which is what lets the 25% explore slice find her new territory.

export const CATEGORIES = [
  "lamp", "pendant", "sconce", "chandelier", "rug", "runner", "sideboard", "console", "dresser", "nightstand",
  "coffee_table", "side_table", "dining_table", "desk", "bench", "ottoman", "sofa", "accent_chair", "dining_chair",
  "stool", "bed", "headboard", "bookcase", "shelf", "cabinet", "mirror", "wall_art", "frame", "vase", "bowl",
  "tray", "candle_holder", "candle", "throw", "pillow", "bedding", "curtain", "dinnerware", "glassware",
  "serveware", "planter", "basket", "clock", "sculpture", "book", "tabletop_decor", "storage", "other",
] as const;

export const ROOMS = [
  "living", "dining", "kitchen", "bedroom", "bathroom", "entry", "office", "nursery", "outdoor", "any",
] as const;

export const MATERIALS = [
  "oak", "walnut", "pine", "teak", "ash", "maple", "reclaimed_wood", "painted_wood", "bamboo", "rattan", "cane",
  "wicker", "jute", "seagrass", "linen", "cotton", "wool", "boucle", "velvet", "leather", "suede", "silk",
  "mohair", "sheepskin", "travertine", "marble", "limestone", "granite", "terrazzo", "concrete", "plaster",
  "ceramic", "stoneware", "porcelain", "terracotta", "glass", "smoked_glass", "brass", "bronze", "iron",
  "steel", "chrome", "nickel", "aluminum", "copper", "lacquer", "acrylic", "paper", "resin", "alabaster",
] as const;

export const COLORS = [
  "white", "ivory", "cream", "beige", "tan", "camel", "brown", "chocolate", "black", "charcoal", "gray",
  "taupe", "greige", "sage", "olive", "green", "emerald", "teal", "blue", "navy", "slate_blue", "lavender",
  "pink", "blush", "terracotta", "rust", "red", "burgundy", "orange", "mustard", "yellow", "gold", "silver",
  "natural", "multicolor",
] as const;

export const PALETTE_FAMILIES = [
  "warm_neutral", "cool_neutral", "earthy", "monochrome", "high_contrast", "pastel", "jewel_tone",
  "muted_color", "bright_color", "dark_moody",
] as const;

export const STYLE_CUES = [
  "modern", "mid_century", "minimalist", "scandinavian", "japandi", "wabi_sabi", "organic_modern",
  "traditional", "transitional", "farmhouse", "cottage", "english_country", "french_country", "parisian",
  "coastal", "mediterranean", "spanish_revival", "bohemian", "eclectic", "maximalist", "art_deco",
  "hollywood_regency", "industrial", "rustic", "brutalist", "postmodern", "memphis", "victorian",
  "arts_and_crafts", "vintage", "antique", "contemporary", "california_casual", "desert_modern", "grandmillennial",
  "curved", "sculptural", "scalloped", "fluted", "checkered", "striped", "floral", "handmade", "chunky",
  "slim_profile", "oversized",
] as const;

export const MOODS = [
  "calm", "cozy", "airy", "moody", "playful", "elegant", "collected", "earthy", "glamorous", "fresh",
  "romantic", "edgy", "serene", "warm", "crisp",
] as const;

export const PRICE_BANDS = ["under_50", "50_150", "150_400", "400_1000", "1000_plus", "unknown"] as const;

export function priceBand(price: number | null): (typeof PRICE_BANDS)[number] {
  if (price == null) return "unknown";
  if (price < 50) return "under_50";
  if (price < 150) return "50_150";
  if (price < 400) return "150_400";
  if (price < 1000) return "400_1000";
  return "1000_plus";
}
