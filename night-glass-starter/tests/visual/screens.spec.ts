/**
 * Screenshot baselines: every screen in tests/support/screens.ts at each size it lists.
 * A change that moves pixels fails here until you look at it and accept it
 * (`npm run visual:update`, then commit the new images with a reason).
 */
import { expect, test } from '../support/app';
import { SCREENS } from '../support/screens';

for (const screen of SCREENS) {
  test(`${screen.name} matches its baseline`, async ({ app }, info) => {
    test.skip(!(screen.projects ?? ['phone']).includes(info.project.name as 'phone'), 'not captured at this size');
    await screen.setup(app);
    await expect(app.page).toHaveScreenshot(`${screen.name}.png`);
  });
}
