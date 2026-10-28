import { env, requireEnv } from "../env.js";
import { tagsFromListing } from "./tag-map.js";
import type { FeedSearch, PoolCard } from "./types.js";

// Etsy Open API v3 (official). Public listing search needs only the app key. Etsy's API terms bar
// using its content for machine learning, so tags come from the seller's own tags/materials/style.

const API = "https://openapi.etsy.com/v3/application";
const REFRESH_HOURS = 6;
export const ETSY_NOTICE =
  "The term 'Etsy' is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.";

// Etsy now expects "keystring:shared_secret" in x-api-key; plain keystring is sent if no secret is set.
function apiKey(): string {
  const key = requireEnv("ETSY_API_KEY");
  const secret = env("ETSY_SHARED_SECRET");
  return secret ? `${key}:${secret}` : key;
}

async function etsyGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { "x-api-key": apiKey() }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Etsy ${res.status} ${path.split("?")[0]}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

export async function searchEtsy(
  query: string,
  { limit = 25, maxPrice }: { limit?: number; maxPrice?: number } = {},
): Promise<FeedSearch> {
  const started = Date.now();
  const params = new URLSearchParams({ keywords: query, limit: String(Math.min(limit, 100)), sort_on: "score" });
  if (maxPrice) params.set("max_price", String(maxPrice));
  const found = await etsyGet<{ count: number; results: EtsyListing[] }>(`/listings/active?${params}`);
  const ids = found.results.map((l) => l.listing_id);
  if (ids.length === 0) return { source: "etsy", query, cards: [], totalAvailable: found.count, ms: Date.now() - started };

  // Search results carry no images; one batch call fetches them.
  const batch = await etsyGet<{ results: (EtsyListing & { images?: EtsyImage[] })[] }>(
    `/listings/batch?listing_ids=${ids.join(",")}&includes=Images`,
  );
  const imagesById = new Map(batch.results.map((l) => [l.listing_id, l.images ?? []]));

  const now = new Date();
  const cards: PoolCard[] = [];
  for (const l of found.results) {
    const images = (imagesById.get(l.listing_id) ?? []).map((i) => i.url_fullxfull ?? i.url_570xN).filter((u): u is string => !!u);
    if (images.length === 0 || !l.url) continue;
    const price = l.price ? l.price.amount / l.price.divisor : null;
    cards.push({
      id: `etsy:${l.listing_id}`,
      source: "etsy",
      sourceId: String(l.listing_id),
      title: decode(l.title),
      url: l.url,
      image: (imagesById.get(l.listing_id) ?? [])[0]?.url_570xN ?? images[0]!,
      images,
      price,
      currency: l.price?.currency_code ?? null,
      condition: l.when_made ?? null,
      vintage: isVintage(l),
      seller: l.shop_id ? String(l.shop_id) : null,
      tags: tagsFromListing({
        title: decode(l.title),
        query,
        sellerTags: [...(l.tags ?? []), ...(l.style ?? [])],
        materials: l.materials ?? [],
        price,
      }),
      tagSource: "listing-metadata",
      query,
      fetchedAt: now.toISOString(),
      refreshAfter: new Date(now.getTime() + REFRESH_HOURS * 3_600_000).toISOString(),
      attribution: ETSY_NOTICE,
    });
  }
  return { source: "etsy", query, cards, totalAvailable: found.count, ms: Date.now() - started };
}

// Etsy defines vintage as 20+ years old and made by someone else.
export function isVintage(l: Pick<EtsyListing, "who_made" | "when_made" | "title">): boolean {
  if (/\b(vintage|antique)\b/i.test(l.title)) return true;
  if (l.who_made !== "someone_else" || !l.when_made) return false;
  const m = l.when_made.match(/(\d{4})/);
  return l.when_made.startsWith("before_") || (m !== null && Number(m[1]) < 2007);
}

function decode(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

interface EtsyListing {
  listing_id: number;
  title: string;
  url?: string;
  shop_id?: number;
  price?: { amount: number; divisor: number; currency_code: string };
  tags?: string[];
  materials?: string[];
  style?: string[];
  who_made?: string;
  when_made?: string;
}

interface EtsyImage {
  url_570xN?: string;
  url_fullxfull?: string;
}
