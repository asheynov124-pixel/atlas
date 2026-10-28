import { describe, expect, it } from "vitest";
import { extractClientRedirect } from "../server/lib/http.js";

describe("extractClientRedirect", () => {
  it("follows a meta refresh in either attribute order", () => {
    expect(extractClientRedirect(`<meta http-equiv="refresh" content="0; url=https://www.wayfair.com/p/1">`, "https://rstyle.me/+a")).toBe("https://www.wayfair.com/p/1");
    expect(extractClientRedirect(`<meta content="0;URL='/go/2'" http-equiv="refresh">`, "https://rstyle.me/+a")).toBe("https://rstyle.me/go/2");
  });
  it("follows location.replace / location.href with literal URLs, decoding &amp;", () => {
    expect(extractClientRedirect(`<script>window.location.replace("https://a.example/p?x=1&amp;y=2")</script>`, "https://r/")).toBe("https://a.example/p?x=1&y=2");
    expect(extractClientRedirect(`<script>location.href = 'https://b.example/item/9'</script>`, "https://r/")).toBe("https://b.example/item/9");
  });
  it("ignores pages without a redirect and non-http targets", () => {
    expect(extractClientRedirect("<html><title>Hi</title></html>", "https://r/")).toBeNull();
    expect(extractClientRedirect(`<script>location.href="javascript:void(0)"</script>`, "https://r/")).toBeNull();
  });
});
