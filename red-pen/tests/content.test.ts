import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  uncoveredAuthority,
  validateCandidates,
  validateLesson,
  type Allowlist,
  type CandidateFile,
  type LessonFile,
  type RubricFile,
} from "../src/lib/validate";
import { validateContentDir } from "../scripts/validate-content";

// Synthetic fixtures: placeholder tags and text, no master judgment.
const RUBRIC: RubricFile = {
  id: "rubric-test",
  source: "test",
  criteria: ["R1", "R2", "KEEP"].map((id) => ({ id, label: id, test: id })),
};
const VERIFIED: Allowlist = { entries: [{ cite: "N.J.S.A. 59:8-8", verifiedByOwner: true }] };
const UNVERIFIED: Allowlist = { entries: [{ cite: "N.J.S.A. 59:8-8", verifiedByOwner: false }] };

const sentences = (d: string, n = 4) => Array.from({ length: n }, (_, i) => ({ id: `${d}-s${i + 1}`, text: `Text ${i + 1}.` }));

function lesson(mutate: (l: LessonFile) => void = () => {}): LessonFile {
  const l: LessonFile = {
    id: "lesson-test",
    title: "Test",
    rubricId: "rubric-test",
    authoredBy: "master",
    exercises: [
      {
        id: "ex1",
        factPattern: "Fixture.",
        task: "Fixture.",
        drafts: (["d1", "d2", "d3", "d4", "d5"] as const).map((id, i) => ({
          id,
          masterRank: (i + 1) as 1 | 2 | 3 | 4 | 5,
          sentences: sentences(id),
          masterMarks: [],
        })),
      },
    ],
  };
  mutate(l);
  return l;
}
const ex = (l: LessonFile) => l.exercises[0]!;
const run = (l: LessonFile, allow = VERIFIED) => validateLesson("lesson.json", l, [RUBRIC], allow);

describe("validateLesson — §15 rules", () => {
  it("accepts a well-formed master export", () => {
    expect(run(lesson())).toEqual([]);
  });

  it("fails when an exercise does not have exactly 5 drafts", () => {
    expect(run(lesson((l) => ex(l).drafts.pop())).join()).toMatch(/4 drafts; exactly 5/);
  });

  it("fails when a masterRank repeats", () => {
    expect(run(lesson((l) => (ex(l).drafts[4]!.masterRank = 1))).join()).toMatch(/masterRank 1 repeats/);
  });

  it("fails when a mark references a missing sentence ID", () => {
    const errs = run(lesson((l) => ex(l).drafts[0]!.masterMarks.push({ sentenceId: "d1-s9", tag: "R1" })));
    expect(errs.join()).toMatch(/missing sentence "d1-s9"/);
  });

  it("fails when a mark points into a different draft", () => {
    const errs = run(lesson((l) => ex(l).drafts[0]!.masterMarks.push({ sentenceId: "d2-s1", tag: "R1" })));
    expect(errs.join()).toMatch(/missing sentence "d2-s1"/);
  });

  it("fails on an unknown rubric tag", () => {
    const errs = run(lesson((l) => ex(l).drafts[0]!.masterMarks.push({ sentenceId: "d1-s1", tag: "R9" })));
    expect(errs.join()).toMatch(/unknown rubric tag "R9"/);
  });

  it("fails when a draft has more than one KEEP", () => {
    const errs = run(
      lesson((l) =>
        ex(l).drafts[0]!.masterMarks.push({ sentenceId: "d1-s1", tag: "KEEP" }, { sentenceId: "d1-s2", tag: "KEEP" }),
      ),
    );
    expect(errs.join()).toMatch(/2 KEEP marks/);
  });

  it("fails when a sentence is marked twice", () => {
    const errs = run(
      lesson((l) => ex(l).drafts[0]!.masterMarks.push({ sentenceId: "d1-s1", tag: "R1" }, { sentenceId: "d1-s1", tag: "R2" })),
    );
    expect(errs.join()).toMatch(/marked twice/);
  });

  it("fails when the file was not written by Master Mode", () => {
    expect(run(lesson((l) => (l.authoredBy = "generator"))).join()).toMatch(/authoredBy is "generator"/);
  });

  it("fails when the rubricId resolves to nothing", () => {
    expect(run(lesson((l) => (l.rubricId = "nope"))).join()).toMatch(/rubricId "nope"/);
  });

  it("fails on a malformed or out-of-place sentence ID", () => {
    expect(run(lesson((l) => (ex(l).drafts[0]!.sentences[0]!.id = "d2-s1"))).join()).toMatch(/must look like "d1-s1"/);
  });
});

