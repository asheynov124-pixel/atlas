// Data model — CLAUDE.md §10, verbatim. Keep Draft free of hand-written assumptions (v2).

export type RubricCriterion = { id: string; label: string; test: string };

export type Sentence = { id: string; text: string }; // id stable: "d3-s2"

export type MasterMark = { sentenceId: string; tag: string; note?: string };

export type Draft = {
  id: string; // "d1".."d5"
  sentences: Sentence[];
  masterRank: 1 | 2 | 3 | 4 | 5; // unique within exercise
  masterMarks: MasterMark[];
  masterSummary?: string; // one line, shown on reveal
};

export type Exercise = {
  id: string;
  factPattern: string;
  task: string;
  drafts: Draft[]; // exactly 5
};

export type Lesson = { id: string; title: string; rubricId: string; exercises: Exercise[] };

export type Course = {
  id: string;
  title: string;
  master: string;
  rubric: RubricCriterion[];
  lessons: Lesson[];
};

export type LearnerMark = { sentenceId: string; tag: string };

export type Attempt = {
  exerciseId: string;
  ranking: string[]; // draft ids, best first
  marks: LearnerMark[];
  score: number;
  completedAt: string; // ISO
};

// --- Scoring output (§7). Everything Reveal needs, so the UI never recomputes. ---

export type ComponentKey = "pairwise" | "topPick" | "killF1" | "tagAgreement";

export type ScoreBreakdown = {
  pairs: { agreed: number; total: number; disagreements: [string, string][] };
  topPick: { learner: string; master: string; hit: boolean };
  kills: {
    caught: string[]; // both killed
    missed: string[]; // master killed, learner did not
    extra: string[]; // learner killed, master kept
    precision: number;
    recall: number;
    f1: number;
  };
  tags: {
    shared: number;
    agreed: number;
    mismatches: { sentenceId: string; learnerTag: string; masterTag: string }[];
    excluded: boolean;
  };
  gems: { found: number; possible: number };
  components: Record<ComponentKey, number | null>; // each 0–1; null = excluded
  weights: Record<ComponentKey, number>; // effective weights, sum to 100
  score: number; // 0–100 integer
};
