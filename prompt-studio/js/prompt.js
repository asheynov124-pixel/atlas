/*
 * prompt.js — PROMPT ASSEMBLY
 *
 * Turns the four form fields into one prompt string.
 * This file knows nothing about the page, the buttons, or storage.
 * It takes plain data in and gives plain data back, so it can be
 * tested on its own (see tests/prompt.test.js).
 */
(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api; // Node (tests)
  } else {
    globalThis.PromptStudio = globalThis.PromptStudio || {};
    globalThis.PromptStudio.prompt = api; // Browser
  }
})(function () {
  'use strict';

  // The order of this list is the order the sections appear in the prompt.
  const SECTIONS = [
    { key: 'goal', title: 'Goal', required: true },
    { key: 'audience', title: 'Audience', required: false },
    { key: 'constraints', title: 'Constraints', required: false },
    { key: 'output', title: 'Desired output', required: false },
  ];

  const FIELD_KEYS = SECTIONS.map((section) => section.key);

  /**
   * Tidy one field's text without changing what the person meant:
   * unify line endings, drop trailing spaces, squeeze runs of blank
   * lines down to one, and trim the ends. Non-strings become ''.
   */
  function cleanText(value) {
    if (typeof value !== 'string') return '';
    return value
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Build the prompt.
   *
   * Returns:
   *   ok              – true when every required field has text
   *   text            – the finished prompt ('' when ok is false)
   *   included        – keys of the fields that have text, in prompt order
   *   missingRequired – keys of required fields that are empty
   *
   * Empty (or whitespace-only) optional fields are left out entirely,
   * so the prompt never contains a heading with nothing under it.
   */
  function assemblePrompt(fields) {
    const input = fields && typeof fields === 'object' ? fields : {};
    const included = [];
    const missingRequired = [];
    const blocks = [];

    for (const section of SECTIONS) {
      const text = cleanText(input[section.key]);
      if (!text) {
        if (section.required) missingRequired.push(section.key);
        continue;
      }
      included.push(section.key);
      blocks.push('## ' + section.title + '\n' + text);
    }

    const ok = missingRequired.length === 0;
    return {
      ok,
      text: ok ? blocks.join('\n\n') : '',
      included,
      missingRequired,
    };
  }

  /** Shortcut when only the text is needed. */
  function buildPrompt(fields) {
    return assemblePrompt(fields).text;
  }

  return { SECTIONS, FIELD_KEYS, cleanText, assemblePrompt, buildPrompt };
});
