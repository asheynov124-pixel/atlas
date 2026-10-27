import { defineConfig, devices } from '@playwright/test';

/**
 * Three screen sizes from the Night Glass checklist. Every project runs in Chromium,
 * the browser the screenshot baselines were made with.
 */
const PORT = 4180;

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  // One baseline per screen and size, shared across machines: tests render with a
  // bundled font, a frozen clock and no animation, so a platform suffix isn't needed.
  snapshotPathTemplate: '{testDir}/visual/__screens__/{projectName}/{arg}{ext}',
  // Locally a new screen writes its first baseline; in CI a missing one fails, so it can't skip review.
  updateSnapshots: process.env.CI ? 'none' : 'missing',
  expect: {
    // Strict on purpose: rendering is deterministic, and a 12px→16px button radius moves only
    // 8–114 pixels per screen. A percentage tolerance would let changes like that through.
    toHaveScreenshot: { maxDiffPixels: 4, threshold: 0.2, animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  use: {
    baseURL: `http://localhost:${PORT}/`,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'phone', use: { ...devices['iPhone 14'], browserName: 'chromium' } },
    { name: 'small', use: { ...devices['iPhone SE'], browserName: 'chromium' } },
    { name: 'tablet', use: { browserName: 'chromium', viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
