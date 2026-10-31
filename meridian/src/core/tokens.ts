/** Cheap, deterministic token estimate (≈ 4 chars/token). Good enough for budgets and watermarks. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
