import { describe, expect, it } from "vitest";
import type { FetchedPage } from "../server/lib/http.ts";
import { canonicalize, classify, retailerOf } from "../server/lib/verify.ts";

const fetched = (over: Partial<FetchedPage>): FetchedPage => ({
  requestedUrl: "https://shop.example/products/lamp",
  finalUrl: "https://shop.example/products/lamp",
  status: 200,
  ok: true,
  html: "",
  contentType: "text/html; charset=utf-8",
  redirects: [],
  ms: 120,
  ...over,
});

const productHtml = `<html><head><meta property="og:type" content="product"><meta property="og:title" content="Lamp"><meta property="og:image" content="https://img.example/l.jpg"><meta property="product:price:amount" content="120"><meta property="product:price:currency" content="USD"></head><body>${"x".repeat(25_000)}</body></html>`;

describe("classify", () => {
  it("accepts a live product page with an image", () => {
    const r = classify(fetched({ html: productHtml }));
    expect(r.status).toBe("ok");
    expect(r.product?.price).toBe(120);
  });

  it("flags PerimeterX walls as blocked, not dead", () => {
    const r = classify(fetched({ status: 403, ok: false, html: `<html><head><title>Access to this page has been denied</title></head><body><div id="px-captcha"></div></body></html>` }));
    expect(r.status).toBe("blocked");
    expect(r.reason).toMatch(/PerimeterX/);
  });

  it("flags a Cloudflare challenge served with 503", () => {
    const r = classify(fetched({ status: 503, ok: false, html: `<html><head><title>Just a moment...</title></head><body><script src="/cdn-cgi/challenge-platform/x.js"></script></body></html>` }));
    expect(r.status).toBe("blocked");
    expect(r.reason).toMatch(/Cloudflare/);
  });

  it("flags Akamai access denied", () => {
    const r = classify(fetched({ status: 403, ok: false, html: `<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD><BODY>Reference #18.6f3c1002.1730000000.1a2b3c4d</BODY></HTML>` }));
    expect(r.status).toBe("blocked");
  });

  it("calls a bare 403 likely bot management", () => {
    expect(classify(fetched({ status: 403, ok: false, html: "<html>nope</html>" })).status).toBe("blocked");
  });

  it("treats 404 as dead", () => {
    expect(classify(fetched({ status: 404, ok: false, html: "<html>gone</html>" })).status).toBe("dead");
  });

  it("treats a product link that redirected to the homepage as a soft 404", () => {
    const r = classify(fetched({ finalUrl: "https://shop.example/", redirects: ["https://shop.example/products/lamp"], html: `<html><head><meta property="og:type" content="website"><title>Shop</title></head><body>${"x".repeat(25_000)}</body></html>` }));
    expect(r.status).toBe("dead");
  });

  it("treats a 'page not found' title served with 200 as dead", () => {
    const r = classify(fetched({ html: `<html><head><title>Page Not Found | Shop</title></head><body>${"x".repeat(25_000)}</body></html>` }));
    expect(r.status).toBe("dead");
  });

  it("reports network errors as error", () => {
    expect(classify(fetched({ status: 0, ok: false, error: "CONNECT tunnel failed, response 403" })).status).toBe("error");
  });

  it("does not mistake a big normal page mentioning 'robot' for a wall", () => {
    const html = productHtml.replace("<body>", "<body><p>Our robot vacuum guide</p>");
    expect(classify(fetched({ html })).status).toBe("ok");
  });
});

describe("canonicalize", () => {
  it("strips tracking params, fragments, trailing slashes and sorts the rest", () => {
    expect(canonicalize("https://WWW.Shop.example/products/lamp/?utm_source=ig&variant=2&gclid=x#reviews")).toBe(
      "https://www.shop.example/products/lamp?variant=2",
    );
  });
  it("keeps product identifiers", () => {
    expect(canonicalize("https://shop.example/item?pid=12345&utm_medium=x")).toBe("https://shop.example/item?pid=12345");
  });
  it("maps mobile hosts to www", () => {
    expect(canonicalize("https://m.shop.example/p/1")).toBe("https://www.shop.example/p/1");
  });
});

describe("retailerOf", () => {
  it("drops www/shop prefixes", () => {
    expect(retailerOf("https://www.westelm.com/products/x")).toBe("westelm.com");
    expect(retailerOf("https://shop.amberinteriors.com/products/x")).toBe("amberinteriors.com");
  });
});
