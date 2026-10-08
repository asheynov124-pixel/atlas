// Content validation — CLAUDE.md §6 and §15. Pure functions; scripts/validate-content.ts does the I/O.
// Every function returns a list of human-readable errors. Empty list = valid.

import { KEEP_TAG } from "./rubric";
import type { Exercise, Lesson, RubricCriterion } from "./types";

export type AllowlistEntry = { cite: string; verifiedByOwner: boolean; note?: string };
export type Allowlist = { entries: AllowlistEntry[] };

export type RubricFile = {
  id: string;
  source: string;
  criteria: RubricCriterion[];
};

/** A lesson as exported by Master Mode. Only Master Mode writes authoredBy: "master". */
export type LessonFile = Lesson & { authoredBy: string };

/** Claude-generated candidates awaiting the master. Carries no judgment of any kind. */
export type CandidateFile = {
  generatedBy: string;
  status: "unreviewed";
  exerciseId: string;
  factPattern: string;
  task: string;
  drafts: { id: string; sentences: { id: string; text: string }[] }[];
};

const SENTENCE_ID = /^d[1-5]-s\d+$/;
const DRAFT_ID = /^d[1-5]$/;

// §15: case-reporter citation patterns. A match must sit inside an allowlisted cite.
const REPORTER_PATTERNS = [/\d+ N\.J\./g, /\d+ F\.\d/g, /U\.S\./g];
// Beyond §15, enforcing §6 ("real statutes may be named only if allowlisted"):
// NJ statutes and NJ court rules must be allowlisted too.
const NAMED_AUTHORITY_PATTERNS = [
  /N\.J\.S\.A\.\s*\d+[A-Z]?:\d+[A-Z]?-\d+(?:\.\d+)?/g,
  /\b(?:R\.|Rule)\s*\d:\d+[A-Z]?-\d+/g,
];

/**
 * Authority found in `text` that is not covered by the allowlist.
 * `requireVerified` = shipping content: an allowlisted cite counts only once the owner has verified it.
 */
export function uncoveredAuthority(text: string, allowlist: Allowlist, requireVerified: boolean): string[] {
  const usable = allowlist.entries.filter((e) => !requireVerified || e.verifiedByOwner).map((e) => e.cite);
  // Character ranges that allowlisted cites occupy in this text.
  const covered: [number, number][] = [];
  for (const cite of usable) {
    let at = text.indexOf(cite);
    while (at !== -1) {
      covered.push([at, at + cite.length]);
      at = text.indexOf(cite, at + 1);
    }
  }
  const isCovered = (start: number, end: number) => covered.some(([a, b]) => start >= a && end <= b);

  const out: string[] = [];
  for (const re of [...REPORTER_PATTERNS, ...NAMED_AUTHORITY_PATTERNS]) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      if (!isCovered(start, start + m[0].length)) out.push(m[0]);
    }
  }
  return out;
}

function checkDraftShape(
  where: string,
  drafts: { id: string; sentences: { id: string; text: string }[] }[],
): string[] {
  const errors: string[] = [];
  if (drafts.length !== 5) errors.push(`${where}: has ${drafts.length} drafts; exactly 5 required`);

  const draftIds = new Set<string>();
  const sentenceIds = new Set<string>();
  for (const d of drafts) {
    if (!DRAFT_ID.test(d.id)) errors.push(`${where}: draft ID "${d.id}" must be d1..d5`);
    if (draftIds.has(d.id)) errors.push(`${where}: draft ID "${d.id}" repeats`);
    draftIds.add(d.id);
    if (d.sentences.length === 0) errors.push(`${where} ${d.id}: has no sentences`);
    for (const s of d.sentences) {
      if (!SENTENCE_ID.test(s.id) || !s.id.startsWith(`${d.id}-`)) {
        errors.push(`${where} ${d.id}: sentence ID "${s.id}" must look like "${d.id}-s1"`);
      }
      if (sentenceIds.has(s.id)) errors.push(`${where}: sentence ID "${s.id}" repeats`);
      sentenceIds.add(s.id);
      if (s.text.trim() === "") errors.push(`${where} ${s.id}: empty sentence text`);
    }
  }
  return errors;
}

function checkAuthority(
  where: string,
  exercise: Pick<Exercise, "factPattern" | "task"> & { drafts: { sentences: { id: string; text: string }[] }[] },
  allowlist: Allowlist,
  requireVerified: boolean,
): string[] {
  const errors: string[] = [];
  const report = (loc: string, text: string) => {
    for (const hit of uncoveredAuthority(text, allowlist, requireVerified)) {
      const why = requireVerified ? "not on the owner-verified allowlist" : "not on the allowlist";
      errors.push(`${where} ${loc}: cites "${hit}", ${why}`);
    }
  };
  report("factPattern", exercise.factPattern);
  report("task", exercise.task);
  for (const d of exercise.drafts) for (const s of d.sentences) report(s.id, s.text);
  return errors;
}

