/*
 * Optional end-to-end check that drives the real app in Chromium.
 * NOT needed to use Prompt Studio, and not part of `npm test`.
 *
 * Needs Playwright:   npm install --no-save playwright && npx playwright install chromium
 * Run:                node tests/browser-check.cjs
 *
 * It starts a local server, runs every check, prints PASS/FAIL for each,
 * saves screenshots to tests/screenshots/, and exits non-zero on any failure.
 */
const { chromium, devices } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8765;
const URL = `http://127.0.0.1:${PORT}/index.html`;
const KEY = 'promptStudio.drafts.v1';
const SHOTS = path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('PASS  ' + name);
  } catch (error) {
    results.push({ name, ok: false, error: error.message.split('\n')[0] });
    console.log('FAIL  ' + name + '\n      ' + error.message.split('\n')[0]);
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function newPage(browser, { init, device, viewport, reducedMotion } = {}) {
  const context = await browser.newContext({
    ...(device ? devices[device] : { viewport: viewport || { width: 1280, height: 860 } }),
    reducedMotion: reducedMotion || 'no-preference',
  });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()));
  page.on('dialog', (d) => d.accept()); // beforeunload on reload
  await page.goto(URL);
  return { context, page };
}

const preview = (page) => page.locator('#preview-text').innerText();
const storedDrafts = (page) =>
  page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw).drafts : [];
  }, KEY);
const listNames = (page) => page.locator('#drafts-list .draft-name').allInnerTexts();

async function fill(page, { goal, audience, constraints, output }) {
  if (goal !== undefined) await page.fill('#field-goal', goal);
  if (audience !== undefined) await page.fill('#field-audience', audience);
  if (constraints !== undefined) await page.fill('#field-constraints', constraints);
  if (output !== undefined) await page.fill('#field-output', output);
}

// A <dialog>'s "close" event is delivered a moment after the click, so
// wait for the dialog to shut and that event to be handled before checking.
async function answerDialog(page, choice) {
  await page.click(choice === 'confirm' ? '#confirm-ok' : '#confirm-cancel');
  await page.waitForFunction(() => !document.getElementById('confirm-dialog').open);
  await page.waitForTimeout(80);
}

async function confirmIfAsked(page) {
  const asked = await page.locator('#confirm-dialog[open]').waitFor({ timeout: 400 }).then(() => true, () => false);
  if (asked) await answerDialog(page, 'confirm');
}