describe("authority checks", () => {
  it.each([
    ["Smith v. Jones, 123 N.J. 456 (2001).", "123 N.J."],
    ["See 456 F.3d 789.", "456 F.3"],
    ["Cf. 500 U.S. 1.", "U.S."],
  ])("flags the §15 citation pattern in %s", (text, hit) => {
    expect(uncoveredAuthority(text, VERIFIED, true)).toContain(hit);
  });

  it("allows [CITE] placeholders", () => {
    expect(uncoveredAuthority("Courts agree [CITE].", VERIFIED, true)).toEqual([]);
  });

  it("allows an allowlisted statute and flags one that is not", () => {
    expect(uncoveredAuthority("Under N.J.S.A. 59:8-8, notice is due.", VERIFIED, true)).toEqual([]);
    expect(uncoveredAuthority("Under N.J.S.A. 59:8-9, late notice may issue.", VERIFIED, true)).toEqual(["N.J.S.A. 59:8-9"]);
  });

  it("flags court rules that are not allowlisted", () => {
    expect(uncoveredAuthority("Dismissal under Rule 4:6-2(e).", VERIFIED, true)).toEqual(["Rule 4:6-2"]);
  });

  it("shipping lessons need the owner to have verified the cite; candidates do not", () => {
    const cited = lesson((l) => (ex(l).drafts[0]!.sentences[0]!.text = "Notice is required by N.J.S.A. 59:8-8."));
    expect(run(cited, VERIFIED)).toEqual([]);
    expect(run(cited, UNVERIFIED).join()).toMatch(/not on the owner-verified allowlist/);
  });

  it("checks the fact pattern and task too", () => {
    expect(run(lesson((l) => (ex(l).factPattern = "As held in 12 N.J. 34, ..."))).join()).toMatch(/factPattern: cites "12 N.J."/);
  });
});

describe("validateCandidates — Claude's drafts carry no judgment", () => {
  const candidates = (mutate: (c: CandidateFile) => void = () => {}): CandidateFile => {
    const c: CandidateFile = {
      generatedBy: "claude",
      status: "unreviewed",
      exerciseId: "ex1",
      factPattern: "Fixture.",
      task: "Fixture.",
      drafts: ["d1", "d2", "d3", "d4", "d5"].map((id) => ({ id, sentences: sentences(id) })),
    };
    mutate(c);
    return c;
  };

  it("accepts clean candidates", () => {
    expect(validateCandidates("c.json", candidates(), UNVERIFIED)).toEqual([]);
  });

  it("rejects any pre-filled master field", () => {
    const c = candidates((c) => Object.assign(c.drafts[0]!, { masterRank: 1 }));
    expect(validateCandidates("c.json", c, UNVERIFIED).join()).toMatch(/carries "masterRank"/);
  });

  it("enforces 4–7 sentences per candidate (§9)", () => {
    const c = candidates((c) => (c.drafts[0]!.sentences = sentences("d1", 3)));
    expect(validateCandidates("c.json", c, UNVERIFIED).join()).toMatch(/3 sentences/);
  });

  it("flags a fabricated reporter citation", () => {
    const c = candidates((c) => (c.drafts[1]!.sentences[0]!.text = "See Doe v. Roe, 210 N.J. 12 (2012)."));
    expect(validateCandidates("c.json", c, UNVERIFIED).join()).toMatch(/cites "210 N.J."/);
  });
});

describe("validateContentDir — the real tree and a broken one", () => {
  it("the repo's content/ is valid", () => {
    expect(validateContentDir(join(__dirname, "..", "content"))).toEqual([]);
  });

  it("fails on anything in content/courses not exported by Master Mode", () => {
    const root = mkdtempSync(join(tmpdir(), "redpen-"));
    cpSync(join(__dirname, "..", "content"), root, { recursive: true });
    mkdirSync(join(root, "courses", "legal-writing"), { recursive: true });
    writeFileSync(join(root, "courses", "legal-writing", "course.json"), JSON.stringify({ id: "c", authoredBy: "generate-script" }));
    writeFileSync(join(root, "courses", "legal-writing", "notes.md"), "draft");
    const errs = validateContentDir(root).join("\n");
    expect(errs).toMatch(/course\.json: authoredBy is "generate-script"/);
    expect(errs).toMatch(/notes\.md: only Master Mode JSON exports/);
  });
});
