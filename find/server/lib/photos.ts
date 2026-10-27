import { requireEnv } from "./env.ts";

// Real interior photography for the inspiration layer. Each photo keeps the credit the
// source requires, plus the hooks the source asks us to call when a photo is used.

export interface RoomPhoto {
  id: string;
  source: "unsplash" | "pexels";
  imageUrl: string; // hotlinked from the source CDN, as both APIs require
  thumbUrl: string;
  width: number;
  height: number;
  color: string | null;
  alt: string | null;
  pageUrl: string;
  photographer: string;
  photographerUrl: string;
  // Unsplash only: must be pinged when the photo is "used" (saved to a board, decoded).
  downloadLocation: string | null;
}

const UTM = "utm_source=find&utm_medium=referral";

export async function searchUnsplash(query: string, perPage = 30): Promise<{ photos: RoomPhoto[]; ms: number }> {
  const started = Date.now();
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(Math.min(perPage, 30)));
  url.searchParams.set("content_filter", "high");
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${requireEnv("UNSPLASH_ACCESS_KEY")}`, "Accept-Version": "v1" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Unsplash ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { results: UnsplashPhoto[] };
  const photos = body.results.map(
    (p): RoomPhoto => ({
      id: `unsplash:${p.id}`,
      source: "unsplash",
      imageUrl: `${p.urls.raw}&w=1080&q=80&fm=jpg&fit=max`,
      thumbUrl: p.urls.small,
      width: p.width,
      height: p.height,
      color: p.color ?? null,
      alt: p.alt_description ?? p.description ?? null,
      pageUrl: `${p.links.html}?${UTM}`,
      photographer: p.user.name,
      photographerUrl: `${p.user.links.html}?${UTM}`,
      downloadLocation: p.links.download_location,
    }),
  );
  return { photos, ms: Date.now() - started };
}

// Unsplash API guideline: trigger a download event when the user uses a photo.
export async function trackUnsplashUse(downloadLocation: string): Promise<void> {
  await fetch(downloadLocation, {
    headers: { Authorization: `Client-ID ${requireEnv("UNSPLASH_ACCESS_KEY")}` },
    signal: AbortSignal.timeout(5_000),
  });
}

export async function searchPexels(query: string, perPage = 30): Promise<{ photos: RoomPhoto[]; ms: number }> {
  const started = Date.now();
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(Math.min(perPage, 80)));
  const res = await fetch(url, {
    headers: { Authorization: requireEnv("PEXELS_API_KEY") },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Pexels ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { photos: PexelsPhoto[] };
  const photos = body.photos.map(
    (p): RoomPhoto => ({
      id: `pexels:${p.id}`,
      source: "pexels",
      imageUrl: p.src.large2x,
      thumbUrl: p.src.medium,
      width: p.width,
      height: p.height,
      color: p.avg_color ?? null,
      alt: p.alt || null,
      pageUrl: p.url,
      photographer: p.photographer,
      photographerUrl: p.photographer_url,
      downloadLocation: null,
    }),
  );
  return { photos, ms: Date.now() - started };
}

interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  color?: string;
  alt_description?: string | null;
  description?: string | null;
  urls: { raw: string; full: string; regular: string; small: string; thumb: string };
  links: { html: string; download_location: string };
  user: { name: string; links: { html: string } };
}

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  avg_color?: string;
  alt?: string;
  src: { original: string; large2x: string; large: string; medium: string; small: string; portrait: string };
}
