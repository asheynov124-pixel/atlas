# Red Pen — Project Spec (CLAUDE.md)

> Read this file at the start of every session. When you make a mistake the owner doesn't want repeated, add a line to **§12 Reject Log** before ending the session.

---

## 1. The product in one sentence

**Red Pen teaches judgment, not production: the learner grades five AI-written drafts, then sees exactly where their red pen and the master's diverged.**

MasterClass shows a master *doing* the work. Red Pen trains the learner to *grade* it — the skill that matters once AI writes the first draft of everything.

## 2. Who this slice is for

- **Master (v1):** Adi Sheynov, NJ litigator. One master, one course, one subject.
- **Learner (v1):** Practicing lawyers and law students who write briefs.
- **Course 1:** *The Red Pen on Legal Writing.*
- **Lesson 1:** *The Opening Paragraph* — the preliminary statement of a motion to dismiss.

## 3. The core loop (the only thing that must feel great)

1. **Read the brief.** The learner sees a short fictional fact pattern and the task ("Write the opening paragraph of defendant's motion to dismiss").
2. **Rank.** The learner sees five drafts of that paragraph and drags them into order, best to worst.
3. **Mark.** The learner taps a sentence to flag it, then picks a kill reason from the rubric. One tap flags, a second tap cycles the tag, and a long press clears it.
4. **Reveal.** The master's ranking and marks appear next to the learner's. The **gap view** is the lesson:
   - "You caught 3 of the master's 5 kills."
   - "You killed 2 sentences the master kept."
   - "You and the master agreed on 8 of 10 head-to-head pairs."
   - For each disagreement, the master's one-line note.
5. **Log.** Misses are written to the learner's **reject log**, tallied by rubric criterion ("Blind spot: throat-clearing — missed 4 of 5").

## 4. Must-ship (v1) — exactly three mechanics plus a lite log

1. **Rank + Mark loop** (§3, steps 1–3), mobile-first.
2. **Reveal / gap view** (§3, step 4), plus the composite Red Pen score (§7).
3. **Master Mode.** This is the same UI behind a toggle. It lets the owner rank and mark drafts *on his phone* and export the result as lesson JSON. It is how course content gets authored, so it is not optional.
4. **Reject log, lite.** A per-criterion tally kept in local storage, shown on the course home screen.

## 5. Out of scope (do not build, do not "helpfully" add)

- Accounts, login, sync, payments, subscriptions
- Live AI generation of drafts at runtime (v2 — see §11)
- An AI grader (v2)
- Multiple masters, user-created courses, a marketplace
- CLE accreditation flows
- Video, audio, comments, social features, leaderboards
- Orion Bach integration
- Any backend. v1 is a static site.

## 6. Hard rules (non-negotiable)

- **Claude never authors master judgment.** Master ranks, master marks, master notes, and rubric wording come only from the owner via Master Mode or explicit dictation. Claude may *generate candidate drafts*. It may not grade them on the master's behalf, "pre-fill" marks, or "suggest" a master markup.
- **Fiction only.** Fact patterns use fictional parties and fictional municipalities. No real client, matter, docket, or person.
- **No fabricated authority.** Generated drafts use `[CITE]` placeholders instead of case citations. Real statutes may be named only if they appear in `content/authority-allowlist.json`, and the owner verifies that list.
- **Sentence segmentation is fixed at authoring time.** Every draft is stored pre-split into sentences with stable IDs. Never re-segment at runtime: marks reference sentence IDs.
- **One agent writes to the repo:** Claude Code. Other models (ChatGPT, Grok) contribute specs and critique as pasted text, never as commits.

## 7. Scoring (deterministic — unit-tested)

Given one exercise (5 drafts):

| Component | Weight | Definition |
|---|---|---|
| Pairwise rank agreement | 30 | Share of the 10 draft pairs ordered the same as the master |
| Top pick | 10 | Learner's #1 equals master's #1 |
| Kill F1 | 40 | F1 of the learner's flagged sentences vs the master's flagged sentences, across all 5 drafts |
| Tag agreement | 20 | Among sentences both flagged, the share with the same rubric tag |

**Red Pen score = weighted sum, 0–100, rounded.**

Edge cases (each must have a test):
- If the master flags zero sentences in an exercise, Kill F1 = 100 when the learner flags zero, else 0.
- If both flagged no shared sentences, tag agreement is excluded and its weight is redistributed proportionally across the other components.
- The **Keeper** tag (§8) never counts as a kill. It is scored separately as "gems found" and does not affect the composite score.

