/**
 * Meridian app entry: picks the model fleet from the environment, registers the
 * workflow templates, and serves the Canvas Workspace plus the API.
 *
 *   ANTHROPIC_API_KEY      → live Claude fleet (Opus 5.5 / Sonnet 5.5 / Haiku 5.5); otherwise deterministic mock
 *   MERIDIAN_WORKSPACE     → folder of documents the review workflow reads (default ./workspace)
 *   MERIDIAN_LABEL         → workspace name shown in the header
 *   PORT                   → default 8787
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKernel } from '../kernel/bootstrap.js';
import { MockProvider } from '../models/mock.js';
import { installMockHandlers } from './mockHandlers.js';
import { createApiServer, type WorkflowTemplate } from '../api/server.js';
import { reviewTemplate, listWorkspaceFiles } from './templates/review.js';
import { replyTemplate } from './templates/reply.js';
import { diligenceTemplate, registerDemoTools } from '../demo/diligence.js';
import type { ModelProvider } from '../models/provider.js';

export async function buildApp(env: NodeJS.ProcessEnv = process.env) {
  const here = dirname(fileURLToPath(import.meta.url));
  const workspaceDir = resolve(env['MERIDIAN_WORKSPACE'] ?? resolve(here, '../../workspace'));
  const live = !!env['ANTHROPIC_API_KEY'];
  let provider: ModelProvider;
  let mock: MockProvider | null = null;
  if (live) {
    const { AnthropicProvider } = await import('../models/anthropic.js');
    provider = new AnthropicProvider();
  } else {
    mock = installMockHandlers(new MockProvider());
    provider = mock;
  }
  const kernel = createKernel({ provider, concurrency: Number(env['MERIDIAN_CONCURRENCY'] ?? 8) });

  const review = reviewTemplate(kernel, workspaceDir);
  const reply = replyTemplate(kernel);
  const templates: Record<string, WorkflowTemplate> = {
    review: { ...review, description: `Review every document in ${workspaceDir} and build a sourced chronology`, match: (g) => (/\b(review|chronolog|timeline|document|file|matter|correspondence|produc)/i.test(g) ? 2 : 1), default_budget_usd: 25 },
    reply: { ...reply, description: 'Draft a reply from memory and send it (Tier 3 approval required before anything leaves)', match: (g) => (/\b(send|reply|respond|e-?mail)\b/i.test(g) ? 4 : 0), default_budget_usd: 5, risk_tier_ceiling: 3 },
  };
  if (mock) {
    const dil = diligenceTemplate(kernel, mock);
    templates['diligence'] = { ...dil, rubric: { id: 'rub_profile_v3', criteria: [{ id: 'coverage', text: 'Every company has revenue, headcount, and last funding with sources.' }, { id: 'consistency', text: 'Figures are in the same currency and fiscal basis.' }, { id: 'evidence', text: 'Every number resolves to a source span.' }], min_score: 0.9, max_revisions: 3 }, description: 'Demo: comparative diligence memo on 40 fictional companies (mock data)', match: (g) => (/\b(diligence|compan|memo|revenue|headcount)/i.test(g) ? 3 : 0), default_budget_usd: 60 };
  } else {
    registerDemoTools(kernel);
  }
  // Outbound mail is registered in both modes so Tier 3 approvals can be exercised; it never sends anywhere real.
  if (!kernel.tools.has('mail.send')) registerDemoTools(kernel);

  const server = createApiServer(kernel, templates, {
    workspace_id: env['MERIDIAN_WORKSPACE_ID'] ?? 'ws_local',
    workspace_label: env['MERIDIAN_LABEL'] ?? 'Local workspace',
    provider_label: live ? 'Claude fleet (live)' : 'Mock fleet (no API key)',
    static_dir: resolve(here, '../../web'),
    reviewer: { id: env['MERIDIAN_USER'] ?? 'user:owner', roles: ['workspace:owner'] },
    files: () => listWorkspaceFiles(workspaceDir),
  });
  return { kernel, server, templates, workspaceDir, live };
}

if (process.argv[1]?.endsWith('main.ts') || process.argv[1]?.endsWith('main.js')) {
  const { server, workspaceDir, live } = await buildApp();
  const port = Number(process.env['PORT'] ?? 8787);
  server.listen(port, () => {
    console.log(`Meridian · http://localhost:${port}`);
    console.log(`  models:    ${live ? 'Claude fleet (ANTHROPIC_API_KEY set)' : 'mock fleet (set ANTHROPIC_API_KEY for live models)'}`);
    console.log(`  workspace: ${workspaceDir}`);
  });
}
