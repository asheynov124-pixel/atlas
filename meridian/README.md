# Meridian Kernel — reference implementation of PAS-001 v1.1

A runnable, tested implementation of every contract in `docs/SPEC.md` (the Meridian
Product Architecture Specification, revised to v1.1 after architecture review). It is
written in TypeScript on Node 22 with no runtime dependencies beyond the Anthropic SDK,
which is only touched when you opt into the live model provider.

```
npm install
npm test                 # 26 tests: ledger invariants, gate rules, inbox, memory, fast path, end-to-end runs
npm run demo:diligence   # §9.3: 40 companies → 88-task DAG → graders → memo with provenance markers
npm run demo:initiative  # §9.4: stale thread → draft → Tier 3 approval → revalidation → send → resume
npm run serve            # §9.2 HTTP API on :8787 (mock provider)
```

## What is here

| Spec section | Module | What it enforces |
|---|---|---|
| §5.4 Task Ledger | `src/ledger/ledger.ts` | Status enum, derived readiness, single owner, `accepted` requires a grader record, hard budgets, append-only log |
| §8.4 Gate Engine | `src/gate/engine.ts`, `src/gate/shell.ts` | Tiers 0/1/3/4 on action classes; confidence and topic **modifiers** that can only raise to a Tier 2 question; static deny → ceiling → tier → modifier order; shell operators and `bash -c` never inherit allow status; unknown tools blocked |
| §8.6–8.7 Approvals Inbox | `src/approvals/inbox.ts` | Verification payloads, TTL with re-request on expiry, state revalidation with reissue, RBAC, scoped/expiring/revocable delegation, audit trail, telemetry that flags payload redesign and never a tier change |
| §7 Continuum Memory | `src/memory/*` | L2 append-only store with one-hop pointers, L0/L1 streaming compaction that refuses pointer-less sentences, L3 graph with contradiction detection and **fact quarantine**, hybrid BM25 + graph retrieval with budgeted packing, litigation holds, JSONL export |
| §6 Fast Path | `src/fastpath/*` | Two-phase router (prefetch → classify → budgeted retrieval), plan cache that stores skeletons and refuses conclusions, cascade evidence check on provisional answers |
| §5 Swarm Kernel | `src/kernel/*` | Lead runtime (plan → checkpoint → DAG → schedule → grade → revise → fan-in → archive), grader ensemble (rubric, sampled critic, deterministic evidence verifier, calibration), scheduler with cost envelopes, Sentinel loop and budget detection, gate-checked tool runtime |
| §8 Initiative Engine | `src/initiative/engine.ts` | Event bus, hypothesis rules with rank threshold, planning checkpoint, Tier 3 lands in the Inbox, run pauses and resumes |
| §9 API | `src/api/server.ts` | `/v1/runs`, `/events` (SSE), `/trace`, `/approvals`, `/memory/query|spans|export|hold|claims`, `/triggers`, `/webhooks`, `/skills` |
| §4.1 Model fleet | `src/models/*` | `ModelProvider` interface; deterministic `MockProvider`; `AnthropicProvider` mapping frontier/balanced/fast to Claude Opus 5.5 / Sonnet 5.5 / Haiku 5.5 with adaptive thinking and effort |

## Using the live model fleet

```ts
import { createKernel, AnthropicProvider } from './src/index.js';
const kernel = createKernel({ provider: new AnthropicProvider() }); // reads ANTHROPIC_API_KEY or an `ant auth login` profile
```

Everything else is identical. Specialists you write receive a `SpecialistContext` whose
`tool()` call is already gate-checked; results come back with an L2 pointer so your
deliverable can cite them and the evidence verifier can check the citation.

## What is deliberately not here

The Canvas Workspace UI (§10), real connectors (§8.3), ephemeral sandboxes and egress
firewall (§8.8), dense embeddings and a cross-encoder reranker (§7.4), and speculative
reasoning (§6.3). Each has an interface or a seam in the code (`DenseScorer`,
`ToolHandler`, `Summarizer`, `inside_sandbox`) where the real thing plugs in.
