import { describe, expect, it } from "vitest";
import { fallbackFor, tagAgreement, type ProductTags } from "../server/lib/claude.js";

describe("fallbackFor", () => {
  it("opts Opus/Sonnet 5.5/Fable 5.1 into the server-side fallback", () => {
    expect(fallbackFor("claude-opus-5-5")).toEqual({ betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    expect(fallbackFor("claude-sonnet-5-5")).toHaveProperty("fallbacks", "default");
    expect(fallbackFor("claude-fable-5-1")).toHaveProperty("fallbacks", "default");
  });
  it("sends nothing for Haiku 5.5, which has no server-side fallback", () => {
    expect(fallbackFor("claude-haiku-5-5")).toEqual({});
  });
});

describe("tagAgreement", () => {
  const base: ProductTags = {
    category: "lamp",
    room: ["living"],
    materials: ["travertine", "linen"],
    colors: ["cream"],
    palette_family: "warm_neutral",
    style_cues: ["organic_modern", "curved"],
    mood: ["calm"],
  };
  it("is 1 for identical tags", () => expect(tagAgreement(base, base)).toBe(1));
  it("drops with disagreement", () => {
    const other: ProductTags = { ...base, category: "vase", materials: ["travertine"], mood: [] };
    const score = tagAgreement(base, other);
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(0.8);
  });
});
