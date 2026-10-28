// Shared Phase 0 plumbing: result types, the per-run context, and error-to-"skipped" handling.

import { MissingKeyError } from "../server/lib/env.js";
import type { RoomPhoto } from "../server/lib/photos.js";
import type { VerifyResult } from "../server/lib/verify.js";

export type StepResult = { status: "ran" } & Record<string, unknown>;
export type Skipped = { status: "skipped"; reason: string };
export type Outcome = StepResult | Skipped;

// Verified product pages found by earlier steps, reused by the tagging step.
export interface SpikeContext {
  verified: VerifyResult[];
  photos: RoomPhoto[];
}

export function newContext(): SpikeContext {
  return { verified: [], photos: [] };
}

export async function step(fn: () => Promise<StepResult>): Promise<Outcome> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof MissingKeyError) return { status: "skipped", reason: `${err.key} not set` };
    const msg = err instanceof Error ? `${err.message}${err.cause instanceof Error ? ` (${err.cause.message})` : ""}` : String(err);
    return { status: "skipped", reason: `failed: ${msg}` };
  }
}

export function tally(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}
