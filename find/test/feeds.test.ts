import { afterEach, describe, expect, it, vi } from "vitest";
import { searchEbay } from "../server/lib/feeds/ebay.js";
import { ETSY_NOTICE, isVintage, searchEtsy } from "../server/lib/feeds/etsy.js";
import { tagsFromListing } from "../server/lib/feeds/tag-map.js";

describe("tagsFromListing", () => {
  it("finds the head-noun category, materials, colors and form cues from the seller's words", () => {
    const t = tagsFromListing({
      title: "Vintage Travertine Mushroom Table Lamp with Linen Shade, Bouclé Cord",
      query: "travertine table lamp",
      price: 129,
    });
    expect(t.category).toBe("lamp");
    expect(t.materials).toEqual(expect.arrayContaining(["travertine", "linen", "boucle"]));
    expect(t.style_cues).toContain("vintage");
    expect(t.price_band).toBe("50_150");
  });

  it("does not double-count 'mid century modern' as 'modern', or 'white oak' as white", () => {
    const t = tagsFromListing({ title: "Mid Century Modern White Oak Sideboard Fluted Doors", query: "sideboard", price: 1450 });
    expect(t.category).toBe("sideboard");
    expect(t.style_cues).toEqual(expect.arrayContaining(["mid_century", "fluted"]));
    expect(t.style_cues).not.toContain("modern");
    expect(t.colors).not.toContain("white");
    expect(t.materials).toContain("oak");
  });

  it("uses item aspects and implied rooms", () => {
    const t = tagsFromListing({
      title: "Nightstand",
      query: "bedside table",
      aspects: { Material: ["Rattan", "Wood"], Color: ["Natural"], Style: ["Bohemian"] },
      price: null,
    });
    expect(t.category).toBe("nightstand");
    expect(t.rooms).toContain("bedroom");
    expect(t.materials).toContain("rattan");
    expect(t.colors).toContain("natural");
    expect(t.style_cues).toContain("bohemian");
    expect(t.price_band).toBe("unknown");
  });

  it("picks the last category before 'with' (pillow, not print)", () => {
    expect(tagsFromListing({ title: "Floral Print Throw Pillow Cover with Insert", query: "", price: 40 }).category).toBe("pillow");
    expect(tagsFromListing({ title: "Coffee Table Book: Japandi Interiors", query: "", price: 40 }).category).toBe("book");
  });
});

describe("isVintage (Etsy)", () => {
  it("follows Etsy's 20-years-and-someone-else rule", () => {
    expect(isVintage({ title: "Brass candlesticks", who_made: "someone_else", when_made: "1970s" })).toBe(true);
    expect(isVintage({ title: "Brass candlesticks", who_made: "someone_else", when_made: "before_2007" })).toBe(true);
    expect(isVintage({ title: "Brass candlesticks", who_made: "i_did", when_made: "made_to_order" })).toBe(false);
    expect(isVintage({ title: "Brass candlesticks", who_made: "someone_else", when_made: "2020_2026" })).toBe(false);
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("feed clients (mocked HTTP)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("eBay: token, search, aspects → PoolCards with listing links and seller-derived tags", async () => {
    vi.stubEnv("EBAY_CLIENT_ID", "id");
    vi.stubEnv("EBAY_CLIENT_SECRET", "secret");
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/oauth2/token")) return json({ access_token: "t", expires_in: 7200 });
      if (url.includes("/item_summary/search"))
        return json({
          total: 2,
          itemSummaries: [
            { itemId: "v1|1|0", title: "Travertine Table Lamp", itemWebUrl: "https://www.ebay.com/itm/1", image: { imageUrl: "https://i.ebayimg.com/1.jpg" }, price: { value: "120.00", currency: "USD" }, condition: "Used", seller: { username: "s1" } },
            { itemId: "v1|2|0", title: "No image lamp", itemWebUrl: "https://www.ebay.com/itm/2" },
          ],
        });
      if (url.includes("/buy/browse/v1/item/")) return json({ localizedAspects: [{ name: "Material", value: "Travertine, Brass" }, { name: "Style", value: "Mid-Century Modern" }] });
      return json({}, 404);
    });
    const r = await searchEbay("travertine lamp", { maxPrice: 150 });
    expect(r.cards).toHaveLength(1);
    const c = r.cards[0]!;
    expect(c).toMatchObject({ id: "ebay:v1|1|0", url: "https://www.ebay.com/itm/1", price: 120, currency: "USD", attribution: "Listing on eBay", tagSource: "listing-metadata" });
    expect(c.tags.materials).toEqual(expect.arrayContaining(["travertine", "brass"]));
    expect(c.tags.style_cues).toContain("mid_century");
    expect(calls.find((u) => u.includes("item_summary"))).toContain(encodeURIComponent("price:[..150]").replace(/%2C/g, ","));
  });

  it("Etsy: search + batch images, price from amount/divisor, required notice, combined key header", async () => {
    vi.stubEnv("ETSY_API_KEY", "key");
    vi.stubEnv("ETSY_SHARED_SECRET", "shh");
    const headers: string[] = [];
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      headers.push(new Headers(init?.headers).get("x-api-key") ?? "");
      if (url.includes("/listings/active"))
        return json({ count: 1, results: [{ listing_id: 42, title: "Scalloped Rattan Mirror &amp; Hook", url: "https://www.etsy.com/listing/42", price: { amount: 8950, divisor: 100, currency_code: "USD" }, tags: ["coastal"], materials: ["rattan"], who_made: "i_did", when_made: "made_to_order" }] });
      if (url.includes("/listings/batch")) return json({ results: [{ listing_id: 42, title: "x", images: [{ url_570xN: "https://i.etsystatic.com/42_570.jpg", url_fullxfull: "https://i.etsystatic.com/42_full.jpg" }] }] });
      return json({}, 404);
    });
    const r = await searchEtsy("scalloped mirror");
    expect(headers.every((h) => h === "key:shh")).toBe(true);
    const c = r.cards[0]!;
    expect(c).toMatchObject({ id: "etsy:42", title: "Scalloped Rattan Mirror & Hook", price: 89.5, image: "https://i.etsystatic.com/42_570.jpg", attribution: ETSY_NOTICE, vintage: false });
    expect(c.tags.category).toBe("mirror");
    expect(c.tags.style_cues).toEqual(expect.arrayContaining(["scalloped", "coastal"]));
  });

  it("surfaces API errors instead of returning empty results", async () => {
    vi.stubEnv("ETSY_API_KEY", "key");
    vi.stubGlobal("fetch", async () => json({ error: "Invalid API key" }, 403));
    await expect(searchEtsy("x")).rejects.toThrow(/Etsy 403/);
  });
});