**Implementation decisions (slice 1, approved plan — `src/lib/score.ts`):**
- A "kill" is any mark whose tag ≠ `KEEP`.
- A learner KEEP on a sentence the master killed counts as a miss, not a tag mismatch.
- Master flags some and learner flags none → F1 = 0 (never NaN).
- Duplicate marks on one sentence: last wins.
- A ranking that is not a permutation of the 5 draft IDs, or a mark on an unknown sentence ID, throws.
- Gems: `possible` = drafts with a master KEEP; `found` = drafts where the learner's KEEP is the same sentence.
- Rounding happens only on the final 0–100.

## 8. Rubric v0 — DRAFT, OWNER TO REWRITE

These are placeholders so the build can proceed. The owner replaces the wording, and may cut or add criteria, before any learner sees them. IDs are stable; labels are not.

| ID | Kill reason (label) | One-line test |
|---|---|---|
| `R1` | Buried winner | The ground that wins on its own is not first |
| `R2` | Can't rule from it | A judge reading only this sentence could not tell what to grant and why |
| `R3` | Throat-clearing | Procedural recital, "respectfully submits," restating the caption |
| `R4` | Overclaim | Asserts more than the record or law supports — a candor risk |
| `R5` | Missing ask | The relief sought (dismissal *with prejudice*) is absent or vague |
| `R6` | Fog | An abstraction where a fact would do the work |
| `R7` | Wrong fight | Argues a point the plaintiff can cure by amendment |
| `KEEP` | Keeper | The best sentence in the draft — learner and master may mark one per draft |

## 9. Lesson 1 content brief

- **Fact pattern (fictional):** Plaintiff Dana Ferro trips on a raised sidewalk slab outside the Township of Harlow municipal building on March 3. She serves no notice of claim. On November 20 she files a negligence complaint against the Township. The Township moves to dismiss for failure to serve notice under the Tort Claims Act.
- **Task shown to the learner:** "Write the opening paragraph of the Township's brief in support of its motion to dismiss."
- **Drafts:** five candidates, each 4–7 sentences. Claude generates them into `content/unreviewed/` using these deliberate profiles, so the set spans the rubric:
  - one genuinely strong draft
  - one strong-but-buried draft
  - one throat-clearing draft
  - one overclaiming draft
  - one that fights a curable point
- **Owner then:** in Master Mode, ranks, marks, writes notes, and exports to `content/courses/legal-writing/lesson-01.json`.
- Allowlisted authority for Lesson 1 (owner to verify before shipping): the Tort Claims Act notice provision, N.J.S.A. 59:8-8.

## 10. Data model (TypeScript)

```ts
type RubricCriterion = { id: string; label: string; test: string };

type Sentence = { id: string; text: string };          // id stable: "d3-s2"

type MasterMark = { sentenceId: string; tag: string; note?: string };

type Draft = {
  id: string;                       // "d1".."d5"
  sentences: Sentence[];
  masterRank: 1 | 2 | 3 | 4 | 5;    // unique within exercise
  masterMarks: MasterMark[];
  masterSummary?: string;           // one line, shown on reveal
};

type Exercise = {
  id: string;
  factPattern: string;
  task: string;
  drafts: Draft[];                  // exactly 5
};

type Lesson = { id: string; title: string; rubricId: string; exercises: Exercise[] };

type Course = { id: string; title: string; master: string; rubric: RubricCriterion[]; lessons: Lesson[] };

type Attempt = {
  exerciseId: string;
  ranking: string[];                // draft ids, best first
  marks: { sentenceId: string; tag: string }[];
  score: number;
  completedAt: string;              // ISO
};
```

v2-ready: keep `Draft` free of anything that assumes it was hand-written, so runtime-generated drafts can use the same type later.

## 11. v2 thesis (do not build — design so it's possible)

v1 ships a curated bank of master-graded drafts. v2 generates fresh drafts at runtime and grades them with an **AI grader conditioned on the master's rubric and markups**.

**Launch gate for v2:** the AI grader is measured against held-out master markups. Live mode ships only when the grader's Red Pen score against the master is ≥ 85 on the held-out set. Until then, everything is master-graded.

This gate is the scaling story: the master grades once, the rubric grades forever.

## 12. Reject Log (build mistakes — append, never delete)

_Format: `YYYY-MM-DD — what went wrong — the rule that prevents it.`_

- (empty)

## 13. Stack

