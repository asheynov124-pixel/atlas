import { defineConfig } from '@playwright/test';

// Acceptance checks run against the production build (npm run build && preview), so the
// service worker, chunking and print styles are the ones Sonny gets.
const port = Number(process.env.PORT ?? 4173);
const external = process.env.BASE_URL;

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: external ?? `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
  },
  webServer: external
    ? undefined
    : {
        command: `npm run build && npx vite preview --port ${port} --strictPort --host 127.0.0.1`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: true,
        timeout: 240_000,
      },
  projects: [
    { name: 'laptop', use: { viewport: { width: 1440, height: 900 } } },
    {
      name: 'iphone',
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      },
    },
  ],
});
