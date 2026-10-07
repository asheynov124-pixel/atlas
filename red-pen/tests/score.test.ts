import { describe, expect, it } from "vitest";
import { scoreAttempt, pairwiseAgreement, f1 } from "../src/lib/score";
import { KEEP_TAG } from "../src/lib/rubric";
import type { Draft, Exercise, LearnerMark, MasterMark } from "../src/lib/types";

// Synthetic fixture: no rubric wording, no master judgment — just IDs and tags.
const IDS = ["d1", "d2", "d3", "d4", "d5"] as const;
const MASTER_ORDER = [...IDS];

function makeExercise(masterMarks: MasterMark[] = [], ranks: Draft["masterRank"][] = [1, 2, 3, 4, 5]): Exercise {
  return {
    id: "ex-test",
    factPattern: "Fixture.",
    task: "Fixture.",
    drafts: IDS.map((id, i) => ({
      id,
      masterRank: ranks[i]!,
      sentences: [1, 2, 3, 4].map((n) => ({ id: `${id}-s${n}`, text: `Sentence ${n} of ${id}.` })),
      masterMarks: masterMarks.filter((m) => m.sentenceId.startsWith(`${id}-`)),
    })),
  };
}

const mk = (sentenceId: string, tag: string) => ({ sentenceId, tag });

// Five master kills spread across drafts, used by several tests.
const FIVE_KILLS: MasterMark[] = [
  mk("d1-s1", "R1"),
  mk("d2-s2", "R3"),
  mk("d3-s3", "R4"),
  mk("d4-s1", "R7"),
  mk("d5-s4", "R2"),
];

describe("perfect and worst cases", () => {
  it("scores 100 when the learner matches the master exactly", () => {
    const ex = makeExercise(FIVE_KILLS);
    const r = scoreAttempt(ex, MASTER_ORDER, FIVE_KILLS);
    expect(r.score).toBe(100);
    expect(r.kills.caught).toHaveLength(5);
    expect(r.tags.mismatches).toEqual([]);
  });

  it("a fully reversed ranking earns zero pairwise and zero top pick", () => {
    const r = scoreAttempt(makeExercise(FIVE_KILLS), [...MASTER_ORDER].reverse(), FIVE_KILLS);
    expect(r.pairs.agreed).toBe(0);
    expect(r.pairs.disagreements).toHaveLength(10);
    expect(r.topPick.hit).toBe(false);
    expect(r.components.pairwise).toBe(0);
    expect(r.score).toBe(60); // kills 40 + tags 20
  });
});

describe("pairwise rank agreement", () => {
  it("one adjacent swap at the top costs one pair and the top pick", () => {
    const r = scoreAttempt(makeExercise(FIVE_KILLS), ["d2", "d1", "d3", "d4", "d5"], FIVE_KILLS);
    expect(r.pairs).toEqual({ agreed: 9, total: 10, disagreements: [["d1", "d2"]] });
    expect(r.topPick).toEqual({ learner: "d2", master: "d1", hit: false });
    expect(r.score).toBe(87); // 27 + 0 + 40 + 20
  });

  it("an adjacent swap lower down keeps the top pick", () => {
    const r = scoreAttempt(makeExercise(FIVE_KILLS), ["d1", "d2", "d3", "d5", "d4"], FIVE_KILLS);
    expect(r.pairs.agreed).toBe(9);
    expect(r.topPick.hit).toBe(true);
    expect(r.score).toBe(97);
  });

  it("reads master order from masterRank, not array order", () => {
    const ex = makeExercise([], [5, 4, 3, 2, 1]);
    const r = scoreAttempt(ex, ["d5", "d4", "d3", "d2", "d1"], []);
    expect(r.pairs.agreed).toBe(10);
    expect(r.topPick.master).toBe("d5");
  });

  it("helper counts all 10 pairs for 5 items", () => {
    expect(pairwiseAgreement(MASTER_ORDER, MASTER_ORDER).total).toBe(10);
  });
});

