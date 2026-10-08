// npm run validate:content — walks content/ and applies src/lib/validate.ts. Exit 1 on any error.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateAllowlist,
  validateCandidates,
  validateLesson,
  validateRubric,
  type Allowlist,
  type CandidateFile,
  type LessonFile,
  type RubricFile,
} from "../src/lib/validate";

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function validateContentDir(root: string): string[] {
  const errors: string[] = [];
  const rel = (p: string) => relative(root, p);
  const read = (p: string): unknown => {
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch (e) {
      errors.push(`${rel(p)}: not valid JSON (${(e as Error).message})`);
      return undefined;
    }
  };

  const allowPath = join(root, "authority-allowlist.json");
  let allowlist: Allowlist = { entries: [] };
  if (!existsSync(allowPath)) errors.push("authority-allowlist.json: missing");
  else {
    const a = read(allowPath) as Allowlist | undefined;
    if (a) {
      errors.push(...validateAllowlist(rel(allowPath), a));
      if (Array.isArray(a.entries)) allowlist = a;
    }
  }

  const rubrics: RubricFile[] = [];
  for (const p of walk(join(root, "rubrics")).filter((p) => p.endsWith(".json"))) {
    const r = read(p) as RubricFile | undefined;
    if (r) {
      errors.push(...validateRubric(rel(p), r));
      rubrics.push(r);
    }
  }

  for (const p of walk(join(root, "courses"))) {
    const name = p.split("/").pop() ?? "";
    if (name.startsWith(".")) continue; // .gitkeep and friends
    if (!p.endsWith(".json")) {
      errors.push(`${rel(p)}: only Master Mode JSON exports belong in content/courses`);
      continue;
    }
    const f = read(p) as (LessonFile & Record<string, unknown>) | undefined;
    if (!f) continue;
    if (Array.isArray(f.exercises)) errors.push(...validateLesson(rel(p), f, rubrics, allowlist));
    else if (f.authoredBy !== "master") {
      errors.push(`${rel(p)}: authoredBy is "${String(f.authoredBy)}"; files in content/courses must come from a Master Mode export ("master")`);
    }
  }

  for (const p of walk(join(root, "unreviewed")).filter((p) => p.endsWith(".candidates.json"))) {
    const c = read(p) as CandidateFile | undefined;
    if (c) errors.push(...validateCandidates(rel(p), c, allowlist));
  }

  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? "content");
  const errors = validateContentDir(root);
  if (errors.length > 0) {
    console.error(`validate:content — ${errors.length} problem(s):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log("validate:content — all content valid");
}
