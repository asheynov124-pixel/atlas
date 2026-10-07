/**
 * services · vitest config for the content audit (OWNER: services). The project config only collects tests/**;
 * run this one with: npx vitest run -c src/content/meshes/services/vitest.config.ts
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: decodeURIComponent(new URL('../../../..', import.meta.url).pathname),
  test: { environment: 'node', include: ['src/content/meshes/services/**/*.test.ts'] },
});