/** A shipping lesson file in content/courses — §15 rules plus authority checks. */
export function validateLesson(file: string, lesson: LessonFile, rubrics: RubricFile[], allowlist: Allowlist): string[] {
  const errors: string[] = [];
  if (lesson.authoredBy !== "master") {
    errors.push(`${file}: authoredBy is "${String(lesson.authoredBy)}"; files in content/courses must come from a Master Mode export ("master")`);
  }
  const rubric = rubrics.find((r) => r.id === lesson.rubricId);
  if (!rubric) {
    errors.push(`${file}: rubricId "${lesson.rubricId}" matches no file in content/rubrics`);
  }
  const tags = new Set(rubric?.criteria.map((c) => c.id) ?? []);

  for (const ex of lesson.exercises) {
    const where = `${file} ${ex.id}`;
    errors.push(...checkDraftShape(where, ex.drafts));

    const ranks = ex.drafts.map((d) => d.masterRank);
    const seen = new Set<number>();
    for (const r of ranks) {
      if (![1, 2, 3, 4, 5].includes(r)) errors.push(`${where}: masterRank ${String(r)} is outside 1..5`);
      else if (seen.has(r)) errors.push(`${where}: masterRank ${r} repeats`);
      seen.add(r);
    }

    for (const d of ex.drafts) {
      const own = new Set(d.sentences.map((s) => s.id));
      const marked = new Set<string>();
      let keeps = 0;
      for (const m of d.masterMarks) {
        if (!own.has(m.sentenceId)) errors.push(`${where} ${d.id}: mark references missing sentence "${m.sentenceId}"`);
        if (marked.has(m.sentenceId)) errors.push(`${where} ${d.id}: sentence "${m.sentenceId}" is marked twice`);
        marked.add(m.sentenceId);
        if (rubric && !tags.has(m.tag)) errors.push(`${where} ${d.id}: unknown rubric tag "${m.tag}" on ${m.sentenceId}`);
        if (m.tag === KEEP_TAG) keeps++;
      }
      if (keeps > 1) errors.push(`${where} ${d.id}: ${keeps} KEEP marks; at most one per draft`);
    }

    errors.push(...checkAuthority(where, ex, allowlist, true));
  }
  return errors;
}

const MASTER_FIELDS = ["masterRank", "masterMarks", "masterSummary"] as const;

/** Claude-generated candidates in content/unreviewed. Shape + authority, and no master judgment (§6). */
export function validateCandidates(file: string, c: CandidateFile, allowlist: Allowlist): string[] {
  const errors: string[] = [];
  if (c.generatedBy !== "claude") errors.push(`${file}: generatedBy must be "claude"`);
  if (c.status !== "unreviewed") errors.push(`${file}: status must be "unreviewed"`);
  errors.push(...checkDraftShape(file, c.drafts));
  for (const d of c.drafts) {
    // §9: each candidate is 4–7 sentences.
    if (d.sentences.length < 4 || d.sentences.length > 7) {
      errors.push(`${file} ${d.id}: ${d.sentences.length} sentences; candidates must have 4–7`);
    }
    for (const f of MASTER_FIELDS) {
      if (f in d) errors.push(`${file} ${d.id}: carries "${f}" — Claude never pre-fills master judgment`);
    }
  }
  errors.push(...checkAuthority(file, c, allowlist, false));
  return errors;
}

export function validateAllowlist(file: string, a: Allowlist): string[] {
  if (!Array.isArray(a.entries)) return [`${file}: must have an "entries" array`];
  return a.entries.flatMap((e, i) =>
    typeof e.cite === "string" && e.cite.trim() !== "" && typeof e.verifiedByOwner === "boolean"
      ? []
      : [`${file}: entry ${i} needs a non-empty "cite" and a boolean "verifiedByOwner"`],
  );
}

export function validateRubric(file: string, r: RubricFile): string[] {
  const errors: string[] = [];
  if (!r.id) errors.push(`${file}: missing id`);
  const ids = new Set<string>();
  for (const c of r.criteria ?? []) {
    if (ids.has(c.id)) errors.push(`${file}: criterion "${c.id}" repeats`);
    ids.add(c.id);
  }
  if (!ids.has(KEEP_TAG)) errors.push(`${file}: must define the "${KEEP_TAG}" criterion`);
  return errors;
}