async function saveAs(page, name) {
  await page.fill('#draft-name', name);
  await page.click('#save-btn');
}

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();

  try {
    // ============================================================ core workflow
    const { context, page } = await newPage(browser);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${PORT}` });

    await check('Empty goal: Copy is disabled and the hint explains why', async () => {
      assert(await page.locator('#copy-btn').isDisabled(), 'copy button should be disabled');
      assert(await page.locator('#copy-hint').isVisible(), 'hint should be visible');
      assert(await page.locator('#preview-text').isHidden(), 'preview text should be hidden');
    });

    await check('Typing a goal updates the preview live and enables Copy', async () => {
      await page.locator('#field-goal').pressSequentially('Plan a team offsite');
      assert((await preview(page)) === '## Goal\nPlan a team offsite', 'preview was: ' + (await preview(page)));
      assert(await page.locator('#copy-btn').isEnabled(), 'copy should be enabled');
      assert(await page.locator('#copy-hint').isHidden(), 'hint should be hidden');
    });

    await check('Optional fields appear when filled; the empty one is omitted', async () => {
      await fill(page, { audience: 'A 12-person design team', output: 'A one-page agenda' });
      const text = await preview(page);
      assert(text.includes('## Audience\nA 12-person design team'), 'audience missing');
      assert(text.includes('## Desired output\nA one-page agenda'), 'output missing');
      assert(!text.includes('Constraints'), 'empty Constraints heading shown');
    });

    await check('Copy Prompt puts exactly the preview text on the clipboard and says so', async () => {
      await page.click('#copy-btn');
      await page.locator('#copy-status.is-success').waitFor();
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      assert(clip === (await preview(page)), 'clipboard differs from preview');
    });

    await check('Empty draft name is refused with an explanation, and nothing is saved', async () => {
      await page.fill('#draft-name', '   ');
      await page.click('#save-btn');
      assert(await page.locator('#name-error').isVisible(), 'no name error');
      assert((await page.getAttribute('#draft-name', 'aria-invalid')) === 'true', 'aria-invalid not set');
      assert((await page.evaluate(() => document.activeElement.id)) === 'draft-name', 'focus not on name');
      assert((await storedDrafts(page)).length === 0, 'something was saved');
    });

    await check('Saving a named draft stores it and lists it', async () => {
      await saveAs(page, 'Offsite plan');
      await page.locator('#save-status.is-success').waitFor();
      assert((await listNames(page)).join() === 'Offsite plan', 'list: ' + (await listNames(page)));
      assert((await storedDrafts(page)).length === 1, 'not in localStorage');
      assert((await page.innerText('#save-pill')) === 'All changes saved', 'pill: ' + (await page.innerText('#save-pill')));
      assert((await page.innerText('#save-btn')) === 'Update draft', 'button did not switch to Update');
    });

    await check('After a refresh the draft is still there and reopens with every field', async () => {
      await page.reload();
      assert((await listNames(page)).join() === 'Offsite plan', 'draft gone after reload');
      await page.click('#drafts-list button[data-action="open"]');
      assert((await page.inputValue('#field-goal')) === 'Plan a team offsite', 'goal not restored');
      assert((await page.inputValue('#field-audience')) === 'A 12-person design team', 'audience not restored');
      assert((await page.inputValue('#field-output')) === 'A one-page agenda', 'output not restored');
      assert((await page.inputValue('#draft-name')) === 'Offsite plan', 'name not restored');
    });

    await check('Editing marks unsaved changes; Update draft saves in place (no duplicate)', async () => {
      await fill(page, { constraints: 'Budget under $2,000' });
      assert((await page.innerText('#save-pill')) === 'Unsaved changes', 'pill not dirty');
      await page.click('#save-btn');
      await page.locator('#save-status.is-success').waitFor();
      const saved = await storedDrafts(page);
      assert(saved.length === 1, 'expected 1 draft, got ' + saved.length);
      assert(saved[0].fields.constraints === 'Budget under $2,000', 'update not stored');
      assert((await page.innerText('#save-pill')) === 'All changes saved', 'pill not clean');
    });

    await check('Save as new with the same name is refused; a new name creates a separate copy', async () => {
      await page.click('#save-new-btn');
      assert((await page.innerText('#name-error')).includes('already have a draft called'), 'no duplicate error');
      assert((await storedDrafts(page)).length === 1, 'duplicate was saved');
      await page.fill('#draft-name', 'Offsite plan v2');
      await page.fill('#field-goal', 'Plan a two-day team offsite');
      await page.click('#save-new-btn');
      await page.locator('#save-status.is-success').waitFor();
      const saved = await storedDrafts(page);
      assert(saved.length === 2, 'expected 2 drafts');
      const original = saved.find((d) => d.name === 'Offsite plan');
      assert(original.fields.goal === 'Plan a team offsite', 'original was overwritten');
    });

    await check('Saving with an empty goal is refused with an explanation', async () => {
      await page.fill('#field-goal', '');
      await page.click('#save-btn');
      assert(await page.locator('#goal-error').isVisible(), 'no goal error');
      assert((await page.evaluate(() => document.activeElement.id)) === 'field-goal', 'focus not on goal');
      const v2 = (await storedDrafts(page)).find((d) => d.name === 'Offsite plan v2');
      assert(v2.fields.goal === 'Plan a two-day team offsite', 'empty goal was saved');
    });

    await check('Opening another draft with unsaved edits warns; "Keep editing" keeps them', async () => {
      await page.fill('#field-goal', 'Half-finished thought');
      await page.click('#drafts-list button[data-action="open"]');
      await page.locator('#confirm-dialog[open]').waitFor();
      assert((await page.innerText('#confirm-title')) === 'Discard unsaved changes?', 'wrong dialog');
      assert((await page.evaluate(() => document.activeElement.id)) === 'confirm-cancel', 'safe button not focused');
      await answerDialog(page, 'cancel');
      assert((await page.inputValue('#field-goal')) === 'Half-finished thought', 'edits lost');
    });

    await check('"Discard and open" replaces the edits with the chosen draft', async () => {
      await page.click('#drafts-list button[data-action="open"]');
      await answerDialog(page, 'confirm');
      assert((await page.inputValue('#field-goal')) === 'Plan a team offsite', 'other draft not opened');
      assert((await page.innerText('#editing-label')) === 'Editing “Offsite plan”', 'label wrong');
    });

    await check('Esc closes the warning, keeps the edits, and returns focus', async () => {
      await page.fill('#field-goal', 'Edited again');
      const opener = page.locator('#drafts-list button[data-action="open"]');
      await opener.focus();
      await page.keyboard.press('Enter');
      await page.locator('#confirm-dialog[open]').waitFor();
      await page.keyboard.press('Escape');
      assert(!(await page.locator('#confirm-dialog').evaluate((d) => d.open)), 'dialog still open');
      assert((await page.inputValue('#field-goal')) === 'Edited again', 'edits lost');
      assert((await page.evaluate(() => document.activeElement.dataset.action)) === 'open', 'focus not returned');
    });

    await check('New draft warns about unsaved edits, then clears the editor', async () => {
      await page.click('#new-draft');
      await page.locator('#confirm-dialog[open]').waitFor();
      await answerDialog(page, 'confirm');
      for (const id of ['#field-goal', '#field-audience', '#field-constraints', '#field-output', '#draft-name']) {
        assert((await page.inputValue(id)) === '', id + ' not cleared');
      }
      assert((await page.innerText('#editing-label')) === 'New draft', 'label wrong');
      assert((await page.evaluate(() => document.activeElement.id)) === 'field-goal', 'focus not on goal');
      assert((await storedDrafts(page)).length === 2, 'saved drafts affected');
    });

    await check('New draft with nothing to lose does not ask', async () => {
      await page.click('#new-draft');
      assert(!(await page.locator('#confirm-dialog').evaluate((d) => d.open)), 'dialog opened needlessly');
    });

    await check('Delete asks first; Cancel keeps the draft', async () => {
      await page.locator('#drafts-list button[data-action="delete"]').first().click();
      await page.locator('#confirm-dialog[open]').waitFor();
      assert((await page.innerText('#confirm-title')).startsWith('Delete “'), 'wrong dialog');
      await answerDialog(page, 'cancel');
      assert((await storedDrafts(page)).length === 2, 'deleted despite cancel');
    });

    await check('Confirmed delete removes it from the list and from storage', async () => {
      const name = await page.locator('#drafts-list .draft-name').first().innerText();
      await page.locator('#drafts-list button[data-action="delete"]').first().click();
      await answerDialog(page, 'confirm');
      assert(!(await listNames(page)).includes(name), 'still listed');
      assert(!(await storedDrafts(page)).some((d) => d.name === name), 'still stored');
      const focused = await page.evaluate(() => document.activeElement.tagName + '#' + document.activeElement.id);
      assert(!focused.startsWith('BODY'), 'focus dropped to body');
    });

    await check('Deleting the open draft keeps its text in the editor as an unsaved new draft', async () => {
      await page.click('#drafts-list button[data-action="open"]');
      await page.locator('#drafts-list button[data-action="delete"]').first().click();
      await answerDialog(page, 'confirm');
      assert((await page.inputValue('#field-goal')) === 'Plan a team offsite', 'text lost');
      assert((await page.innerText('#editing-label')) === 'New draft', 'still claims to edit deleted draft');
      assert((await page.innerText('#save-pill')) === 'Not saved', 'pill: ' + (await page.innerText('#save-pill')));
      assert((await storedDrafts(page)).length === 0, 'not deleted');
    });

    await check('Ctrl+S saves', async () => {
      await page.fill('#draft-name', 'Shortcut save');
      await page.focus('#field-goal');
      await page.keyboard.press('Control+s');
      await page.locator('#save-status.is-success').waitFor();
      assert((await storedDrafts(page)).some((d) => d.name === 'Shortcut save'), 'not saved');
    });

    await check('Draft names with HTML are shown as text, not run', async () => {
      await page.fill('#draft-name', '<img src=x onerror="window.__xss=1">');
      await page.click('#save-new-btn');
      await page.locator('#save-status.is-success').waitFor();
      assert((await listNames(page)).includes('<img src=x onerror="window.__xss=1">'), 'name not shown literally');
      assert(!(await page.evaluate(() => window.__xss)), 'markup executed');
    });

    await check('No JavaScript errors during the core workflow', async () => {
      assert(page.errors.length === 0, page.errors.join(' | '));
    });

    await check('Two tabs saving at once do not erase each other’s drafts', async () => {
      const tabB = await context.newPage();
      await tabB.goto(URL);
      await page.click('#new-draft');
      await confirmIfAsked(page);
      await fill(page, { goal: 'From tab A' });
      await fill(tabB, { goal: 'From tab B' });
      await saveAs(page, 'Tab A draft');
      await saveAs(tabB, 'Tab B draft');
      await tabB.locator('#save-status.is-success').waitFor();
      const names = (await storedDrafts(page)).map((d) => d.name);
      assert(names.includes('Tab A draft') && names.includes('Tab B draft'), 'stored: ' + names);
      await page.waitForFunction(() => [...document.querySelectorAll('.draft-name')].some((n) => n.textContent === 'Tab B draft'));
      await tabB.close();
    });

    // ============================================================ keyboard + accessibility
    await check('Keyboard: Tab order follows the screen, and focus is visibly outlined', async () => {
      await page.reload();
      await page.click('#new-draft');
      await confirmIfAsked(page);
      await page.reload();
      await page.evaluate(() => document.activeElement.blur());
      await page.mouse.click(5, 300); // reset focus to the document
      const order = [];
      for (let i = 0; i < 9; i++) {
        await page.keyboard.press('Tab');
        order.push(await page.evaluate(() => document.activeElement.id || document.activeElement.className));
      }
      const expected = ['skip-link', 'new-draft', 'field-goal', 'field-audience', 'field-constraints', 'field-output', 'example-btn', 'draft-name', 'save-btn'];
      assert(order.join() === expected.join(), 'order: ' + order.join());
      await page.focus('#new-draft');
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle + ' ' + getComputedStyle(document.activeElement).outlineWidth);
      assert(outline.startsWith('solid') && !outline.endsWith(' 0px'), 'no visible focus ring: ' + outline);
    });

    await check('Every field has a label and every button has an accessible name', async () => {
      const problems = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('textarea, input').forEach((f) => {
          if (!f.labels || !f.labels.length || !f.labels[0].textContent.trim()) out.push('unlabelled ' + f.id);
          if (f.placeholder && f.labels[0] && f.labels[0].textContent.trim() === f.placeholder) out.push('placeholder as label ' + f.id);
        });
        document.querySelectorAll('button').forEach((b) => {
          const name = (b.getAttribute('aria-label') || b.textContent).trim();
          if (!name) out.push('nameless button ' + (b.id || b.className));
        });
        return out;
      });
      assert(problems.length === 0, problems.join(', '));
    });

    await check('Enter on a saved draft’s Open button works from the keyboard', async () => {
      await page.locator('#drafts-list button[data-action="open"]').first().focus();
      await page.keyboard.press('Enter');
      await confirmIfAsked(page);
      assert((await page.innerText('#editing-label')).startsWith('Editing'), 'did not open');
    });

    await page.screenshot({ path: path.join(SHOTS, 'desktop.png'), fullPage: true });

    await check('Desktop: editor and preview sit side by side', async () => {
      const e = await page.locator('.editor').boundingBox();
      const p = await page.locator('.preview').boundingBox();
      assert(p.x > e.x + e.width - 1 && Math.abs(p.y - e.y) < 5, `editor ${JSON.stringify(e)} preview ${JSON.stringify(p)}`);
    });
    await context.close();

    // ============================================================ narrow screen
    await check('iPhone width: stacked editor → preview → save → drafts, no sideways scroll', async () => {
      const { context: c, page: p } = await newPage(browser, { device: 'iPhone 13' });
      await fill(p, { goal: 'Write a short welcome note for new members', audience: 'Book club members', constraints: 'Under 80 words', output: 'One paragraph' });
      await saveAs(p, 'Welcome note');
      const tops = [];
      for (const s of ['.editor', '.preview', '.save', '.drafts']) tops.push((await p.locator(s).boundingBox()).y);
      assert(tops.every((t, i) => i === 0 || t > tops[i - 1]), 'order wrong: ' + tops);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert(overflow <= 0, 'horizontal overflow of ' + overflow + 'px');
      const fontSize = await p.evaluate(() => getComputedStyle(document.querySelector('#field-goal')).fontSize);
      assert(parseFloat(fontSize) >= 16, 'inputs under 16px cause iOS zoom: ' + fontSize);
      const smallTargets = await p.evaluate(() =>
        [...document.querySelectorAll('button:not([hidden])')]
          .filter((b) => b.offsetParent)
          .map((b) => b.getBoundingClientRect())
          .filter((r) => r.height < 40 || r.width < 40).length
      );
      assert(smallTargets === 0, smallTargets + ' buttons smaller than 40px');
      await p.screenshot({ path: path.join(SHOTS, 'iphone-top.png') });
      await p.screenshot({ path: path.join(SHOTS, 'iphone-full.png'), fullPage: true });
      assert(p.errors.length === 0, p.errors.join(' | '));
      await c.close();
    });

    // ============================================================ failure modes
    await check('Storage write failure: honest error, nothing listed, text kept', async () => {
      const { context: c, page: p } = await newPage(browser, {
        init: () => {
          Storage.prototype.setItem = function () {
            throw new DOMException('Quota exceeded', 'QuotaExceededError');
          };
        },
      });
      assert(await p.locator('#banner').isVisible(), 'no warning banner');
      await fill(p, { goal: 'Will this save?' });
      await saveAs(p, 'Doomed');
      await p.locator('#save-status.is-error').waitFor();
      assert((await p.innerText('#save-status')).includes('Couldn’t save'), 'wrong message');
      assert((await listNames(p)).length === 0, 'claimed success by listing it');
      assert((await p.inputValue('#field-goal')) === 'Will this save?', 'text lost');
      assert((await p.innerText('#editing-label')) === 'New draft', 'claims to be editing a saved draft');
      await p.screenshot({ path: path.join(SHOTS, 'storage-write-failure.png') });
      assert(p.errors.length === 0, p.errors.join(' | '));
      await c.close();
    });

    await check('Storage unavailable: banner explains, saving is disabled, prompts still work', async () => {
      const { context: c, page: p } = await newPage(browser, {
        init: () => {
          Object.defineProperty(window, 'localStorage', {
            get() {
              throw new DOMException('Blocked', 'SecurityError');
            },
          });
        },
      });
      assert((await p.innerText('#banner-text')).includes('blocking storage'), 'no banner');
      assert(await p.locator('#save-btn').isDisabled(), 'save not disabled');
      await fill(p, { goal: 'Still useful' });
      assert((await preview(p)) === '## Goal\nStill useful', 'preview broken');
      assert(p.errors.length === 0, p.errors.join(' | '));
      await c.close();
    });

    await check('Malformed saved data: no crash, explained, backed up, saving still works', async () => {
      const { context: c, page: p } = await newPage(browser);
      await p.evaluate((k) => localStorage.setItem(k, '{"version":1,"drafts":[{oops'), KEY);
      await p.reload();
      assert((await p.innerText('#banner-text')).includes('couldn’t be read'), 'no explanation');
      const backup = await p.evaluate((k) => localStorage.getItem(k + '.backup'), KEY);
      assert(backup === '{"version":1,"drafts":[{oops', 'not backed up');
      await fill(p, { goal: 'Fresh start' });
      await saveAs(p, 'After corruption');
      await p.locator('#save-status.is-success').waitFor();
      assert((await storedDrafts(p)).length === 1, 'could not save after corruption');
      assert(p.errors.length === 0, p.errors.join(' | '));
      await c.close();
    });

    await check('Partly damaged saved data: good drafts load, bad ones are counted', async () => {
      const { context: c, page: p } = await newPage(browser);
      await p.evaluate((k) => {
        localStorage.setItem(
          k,
          JSON.stringify({
            version: 1,
            drafts: [
              { id: 'good', name: 'Good one', fields: { goal: 'Fine' }, createdAt: 1, updatedAt: 1 },
              { id: 'bad', name: 'Bad one', fields: { goal: { nested: true } } },
              'garbage',
            ],
          })
        );
      }, KEY);
      await p.reload();
      assert((await listNames(p)).join() === 'Good one', 'list: ' + (await listNames(p)));
      assert((await p.innerText('#banner-text')).startsWith('2 saved drafts were damaged'), await p.innerText('#banner-text'));
      await c.close();
    });

    await check('Clipboard failure: prompt is selected and the message explains manual copy', async () => {
      const { context: c, page: p } = await newPage(browser, {
        init: () => {
          Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } });
          document.execCommand = () => false;
        },
      });
      await fill(p, { goal: 'Copy me by hand', output: 'Plain text' });
      await p.click('#copy-btn');
      await p.locator('#copy-status.is-error').waitFor();
      assert((await p.innerText('#copy-status')).includes('press Ctrl+C'), 'no manual-copy instructions');
      const selected = await p.evaluate(() => window.getSelection().toString());
      assert(selected === (await preview(p)), 'preview not selected: ' + JSON.stringify(selected));
      await p.screenshot({ path: path.join(SHOTS, 'clipboard-failure.png') });
      await c.close();
    });

    await check('Reduced motion: transitions and dialog animation are switched off', async () => {
      const { context: c, page: p } = await newPage(browser, { reducedMotion: 'reduce' });
      const btn = await p.evaluate(() => getComputedStyle(document.querySelector('.btn')).transitionDuration);
      await fill(p, { goal: 'x' });
      await saveAs(p, 'Motion');
      await p.fill('#field-goal', 'changed');
      await p.click('#new-draft');
      const dlg = await p.evaluate(() => getComputedStyle(document.querySelector('#confirm-dialog')).animationDuration);
      assert(parseFloat(btn) < 0.001 && parseFloat(dlg) < 0.001, `button ${btn}, dialog ${dlg}`);
      await c.close();
    });

    await check('Opening index.html directly from disk (file://) works', async () => {
      const c = await browser.newContext();
      const p = await c.newPage();
      const errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      await p.goto('file://' + path.join(ROOT, 'index.html'));
      await p.fill('#field-goal', 'Offline');
      assert((await p.locator('#preview-text').innerText()) === '## Goal\nOffline', 'app did not start');
      assert(errors.length === 0, errors.join(' | '));
      await c.close();
    });
  } finally {
    await browser.close();
    server.kill();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
})();
