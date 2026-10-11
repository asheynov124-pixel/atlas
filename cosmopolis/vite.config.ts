/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Single-file build: nothing may be fetched besides the page itself (it runs inside a sandboxed artifact frame with
 * no other files). The icon is inlined as a data: URI; the PWA manifest and touch icon (multi-file PWA only) go.
 */
function singleFileHead(): Plugin {
  return {
    name: 'cosmo-single-head',
    async transformIndexHtml(html) {
      // node:fs through an untyped dynamic import: the app tsconfig (which also checks this file) has no node types
      const fs = (await import('node:fs' as string)) as { readFileSync(p: URL, enc: 'utf8'): string };
      const svg = fs.readFileSync(new URL('./public/icon.svg', import.meta.url), 'utf8');
      const icon = 'data:image/svg+xml,' + encodeURIComponent(svg.trim());
      return html
        .replace(/\s*<link rel="manifest"[^>]*>/, '')
        .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
        .replace(/<link rel="icon" href="[^"]*"/, `<link rel="icon" href="${icon}"`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: [preact(), ...(single ? [singleFileHead(), viteSingleFile({ removeViteModuleLoader: true })] : [])],
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
