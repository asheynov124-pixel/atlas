import { GoogleGenAI, type GenerateContentResponse, type GroundingChunk } from "@google/genai";
import { models, requireEnv } from "./env.ts";

// Gemini + Google Search grounding finds *candidates*. A candidate is only a lead:
// its URL is verified by fetching the page (verify.ts), and its image and price come from
// that page — never from the model's text.

export interface Candidate {
  name: string;
  retailer: string | null;
  statedPrice: string | null;
  statedUrl: string | null;
}

export interface GroundingSource {
  title: string | null;
  uri: string;
}

export interface GroundedSearch {
  model: string;
  query: string;
  candidates: Candidate[];
  sources: GroundingSource[];
  searchQueries: string[];
  // Google requires the Search Suggestions chip to be shown wherever grounded results are shown.
  searchEntryPointHtml: string | null;
  usage: {
    promptTokens: number;
    outputTokens: number;
    thoughtsTokens: number;
    toolUsePromptTokens: number;
  };
  ms: number;
  rawText: string;
}

let client: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
  return client;
}

export function buildProductPrompt(query: string, count: number): string {
  return [
    `Find ${count} real products that are for sale online right now and match: "${query}".`,
    "Rules:",
    "- Each result must be a single product on the retailer's own product page (not a category page, search results, blog post, Pinterest pin, or editorial roundup).",
    "- Prefer home-decor retailers and small brands with their own shops; include a mix of price points within the request.",
    "- Only give a product_url you actually saw in search results. If you are not sure of the exact product page URL, set product_url to null. Never guess or construct a URL.",
    "- Do not invent products, prices, or retailers.",
    "Return only a JSON array, no prose, in this shape:",
    '[{"name": string, "retailer": string, "price": string | null, "product_url": string | null}]',
  ].join("\n");
}

export async function groundedProductSearch(query: string, { count = 5 } = {}): Promise<GroundedSearch> {
  const model = models.gemini();
  const started = Date.now();
  const res = await gemini().models.generateContent({
    model,
    contents: buildProductPrompt(query, count),
    // Temperature left at the default: Google advises against lowering it on Gemini 3 models.
    config: { tools: [{ googleSearch: {} }] },
  });
  return summarize(res, model, query, Date.now() - started);
}

export function summarize(res: GenerateContentResponse, model: string, query: string, ms: number): GroundedSearch {
  const rawText = res.text ?? "";
  const meta = res.candidates?.[0]?.groundingMetadata;
  const usage = res.usageMetadata;
  return {
    model,
    query,
    candidates: parseCandidates(rawText),
    sources: (meta?.groundingChunks ?? []).map(toSource).filter((s): s is GroundingSource => s !== null),
    searchQueries: meta?.webSearchQueries ?? [],
    searchEntryPointHtml: meta?.searchEntryPoint?.renderedContent ?? null,
    usage: {
      promptTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      thoughtsTokens: usage?.thoughtsTokenCount ?? 0,
      toolUsePromptTokens: usage?.toolUsePromptTokenCount ?? 0,
    },
    ms,
    rawText,
  };
}

function toSource(chunk: GroundingChunk): GroundingSource | null {
  if (chunk.web?.uri) return { title: chunk.web.title ?? null, uri: chunk.web.uri };
  return null;
}

// The model is asked for a bare JSON array but may wrap it in prose or a code fence.
export function parseCandidates(text: string): Candidate[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: Candidate[] = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name) continue;
    const url = typeof r.product_url === "string" && /^https?:\/\//i.test(r.product_url) ? r.product_url.trim() : null;
    out.push({
      name,
      retailer: typeof r.retailer === "string" ? r.retailer.trim() : null,
      statedPrice: typeof r.price === "string" ? r.price : typeof r.price === "number" ? String(r.price) : null,
      statedUrl: url,
    });
  }
  return out;
}

// Grounding chunk URIs on the Gemini API are redirect links; the real page is where they land.
export function isGroundingRedirect(uri: string): boolean {
  return /vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\//.test(uri);
}
