import { timingSafeEqual } from "node:crypto";
import { PRICES_CHECKED } from "../server/lib/cost.js";
import { env } from "../server/lib/env.js";
import { renderMarkdown } from "../spike/report.js";
import {
  newContext,
  runFeeds,
  runGemini,
  runLtk,
  runPhotos,
  runSurvey,
  runTagging,
  runVision,
  step,
  type Outcome,
} from "../spike/steps.js";

// Phase 0 from the host's own servers. Retailers treat cloud IPs differently from a home
// connection, and this is where the app will run, so these are the numbers that count.
//
//   GET /api/spike?token=…&step=survey&urls=<url1>,<url2>   verify up to 20 product pages
//   GET /api/spike?token=…&step=ltk[&url=…]                 decode one LTK post
//   GET /api/spike?token=…&step=feeds|gemini|photos|vision|tagging|all[&format=json]
//
// Guarded by SPIKE_TOKEN (a throwaway for Phase 0, not the app passcode). Remove after Phase 0.

const STEPS = ["feeds", "gemini", "ltk", "photos", "vision", "tagging"] as const;

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const expected = env("SPIKE_TOKEN");
  if (!expected) return new Response("SPIKE_TOKEN is not configured", { status: 503 });
  if (!sameSecret(url.searchParams.get("token") ?? "", expected)) return new Response("unauthorized", { status: 401 });

  const which = url.searchParams.get("step") ?? "all";
  const ctx = newContext();
  const report: Record<string, Outcome> = {};

  if (which === "survey") {
    const urls = (url.searchParams.get("urls") ?? "")
      .split(/[\n,]\s*(?=https?:\/\/)/)
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//.test(u))
      .slice(0, 20);
    if (urls.length === 0) return Response.json({ error: "pass urls=<comma-separated product URLs> (max 20)" }, { status: 400 });
    report.survey = await step(() => runSurvey(urls));
  } else {
    const selected = which === "all" ? STEPS : STEPS.filter((s) => s === which);
    if (selected.length === 0) return Response.json({ error: `unknown step "${which}"` }, { status: 400 });
    for (const s of selected) {
      if (s === "feeds") report.feeds = await step(() => runFeeds());
      if (s === "gemini") report.gemini = await step(() => runGemini(ctx));
      if (s === "ltk") report.ltk = await step(() => runLtk(ctx, url.searchParams.get("url") ?? undefined));
      if (s === "photos") report.photos = await step(() => runPhotos(ctx));
      if (s === "vision") report.vision = await step(() => runVision(ctx));
      if (s === "tagging") report.tagging = await step(() => runTagging(ctx));
    }
  }

  const json = { ranAt: new Date().toISOString(), pricesChecked: PRICES_CHECKED, region: env("VERCEL_REGION") ?? null, report };
  if (url.searchParams.get("format") === "json") return Response.json(json);
  return new Response(renderMarkdown(json), { headers: { "content-type": "text/markdown; charset=utf-8" } });
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
