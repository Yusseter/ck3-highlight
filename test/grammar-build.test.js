const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const grammarIds = ['ck3', 'paradox', 'localization'];

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grammar-build-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const file of [
    'scripts/tiger-sync',
    'scripts/build-grammars.js',
    'grammars',
  ]) {
    const source = path.join(repoRoot, file);
    if (fs.existsSync(source))
      fs.cpSync(source, path.join(root, file), { recursive: true });
  }
  return root;
}

function run(root, ...args) {
  return spawnSync(
    process.execPath,
    [path.join(root, 'scripts/build-grammars.js'), ...args],
    {
      encoding: 'utf8',
      env: { ...process.env, CK3_TIGER_ROOT: '' },
    },
  );
}

function outputs(root) {
  const files = grammarIds.map((id) => `syntaxes/${id}.tmLanguage.json`);
  if (fs.existsSync(path.join(root, 'generated/tiger'))) {
    files.push(
      ...fs
        .readdirSync(path.join(root, 'generated/tiger'))
        .sort()
        .map((name) => `generated/tiger/${name}`),
    );
  }
  return Object.fromEntries(
    files.map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]),
  );
}

test('offline build restores deleted outputs byte-for-byte without a Tiger checkout', (t) => {
  const root = fixture(t);
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(outputs(root), outputs(repoRoot));
  const first = outputs(root);
  fs.rmSync(path.join(root, 'syntaxes'), { recursive: true });
  fs.rmSync(path.join(root, 'generated'), { recursive: true });
  assert.equal(run(root).status, 0);
  assert.deepEqual(outputs(root), first);
  assert.equal(run(root, '--check').status, 0);
  assert.equal(run(root).status, 0);
  assert.deepEqual(outputs(root), first);
});

test('offline check detects missing outputs without creating directories', (t) => {
  const root = fixture(t);
  const result = run(root, '--check');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /Out of date:/);
  assert.equal(result.stderr, '');
  assert.equal(fs.existsSync(path.join(root, 'syntaxes')), false);
  assert.equal(fs.existsSync(path.join(root, 'generated')), false);
});

test('LF-normalized checkouts reproduce the recorded build provenance', (t) => {
  const root = fixture(t);
  for (const entry of fs.readdirSync(root, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !/\.(?:json|js)$/.test(entry.name)) continue;
    const file = path.join(entry.parentPath, entry.name);
    fs.writeFileSync(
      file,
      fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'),
    );
  }
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  const generated = JSON.parse(
    fs.readFileSync(path.join(root, 'generated/tiger/manifest.json'), 'utf8'),
  );
  const recorded = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, 'generated/tiger/manifest.json'),
      'utf8',
    ),
  );
  assert.deepEqual(generated.provenance, recorded.provenance);
});

test('canonical keyword fragments and static rule edits drive the output, not runtime JSON', (t) => {
  const root = fixture(t);
  assert.equal(run(root).status, 0);
  const before = outputs(root);
  const file = path.join(root, 'grammars/keywords/ck3-effects.json');
  const pieces = JSON.parse(fs.readFileSync(file, 'utf8'));
  pieces.push('legacy_optional(?:_suffix)?', 'fixture\\.literal');
  fs.writeFileSync(file, JSON.stringify(pieces, null, 2) + '\n');
  const sourceFile = path.join(root, 'grammars/paradox.json');
  const source = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  source.repository.date.name = 'constant.numeric.date.fixture';
  fs.writeFileSync(sourceFile, JSON.stringify(source));
  assert.equal(run(root, '--check').status, 1);
  assert.deepEqual(outputs(root), before);
  fs.writeFileSync(
    path.join(root, 'syntaxes/ck3.tmLanguage.json'),
    '{invalid output is not a source',
  );
  assert.equal(run(root).status, 0);
  const ck3 = JSON.parse(
    fs.readFileSync(path.join(root, 'syntaxes/ck3.tmLanguage.json'), 'utf8'),
  );
  assert.ok(
    ck3.repository.effects.match.endsWith(
      '|legacy_optional(?:_suffix)?|fixture\\.literal)\\b',
    ),
  );
  assert.equal(
    JSON.parse(
      fs.readFileSync(
        path.join(root, 'syntaxes/paradox.tmLanguage.json'),
        'utf8',
      ),
    ).repository.date.name,
    'constant.numeric.date.fixture',
  );
  assert.equal(run(root, '--check').status, 0);
});

test('invalid canonical grammar and keyword fragments fail before writing any outputs', (t) => {
  for (const [file, value] of [
    ['paradox.json', '{invalid'],
    ['keywords/ck3-effects.json', '[42]'],
  ]) {
    const root = fixture(t);
    assert.equal(run(root).status, 0);
    const before = outputs(root);
    fs.writeFileSync(path.join(root, 'grammars', file), value);
    const result = run(root);
    assert.equal(result.status, 1);
    assert.deepEqual(outputs(root), before);
  }
});

test('readable sources keep nested legacy alternatives as complete regex fragments', () => {
  const pieces = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, 'grammars/keywords/paradox-parameters-rhs.json'),
      'utf8',
    ),
  );
  assert.ok(pieces.includes('(?i:rgb|hex|hsv|hsv360)'));
  assert.ok(!pieces.includes('(?i:rgb'));
  for (const entry of fs
    .readdirSync(path.join(repoRoot, 'grammars'), {
      recursive: true,
      withFileTypes: true,
    })
    .filter((entry) => entry.isFile())) {
    const file = path.join(entry.parentPath, entry.name);
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/))
      assert.ok(line.length < 1000, file);
  }
});

test('canonical Tiger list edits rebuild function patterns without changing their semantic scopes', (t) => {
  const root = fixture(t);
  assert.equal(run(root).status, 0);
  const before = JSON.parse(
    fs.readFileSync(
      path.join(root, 'syntaxes/localization.tmLanguage.json'),
      'utf8',
    ),
  );
  const sourceFile = path.join(
    root,
    'grammars/tiger/localization-builtins.json',
  );
  const feed = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  feed.sections['no-arg-functions'].values.push('FixtureCanonicalFunction');
  fs.writeFileSync(sourceFile, JSON.stringify(feed));
  assert.equal(run(root, '--check').status, 1);
  assert.equal(run(root).status, 0);
  for (const [id, key] of [
    ['localization', 'function-without-para'],
    ['paradox', 'quoted-localization-function-without-para'],
  ]) {
    const grammar = JSON.parse(
      fs.readFileSync(
        path.join(root, `syntaxes/${id}.tmLanguage.json`),
        'utf8',
      ),
    );
    assert.match(grammar.repository[key].match, /FixtureCanonicalFunction/);
    assert.deepEqual(
      grammar.repository[key].captures,
      before.repository['function-without-para'].captures,
    );
  }
  assert.equal(run(root, '--check').status, 0);
});
