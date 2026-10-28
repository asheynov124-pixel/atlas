// Reads config from the environment: Vercel project env vars in production, a sourced .env locally.
// Keys never leave the server: nothing in this folder is imported by client code.

export function env(name: string): string | undefined {
  const v = process.env[name];
  return v === "" ? undefined : v;
}

export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new MissingKeyError(name);
  return v;
}

export class MissingKeyError extends Error {
  constructor(public readonly key: string) {
    super(`Missing environment variable ${key}`);
    this.name = "MissingKeyError";
  }
}

// Model IDs are config, not code, so they can be bumped without a deploy of new logic.
export const models = {
  claudeVision: () => env("CLAUDE_VISION_MODEL") ?? "claude-opus-5-5",
  // Tagging is short, schema-constrained classification: Haiku 5.5 does it at ~1/40th of Opus's
  // price. The spike's tagging step checks its agreement with Opus on the same cards.
  claudeTagging: () => env("CLAUDE_TAG_MODEL") ?? "claude-haiku-5-5",
  // Google's own grounding cookbook uses gemini-3.8-flash; 2.5 models are closed to new users.
  gemini: () => env("GEMINI_MODEL") ?? "gemini-3.8-flash",
};
