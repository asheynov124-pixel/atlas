/**
 * The design lint on every screen: colors, radii, weights, touch targets, names, verb
 * colors, one gradient per view, no sideways scroll. A failure lists each element and
 * what's wrong with it.
 */
import { expect, test } from '../support/app';
import { lint, loadRules } from '../support/lint';
import { SCREENS } from '../support/screens';

const rules = loadRules();

for (const screen of SCREENS) {
  test(`${screen.name} follows Night Glass`, async ({ app }, info) => {
    test.skip(!(screen.projects ?? ['phone']).includes(info.project.name as 'phone'), 'not checked at this size');
    await screen.setup(app);
    const problems = await lint(app.page, rules);
    expect(problems, `\n${problems.join('\n')}\n`).toEqual([]);
  });
}

test('the lint catches what it should', async ({ app }, info) => {
  test.skip(info.project.name !== 'phone', 'one size is enough');
  await app.open();
  // Plant four violations and make sure each one is reported.
  await app.page.evaluate(() => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;top:120px;left:20px;z-index:999;display:flex;gap:8px';
    host.innerHTML =
      '<button style="background:#ff0000;width:60px;height:40px">Red</button>' +
      '<span style="color:#34d399">Green text</span>' +
      '<button style="width:20px;height:20px;border-radius:7px"></button>' +
      '<button class="btn btn--primary">One</button><button class="btn btn--primary">Two</button>';
    document.body.appendChild(host);
  });
  const problems = (await lint(app.page, rules)).join('\n');
  expect(problems).toContain('isn’t a Night Glass token');
  expect(problems).toContain('uses a verb color without data-verb');
  expect(problems).toContain('corner radius 7px');
  expect(problems).toContain('smaller than 32px');
  expect(problems).toContain('has no accessible name');
  expect(problems).toContain('gradient buttons on screen');
});
