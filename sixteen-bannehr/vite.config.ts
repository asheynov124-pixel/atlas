/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Font subsets the book never uses; leaving them out keeps the offline cache small.
const unusedSubsets = ['cyrillic', 'cyrillic-ext', 'greek', 'greek-ext', 'vietnamese'];

// `vite build --mode artifact` makes the claude.ai artifact: relative asset paths, no
// service worker (the viewer refuses them) and no public/ files, into dist-artifact/.
export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact';
  return {
    base: artifact ? './' : '/',
    publicDir: artifact ? false : 'public',
    plugins: [
      react(),
      VitePWA({
        disable: artifact,
        registerType: 'autoUpdate',
        injectRegister: false,
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'Sixteen Bannehr',
          short_name: 'Bannehr',
          description: 'A book about a house, in progress.',
          lang: 'en',
          start_url: '.',
          scope: '.',
          display: 'standalone',
          orientation: 'any',
          background_color: '#F5F1EA',
          theme_color: '#8A9A7B',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
          globIgnores: unusedSubsets.map((s) => `**/*-${s}-*.woff2`),
          // Imported photos are cached as they are viewed, not all at install.
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.includes('/photos/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'photos',
                expiration: { maxEntries: 600 },
              },
            },
          ],
          navigateFallback: 'index.html',
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        },
      }),
    ],
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 900,
      outDir: artifact ? 'dist-artifact' : 'dist',
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
