/*
 * app.js — RENDERING AND EVENT HANDLING
 *
 * The only file that touches the page. It has three parts:
 *   1. Setup     – find the page elements, load saved drafts, create the state
 *   2. Rendering – draw the screen from the state (render and its helpers)
 *   3. Events    – respond to typing and clicks by changing the state
 *
 * The rules live elsewhere: prompt.js builds the prompt, drafts.js knows
 * what a valid draft is, storage.js saves, state.js holds the data.
 */
(() => {
  'use strict';

  const { prompt: promptLib, drafts: draftLib, storage: storageLib, state: stateLib } = window.PromptStudio;
  const FIELD_KEYS = promptLib.FIELD_KEYS;
  const SECTION_TITLES = Object.fromEntries(promptLib.SECTIONS.map((s) => [s.key, s.title]));

  const EXAMPLE = {
    goal: 'Write a friendly email inviting past customers to our spring open house.',
    audience: 'Customers who bought from us in the last two years but haven’t visited lately.',
    constraints: 'Under 150 words.\nNo discount codes.\nMention the date (April 12), free parking, and coffee from the café next door.',
    output: 'A subject line, then three short paragraphs. Warm and plain-spoken, not salesy.',
  };

  // ================================================================ 1. SETUP

  const byId = (id) => document.getElementById(id);
  const ui = {
    banner: byId('banner'),
    bannerText: byId('banner-text'),
    bannerClose: byId('banner-close'),
    newDraft: byId('new-draft'),
    editorTitle: byId('editor-title'),
    editingLabel: byId('editing-label'),
    fields: Object.fromEntries(FIELD_KEYS.map((key) => [key, byId('field-' + key)])),
    goalError: byId('goal-error'),
    copyBtn: byId('copy-btn'),
    copyHint: byId('copy-hint'),
    copyStatus: byId('copy-status'),
    previewEmpty: byId('preview-empty'),
    previewEmptyText: byId('preview-empty-text'),
    exampleBtn: byId('example-btn'),
    previewText: byId('preview-text'),
    previewMeta: byId('preview-meta'),
    nameInput: byId('draft-name'),
    nameError: byId('name-error'),
    saveBtn: byId('save-btn'),
    saveNewBtn: byId('save-new-btn'),
    saveHelp: byId('save-help'),
    saveStatus: byId('save-status'),
    savePill: byId('save-pill'),
    draftsTitle: byId('drafts-title'),
    draftsCount: byId('drafts-count'),
    draftsStatus: byId('drafts-status'),
    draftsEmpty: byId('drafts-empty'),
    draftsList: byId('drafts-list'),
    dialog: byId('confirm-dialog'),
    dialogTitle: byId('confirm-title'),
    dialogBody: byId('confirm-body'),
    dialogOk: byId('confirm-ok'),
    dialogCancel: byId('confirm-cancel'),
    trashIcon: byId('trash-icon'),
  };

  const draftStore = storageLib.createDraftStore({ getStorage: () => window.localStorage });
  const loaded = draftStore.load();

  const blankBaseline = () => ({ fields: draftLib.emptyFields(), name: '' });

  const store = stateLib.createStore({
    fields: draftLib.emptyFields(),
    name: '',
    currentId: null,
    baseline: blankBaseline(),
    drafts: loaded.drafts,
    canSave: loaded.readable,
  });

  // ================================================================ 2. RENDERING

  function render(state, previous) {
    renderEditorLabel(state);
    renderPreview(state);
    renderSaveArea(state);
    if (!previous || previous.drafts !== state.drafts || previous.currentId !== state.currentId) {
      renderDraftList(state);
    }
  }

  function renderEditorLabel(state) {
    const current = stateLib.currentDraft(state);
    ui.editingLabel.textContent = current ? `Editing “${current.name}”` : 'New draft';
  }

  let lastPreviewText = null;

  function renderPreview(state) {
    const result = promptLib.assemblePrompt(state.fields);

    ui.copyBtn.disabled = !result.ok;
    ui.copyHint.hidden = result.ok;

    if (!result.ok) {
      const othersFilled = result.included.length > 0;
      ui.previewEmpty.hidden = false;
      ui.previewText.hidden = true;
      ui.previewEmptyText.textContent = othersFilled
        ? 'Add a goal to finish your prompt. The other sections you’ve written will appear here with it.'
        : 'Start with a goal. Your prompt builds itself here as you type.';
      ui.exampleBtn.hidden = othersFilled;
      ui.previewMeta.textContent = '';
      lastPreviewText = null;
      return;
    }

    ui.previewEmpty.hidden = true;
    ui.previewText.hidden = false;
    if (result.text !== lastPreviewText) {
      writePreviewText(result.text);
      lastPreviewText = result.text;
    }
    const words = result.text.split(/\s+/).filter(Boolean).length;
    const sections = result.included.map((key) => SECTION_TITLES[key]).join(' · ');
    ui.previewMeta.textContent = `${sections}  —  ${words} ${words === 1 ? 'word' : 'words'}`;
  }

  /** Show the prompt with "## Heading" lines styled. The text itself is unchanged,
   *  so selecting and copying it by hand gives exactly what Copy would. */
  function writePreviewText(text) {
    const fragment = document.createDocumentFragment();
    text.split('\n').forEach((line, index) => {
      if (index > 0) fragment.append('\n');
      if (line.startsWith('## ')) {
        const heading = document.createElement('span');
        heading.className = 'pv-heading';
        const hash = document.createElement('span');
        hash.className = 'pv-hash';
        hash.textContent = '## ';
        heading.append(hash, line.slice(3));
        fragment.append(heading);
      } else {
        fragment.append(line);
      }
    });
    ui.previewText.replaceChildren(fragment);
  }

  const PILL = {
    blank: null,
    'unsaved-new': { text: 'Not saved', cls: 'is-dirty' },
    'unsaved-changes': { text: 'Unsaved changes', cls: 'is-dirty' },
    saved: { text: 'All changes saved', cls: 'is-saved' },
  };

  function renderSaveArea(state) {
    const current = stateLib.currentDraft(state);
    const pill = PILL[stateLib.saveStatus(state)];

    ui.savePill.hidden = !pill;
    if (pill) {
      ui.savePill.textContent = pill.text;
      ui.savePill.className = 'pill ' + pill.cls;
    }

    ui.saveBtn.textContent = current ? 'Update draft' : 'Save draft';
    ui.saveNewBtn.hidden = !current;
    ui.saveBtn.disabled = !state.canSave;
    ui.saveNewBtn.disabled = !state.canSave;

    if (!state.canSave) {
      ui.saveHelp.textContent = 'Saving is turned off because this browser is blocking storage. You can still write and copy prompts.';
    } else if (current) {
      ui.saveHelp.textContent = `Update draft replaces the saved “${current.name}”. Save as new leaves it as it is and saves a separate copy under the name above.`;
    } else {
      ui.saveHelp.textContent = 'Drafts are kept in this browser on this device.';
    }
  }

  function renderDraftList(state) {
    const sorted = draftLib.sortByRecent(state.drafts);
    ui.draftsCount.textContent = sorted.length ? `${sorted.length} ${sorted.length === 1 ? 'draft' : 'drafts'}` : '';
    ui.draftsEmpty.hidden = sorted.length > 0;
    ui.draftsList.replaceChildren(...sorted.map((draft) => draftItem(draft, draft.id === state.currentId)));
  }

  // Built with DOM methods, never innerHTML, so names and text people
  // type can't be interpreted as HTML.
  function draftItem(draft, isCurrent) {
    const item = document.createElement('li');
    item.className = 'draft-item' + (isCurrent ? ' is-current' : '');
    item.dataset.id = draft.id;
    if (isCurrent) item.setAttribute('aria-current', 'true');

    const info = document.createElement('div');
    info.className = 'draft-info';

    const nameRow = document.createElement('div');
    nameRow.className = 'draft-name-row';
    const name = document.createElement('span');
    name.className = 'draft-name';
    name.textContent = draft.name;
    nameRow.append(name);
    if (isCurrent) {
      const badge = document.createElement('span');
      badge.className = 'draft-badge';
      badge.textContent = 'Editing';
      nameRow.append(badge);
    }

    const snippet = document.createElement('span');
    snippet.className = 'draft-snippet';
    snippet.textContent = promptLib.cleanText(draft.fields.goal).replace(/\s+/g, ' ') || 'No goal yet';

    const time = document.createElement('span');
    time.className = 'draft-time';
    time.textContent = 'Updated ' + formatWhen(draft.updatedAt);

    info.append(nameRow, snippet, time);

    const actions = document.createElement('div');
    actions.className = 'draft-actions';
    if (!isCurrent) {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'btn btn-secondary btn-small';
      open.dataset.action = 'open';
      open.textContent = 'Open';
      open.setAttribute('aria-label', `Open draft “${draft.name}”`);
      actions.append(open);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-btn';
    remove.dataset.action = 'delete';
    remove.setAttribute('aria-label', `Delete draft “${draft.name}”`);
    remove.title = 'Delete draft';
    remove.append(ui.trashIcon.content.cloneNode(true));
    actions.append(remove);

    item.append(info, actions);
    return item;
  }

  function formatWhen(timestamp) {
    if (!timestamp) return 'some time ago';
    const seconds = Math.round((timestamp - Date.now()) / 1000);
    const abs = Math.abs(seconds);
    if (abs < 45) return 'just now';
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
    if (abs < 7 * 86400) return rtf.format(Math.round(seconds / 86400), 'day');
    return 'on ' + new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ---------------------------------------------------------------- small UI helpers

  const statusTimers = new Map();

  /** kind: 'success' | 'error' | 'info'. Success messages fade after a few seconds. */
  function showStatus(node, kind, text) {
    clearTimeout(statusTimers.get(node));
    node.className = 'status is-' + kind;
    node.textContent = text;
    if (kind === 'success') {
      statusTimers.set(node, setTimeout(() => clearStatus(node), 5000));
    }
  }

  function clearStatus(node) {
    clearTimeout(statusTimers.get(node));
    node.className = 'status';
    node.textContent = '';
  }

  function setFieldError(input, errorNode, message) {
    errorNode.textContent = message || '';
    errorNode.hidden = !message;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  /** Grow a text box to fit its text, so nothing hides behind a scrollbar. */
  function autosize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 2 + 'px';
  }

  function putFieldsInEditor(fields, name) {
    for (const key of FIELD_KEYS) {
      ui.fields[key].value = fields[key];
      autosize(ui.fields[key]);
    }
    ui.nameInput.value = name;
    setFieldError(ui.fields.goal, ui.goalError, '');
    setFieldError(ui.nameInput, ui.nameError, '');
  }

  /** How the current work is described in warnings. */
  function describeCurrentWork(state) {
    const current = stateLib.currentDraft(state);
    return current ? `“${current.name}”` : 'this new draft';
  }

  /**
   * Ask a yes/no question in a modal dialog. Resolves true only if the
   * person picks the confirm button; Esc, Cancel or a click outside mean no.
   */
  function confirmAction({ title, body, confirmLabel, cancelLabel = 'Cancel', danger = false }) {
    if (typeof ui.dialog.showModal !== 'function') {
      return Promise.resolve(window.confirm(title + '\n\n' + body));
    }
    const returnFocusTo = document.activeElement;
    ui.dialogTitle.textContent = title;
    ui.dialogBody.textContent = body;
    ui.dialogOk.textContent = confirmLabel;
    ui.dialogOk.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
    ui.dialogCancel.textContent = cancelLabel;
    ui.dialog.returnValue = '';

    return new Promise((resolve) => {
      ui.dialog.addEventListener(
        'close',
        () => {
          if (returnFocusTo && document.contains(returnFocusTo)) returnFocusTo.focus();
          resolve(ui.dialog.returnValue === 'confirm');
        },
        { once: true }
      );
      ui.dialog.showModal();
      ui.dialogCancel.focus(); // the safe choice is the default
    });
  }

  // ================================================================ 3. EVENTS

  // ---------------------------------------------------------------- typing

  for (const key of FIELD_KEYS) {
    ui.fields[key].addEventListener('input', (event) => {
      autosize(event.target);
      if (key === 'goal' && event.target.value.trim()) setFieldError(ui.fields.goal, ui.goalError, '');
      clearStatus(ui.copyStatus);
      store.update({ fields: { ...store.get().fields, [key]: event.target.value } });
    });
  }

  ui.nameInput.addEventListener('input', () => {
    setFieldError(ui.nameInput, ui.nameError, '');
    store.update({ name: ui.nameInput.value });
  });

  // Enter in the name box saves, as people expect from a one-line field.
  ui.nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      saveDraft(store.get().currentId ? 'update' : 'create');
    }
  });

  ui.exampleBtn.addEventListener('click', () => {
    const fields = { ...EXAMPLE };
    for (const key of FIELD_KEYS) {
      ui.fields[key].value = fields[key];
      autosize(ui.fields[key]);
    }
    store.update({ fields });
    ui.previewText.focus();
  });

  // ---------------------------------------------------------------- copy

  ui.copyBtn.addEventListener('click', async () => {
    const result = promptLib.assemblePrompt(store.get().fields);
    if (!result.ok) return; // the button is disabled in this case anyway
    const copied = await copyToClipboard(result.text);
    if (copied) {
      showStatus(ui.copyStatus, 'success', 'Copied to clipboard. Paste it wherever you need it.');
    } else {
      selectPreview();
      showStatus(
        ui.copyStatus,
        'error',
        'Your browser didn’t allow copying. The prompt below is selected — press Ctrl+C (⌘C on a Mac) to copy it, or on a phone, press and hold the text and choose Copy.'
      );
    }
  });

  /** Try the modern clipboard first, then the older method. Resolves true/false. */
  async function copyToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        // fall through to the older method
      }
    }
    return legacyCopy(text);
  }

  function legacyCopy(text) {
    const active = document.activeElement;
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;';
    document.body.append(helper);
    helper.select();
    helper.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand('copy') === true;
    } catch (error) {
      ok = false;
    }
    helper.remove();
    if (active && typeof active.focus === 'function') active.focus();
    return ok;
  }

  function selectPreview() {
    ui.previewText.focus();
    const range = document.createRange();
    range.selectNodeContents(ui.previewText);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // ---------------------------------------------------------------- save

  ui.saveBtn.addEventListener('click', () => saveDraft(store.get().currentId ? 'update' : 'create'));
  ui.saveNewBtn.addEventListener('click', () => saveDraft('create'));

  /** mode: 'update' (change the open draft) or 'create' (add a new one). */
  function saveDraft(mode) {
    const state = store.get();
    clearStatus(ui.saveStatus);

    if (!state.canSave) {
      showStatus(ui.saveStatus, 'error', 'Saving isn’t possible because this browser is blocking storage. Copy your prompt to keep it.');
      return;
    }

    // Check the form before touching storage, and point at every problem.
    const goalOk = promptLib.assemblePrompt(state.fields).ok;
    const nameCheck = draftLib.validateName(state.name, [], null);
    setFieldError(ui.fields.goal, ui.goalError, goalOk ? '' : 'Add a goal before saving — it’s the one field every prompt needs.');
    setFieldError(ui.nameInput, ui.nameError, nameCheck.ok ? '' : nameMessage(nameCheck));
    if (!goalOk) return ui.fields.goal.focus();
    if (!nameCheck.ok) return ui.nameInput.focus();

    const change = { name: state.name, fields: state.fields, now: Date.now() };
    const result = draftStore.commit(
      (list) => (mode === 'update' ? draftLib.updateDraft(list, state.currentId, change) : draftLib.createDraft(list, change)),
      state.drafts
    );

    if (!result.ok) return handleSaveFailure(result, state);

    store.update({
      drafts: result.drafts,
      currentId: result.draft.id,
      name: result.draft.name,
      baseline: { fields: { ...result.draft.fields }, name: result.draft.name },
    });
    ui.nameInput.value = result.draft.name;
    showStatus(ui.saveStatus, 'success', mode === 'update' ? `Updated “${result.draft.name}”.` : `Saved “${result.draft.name}”.`);
  }

  function nameMessage(check) {
    if (check.code === 'empty') return 'Give this draft a name so you can find it later — for example, “Spring email”.';
    if (check.code === 'too_long') return `Keep the name to ${draftLib.NAME_MAX} characters or fewer.`;
    if (check.code === 'duplicate') {
      return `You already have a draft called “${check.conflict.name}”. Choose a different name, or open that draft from Saved drafts to update it.`;
    }
    return 'Please choose a different name.';
  }

  function handleSaveFailure(result, state) {
    if (result.code === 'empty' || result.code === 'too_long' || result.code === 'duplicate') {
      setFieldError(ui.nameInput, ui.nameError, nameMessage(result));
      ui.nameInput.focus();
      return;
    }
    if (result.code === 'missing') {
      // The draft was deleted elsewhere (another tab). Keep the text, make it a new draft.
      refreshDraftsFromStorage();
      store.update({ currentId: null, baseline: blankBaseline() });
      showStatus(ui.saveStatus, 'error', 'This draft no longer exists — it may have been deleted in another tab. Your text is still here; press Save draft to keep it as a new draft.');
      return;
    }
    // write_failed: nothing was changed, and the screen still shows the old list.
    showStatus(
      ui.saveStatus,
      'error',
      'Couldn’t save — your browser refused to store the draft (storage may be full or blocked). Nothing was changed. Copy your prompt so you don’t lose it.'
    );
  }

  // ---------------------------------------------------------------- open / delete

  ui.draftsList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = button.closest('.draft-item').dataset.id;
    if (button.dataset.action === 'open') openDraft(id);
    if (button.dataset.action === 'delete') deleteDraft(id);
  });

  async function openDraft(id) {
    const state = store.get();
    const draft = state.drafts.find((d) => d.id === id);
    if (!draft || id === state.currentId) return;

    if (stateLib.isDirty(state)) {
      const discard = await confirmAction({
        title: 'Discard unsaved changes?',
        body: `You have unsaved changes in ${describeCurrentWork(state)}. Opening “${draft.name}” will replace them.`,
        confirmLabel: 'Discard and open',
        cancelLabel: 'Keep editing',
      });
      if (!discard) return;
    }

    const fields = draftLib.sanitizeFields(draft.fields);
    putFieldsInEditor(fields, draft.name);
    store.update({ fields, name: draft.name, currentId: draft.id, baseline: { fields: { ...fields }, name: draft.name } });
    clearStatus(ui.saveStatus);
    clearStatus(ui.copyStatus);
    clearStatus(ui.draftsStatus);
    showStatus(ui.saveStatus, 'info', `Opened “${draft.name}”.`);
    ui.editorTitle.focus();
  }

  async function deleteDraft(id) {
    const state = store.get();
    const draft = state.drafts.find((d) => d.id === id);
    if (!draft) return;

    const yes = await confirmAction({
      title: `Delete “${draft.name}”?`,
      body: 'This removes the saved draft from this browser for good. It can’t be undone.',
      confirmLabel: 'Delete draft',
      danger: true,
    });
    if (!yes) return;

    // Remember where focus should go once this row disappears.
    const order = draftLib.sortByRecent(state.drafts).map((d) => d.id);
    const position = order.indexOf(id);

    const result = draftStore.commit((list) => draftLib.deleteDraft(list, id), state.drafts);
    if (!result.ok) {
      showStatus(ui.draftsStatus, 'error', `Couldn’t delete “${draft.name}” — your browser refused to update storage. Nothing was changed.`);
      return;
    }

    const wasOpen = id === store.get().currentId;
    const patch = { drafts: result.drafts };
    if (wasOpen) {
      patch.currentId = null;
      patch.baseline = blankBaseline();
    }
    store.update(patch);
    showStatus(
      ui.draftsStatus,
      'success',
      wasOpen ? `Deleted “${draft.name}”. Its text is still in the editor as an unsaved new draft.` : `Deleted “${draft.name}”.`
    );

    const remaining = order.filter((other) => other !== id);
    const nextId = remaining[Math.min(position, remaining.length - 1)];
    const nextRow = nextId && ui.draftsList.querySelector(`[data-id="${CSS.escape(nextId)}"]`);
    const nextButton = nextRow && nextRow.querySelector('button');
    (nextButton || ui.draftsTitle).focus();
  }

  // ---------------------------------------------------------------- new draft

  ui.newDraft.addEventListener('click', startNewDraft);

  async function startNewDraft() {
    const state = store.get();
    if (stateLib.isDirty(state)) {
      const discard = await confirmAction({
        title: 'Start a new draft?',
        body: `Your unsaved changes in ${describeCurrentWork(state)} will be lost.`,
        confirmLabel: 'Discard and start new',
        cancelLabel: 'Keep editing',
      });
      if (!discard) return;
    }
    const fields = draftLib.emptyFields();
    putFieldsInEditor(fields, '');
    store.update({ fields, name: '', currentId: null, baseline: blankBaseline() });
    clearStatus(ui.copyStatus);
    clearStatus(ui.draftsStatus);
    showStatus(ui.saveStatus, 'info', 'Started a new draft.');
    ui.fields.goal.focus();
  }

  // ---------------------------------------------------------------- keyboard shortcut

  // Ctrl+S / ⌘S saves (and stops the browser's "Save page" dialog).
  document.addEventListener('keydown', (event) => {
    const isSave = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's';
    if (!isSave || ui.dialog.open) return;
    event.preventDefault();
    saveDraft(store.get().currentId ? 'update' : 'create');
  });

  // ---------------------------------------------------------------- leaving and other tabs

  window.addEventListener('beforeunload', (event) => {
    if (!stateLib.isDirty(store.get())) return;
    event.preventDefault();
    event.returnValue = '';
  });

  // Another tab saved or deleted something: show the fresh list.
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== draftStore.key) return;
    refreshDraftsFromStorage();
  });

  function refreshDraftsFromStorage() {
    const fresh = draftStore.read();
    if (!fresh.readable || fresh.status === 'corrupt') return;
    const state = store.get();
    const patch = { drafts: fresh.drafts };
    if (state.currentId && !fresh.drafts.some((d) => d.id === state.currentId)) {
      patch.currentId = null;
      patch.baseline = blankBaseline();
      showStatus(ui.saveStatus, 'info', 'This draft was deleted in another tab. Your text is still here as an unsaved new draft.');
    }
    store.update(patch);
  }

  // ---------------------------------------------------------------- start-up message

  ui.bannerClose.addEventListener('click', () => {
    ui.banner.hidden = true;
  });

  function startupMessage(result) {
    if (!result.readable) {
      return 'This browser is blocking storage, so drafts can’t be saved or loaded right now. You can still write and copy prompts.';
    }
    const kept = result.backedUp
      ? 'A copy of the unreadable data was kept in this browser rather than deleted.'
      : 'The unreadable data could not be backed up.';
    if (result.status === 'corrupt') {
      return 'Your saved drafts couldn’t be read, so Prompt Studio started with an empty list. ' + kept;
    }
    if (result.status === 'partial') {
      const n = result.skipped;
      return `${n} saved ${n === 1 ? 'draft was' : 'drafts were'} damaged and skipped; the rest loaded normally. ` + kept;
    }
    if (!result.writable) {
      return 'This browser isn’t accepting new saves right now (storage may be full or restricted). Your saved drafts are shown, but saving may fail.';
    }
    return '';
  }

  // ---------------------------------------------------------------- go

  store.subscribe(render);
  render(store.get(), null);
  for (const key of FIELD_KEYS) autosize(ui.fields[key]);

  const message = startupMessage(loaded);
  if (message) {
    ui.bannerText.textContent = message;
    ui.banner.hidden = false;
  }

  // Close the dialog when the backdrop (outside the box) is clicked.
  ui.dialog.addEventListener('click', (event) => {
    if (event.target === ui.dialog) ui.dialog.close('cancel');
  });
})();
