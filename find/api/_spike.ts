import { timingSafeEqual } from "node:crypto";
import { PRICES_CHECKED } from "../server/lib/cost.js";
import { env } from "../server/lib/env.js";
import type { Outcome } from "../spike/core.js";
import { renderMarkdown } from "../spike/report.js";

// Shared by the Phase 0 endpoints (files starting with "_" aren't deployed as functions).
// Guarded by SPIKE_TOKEN, a throwaway for Phase 0, not the app passcode. Remove after Phase 0.

export function denied(url: URL): Response | null {
  const expected = env("SPIKE_TOKEN");
  if (!expected) return new Response("SPIKE_TOKEN is not configured", { status: 503 });
  const given = Buffer.from(url.searchParams.get("token") ?? "");
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return new Response("unauthorized", { status: 401 });
  return null;
}

export function surveyUrls(url: URL): string[] {
  return (url.searchParams.get("urls") ?? "")
    .split(/[\n,]\s*(?=https?:\/\/)/)
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//.test(u))
    .slice(0, 20);
}

export function respond(url: URL, report: Record<string, Outcome>): Response {
  const json = { ranAt: new Date().toISOString(), pricesChecked: PRICES_CHECKED, region: env("VERCEL_REGION") ?? null, report };
  if (url.searchParams.get("format") === "json") return Response.json(json);
  return new Response(renderMarkdown(json), { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
