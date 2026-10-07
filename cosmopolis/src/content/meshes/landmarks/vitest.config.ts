/**
 * landmarks · vitest config for the content audit (OWNER: landmarks). The project config only collects tests/**;
 * run this one with: npx vitest run -c src/content/meshes/landmarks/vitest.config.ts
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: decodeURIComponent(new URL('../../../..', import.meta.url).pathname),
  test: { environment: 'node', include: ['src/content/meshes/landmarks/**/*.test.ts'] },
});
