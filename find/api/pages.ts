import { newContext, step, type Outcome } from "../spike/core.js";
import { runLtk, runSurvey } from "../spike/page-steps.js";
import { denied, respond, surveyUrls } from "./_spike.js";

// Phase 0 checks that need no API keys, run from the host's own servers (retailers treat cloud IPs
// differently from a home connection, and this is where the app runs).
//
//   GET /api/pages?token=…&step=survey&urls=<url1>,<url2>   verify up to 20 product pages
//   GET /api/pages?token=…&step=ltk[&url=…]                 decode one LTK post

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const blocked = denied(url);
  if (blocked) return blocked;

  const report: Record<string, Outcome> = {};
  const which = url.searchParams.get("step");
  if (which === "survey") {
    const urls = surveyUrls(url);
    if (urls.length === 0) return Response.json({ error: "pass urls=<comma-separated product URLs> (max 20)" }, { status: 400 });
    report.survey = await step(() => runSurvey(urls));
  } else if (which === "ltk") {
    report.ltk = await step(() => runLtk(newContext(), url.searchParams.get("url") ?? undefined));
  } else {
    return Response.json({ error: 'step must be "survey" or "ltk"' }, { status: 400 });
  }
  return respond(url, report);
}
