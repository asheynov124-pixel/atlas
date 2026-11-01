# Meridian — Canvas Workspace app and kernel (PAS-001 v1.1)

A runnable, tested implementation of `docs/SPEC.md` (the Meridian Product Architecture
Specification, revised to v1.1 after architecture review): the Swarm Kernel, Gate
Engine, Approvals Inbox, Continuum Memory and Fast Path underneath, and the Canvas
Workspace (§10) on top. TypeScript on Node 22. The only runtime dependency is the
Anthropic SDK, used when you opt into live models.

## Run the app

```
npm install
npm start                      # http://localhost:8787 — mock model fleet, sample matter loaded
ANTHROPIC_API_KEY=… npm start  # live fleet: Opus 5.5 (frontier) / Sonnet 5.5 (balanced) / Haiku 5.5 (fast)
MERIDIAN_WORKSPACE=~/matters/harbor npm start   # review your own folder of .txt/.md/.eml/.csv/.json/.html files
```

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | unset → mock fleet | Any Anthropic credential the SDK accepts; an `ant auth login` profile also works |
| `MERIDIAN_WORKSPACE` | `./workspace` | Folder the review workflow reads. Nothing outside it is readable (gate-enforced) |
| `MERIDIAN_LABEL` | `Local workspace` | Name in the header |
| `MERIDIAN_USER` | `user:owner` | Reviewer identity recorded on every approval |
| `MERIDIAN_CONCURRENCY` | `8` | Specialists per run |
| `PORT` | `8787` | |

### What you can do in it

- **Ask** a question in the composer. The router classifies it, retrieves from memory with a budget sized to the predicted effort, answers at the cheapest adequate tier, and runs the evidence check. Every factual sentence carries a `src` chip that opens the verbatim source span.
- **Delegate** a goal. It becomes a run with a task DAG. Three workflows ship:
  - `review` — one task per document in the workspace, then a chronology; every event cites the sentence it came from. Each event is also staged into the semantic graph through the fact quarantine.
  - `reply` — drafts an outbound email from memory and tries to send it. Sending is Tier 3, so the plan checkpoint fires first and the send waits in the **Approvals** rail with a verification payload: what changes, the evidence, the state snapshot, the alternatives. Edit, reject, or approve. If the thread changed meanwhile the approval is invalidated and reissued.
  - `diligence` — the §9.3 demo on 40 fictional companies (mock fleet only).
- **Canvas** shows the artifact with provenance markers ⟦n⟧. Click one for the source, pin it, copy the pointer, or open the full record.
- **Swarm** rail shows pools, task status, grader scores, critiques of revisions, cost against budget, Sentinel alerts, and cancel. **Open trace** returns the full ledger, event and gate-audit log.
- **Memory** rail opens the explorer: verbatim search, claims with confidence and evidence, contested claims you can dispute, the quarantine, exports, and litigation holds (workspace-wide or per run; a hold freezes retention and Forgetting).
- Works one-handed on a phone: Runs · Canvas · Memory tabs, approvals under **Needs you**.

### Demos and tests

```
npm test                 # 29 tests: ledger invariants, gate rules, inbox, memory, fast path, kernel, app API
npm run demo:diligence   # §9.3: 40 companies → 88-task DAG → graders → memo with provenance markers
npm run demo:initiative  # §9.4: stale thread → draft → Tier 3 approval → revalidation → send → resume
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
| §9 API | `src/api/server.ts` | `/v1/state`, `/v1/ask`, `/v1/runs` (+ `/events` SSE, `/trace`, `/approve-plan`, `/answer`, `/cancel`), `/v1/approvals` (+ `/open`, `/decide`, `/telemetry`), `/v1/memory/query|spans|export|hold|holds|claims`, `/v1/triggers`, `/v1/webhooks`, `/v1/skills` |
| §10 Canvas Workspace | `web/` | Five zones, provenance chips, plan checkpoint card, Tier 2 question form, approvals with edit/reject/approve, memory explorer, mobile tabs. Vanilla JS over the API with SSE |
| App wiring | `src/app/` | Environment-driven provider choice, mock handlers, `review` and `reply` workflow templates |
| §4.1 Model fleet | `src/models/*` | `ModelProvider` interface; deterministic `MockProvider`; `AnthropicProvider` mapping frontier/balanced/fast to Claude Opus 5.5 / Sonnet 5.5 / Haiku 5.5 with adaptive thinking and effort |

## Using the live model fleet

```ts
import { createKernel, AnthropicProvider } from './src/index.js';
const kernel = createKernel({ provider: new AnthropicProvider() }); // reads ANTHROPIC_API_KEY or an `ant auth login` profile
```

Everything else is identical. Specialists you write receive a `SpecialistContext` whose
`tool()` call is already gate-checked; results come back with an L2 pointer so your
deliverable can cite them and the evidence verifier can check the citation.

## Adding your own workflow

A workflow is a planner (goal → task specs) and an executor (task → deliverable with
evidence). Register it in `src/app/main.ts` with a `match` function and it appears in
the composer's workflow menu and in auto-routing. Tools are registered on
`kernel.tools` and pass the Gate Engine on every call; the result comes back with an
L2 pointer so the deliverable can cite it. See `src/app/templates/review.ts`.

## What is deliberately not here

Real connectors (§8.3: mail, calendar, repos), ephemeral sandboxes and an egress
firewall (§8.8), dense embeddings and a cross-encoder reranker (§7.4), speculative
reasoning (§6.3), and PDF text extraction. Each has a seam (`ToolHandler`,
`inside_sandbox`, `DenseScorer`, `Summarizer`, `TEXT_EXT`) where the real thing plugs
in. The `mail.send` tool in this build prints a receipt; it does not deliver mail.
