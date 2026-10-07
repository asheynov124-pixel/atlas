/**
 * utilities · vitest config for the utilities content audit (OWNER: utilities).
 * Run: npx vitest run -c src/content/meshes/utilities/vitest.config.ts
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['src/content/meshes/utilities/**/*.test.ts'], root: new URL('../../../../', import.meta.url).pathname },
});
