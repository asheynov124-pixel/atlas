# Prompt Studio

Turn a rough idea into a clear, structured prompt. Type a goal (and, if you like, an audience,
constraints and the output you want); the prompt builds itself as you type. Copy it, or save it as a
named draft that stays in your browser.

No accounts, no server, no AI service, no tracking, no downloads. Plain HTML, CSS and JavaScript.

## Launch it

**Option 1 — just open the file.** Double-click `prompt-studio/index.html`. It opens in your browser
and works fully, saving included.

**Option 2 — a local web server** (closer to how a real website behaves):

```bash
cd prompt-studio
python3 -m http.server 8000
```

Then open <http://localhost:8000> in your browser. Press `Ctrl+C` in the terminal to stop it.

> To try it on an iPhone, run Option 2 on a computer on the same Wi-Fi, then open
> `http://<your computer's local IP>:8000` in Safari. Drafts saved on the phone stay on the phone.

## Test it

You need [Node.js](https://nodejs.org) 18 or newer. No packages to install.

```bash
cd prompt-studio
npm test
```

That runs 22 checks on prompt assembly, draft naming and saving, and damaged-data handling.

**Optional browser check** (34 checks that click through the real app in Chromium, including
storage and clipboard failures, keyboard use and the phone layout). It needs Playwright, which the app
itself does not:

```bash
cd prompt-studio
npm install --no-save playwright && npx playwright install chromium
node tests/browser-check.cjs
```

Screenshots land in `tests/screenshots/`.

## What's where

| File | In plain English |
|---|---|
| `index.html` | The page: the four fields, the preview, the save box, the drafts list and the "are you sure?" dialog. |
| `styles.css` | How it looks. All colours are at the top, in one place. |
| `js/prompt.js` | **Builds the prompt.** Takes the four fields, returns the text. Knows nothing about the page — that's why it can be tested alone. |
| `js/drafts.js` | **The rules for drafts.** What counts as a valid name, how to add, update or delete a draft, and how to read saved data safely when it's damaged. |
| `js/storage.js` | **Saving.** The only file that touches the browser's storage. Never crashes; always reports whether a save really worked. |
| `js/state.js` | **What the app currently knows** (the text typed, which draft is open, the saved list) and whether there are unsaved changes. |
| `js/app.js` | **The glue.** Draws the screen from the state, and turns clicks and typing into changes. |
| `tests/prompt.test.js` | Tests for prompt building. |
| `tests/drafts.test.js` | Tests for draft rules and saving, including storage that refuses to save. |
| `tests/browser-check.cjs` | The optional click-through check described above. |

The scripts load in the order listed in `index.html`; each uses the ones before it.

## How saving behaves

- **Save draft** stores a new draft. Once a draft is open, the button becomes **Update draft**
  (changes that draft in place) and **Save as new** appears (keeps the original, saves a copy).
- Two drafts can't share a name (capital letters and extra spaces don't count as different), so
  nothing is ever overwritten by accident.
- Opening another draft, or starting a new one, warns you first if you have unsaved changes. So does
  closing the tab.
- Drafts live in this browser's local storage. Clearing site data deletes them; a different browser
  or device won't see them.
- If saved data is ever damaged, Prompt Studio keeps a copy under the storage key
  `promptStudio.drafts.v1.backup` rather than deleting it, and tells you.
- Keyboard: `Ctrl+S` / `⌘S` saves; `Enter` in the name box saves; `Esc` closes a warning.
