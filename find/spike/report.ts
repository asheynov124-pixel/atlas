import { usd } from "../server/lib/cost.js";
import { env } from "../server/lib/env.js";
import type { Outcome } from "./steps.js";

const KEYS = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "UNSPLASH_ACCESS_KEY", "PEXELS_API_KEY", "EBAY_CLIENT_ID", "ETSY_API_KEY"];

export function renderMarkdown(json: { ranAt: string; pricesChecked: string; report: Record<string, Outcome> }): string {
  const keys = KEYS.map((k) => `${k}=${env(k) ? "yes" : "no"}`).join(", ");
  const lines = [`# Phase 0 results — ${json.ranAt}`, "", `Prices checked ${json.pricesChecked}. Keys present: ${keys}.`, ""];

  const f = json.report.feeds;
  if (f?.status === "ran") {
    lines.push("## Pool: official feeds");
    for (const name of ["ebay", "etsy"]) {
      const r = f[name] as Record<string, unknown> | undefined;
      if (!r) continue;
      if ("skipped" in r) {
        lines.push(`- ${name}: skipped — ${r.skipped}`);
        continue;
      }
      const hit = Number(r.hitRate);
      lines.push(
        `- **${name}**: ${(hit * 100).toFixed(0)}% of ${r.cardsRequested} requested cards are complete (link + image + price) — ${hit >= 0.7 ? "PASS" : "BELOW GATE"}; tag coverage ${JSON.stringify(r.tagCoverage)}; p50 ${r.latencyMsP50} ms`,
      );
    }
    lines.push("");
  }

  const g = json.report.gemini;
  if (g?.status === "ran") {
    const hit = Number(g.hitRate);
    const cost = g.cost as { perVerifiedCard: number };
    lines.push(
      "## Live search: Gemini grounded search → verified retailer pages",
      `- Real-product hit rate: **${(hit * 100).toFixed(0)}%** of ${g.cardsRequested} requested cards (${g.candidatesReturned} candidates) — ${hit >= 0.7 ? "PASS (≥70%)" : "BELOW GATE (<70%)"}`,
      `- Stated-URL hit rate ${(Number(g.statedUrlHitRate) * 100).toFixed(0)}% · grounding-source hit rate ${(Number(g.groundingHitRate) * 100).toFixed(0)}%`,
      `- Structured price on ${g.withStructuredPrice}/${g.verifiedCards} verified cards; lamps under $150 by the retailer's own price: ${g.lampsUnder150}/${g.lampsVerified}`,
      `- Latency ${JSON.stringify(g.latency)}; Gemini cost per verified card ${usd(cost.perVerifiedCard)}`,
      `- Blocked: ${JSON.stringify(g.blockedByRetailer)}`,
      "",
    );
  }

  const t = json.report.tagging;
  if (t?.status === "ran") {
    const h = t.haiku as { perCardCost: number };
    const o = t.opus as { perCardCost: number };
    lines.push(
      "## Tagging: Haiku 5.5 vs Opus 5.5 on the same cards",
      `- Mean agreement ${(Number(t.meanAgreement) * 100).toFixed(0)}% · Haiku ${usd(h.perCardCost)}/card · Opus ${usd(o.perCardCost)}/card`,
      "",
    );
  }

  const s = json.report.survey;
  if (s?.status === "ran") {
    lines.push("## Retailer survey", `- ${(Number(s.okRate) * 100).toFixed(0)}% of ${s.urls} product URLs verified; outcomes ${JSON.stringify(s.outcomes)}`, "");
  }

  for (const [name, r] of Object.entries(json.report)) {
    if (r.status === "skipped") lines.push(`## ${name}: skipped — ${r.reason}`, "");
    else lines.push(`<details><summary>${name} (raw)</summary>`, "", "```json", JSON.stringify(r, null, 2).slice(0, 6000), "```", "</details>", "");
  }
  return lines.join("\n");
}
