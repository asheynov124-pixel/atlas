import { describe, expect, it } from "vitest";
import { normalizeAvailability, parseProductPage, toNumber } from "../server/lib/product-page.js";

const page = (head: string, body = "") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const ld = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

describe("parseProductPage", () => {
  it("reads a Shopify-style page: og:type product + og:price meta + JSON-LD offers array", () => {
    const html = page(
      `<meta property="og:type" content="product">
       <meta property="og:title" content="Fluted Travertine Lamp">
       <meta property="og:image" content="//cdn.shop.example/lamp.jpg">
       <meta property="og:price:amount" content="1,249.00">
       <meta property="og:price:currency" content="USD">
       ${ld({
         "@context": "https://schema.org",
         "@type": "Product",
         name: "Fluted Travertine Lamp",
         image: ["https://cdn.shop.example/lamp-1.jpg"],
         brand: { "@type": "Brand", name: "Stone & Co" },
         offers: [
           { "@type": "Offer", price: "139.00", priceCurrency: "USD", availability: "https://schema.org/InStock" },
           { "@type": "Offer", price: "149.00", priceCurrency: "USD", availability: "https://schema.org/OutOfStock" },
         ],
       })}`,
    );
    const p = parseProductPage(html, "https://shop.example/products/lamp");
    expect(p.isProduct).toBe(true);
    expect(p.title).toBe("Fluted Travertine Lamp");
    expect(p.price).toBe(139);
    expect(p.currency).toBe("USD");
    expect(p.priceSource).toBe("json-ld");
    expect(p.availability).toBe("in_stock");
    expect(p.image).toBe("https://cdn.shop.example/lamp-1.jpg");
    expect(p.brand).toBe("Stone & Co");
  });

  it("finds a Product inside @graph and reads AggregateOffer lowPrice", () => {
    const html = page(
      ld({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebPage", name: "Rug page" },
          { "@type": ["Product", "Thing"], name: "Checked Wool Rug", image: { "@type": "ImageObject", url: "https://img.example/rug.jpg" }, offers: { "@type": "AggregateOffer", lowPrice: 289, highPrice: 899, priceCurrency: "USD" } },
        ],
      }),
    );
    const p = parseProductPage(html, "https://rugs.example/p/checked");
    expect(p.isProduct).toBe(true);
    expect(p.price).toBe(289);
    expect(p.image).toBe("https://img.example/rug.jpg");
  });

  it("reads offers from ProductGroup variants", () => {
    const html = page(
      ld({
        "@type": "ProductGroup",
        name: "Scalloped Mirror",
        hasVariant: [
          { "@type": "Product", name: "Small", image: "https://img.example/s.jpg", offers: { price: "98", priceCurrency: "USD", availability: "InStock" } },
          { "@type": "Product", name: "Large", offers: { price: "198", priceCurrency: "USD" } },
        ],
      }),
    );
    const p = parseProductPage(html, "https://mirrors.example/scalloped");
    expect(p.price).toBe(98);
    expect(p.image).toBe("https://img.example/s.jpg");
    expect(p.availability).toBe("in_stock");
  });

  it("falls back to microdata price", () => {
    const html = page(
      `<meta property="og:image" content="https://img.example/v.jpg"><title>Bud vase</title>`,
      `<div itemscope itemtype="https://schema.org/Product"><span itemprop="price" content="24.50"></span><meta itemprop="priceCurrency" content="USD"></div>`,
    );
    const p = parseProductPage(html, "https://vases.example/item/1");
    expect(p.isProduct).toBe(true);
    expect(p.price).toBe(24.5);
    expect(p.priceSource).toBe("microdata");
  });

  it("never invents a price: product page with no structured price has price null", () => {
    const html = page(`<meta property="og:type" content="og:product"><meta property="og:title" content="Boucle Chair"><meta property="og:image" content="https://img.example/c.jpg">`, `<p>Only $499!</p>`);
    const p = parseProductPage(html, "https://chairs.example/boucle");
    expect(p.isProduct).toBe(true);
    expect(p.price).toBeNull();
    expect(p.priceSource).toBeNull();
  });

  it("treats a category page as not a product", () => {
    const html = page(`<meta property="og:type" content="website"><meta property="og:title" content="Table Lamps | Shop"><meta property="og:image" content="https://img.example/cat.jpg">`, `<ul><li>Lamp A $99</li><li>Lamp B $129</li></ul>`);
    expect(parseProductPage(html, "https://shop.example/lighting/table-lamps").isProduct).toBe(false);
  });

  it("survives malformed JSON-LD and HTML comment wrappers", () => {
    const html = page(
      `<script type="application/ld+json">{ not json </script>
       <script type="application/ld+json"><!-- {"@type":"Product","name":"Linen Throw","image":"https://img.example/t.jpg","offers":{"price":"79","priceCurrency":"USD"}} --></script>`,
    );
    const p = parseProductPage(html, "https://throws.example/linen");
    expect(p.title).toBe("Linen Throw");
    expect(p.price).toBe(79);
  });
});

describe("helpers", () => {
  it("toNumber parses prices and rejects zero/garbage", () => {
    expect(toNumber("$1,299.99")).toBe(1299.99);
    expect(toNumber(42)).toBe(42);
    expect(toNumber("0")).toBeNull();
    expect(toNumber("call for price")).toBeNull();
  });
  it("normalizeAvailability maps schema.org values", () => {
    expect(normalizeAvailability("https://schema.org/InStock")).toBe("in_stock");
    expect(normalizeAvailability("http://schema.org/OutOfStock")).toBe("out_of_stock");
    expect(normalizeAvailability("PreOrder")).toBe("preorder");
    expect(normalizeAvailability(undefined)).toBe("unknown");
  });
});
