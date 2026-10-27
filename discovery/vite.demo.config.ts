// Build of the app for hosting as a shareable demo page (no service worker,
// React from the cdnjs UMD build, unminified so the bundle stays reviewable).
//   npx vite build --config vite.demo.config.ts   →  dist-demo/
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const shim = (f: string) => fileURLToPath(new URL(`./demo/shims/${f}`, import.meta.url));

export default defineConfig({
  base: './',
  root: 'demo',
  plugins: [react()],
  define: { 'import.meta.env.VITE_EMBED': JSON.stringify('1') },
  resolve: {
    alias: [
      { find: /^react\/jsx-runtime$/, replacement: shim('jsx-runtime.js') },
      { find: /^react\/jsx-dev-runtime$/, replacement: shim('jsx-runtime.js') },
      { find: /^react-dom\/client$/, replacement: shim('react-dom-client.js') },
      { find: /^react$/, replacement: shim('react.js') },
      { find: /^virtual:pwa-register$/, replacement: shim('pwa-register.js') },
    ],
  },
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
    minify: false,
    modulePreload: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: { entryFileNames: 'app.js', assetFileNames: 'app[extname]', inlineDynamicImports: true },
    },
  },
});
