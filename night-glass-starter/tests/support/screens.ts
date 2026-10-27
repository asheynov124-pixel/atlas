/**
 * The screens the visual checks cover. The screenshot test and the design lint walk
 * the same list, so a screen you add here gets both. Add one for every new screen or
 * state you build.
 */
import { expect } from '@playwright/test';
import { NOW, type App, type Seed } from './app';

export interface Screen {
  name: string;
  /** Projects (screen sizes) to capture it at. Default: phone only. */
  projects?: ('phone' | 'small' | 'tablet')[];
  setup: (app: App) => Promise<void>;
}

const ago = (minutes: number) => NOW - minutes * 60_000;

/** A library with something in it: three saves, two likes, one pass. */
export const LIVED_IN: Seed = {
  saves: [
    { id: 'c3', at: ago(3) },
    { id: 'c8', at: ago(42) },
    { id: 'c12', at: ago(60 * 26) },
  ],
  judgments: { c1: 'like', c2: 'pass', c8: 'like' },
  history: [
    { id: 'c8', at: ago(42) },
    { id: 'c3', at: ago(3) },
  ],
};

const ALL = ['phone', 'small', 'tablet'] as const;

export const SCREENS: Screen[] = [
  {
    name: 'welcome',
    projects: [...ALL],
    setup: async (app) => {
      await app.open({ onboarded: false });
      await expect(app.page.getByRole('dialog', { name: 'Night Glass Starter' })).toBeVisible();
    },
  },
  {
    name: 'feed',
    projects: [...ALL],
    setup: async (app) => {
      await app.open();
      await expect(app.feedPosition).toHaveText('1/40');
    },
  },
  {
    name: 'feed-dragging-like',
    setup: async (app) => {
      await app.open();
      await app.drag(90, 6, { release: false });
      await expect(app.page.locator('.feedback[data-intent="like"]')).toBeAttached();
    },
  },
  {
    name: 'feed-overlay-hidden',
    setup: async (app) => {
      await app.open();
      await app.page.keyboard.press(' ');
      await expect(app.page.locator('.pathbar--hidden')).toBeAttached();
      await app.page.waitForTimeout(450);
    },
  },
  {
    name: 'toast-with-undo',
    setup: async (app) => {
      await app.open();
      await app.page.keyboard.press('ArrowRight');
      await expect(app.page.locator('.toast', { hasText: 'Liked' })).toBeVisible();
      await app.page.waitForTimeout(450);
    },
  },
  {
    name: 'action-sheet',
    projects: [...ALL],
    setup: async (app) => {
      await app.open();
      await app.page.getByRole('button', { name: 'More', exact: true }).click();
      await expect(app.page.locator('.sheet')).toBeVisible();
      await app.page.waitForTimeout(400);
    },
  },
  {
    name: 'gestures-sheet',
    setup: async (app) => {
      await app.open();
      await app.page.getByRole('button', { name: 'How swiping works' }).click();
      await expect(app.page.locator('.sheet')).toBeVisible();
      await app.page.waitForTimeout(400);
    },
  },
  {
    name: 'feed-end',
    setup: async (app) => {
      await app.open({ saves: [{ id: 'c3', at: ago(3) }] });
      await app.tab('Library');
      await app.page.getByRole('button', { name: 'Play as feed' }).click();
      await app.page.keyboard.press('ArrowDown');
      await expect(app.page.getByRole('heading', { name: 'You’re all caught up' })).toBeVisible();
      await app.page.waitForTimeout(400);
    },
  },
  {
    name: 'library',
    projects: [...ALL],
    setup: async (app) => {
      await app.open(LIVED_IN);
      await app.tab('Library');
      await expect(app.page.locator('.tile')).toHaveCount(3);
    },
  },
  {
    name: 'library-empty',
    setup: async (app) => {
      await app.open();
      await app.tab('Library');
      await expect(app.page.getByRole('heading', { name: 'Nothing saved yet' })).toBeVisible();
    },
  },
  {
    name: 'search',
    setup: async (app) => {
      await app.open();
      await app.tab('Search');
      await expect(app.page.getByText('40 results')).toBeVisible();
    },
  },
  {
    name: 'search-empty',
    setup: async (app) => {
      await app.open();
      await app.tab('Search');
      await app.page.getByRole('searchbox').fill('zzzz');
      await expect(app.page.getByRole('heading', { name: 'Nothing matches' })).toBeVisible();
    },
  },
  {
    name: 'you',
    setup: async (app) => {
      await app.open(LIVED_IN);
      await app.tab('You');
      await expect(app.page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    },
  },
];

export const screensFor = (project: string) => SCREENS.filter((s) => (s.projects ?? ['phone']).includes(project as 'phone'));
