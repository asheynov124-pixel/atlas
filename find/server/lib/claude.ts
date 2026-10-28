import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { models, requireEnv } from "./env.js";
import { CATEGORIES, COLORS, MATERIALS, MOODS, PALETTE_FAMILIES, ROOMS, STYLE_CUES } from "./vocab.js";

// Claude reads images and tags products. It never produces a product, price, or link:
// its job is to describe what it sees so Gemini + verification can find real matches.

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  return client;
}

// On a safety decline, the API re-runs the request on Anthropic's recommended fallback model.
// Haiku 5.5 has no server-side fallback (the parameter would be rejected or do nothing), so it
// gets none; a declined tag request just leaves the card untagged.
type Fallback = { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: "default" } | Record<string, never>;
export function fallbackFor(model: string): Fallback {
  return /^claude-(opus-5|sonnet-5-5|fable-5-1)/.test(model)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }
    : {};
}

export interface ClaudeUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  ms: number;
}

function usageOf(res: Anthropic.Beta.BetaMessage, ms: number): ClaudeUsage {
  return {
    model: res.model,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
    ms,
  };
}

// ---------- Decode a screenshot / room photo ----------

export const DecodedLook = z.object({
  room: z.enum(ROOMS),
  items: z.array(
    z.object({
      label: z.string().describe("Short name, e.g. 'travertine mushroom table lamp'"),
      category: z.enum(CATEGORIES),
      materials: z.array(z.enum(MATERIALS)),
      colors: z.array(z.enum(COLORS)),
      style_cues: z.array(z.enum(STYLE_CUES)),
      search_query: z
        .string()
        .describe("A shopping search query a person would type to find this exact look, 4-10 words, no brand guesses"),
      visible_text: z
        .string()
        .nullable()
        .describe("Any brand, product name, price, or tag text literally visible in the image, else null"),
      confidence: z.enum(["high", "medium", "low"]),
    }),
  ),
  palette_family: z.enum(PALETTE_FAMILIES),
  mood: z.array(z.enum(MOODS)),
  recipe: z
    .string()
    .describe("One short paragraph on how the look is layered: anchor piece, textures, contrast, scale."),
});
export type DecodedLook = z.infer<typeof DecodedLook>;

const DECODE_SYSTEM = `You help someone who loves interior design figure out what is in a room photo or a shopping screenshot so they can find the real items.
List every distinct, shoppable item that is clearly visible (furniture, lighting, rugs, decor, textiles, tabletop). Skip architecture (walls, windows, floors) unless it is a removable item like a rug.
Describe only what you can see. If text in the image names a brand, product, or price, copy it exactly into visible_text; otherwise leave it null and do not guess brands.
Search queries should name shape, material, color, and size cues ("oversized scalloped rattan mirror"), the way a shopper would type them.`;

export async function decodeLookImage(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
  note?: string,
): Promise<{ look: DecodedLook | null; usage: ClaudeUsage; stopReason: string | null }> {
  const started = Date.now();
  const model = models.claudeVision();
  const res = await anthropic().beta.messages.parse({
    ...fallbackFor(model),
    model,
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(DecodedLook) },
    system: DECODE_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: note ? `Context from the post: ${note}` : "Decode this look." },
        ],
      },
    ],
  });
  return {
    look: res.stop_reason === "refusal" ? null : (res.parsed_output ?? null),
    usage: usageOf(res, Date.now() - started),
    stopReason: res.stop_reason,
  };
}

// ---------- Tag a verified product card ----------

export const ProductTags = z.object({
  category: z.enum(CATEGORIES),
  room: z.array(z.enum(ROOMS)),
  materials: z.array(z.enum(MATERIALS)),
  colors: z.array(z.enum(COLORS)),
  palette_family: z.enum(PALETTE_FAMILIES),
  style_cues: z.array(z.enum(STYLE_CUES)),
  mood: z.array(z.enum(MOODS)),
});
export type ProductTags = z.infer<typeof ProductTags>;

// The system prompt is the stable prefix for the nightly refill batch. cache_control only takes
// effect once that prefix passes the model's minimum cacheable length (check cache_read_input_tokens).
const TAG_SYSTEM = `You tag home-decor products for a personal style-discovery app. Use only the allowed values in the schema.
Tag what the product image and title actually show. Prefer 1-4 values per list; leave a list empty rather than guess.
style_cues mixes era/style words (mid_century, japandi) and form words (curved, fluted, scalloped). Include both when visible.`;

export async function tagProduct(input: {
  title: string;
  retailer: string;
  imageUrl: string;
  description?: string | null;
  model?: string;
}): Promise<{ tags: ProductTags | null; usage: ClaudeUsage }> {
  const started = Date.now();
  const model = input.model ?? models.claudeTagging();
  const res = await anthropic().beta.messages.parse({
    ...fallbackFor(model),
    model,
    max_tokens: 4000,
    output_config: { effort: "low", format: betaZodOutputFormat(ProductTags) },
    system: [{ type: "text", text: TAG_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: input.imageUrl } },
          {
            type: "text",
            text: `Title: ${input.title}\nRetailer: ${input.retailer}${input.description ? `\nDescription: ${input.description.slice(0, 600)}` : ""}`,
          },
        ],
      },
    ],
  });
  return {
    tags: res.stop_reason === "refusal" ? null : (res.parsed_output ?? null),
    usage: usageOf(res, Date.now() - started),
  };
}

// How closely two taggers agree on the same card: exact match on category and palette, Jaccard
// overlap on the lists. Used by the spike to check the cheap tagger against the strong one.
export function tagAgreement(a: ProductTags, b: ProductTags): number {
  const jaccard = (x: readonly string[], y: readonly string[]) => {
    const X = new Set(x);
    const Y = new Set(y);
    if (X.size === 0 && Y.size === 0) return 1;
    let both = 0;
    for (const v of X) if (Y.has(v)) both++;
    return both / (X.size + Y.size - both);
  };
  const parts = [
    a.category === b.category ? 1 : 0,
    a.palette_family === b.palette_family ? 1 : 0,
    jaccard(a.room, b.room),
    jaccard(a.materials, b.materials),
    jaccard(a.colors, b.colors),
    jaccard(a.style_cues, b.style_cues),
    jaccard(a.mood, b.mood),
  ];
  return parts.reduce((s, x) => s + x, 0) / parts.length;
}
