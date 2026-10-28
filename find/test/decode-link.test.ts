import { describe, expect, it } from "vitest";
import { decodeLinkPage, maybeUnflatten } from "../server/lib/decode-link.js";

describe("decodeLinkPage", () => {
  it("reads caption/cover from Open Graph and product links from embedded Next.js JSON", () => {
    const next = {
      props: {
        pageProps: {
          post: {
            caption: "Fall living room refresh",
            products: [
              { hyperlink: "https://rstyle.me/+abc123", retailer_display_name: "Target", image_url: "https://cdn.example/p1.jpg" },
              { hyperlink: "https://liketk.it/4xyz", name: "Travertine lamp" },
              { hyperlink: "https://www.shopltk.com/explore/someone", name: "Profile link" },
            ],
          },
        },
      },
    };
    const html = `<html><head>
      <meta property="og:title" content="tonedelements on LTK">
      <meta property="og:description" content="Fall living room refresh 🍂">
      <meta property="og:image" content="https://cdn.example/cover.jpg">
      <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script>
    </head><body></body></html>`;
    const d = decodeLinkPage(html, "https://www.shopltk.com/explore/tonedelements/posts/1");
    expect(d.caption).toBe("Fall living room refresh 🍂");
    expect(d.coverImage).toBe("https://cdn.example/cover.jpg");
    expect(d.links.map((l) => l.url)).toEqual(["https://rstyle.me/+abc123", "https://liketk.it/4xyz"]);
    expect(d.links[0]?.label).toBe("Target");
    expect(d.links[1]?.label).toBe("Travertine lamp");
  });

  it("rebuilds devalue-flattened Nuxt state", () => {
    // root -> {data: 1}; 1 -> [2]; 2 -> {name: 3, link: 4}
    const flat = [{ data: 1 }, [2], { name: 3, link: 4 }, "Oak sideboard", "https://www.example-store.com/products/oak-sideboard"];
    expect(maybeUnflatten(flat)).toEqual({ data: [{ name: "Oak sideboard", link: "https://www.example-store.com/products/oak-sideboard" }] });
    const html = `<html><head><script type="application/json" id="__NUXT_DATA__">${JSON.stringify(flat)}</script></head></html>`;
    const d = decodeLinkPage(html, "https://blog.example/post");
    expect(d.links).toEqual([{ url: "https://www.example-store.com/products/oak-sideboard", label: "Oak sideboard", via: "embedded-json" }]);
  });

  it("finds affiliate URLs inside escaped inline script and product anchors in the body", () => {
    const html = `<html><head><script>window.__STATE__={"l":"https:\\u002F\\u002Fliketk.it\\u002F4abc"}</script></head><body>
      <a href="https://www.instagram.com/someone">IG</a>
      <a href="https://www.example-store.com/products/linen-throw-12345">Linen throw</a>
      <a href="https://www.example-store.com/collections/throws">All throws</a>
      <a href="https://cdn.example/style.css">css</a>
    </body></html>`;
    const d = decodeLinkPage(html, "https://blog.example/post");
    const urls = d.links.map((l) => l.url);
    expect(urls).toContain("https://liketk.it/4abc");
    expect(urls).toContain("https://www.example-store.com/products/linen-throw-12345");
    expect(urls).not.toContain("https://www.example-store.com/collections/throws");
    expect(urls.some((u) => u.includes("instagram"))).toBe(false);
  });

  it("recognizes when the pasted link is itself a product page", () => {
    const html = `<html><head><meta property="og:type" content="product"></head></html>`;
    expect(decodeLinkPage(html, "https://shop.example/products/x").isItselfAProduct).toBe(true);
  });
});
