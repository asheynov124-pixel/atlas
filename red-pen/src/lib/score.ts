// Red Pen score — CLAUDE.md §7. Pure and deterministic: same inputs, same breakdown.
// The v2 launch gate (§11) reuses this unchanged, with the AI grader as the "learner".

import { KEEP_TAG } from "./rubric";
import type { ComponentKey, Exercise, LearnerMark, ScoreBreakdown } from "./types";

export const WEIGHTS: Readonly<Record<ComponentKey, number>> = {
  pairwise: 30,
  topPick: 10,
  killF1: 40,
  tagAgreement: 20,
};

/** sentenceId -> tag, keeping only the last mark per sentence. */
type MarkMap = Map<string, string>;

function toMarkMap(marks: readonly { sentenceId: string; tag: string }[]): MarkMap {
  const map: MarkMap = new Map();
  for (const m of marks) map.set(m.sentenceId, m.tag);
  return map;
}

function killsOf(map: MarkMap): Set<string> {
  const out = new Set<string>();
  for (const [id, tag] of map) if (tag !== KEEP_TAG) out.add(id);
  return out;
}

/** Share of unordered draft pairs ordered the same way in both rankings (best first). */
export function pairwiseAgreement(
  learner: readonly string[],
  master: readonly string[],
): { agreed: number; total: number; disagreements: [string, string][] } {
  const pos = new Map(learner.map((id, i) => [id, i]));
  let agreed = 0;
  let total = 0;
  const disagreements: [string, string][] = [];
  for (let i = 0; i < master.length; i++) {
    for (let j = i + 1; j < master.length; j++) {
      const better = master[i]!;
      const worse = master[j]!;
      total++;
      if (pos.get(better)! < pos.get(worse)!) agreed++;
      else disagreements.push([better, worse]); // master's order: better above worse
    }
  }
  return { agreed, total, disagreements };
}

/** Kill sets compared. `order` fixes output order (reading order of the exercise). */
export function killSets(
  learnerKills: ReadonlySet<string>,
  masterKills: ReadonlySet<string>,
  order: readonly string[],
): { caught: string[]; missed: string[]; extra: string[] } {
  const caught: string[] = [];
  const missed: string[] = [];
  const extra: string[] = [];
  for (const id of order) {
    const l = learnerKills.has(id);
    const m = masterKills.has(id);
    if (l && m) caught.push(id);
    else if (m) missed.push(id);
    else if (l) extra.push(id);
  }
  return { caught, missed, extra };
}

/** F1 with the §7 edge cases. Returns precision/recall alongside; never NaN. */
export function f1(
  caught: number,
  learnerTotal: number,
  masterTotal: number,
): { precision: number; recall: number; f1: number } {
  if (masterTotal === 0) {
    // §7: master flags nothing → perfect only if the learner also flags nothing.
    const clean = learnerTotal === 0 ? 1 : 0;
    return { precision: clean, recall: 1, f1: clean };
  }
  const precision = learnerTotal === 0 ? 0 : caught / learnerTotal;
  const recall = caught / masterTotal;
  const score = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1: score };
}

export function scoreAttempt(
  exercise: Exercise,
  ranking: readonly string[],
  marks: readonly LearnerMark[],
): ScoreBreakdown {
  const draftIds = exercise.drafts.map((d) => d.id);
  const draftOf = new Map<string, string>(); // sentenceId -> draftId
  const order: string[] = []; // every sentenceId, in reading order
  for (const d of exercise.drafts) {
    for (const s of d.sentences) {
      draftOf.set(s.id, d.id);
      order.push(s.id);
    }
  }

  // Guard rails: a mis-scored attempt is worse than a loud failure.
  const rankSet = new Set(ranking);
  if (ranking.length !== draftIds.length || rankSet.size !== draftIds.length || !draftIds.every((id) => rankSet.has(id))) {
    throw new Error(`Ranking must be a permutation of [${draftIds.join(", ")}]; got [${ranking.join(", ")}]`);
  }
  for (const m of marks) {
    if (!draftOf.has(m.sentenceId)) throw new Error(`Unknown sentence ID in learner marks: ${m.sentenceId}`);
  }

  const masterRanking = [...exercise.drafts].sort((a, b) => a.masterRank - b.masterRank).map((d) => d.id);
  const learnerMap = toMarkMap(marks);
  const masterMap = toMarkMap(exercise.drafts.flatMap((d) => d.masterMarks));

  // 1. Pairwise rank agreement
  const pairs = pairwiseAgreement(ranking, masterRanking);

  // 2. Top pick
  const topPick = { learner: ranking[0]!, master: masterRanking[0]!, hit: ranking[0] === masterRanking[0] };

  // 3. Kill F1 — KEEP is never a kill (§7)
  const learnerKills = killsOf(learnerMap);
  const masterKills = killsOf(masterMap);
  const sets = killSets(learnerKills, masterKills, order);
  const prf = f1(sets.caught.length, learnerKills.size, masterKills.size);

  // 4. Tag agreement, among sentences both killed
  const mismatches: ScoreBreakdown["tags"]["mismatches"] = [];
  for (const id of sets.caught) {
    const learnerTag = learnerMap.get(id)!;
    const masterTag = masterMap.get(id)!;
    if (learnerTag !== masterTag) mismatches.push({ sentenceId: id, learnerTag, masterTag });
  }
  const shared = sets.caught.length;
  const tags = { shared, agreed: shared - mismatches.length, mismatches, excluded: shared === 0 };

  // Gems (KEEP) — reported, never scored
  const keepByDraft = (map: MarkMap) => {
    const out = new Map<string, string>();
    for (const [id, tag] of map) if (tag === KEEP_TAG) out.set(draftOf.get(id)!, id);
    return out;
  };
  const masterKeeps = keepByDraft(masterMap);
  const learnerKeeps = keepByDraft(learnerMap);
  let found = 0;
  for (const [draft, id] of masterKeeps) if (learnerKeeps.get(draft) === id) found++;
  const gems = { found, possible: masterKeeps.size };

  // Composite, with proportional redistribution when tag agreement is excluded
  const components: Record<ComponentKey, number | null> = {
    pairwise: pairs.agreed / pairs.total,
    topPick: topPick.hit ? 1 : 0,
    killF1: prf.f1,
    tagAgreement: tags.excluded ? null : tags.agreed / shared,
  };
  const keys = Object.keys(WEIGHTS) as ComponentKey[];
  const activeWeight = keys.reduce((sum, k) => (components[k] === null ? sum : sum + WEIGHTS[k]), 0);
  const weights = {} as Record<ComponentKey, number>;
  let raw = 0;
  for (const k of keys) {
    const c = components[k];
    weights[k] = c === null ? 0 : (WEIGHTS[k] * 100) / activeWeight;
    if (c !== null) raw += weights[k] * c;
  }

  return {
    pairs,
    topPick,
    kills: { ...sets, ...prf },
    tags,
    gems,
    components,
    weights,
    score: Math.round(raw),
  };
}