describe("kill F1", () => {
  it("caught 3 of 5, killed 2 extra → P = R = F1 = 0.6", () => {
    const learner = [
      mk("d1-s1", "R1"),
      mk("d2-s2", "R3"),
      mk("d3-s3", "R4"),
      mk("d1-s4", "R6"), // extra
      mk("d2-s4", "R6"), // extra
    ];
    const r = scoreAttempt(makeExercise(FIVE_KILLS), MASTER_ORDER, learner);
    expect(r.kills.caught).toEqual(["d1-s1", "d2-s2", "d3-s3"]);
    expect(r.kills.missed).toEqual(["d4-s1", "d5-s4"]);
    expect(r.kills.extra).toEqual(["d1-s4", "d2-s4"]);
    expect(r.kills.precision).toBeCloseTo(0.6);
    expect(r.kills.recall).toBeCloseTo(0.6);
    expect(r.kills.f1).toBeCloseTo(0.6);
    expect(r.score).toBe(84); // 30 + 10 + 24 + 20
  });

  it("learner flags nothing while master flags some → F1 = 0, not NaN", () => {
    const r = scoreAttempt(makeExercise(FIVE_KILLS), MASTER_ORDER, []);
    expect(r.kills.f1).toBe(0);
    expect(Number.isNaN(r.kills.precision)).toBe(false);
  });

  it("[spec edge] master flags zero, learner flags zero → F1 = 100%", () => {
    const r = scoreAttempt(makeExercise([]), MASTER_ORDER, []);
    expect(r.components.killF1).toBe(1);
    expect(r.score).toBe(100);
  });

  it("[spec edge] master flags zero, learner flags one → F1 = 0", () => {
    const r = scoreAttempt(makeExercise([]), MASTER_ORDER, [mk("d1-s1", "R3")]);
    expect(r.components.killF1).toBe(0);
    expect(r.kills.extra).toEqual(["d1-s1"]);
  });

  it("helper never returns NaN at the zero corners", () => {
    for (const [c, l, m] of [[0, 0, 0], [0, 0, 3], [0, 3, 0], [0, 3, 3]] as const) {
      const out = f1(c, l, m);
      expect(Object.values(out).some(Number.isNaN)).toBe(false);
    }
  });
});

describe("tag agreement", () => {
  it("lists mismatches and scores the agreeing share", () => {
    const learner = [mk("d1-s1", "R1"), mk("d2-s2", "R6"), mk("d3-s3", "R4")];
    const master = [mk("d1-s1", "R1"), mk("d2-s2", "R3"), mk("d3-s3", "R4")];
    const r = scoreAttempt(makeExercise(master), MASTER_ORDER, learner);
    expect(r.tags).toEqual({
      shared: 3,
      agreed: 2,
      mismatches: [{ sentenceId: "d2-s2", learnerTag: "R6", masterTag: "R3" }],
      excluded: false,
    });
    expect(r.score).toBe(93); // 30 + 10 + 40 + 13.33
  });

  it("[spec edge] no shared flags → tag excluded, weight redistributed proportionally", () => {
    // Perfect ranking; master kills one sentence, learner kills a different one.
    const r = scoreAttempt(makeExercise([mk("d1-s1", "R1")]), MASTER_ORDER, [mk("d2-s1", "R1")]);
    expect(r.tags.excluded).toBe(true);
    expect(r.components.tagAgreement).toBeNull();
    expect(r.weights).toEqual({ pairwise: 37.5, topPick: 12.5, killF1: 50, tagAgreement: 0 });
    expect(r.score).toBe(50); // 37.5 + 12.5 + 0
  });

  it("[spec edge] redistribution also applies when both flag nothing", () => {
    const r = scoreAttempt(makeExercise([]), ["d2", "d1", "d3", "d4", "d5"], []);
    expect(r.tags.excluded).toBe(true);
    // 37.5 × 0.9 + 0 + 50 × 1 = 83.75
    expect(r.score).toBe(84);
  });

  it("effective weights always sum to 100", () => {
    const a = scoreAttempt(makeExercise(FIVE_KILLS), MASTER_ORDER, FIVE_KILLS);
    const b = scoreAttempt(makeExercise([]), MASTER_ORDER, []);
    for (const r of [a, b]) {
      expect(Object.values(r.weights).reduce((s, w) => s + w, 0)).toBeCloseTo(100);
    }
  });
});

