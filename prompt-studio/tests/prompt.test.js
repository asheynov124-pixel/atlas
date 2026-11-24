// Tests for prompt assembly. Run with:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { assemblePrompt, buildPrompt, cleanText } = require('../js/prompt.js');

test('the goal is required: no goal means no prompt', () => {
  const result = assemblePrompt({ goal: '', audience: 'Teachers', constraints: 'Short', output: 'A list' });
  assert.equal(result.ok, false);
  assert.equal(result.text, '');
  assert.deepEqual(result.missingRequired, ['goal']);
});

test('a goal made only of spaces and newlines counts as empty', () => {
  const result = assemblePrompt({ goal: '   \n\t \n ' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingRequired, ['goal']);
});

test('missing or odd input does not throw', () => {
  assert.equal(assemblePrompt().ok, false);
  assert.equal(assemblePrompt(null).ok, false);
  assert.equal(assemblePrompt({ goal: 42 }).ok, false);
});

test('a goal alone produces just the goal section', () => {
  assert.equal(buildPrompt({ goal: 'Plan a team offsite' }), '## Goal\nPlan a team offsite');
});

test('every populated optional section is included, in a fixed order', () => {
  const result = assemblePrompt({
    output: 'A one-page agenda',
    constraints: 'Budget under $2,000',
    audience: 'A 12-person design team',
    goal: 'Plan a team offsite',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.included, ['goal', 'audience', 'constraints', 'output']);
  assert.equal(
    result.text,
    [
      '## Goal',
      'Plan a team offsite',
      '',
      '## Audience',
      'A 12-person design team',
      '',
      '## Constraints',
      'Budget under $2,000',
      '',
      '## Desired output',
      'A one-page agenda',
    ].join('\n')
  );
});

test('empty optional sections are omitted — no blank headings', () => {
  const text = buildPrompt({ goal: 'Summarise this report', audience: '', constraints: '   ', output: 'Three bullet points' });
  assert.equal(text, '## Goal\nSummarise this report\n\n## Desired output\nThree bullet points');
  assert.ok(!text.includes('## Audience'));
  assert.ok(!text.includes('## Constraints'));
});

test('multi-line text keeps its lines but loses stray whitespace', () => {
  const text = buildPrompt({ goal: '  Write a poem  ', constraints: 'Rhymes   \r\nNo clichés\r\n\r\n\r\n\r\nFour lines\n' });
  assert.equal(text, '## Goal\nWrite a poem\n\n## Constraints\nRhymes\nNo clichés\n\nFour lines');
});

test('cleanText handles non-strings', () => {
  assert.equal(cleanText(undefined), '');
  assert.equal(cleanText(null), '');
  assert.equal(cleanText({}), '');
});