- Vite + React + TypeScript (strict), CSS modules, no UI kit
- Drag-to-rank: `@dnd-kit/core` and `@dnd-kit/sortable`, with keyboard support
- State: React state + a small `useLocalStore` hook. Wrap every `localStorage` call in try/catch and degrade to memory-only, because the app must also run inside a sandboxed preview.
- Tests: Vitest (unit), Playwright (e2e + screenshots)
- Deploy target: a static build (Vercel), plus a single-file build for a phone-viewable preview

```
/src
  /screens   CourseHome, Exercise, Reveal, MasterMode
  /components DraftCard, SentenceTap, RankList, GapRow, RubricChip
  /lib       score.ts, segment.ts, store.ts, exportLesson.ts
/content
  /courses/legal-writing/course.json, lesson-01.json
  /unreviewed/            (Claude-generated candidate drafts only)
  authority-allowlist.json
/scripts     validate-content.ts
/tests       score.test.ts, content.test.ts, e2e/*.spec.ts
```

> Repo note: Red Pen currently lives in `red-pen/` inside the `atlas` repo (the only repo in session scope). All paths above are relative to `red-pen/`. It moves to its own repo with a single `git mv`/subtree split.

## 14. Design direction

- **Feel:** a senior partner's desk at 11 p.m. Cream paper (`#F6F1E7`), ink black (`#1B1A17`), one red (`#B3261E`) used **only** for marks and the score. Nothing else gets red.
- **Type:** a serif for draft text (Newsreader or Source Serif 4, 18px/1.6 on mobile). A grotesk for UI chrome. A monospace for sentence IDs in Master Mode only.
- **Marks:** a flagged sentence gets a hand-drawn red underline that animates in over 180 ms, with the tag as a small margin chip. Respect `prefers-reduced-motion`.
- **Reveal:** split view on desktop. On mobile, tabs labeled "Yours / Master's / Gap," with Gap as the default tab.
- **Restraint:** no gradients, no emoji, no confetti. The score appears once, large, then gets out of the way.
- **Reference games/apps for feel:** *Papers, Please* (the act of judging is the game); the Wordle share grid, for one shareable result line after each lesson.
- **Every screen** must work one-handed at 390 × 844 with the primary action in the thumb zone.

## 15. Commands and the verification loop

```
npm run dev
npm run check      # typecheck + lint + test + validate:content + e2e
npm run build      # static site
npm run build:single   # single-file HTML for phone preview
```

**Do not end a task until `npm run check` passes.** Plausible-looking code that fails the check is not done.

> Status: as of slice 1, `check` = typecheck + lint + test. `validate:content` joins in slice 2, `e2e` in slice 3; `dev`/`build`/`build:single` arrive with the first screen.

`validate:content` must fail when:
- an exercise does not have exactly 5 drafts
- any `masterRank` repeats within an exercise
- any mark references a missing sentence ID or an unknown rubric tag
- more than one `KEEP` mark appears per draft
- any draft contains a citation pattern (`\d+ N\.J\.`, `\d+ F\.\d`, `U\.S\.`) not covered by the allowlist
- any file in `/content/courses` was last written by a generation script — Master Mode exports carry `"authoredBy": "master"`

The e2e suite must:
- complete Lesson 1 end to end on a 390px viewport
- assert that the score renders
- save screenshots of Exercise, Reveal (Gap tab), and Master Mode to `/tests/screenshots/`

## 16. How to work in this repo

- Plan mode first for any change touching more than one screen or `score.ts`.
- One vertical slice per session. Order:
  1. scoring + tests
  2. content schema + validator
  3. Exercise screen
  4. Reveal
  5. Master Mode + export
  6. reject log lite
  7. polish pass against §14
- After each slice, post a phone-width screenshot and a two-line summary of what passed the check and what remains unverified.
- When the owner rejects output, add the reason to §12 before continuing.

## 17. Done-when (the slice is finished)

- [ ] `npm run check` is green
- [ ] Lesson 1 is authored entirely in Master Mode, on a phone, by the owner
- [ ] A stranger can finish Lesson 1 on a phone with no explanation, in under 6 minutes
- [ ] 5 practicing lawyers try it. At least 3 finish, at least 2 replay it or ask for Lesson 2 unprompted, and at least 1 names a price they'd pay.
- [ ] Owner's verdict on Orion Bach integration is recorded here: ______

## 18. Model roles

| Model | Job | Never |
|---|---|---|
| Claude Code | Builds, tests, generates candidate drafts | Grades as the master; commits outside this repo's scope |
| ChatGPT | Expands specs, writes alternative fact patterns for later lessons | Touches the repo |
| Grok | Adversarial critique: "why won't a lawyer pay for this?" | Touches the repo |
| Owner | Rubric, rankings, marks, notes, final taste call | — |