describe("Keeper tag", () => {
  const masterWithKeeps: MasterMark[] = [...FIVE_KILLS, mk("d1-s2", KEEP_TAG), mk("d2-s1", KEEP_TAG)];

  it("[spec edge] KEEP never counts as a kill and never moves the composite", () => {
    const ex = makeExercise(masterWithKeeps);
    const matching = scoreAttempt(ex, MASTER_ORDER, [...FIVE_KILLS, mk("d1-s2", KEEP_TAG), mk("d2-s1", KEEP_TAG)]);
    const wrong = scoreAttempt(ex, MASTER_ORDER, [...FIVE_KILLS, mk("d1-s3", KEEP_TAG)]);
    const none = scoreAttempt(ex, MASTER_ORDER, FIVE_KILLS);

    expect(matching.gems).toEqual({ found: 2, possible: 2 });
    expect(wrong.gems).toEqual({ found: 0, possible: 2 });
    expect(none.gems).toEqual({ found: 0, possible: 2 });
    expect(matching.score).toBe(100);
    expect(wrong.score).toBe(100);
    expect(none.score).toBe(100);
    expect(matching.kills.extra).toEqual([]);
  });

  it("learner KEEP on a master-killed sentence counts as a miss, not a tag mismatch", () => {
    const learner = FIVE_KILLS.map((m) => (m.sentenceId === "d1-s1" ? mk("d1-s1", KEEP_TAG) : m));
    const r = scoreAttempt(makeExercise(FIVE_KILLS), MASTER_ORDER, learner);
    expect(r.kills.missed).toEqual(["d1-s1"]);
    expect(r.tags.mismatches).toEqual([]);
  });
});

describe("input guards and determinism", () => {
  it("throws on a ranking that is not a permutation of the draft IDs", () => {
    const ex = makeExercise();
    expect(() => scoreAttempt(ex, ["d1", "d2", "d3", "d4"], [])).toThrow(/permutation/);
    expect(() => scoreAttempt(ex, ["d1", "d1", "d3", "d4", "d5"], [])).toThrow(/permutation/);
    expect(() => scoreAttempt(ex, ["d1", "d2", "d3", "d4", "d9"], [])).toThrow(/permutation/);
  });

  it("throws on a mark that references an unknown sentence ID", () => {
    expect(() => scoreAttempt(makeExercise(), MASTER_ORDER, [mk("d1-s9", "R1")])).toThrow(/Unknown sentence/);
  });

  it("last mark wins when a sentence is marked twice", () => {
    const r = scoreAttempt(makeExercise([mk("d1-s1", "R3")]), MASTER_ORDER, [mk("d1-s1", "R1"), mk("d1-s1", "R3")]);
    expect(r.tags.agreed).toBe(1);
  });

  it("mark order does not change the breakdown", () => {
    const ex = makeExercise(FIVE_KILLS);
    const learner = [mk("d5-s4", "R2"), mk("d1-s4", "R6"), mk("d2-s2", "R1"), mk("d1-s1", "R1")];
    const a = scoreAttempt(ex, ["d2", "d1", "d4", "d3", "d5"], learner);
    const b = scoreAttempt(ex, ["d2", "d1", "d4", "d3", "d5"], [...learner].reverse());
    expect(a).toEqual(b);
  });

  it("score is always an integer in [0, 100] (seeded random attempts)", () => {
    let seed = 0x5eed;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const shuffle = <T,>(xs: T[]) => {
      const out = [...xs];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    };
    const allSentences = IDS.flatMap((d) => [1, 2, 3, 4].map((n) => `${d}-s${n}`));
    const tags = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", KEEP_TAG];
    const randomMarks = (): LearnerMark[] =>
      allSentences.filter(() => rand() < 0.3).map((id) => mk(id, tags[Math.floor(rand() * tags.length)]!));

    for (let i = 0; i < 500; i++) {
      const ranks = shuffle([1, 2, 3, 4, 5] as Draft["masterRank"][]);
      const ex = makeExercise(randomMarks(), ranks);
      const r = scoreAttempt(ex, shuffle([...IDS]), randomMarks());
      expect(Number.isInteger(r.score)).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });
});
