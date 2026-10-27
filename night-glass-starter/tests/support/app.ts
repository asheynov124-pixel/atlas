/**
 * Test helpers: open the app in a known state, drive it with real pointer gestures,
 * and make rendering deterministic for screenshots (one bundled font, a frozen clock).
 */
import { test as base, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const FONT = readFileSync(require.resolve('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')).toString('base64');

/** Every test runs at this moment, so "3m ago" always reads "3m ago". */
export const NOW = new Date('2026-03-14T15:00:00Z').getTime();
export const STORE_KEY = 'night-glass-starter';

/** The persisted parts of the store you can seed (see src/state/store.ts). */
export interface Seed {
  onboarded?: boolean;
  settings?: { haptics?: boolean; classic?: boolean };
  judgments?: Record<string, 'like' | 'pass'>;
  saves?: { id: string; at: number }[];
  history?: { id: string; at: number }[];
}

export class App {
  constructor(readonly page: Page) {}

  /** The card on screen. */
  get card() {
    return this.page.locator('.card:not(.card--prev):not(.card--next)');
  }

  get feedPosition() {
    return this.page.locator('.pathbar__pos');
  }

  /** Open with seeded state (written once, so a reload keeps what the test did). */
  async open(seed: Seed = {}) {
    const state = { onboarded: true, ...seed };
    await this.page.addInitScript(
      ([key, value]) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      },
      [STORE_KEY, JSON.stringify({ state, version: 1 })] as const,
    );
    await this.page.goto('./');
    await this.stabilize();
  }

  /** One bundled font for every machine, so screenshots don't depend on installed fonts. */
  async stabilize() {
    await this.page.addStyleTag({
      content: `@font-face{font-family:'NG Test';src:url(data:font/woff2;base64,${FONT}) format('woff2');font-weight:100 900;font-display:block}
:root{font-family:'NG Test',sans-serif!important}`,
    });
    await this.page.evaluate(() => document.fonts.ready.then(() => undefined));
  }

  async tab(name: 'Feed' | 'Search' | 'Library' | 'You') {
    await this.page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click();
  }

  /**
   * A one-finger drag across the card, the way a thumb does it. `from` defaults to the
   * middle of the screen (a judging swipe); start within 26px of an edge to navigate.
   */
  async drag(dx: number, dy: number, opts: { from?: { x: number; y: number }; steps?: number; release?: boolean } = {}) {
    const vp = this.page.viewportSize()!;
    const { x, y } = opts.from ?? { x: vp.width / 2, y: vp.height * 0.45 };
    const steps = opts.steps ?? 12;
    await this.page.mouse.move(x, y);
    await this.page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      await this.page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
      await this.page.waitForTimeout(16);
    }
    if (opts.release !== false) {
      await this.page.mouse.up();
      await this.page.waitForTimeout(450); // let the card fly and the next one settle
    }
  }

  async longPress(at?: { x: number; y: number }) {
    const vp = this.page.viewportSize()!;
    const { x, y } = at ?? { x: vp.width / 2, y: vp.height * 0.45 };
    await this.page.mouse.move(x, y);
    await this.page.mouse.down();
    await this.page.waitForTimeout(650);
    await this.page.mouse.up();
  }

  async doubleTap(at?: { x: number; y: number }) {
    const vp = this.page.viewportSize()!;
    const { x, y } = at ?? { x: vp.width / 2, y: vp.height * 0.45 };
    for (let i = 0; i < 2; i++) {
      await this.page.mouse.move(x, y);
      await this.page.mouse.down();
      await this.page.waitForTimeout(40);
      await this.page.mouse.up();
      await this.page.waitForTimeout(80);
    }
  }
}

export const test = base.extend<{ app: App }>({
  app: async ({ page }, use) => {
    await page.clock.setFixedTime(NOW);
    await use(new App(page));
  },
});

export { expect };
