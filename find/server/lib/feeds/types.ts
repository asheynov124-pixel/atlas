import type { CATEGORIES, COLORS, MATERIALS, PRICE_BANDS, ROOMS, STYLE_CUES } from "../vocab.js";

// A card in the product pool. Pool cards come only from official, licensed feeds (eBay, Etsy):
// every field is the source's own data, shown with the source's required attribution.

export interface CardTags {
  category: (typeof CATEGORIES)[number] | null;
  rooms: (typeof ROOMS)[number][];
  materials: (typeof MATERIALS)[number][];
  colors: (typeof COLORS)[number][];
  style_cues: (typeof STYLE_CUES)[number][];
  price_band: (typeof PRICE_BANDS)[number];
}

export interface PoolCard {
  id: string; // "<source>:<source id>"
  source: "ebay" | "etsy";
  sourceId: string;
  title: string;
  url: string; // the listing page on the source
  image: string; // hotlinked from the source's CDN
  images: string[];
  price: number | null;
  currency: string | null;
  condition: string | null;
  vintage: boolean;
  seller: string | null;
  tags: CardTags;
  // Tags come from the seller's own listing data + the search that found the card, never from an
  // AI model: both eBay's and Etsy's API terms restrict running their content through AI/ML.
  tagSource: "listing-metadata";
  query: string;
  fetchedAt: string;
  // Re-fetch from the source before showing a card past this point (prices and stock change).
  refreshAfter: string;
  attribution: string;
}

export interface FeedSearch {
  source: PoolCard["source"];
  query: string;
  cards: PoolCard[];
  totalAvailable: number | null;
  ms: number;
}
