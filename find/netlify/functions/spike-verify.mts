import type { Config, Context } from "@netlify/functions";
import { env } from "../../server/lib/env.ts";
import { mapLimit } from "../../server/lib/pool-utils.ts";
import { verifyProductUrl } from "../../server/lib/verify.ts";

// Phase 0 helper: verify product URLs *from Netlify's own servers*. Retailer bot walls treat
// cloud IPs differently from a home connection, so the hit rate that matters is the one
// measured here, where the nightly refill will actually run.
//
//   curl -X POST https://<site>/api/spike/verify -H "x-passcode: $APP_PASSCODE" \
//        -H "content-type: application/json" -d '{"urls":["https://…","https://…"]}'

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const passcode = env("APP_PASSCODE");
  if (!passcode || req.headers.get("x-passcode") !== passcode) return new Response("unauthorized", { status: 401 });

  const body = (await req.json().catch(() => null)) as { urls?: unknown } | null;
  const urls = Array.isArray(body?.urls) ? body.urls.filter((u): u is string => typeof u === "string").slice(0, 12) : [];
  if (urls.length === 0) return Response.json({ error: "send {urls: string[]} (max 12)" }, { status: 400 });

  // Stay inside the synchronous function time limit: short per-page timeout, 4 at a time.
  const results = await mapLimit(urls, 4, (u) => verifyProductUrl(u, { timeoutMs: 6_000 }));
  return Response.json(
    results.map((r) => ({
      url: r.url,
      retailer: r.retailer,
      status: r.status,
      http: r.httpStatus,
      reason: r.reason,
      ms: r.ms,
      title: r.product?.title ?? null,
      price: r.product?.price ?? null,
      currency: r.product?.currency ?? null,
      image: r.product?.image ?? null,
    })),
  );
};

export const config: Config = { path: "/api/spike/verify" };
