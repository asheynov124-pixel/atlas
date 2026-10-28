// Phase 0 CLI: prove the data before building the UI.
//
//   npm run spike                       # everything that has keys
//   npm run spike -- --only feeds,gemini
//   npm run spike -- --screenshot ./room.jpg
//   npm run spike -- --urls ./urls.txt  # retailer survey: can a server verify these pages?
//
// Writes spike/results/<timestamp>.json and spike/results/latest.md (both gitignored).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRICES_CHECKED } from "../server/lib/cost.js";
import { renderMarkdown } from "./report.js";
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
} from "./steps.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

async function main() {
  const only = args.only ? new Set(args.only.split(",")) : null;
  const want = (name: string) => !only || only.has(name);
  const ctx = newContext();
  const report: Record<string, Outcome> = {};
  const run = async (name: string, fn: Parameters<typeof step>[0]) => {
    process.stderr.write(`▸ ${name}…\n`);
    report[name] = await step(fn);
  };

  if (want("feeds")) await run("feeds", () => runFeeds());
  if (want("gemini")) await run("gemini", () => runGemini(ctx, args.queries?.split("|")));
  if (want("ltk")) await run("ltk", () => runLtk(ctx, args.ltk));
  if (want("photos")) await run("photos", () => runPhotos(ctx, args.photoQuery));
  if (want("vision")) {
    const shot = args.screenshot;
    await run("vision", async () =>
      runVision(
        ctx,
        shot
          ? {
              base64: (await readFile(shot)).toString("base64"),
              mediaType: shot.endsWith(".png") ? "image/png" : shot.endsWith(".webp") ? "image/webp" : "image/jpeg",
              source: shot,
            }
          : undefined,
      ),
    );
  }
  if (want("tagging")) await run("tagging", () => runTagging(ctx, Number(args.tagSample ?? 5)));
  if (args.urls) {
    const urls = (await readFile(args.urls, "utf8")).split(/\r?\n/).map((l) => l.trim()).filter((l) => /^https?:\/\//.test(l));
    await run("survey", () => runSurvey(urls));
  }

  const json = { ranAt: new Date().toISOString(), pricesChecked: PRICES_CHECKED, report };
  const out = path.join(here, "results");
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, `${json.ranAt.replace(/[:.]/g, "-")}.json`), JSON.stringify(json, null, 2));
  const md = renderMarkdown(json);
  await writeFile(path.join(out, "latest.md"), md);
  console.log(md);
}

function parseArgs(argv: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (!a.startsWith("--")) continue;
    const key = a.slice(2).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    const next = argv[i + 1];
    out[key] = next && !next.startsWith("--") ? (i++, next) : "true";
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
