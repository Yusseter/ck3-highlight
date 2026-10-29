const test = require('node:test');
const assert = require('node:assert/strict');
const { formatScript } = require('../src/formatter');

const spaces = { tabSize: 4, insertSpaces: true };

test('preserves the baseline indentation, including the first line', () => {
  assert.equal(
    formatScript('    child = {\n value = yes\n }', spaces),
    '    child = {\n        value = yes\n    }',
  );
});

test('counts all braces while ignoring quoted and commented braces', () => {
  assert.equal(
    formatScript(
      'root = { nested = {\nvalue = "} # {" # }\n}}\nnext = yes',
      spaces,
    ),
    'root = { nested = {\n        value = "} # {" # }\n}}\nnext = yes',
  );
});

test('preserves every character inside multiline strings', () => {
  const text =
    'root = {\n text = "first\n      text with spaces  \n   last"\n}';
  assert.equal(
    formatScript(text, spaces),
    'root = {\n    text = "first\n      text with spaces  \n   last"\n}',
  );
});

test('preserves CRLF, terminal newlines, escapes and comment text', () => {
  const text = 'root = {\r\n x = "a \\" { b" # keep  \r\n}\r\n';
  const result = formatScript(text, spaces);
  assert.equal(result, 'root = {\r\n    x = "a \\" { b" # keep  \r\n}\r\n');
  assert.equal(formatScript(result, spaces), result);
});

test('uses document formatting options and keeps tab baselines intact', () => {
  assert.equal(
    formatScript('root = {\n x = yes\n}', { tabSize: 2, insertSpaces: true }),
    'root = {\n  x = yes\n}',
  );
  assert.equal(
    formatScript('\tchild = {\n\t\tx = yes\n\t}', {
      tabSize: 4,
      insertSpaces: false,
    }),
    '\tchild = {\n\t\tx = yes\n\t}',
  );
});

test('formats empty and incomplete documents without deleting content', () => {
  assert.equal(formatScript('', spaces), '');
  assert.equal(
    formatScript('x = "unterminated\n  keep', spaces),
    'x = "unterminated\n  keep',
  );
});
