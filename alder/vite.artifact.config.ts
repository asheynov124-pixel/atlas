import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// A single-bundle build used to publish Alder as one self-contained HTML file.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist-artifact',
    chunkSizeWarningLimit: 3000,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true, manualChunks: undefined } },
  },
});
