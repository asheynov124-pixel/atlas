/** Wires every service together. One call gives you a working kernel. */
import { EventStream } from '../core/events.js';
import { TaskLedger, type LogSink } from '../ledger/ledger.js';
import { GateEngine, type GatePolicy } from '../gate/engine.js';
import { ApprovalsInbox } from '../approvals/inbox.js';
import { EpisodicStore } from '../memory/episodic.js';
import { SemanticGraph } from '../memory/graph.js';
import { HybridRetriever } from '../memory/retrieval.js';
import { PlanCache } from '../fastpath/planCache.js';
import { Router } from '../fastpath/router.js';
import type { ModelProvider } from '../models/provider.js';
import { EvidenceVerifier, GraderEnsemble, type EnsembleOptions } from './grader.js';
import { Scheduler, Sentinel } from './scheduler.js';
import { ToolRuntime } from './tools.js';
import { LeadRuntime } from './run.js';

export interface KernelOptions {
  provider: ModelProvider;
  concurrency?: number;
  gate_policy?: GatePolicy;
  ensemble?: EnsembleOptions;
  ledger_sink?: LogSink;
  clock?: () => number;
}

export interface Kernel {
  events: EventStream;
  ledger: TaskLedger;
  gate: GateEngine;
  inbox: ApprovalsInbox;
  l2: EpisodicStore;
  l3: SemanticGraph;
  retriever: HybridRetriever;
  planCache: PlanCache;
  router: Router;
  tools: ToolRuntime;
  graders: GraderEnsemble;
  scheduler: Scheduler;
  sentinel: Sentinel;
  lead: LeadRuntime;
  provider: ModelProvider;
}

export function createKernel(opts: KernelOptions): Kernel {
  const events = new EventStream();
  const ledger = new TaskLedger(events, opts.ledger_sink);
  const gate = new GateEngine(events, opts.gate_policy ?? {});
  const inbox = new ApprovalsInbox(events, opts.clock ?? (() => Date.now()));
  const l2 = new EpisodicStore();
  const l3 = new SemanticGraph(l2, events);
  const retriever = new HybridRetriever(l2, l3);
  const planCache = new PlanCache();
  const router = new Router(retriever, planCache);
  const tools = new ToolRuntime(gate, inbox, l2, events);
  const graders = new GraderEnsemble(opts.provider, new EvidenceVerifier(l2), opts.ensemble ?? {});
  const scheduler = new Scheduler(ledger, { concurrency: opts.concurrency ?? 16 });
  const sentinel = new Sentinel(events, tools);
  const lead = new LeadRuntime(ledger, tools, graders, scheduler, sentinel, l2, l3, events, opts.provider, (t) => gate.tierOf(t));
  return { events, ledger, gate, inbox, l2, l3, retriever, planCache, router, tools, graders, scheduler, sentinel, lead, provider: opts.provider };
}
