import { describe, expect, it } from "vitest";
import { claudeCost, geminiCost, usd } from "../server/lib/cost.ts";
import { buildProductPrompt, isGroundingRedirect, parseCandidates } from "../server/lib/gemini.ts";
import { priceBand } from "../server/lib/vocab.ts";

describe("parseCandidates", () => {
  it("parses a fenced JSON array and drops URLs that aren't http(s)", () => {
    const text = 'Here you go:\n```json\n[{"name":"Mushroom Travertine Lamp","retailer":"Shop A","price":"$129","product_url":"https://a.example/p/1"},{"name":"Stone Lamp","retailer":"Shop B","price":null,"product_url":"a.example/p/2"},{"name":"","product_url":"https://x"}]\n```';
    expect(parseCandidates(text)).toEqual([
      { name: "Mushroom Travertine Lamp", retailer: "Shop A", statedPrice: "$129", statedUrl: "https://a.example/p/1" },
      { name: "Stone Lamp", retailer: "Shop B", statedPrice: null, statedUrl: null },
    ]);
  });
  it("returns [] for prose or broken JSON instead of guessing", () => {
    expect(parseCandidates("I couldn't find any.")).toEqual([]);
    expect(parseCandidates("[{broken")).toEqual([]);
  });
  it("prompt forbids invented URLs", () => {
    expect(buildProductPrompt("x", 5)).toMatch(/Never guess or construct a URL/);
  });
  it("recognizes grounding redirect URIs", () => {
    expect(isGroundingRedirect("https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC123")).toBe(true);
    expect(isGroundingRedirect("https://www.westelm.com/products/x")).toBe(false);
  });
});

describe("cost", () => {
  it("prices Claude usage per million tokens", () => {
    expect(claudeCost("claude-opus-5-5", { inputTokens: 1_000_000, outputTokens: 0 })).toBe(4);
    expect(claudeCost("claude-haiku-5-5", { inputTokens: 2000, outputTokens: 300 })).toBeCloseTo(0.00035, 8);
  });
  it("unknown models are NaN, not $0", () => {
    expect(Number.isNaN(claudeCost("claude-unknown", { inputTokens: 1, outputTokens: 1 }))).toBe(true);
    expect(usd(Number.NaN)).toMatch(/unknown/);
  });
  it("adds per-prompt grounding to Gemini token cost", () => {
    const c = geminiCost("gemini-2.5-flash", { promptTokens: 1000, outputTokens: 1000, thoughtsTokens: 0, toolUsePromptTokens: 0 }, 3);
    expect(c).toBeCloseTo(0.0003 + 0.0025 + 0.035, 8);
  });
  it("bills Gemini 3 grounding per search query the model ran", () => {
    const one = geminiCost("gemini-3.8-flash", { promptTokens: 0, outputTokens: 0, thoughtsTokens: 0, toolUsePromptTokens: 0 }, 1);
    const three = geminiCost("gemini-3.8-flash", { promptTokens: 0, outputTokens: 0, thoughtsTokens: 0, toolUsePromptTokens: 0 }, 3);
    expect(one).toBeCloseTo(0.014, 8);
    expect(three).toBeCloseTo(0.042, 8);
  });
});

describe("priceBand", () => {
  it("bands real prices and leaves unknown as unknown", () => {
    expect(priceBand(null)).toBe("unknown");
    expect(priceBand(49.99)).toBe("under_50");
    expect(priceBand(149)).toBe("50_150");
    expect(priceBand(1200)).toBe("1000_plus");
  });
});
