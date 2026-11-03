/**
 * Meridian app entry. Picks the model fleet from the environment, opens the firm database,
 * and serves the Canvas Workspace and API on 127.0.0.1 (set MERIDIAN_HOST=0.0.0.0 to share
 * on the firm network).
 *
 *   ANTHROPIC_API_KEY      live Claude fleet (Opus 5.5 / Sonnet 5.5 / Haiku 5.5) and OCR of scanned pages
 *   COURTLISTENER_TOKEN    search and import published opinions from CourtListener
 *   MERIDIAN_DATA          where the database and matter files live (default ./.meridian-data)
 *   MERIDIAN_WORKSPACE     use this folder as the sample matter's documents
 *   MERIDIAN_COMMUNITY_DIR shared folder for community workflows (default ./community)
 *   PORT, MERIDIAN_HOST    default 8787 on 127.0.0.1
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MockProvider } from '../models/mock.js';
import { installMockHandlers } from './mockHandlers.js';
import { createApiServer } from '../api/server.js';
import { Firm } from '../firm/firm.js';
import type { ModelProvider } from '../models/provider.js';

export async function buildApp(env: NodeJS.ProcessEnv = process.env) {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, '../..');
  const live = !!env['ANTHROPIC_API_KEY'];
  let provider: ModelProvider;
  if (live) { const { AnthropicProvider } = await import('../models/anthropic.js'); provider = new AnthropicProvider(); }
  else provider = installMockHandlers(new MockProvider());
  const firm = new Firm({
    dataDir: resolve(env['MERIDIAN_DATA'] ?? resolve(root, '.meridian-data')),
    provider, providerLabel: live ? 'Claude fleet (live)' : 'Mock fleet (no API key)',
    sampleDir: resolve(root, 'workspace/sample-matter'),
    ...(env['MERIDIAN_WORKSPACE'] ? { legacyWorkspace: resolve(env['MERIDIAN_WORKSPACE']) } : {}),
    communityDir: resolve(env['MERIDIAN_COMMUNITY_DIR'] ?? resolve(root, 'community')),
    concurrency: Number(env['MERIDIAN_CONCURRENCY'] ?? 8),
    watchFolders: env['MERIDIAN_WATCH'] !== 'off',
    ...(env['COURTLISTENER_TOKEN'] ? { courtListenerToken: env['COURTLISTENER_TOKEN'] } : {}),
  });
  const server = createApiServer(firm, { static_dir: resolve(root, 'web') });
  return { firm, server, live };
}

if (process.argv[1]?.endsWith('main.ts') || process.argv[1]?.endsWith('main.js')) {
  const { firm, server, live } = await buildApp();
  const port = Number(process.env['PORT'] ?? 8787);
  const host = process.env['MERIDIAN_HOST'] ?? '127.0.0.1';
  server.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`\nPort ${port} is already in use, most likely by an older copy of Meridian.`);
      console.error('Find the Terminal window where it is running and press Control-C, or run:');
      console.error(`  lsof -ti tcp:${port} | xargs kill`);
      console.error('then run npm start again.\n');
      process.exit(1);
    }
    throw e;
  });
  server.listen(port, host, () => {
    console.log(`Meridian · http://localhost:${port}`);
    console.log(`  models:        ${live ? 'Claude fleet (ANTHROPIC_API_KEY set)' : 'mock fleet (set ANTHROPIC_API_KEY for live models and OCR)'}`);
    console.log(`  case law:      ${firm.agent.cl.enabled ? 'CourtListener connected' : 'local library (set COURTLISTENER_TOKEN to search CourtListener)'}`);
    console.log(`  data:          ${firm.dataDir}`);
    console.log(firm.needsSetup() ? '  first run:     open the link above to create the admin account' : `  matters:       ${firm.allMatters().length}`);
  });
  const stop = async () => { server.close(); await firm.close(); process.exit(0); };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}
