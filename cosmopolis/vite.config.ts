/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build` → dist/ (PWA, multi-file).  `vite build --mode single` → dist-single/index.html (everything inlined).
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: [preact(), ...(single ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
    define: { __SINGLE_FILE__: JSON.stringify(single) },
    build: {
      target: ['es2020', 'safari15'],
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 6000,
      assetsInlineLimit: single ? 100_000_000 : 4096,
      copyPublicDir: !single,
      sourcemap: false,
    },
    server: { host: true, port: 5173, fs: { strict: false } },
    preview: { host: true, port: 4173 },
    test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  };
});
