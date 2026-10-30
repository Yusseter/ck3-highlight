const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

test('repository and user-facing metadata describe the same extension', () => {
  const manifest = require('../package.json');
  assert.equal(manifest.name, 'ck3-syntax');
  assert.equal(manifest.displayName, 'CK3 Syntax');
  const repository = manifest.repository.url.replace(/\.git$/, '');
  assert.equal(
    repository,
    `https://github.com/${manifest.publisher}/${manifest.name}`,
  );
  assert.equal(manifest.homepage, repository);
  assert.equal(manifest.bugs.url, repository + '/issues');
  assert.equal(manifest.qna, repository + '/issues');
  const readme = fs.readFileSync(
    path.resolve(__dirname, '..', 'README.md'),
    'utf8',
  );
  assert(readme.startsWith('# ' + manifest.displayName + '\n'));
  assert.equal(manifest.contributes.configuration.title, manifest.displayName);
});

test('publication documents use available source links instead of local development records', () => {
  const root = path.resolve(__dirname, '..');
  for (const file of ['README.md', 'NOTICE.md', 'CHANGELOG.md']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert(!text.includes('docs/development/'), file);
    assert(!text.includes('.cache/'), file);
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('#'))
        continue;
      const local = decodeURIComponent(target.split(/[?#]/)[0]);
      assert(fs.existsSync(path.resolve(root, local)), `${file}: ${target}`);
    }
  }
});

test('published release text is archived verbatim and excluded from formatting', async () => {
  const root = path.resolve(__dirname, '..');
  const file = path.join(root, 'docs', 'releases', 'v0.0.4.md');
  const data = fs.readFileSync(file);
  assert.equal(
    createHash('sha256').update(data).digest('hex'),
    '524e86135ef231704848def4334e1de6a4bba451060598ab5a9d87aaf307797d',
  );
  const info = await require('prettier').getFileInfo(file, {
    ignorePath: path.join(root, '.prettierignore'),
  });
  assert.equal(info.ignored, true);
});
