import { requireEnv } from "../env.js";
import { mapLimit } from "../pool-utils.js";
import { tagsFromListing } from "./tag-map.js";
import type { FeedSearch, PoolCard } from "./types.js";

// eBay Browse API (official). Application token via client credentials; search + item details.
// eBay content is shown with a link back to the listing and is never sent to an AI model.

const API = "https://api.ebay.com";
const HOME_AND_GARDEN = "11700";
// Conservative until the API License Agreement's storage terms are confirmed: re-fetch after 6h.
const REFRESH_HOURS = 6;

let token: { value: string; expiresAt: number } | null = null;

async function appToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const basic = Buffer.from(`${requireEnv("EBAY_CLIENT_ID")}:${requireEnv("EBAY_CLIENT_SECRET")}`).toString("base64");
  const res = await fetch(`${API}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`eBay token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return token.value;
}

async function ebayGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${await appToken()}`, "x-ebay-c-marketplace-id": "EBAY_US" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`eBay ${res.status} ${path.split("?")[0]}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

export async function searchEbay(
  query: string,
  { limit = 25, maxPrice, withAspects = 10 }: { limit?: number; maxPrice?: number; withAspects?: number } = {},
): Promise<FeedSearch> {
  const started = Date.now();
  const filters = ["buyingOptions:{FIXED_PRICE}", "priceCurrency:USD"];
  if (maxPrice) filters.push(`price:[..${maxPrice}]`);
  const params = new URLSearchParams({
    q: query,
    limit: String(Math.min(limit, 200)),
    category_ids: HOME_AND_GARDEN,
    filter: filters.join(","),
  });
  const body = await ebayGet<{ total?: number; itemSummaries?: EbaySummary[] }>(`/buy/browse/v1/item_summary/search?${params}`);
  const summaries = (body.itemSummaries ?? []).filter((s) => s.image?.imageUrl && s.itemWebUrl);

  // Item aspects (Material, Color, Style…) are the seller's own structured description and the best
  // tag source; they need one getItem call each, so only the first few get them.
  const aspects = await mapLimit(summaries.slice(0, withAspects), 4, async (s) => {
    try {
      const item = await ebayGet<{ localizedAspects?: { name: string; value: string }[] }>(
        `/buy/browse/v1/item/${encodeURIComponent(s.itemId)}`,
      );
      const out: Record<string, string[]> = {};
      for (const a of item.localizedAspects ?? []) (out[a.name] ??= []).push(...a.value.split(/,\s*/));
      return out;
    } catch {
      return {};
    }
  });

  const now = new Date();
  const cards = summaries.map((s, i): PoolCard => {
    const price = s.price?.value ? Number(s.price.value) : null;
    const aspect = aspects[i] ?? {};
    return {
      id: `ebay:${s.itemId}`,
      source: "ebay",
      sourceId: s.itemId,
      title: s.title,
      url: s.itemWebUrl,
      image: s.image!.imageUrl,
      images: [s.image!.imageUrl, ...(s.additionalImages ?? []).map((x) => x.imageUrl)],
      price: Number.isFinite(price) ? price : null,
      currency: s.price?.currency ?? null,
      condition: s.condition ?? null,
      vintage: /\b(vintage|antique|mid century|midcentury|retro)\b/i.test(s.title) || /vintage|antique/i.test(JSON.stringify(aspect)),
      seller: s.seller?.username ?? null,
      tags: tagsFromListing({ title: s.title, query, aspects: aspect, price }),
      tagSource: "listing-metadata",
      query,
      fetchedAt: now.toISOString(),
      refreshAfter: new Date(now.getTime() + REFRESH_HOURS * 3_600_000).toISOString(),
      attribution: "Listing on eBay",
    };
  });
  return { source: "ebay", query, cards, totalAvailable: body.total ?? null, ms: Date.now() - started };
}

interface EbaySummary {
  itemId: string;
  title: string;
  itemWebUrl: string;
  image?: { imageUrl: string };
  additionalImages?: { imageUrl: string }[];
  price?: { value: string; currency: string };
  condition?: string;
  seller?: { username?: string };
}
