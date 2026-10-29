const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const prettier = require('prettier');
const manifest = require('../package.json');

test('JSONC formatting avoids trailing-comma schema warnings', async () => {
  const file = path.resolve(__dirname, '..', '.markdownlint-cli2.jsonc');
  const config = await prettier.resolveConfig(file);
  const source = JSON.stringify(
    { config: { MD013: false }, ignores: ['node_modules/**'] },
    null,
    2,
  );
  const formatted = await prettier.format(source, {
    ...config,
    filepath: file,
  });
  assert.doesNotThrow(() => JSON.parse(formatted));
});

test('language comment configuration satisfies the object schema without changing indentation', () => {
  for (const language of manifest.contributes.languages) {
    const file = path.resolve(__dirname, '..', language.configuration);
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(
      config.comments.lineComment,
      { comment: '#', noIndent: false },
      language.id,
    );
  }
});
