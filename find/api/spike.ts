import {
  newContext,
  runFeeds,
  runGemini,
  runLtk,
  runPhotos,
  runTagging,
  runVision,
  step,
  type Outcome,
} from "../spike/steps.js";
import { denied, respond } from "./_spike.js";

// Phase 0 checks that need API keys, run from the host's own servers. Keyless checks
// (retailer survey, LTK) live in api/pages.ts.
//
//   GET /api/spike?token=…&step=feeds|gemini|ltk|photos|vision|tagging|all[&format=json]
//
// "all" runs them in order so later steps reuse earlier results (vision uses a fetched photo,
// tagging uses verified pages from gemini/ltk).

const STEPS = ["feeds", "gemini", "ltk", "photos", "vision", "tagging"] as const;

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const blocked = denied(url);
  if (blocked) return blocked;

  const which = url.searchParams.get("step") ?? "all";
  const selected = which === "all" ? STEPS : STEPS.filter((s) => s === which);
  if (selected.length === 0) return Response.json({ error: `unknown step "${which}"` }, { status: 400 });

  const ctx = newContext();
  const report: Record<string, Outcome> = {};
  for (const s of selected) {
    if (s === "feeds") report.feeds = await step(() => runFeeds());
    if (s === "gemini") report.gemini = await step(() => runGemini(ctx));
    if (s === "ltk") report.ltk = await step(() => runLtk(ctx));
    if (s === "photos") report.photos = await step(() => runPhotos(ctx));
    if (s === "vision") report.vision = await step(() => runVision(ctx));
    if (s === "tagging") report.tagging = await step(() => runTagging(ctx));
  }
  return respond(url, report);
}
