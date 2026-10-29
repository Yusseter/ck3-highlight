const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const rust = require('../scripts/tiger-sync/lib/rust');
const shared = require('../scripts/tiger-sync/lib/shared');

const repoRoot = path.resolve(__dirname, '..');
const revision = '1234567890abcdef1234567890abcdef12345678';
const hash = (value) => createHash('sha256').update(value).digest('hex');

test('generated JSON uses expanded two-space indentation without changing string values', () => {
  const value = { sample: { text: 'preserve\tinside', list: ['one', 'two'] } };
  const output = shared.prepareJsonOutput('style-fixture.json', value, null);
  assert.equal(output.nextText, JSON.stringify(value, null, 2) + '\n');
  assert.deepEqual(JSON.parse(output.nextText), value);
});

function tempDir(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tiger-sync-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function put(root, file, text) {
  const fullPath = path.join(root, file);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, text);
  return fullPath;
}

function snapshot(root) {
  if (!fs.existsSync(root)) return {};
  return Object.fromEntries(
    fs
      .readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const fullPath = path.join(entry.parentPath, entry.name);
        return [path.relative(root, fullPath), hash(fs.readFileSync(fullPath))];
      })
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );
}

function fixture(t) {
  const root = tempDir(t);
  const repo = path.join(root, 'repo');
  const tiger = path.join(root, 'tiger');
  fs.cpSync(
    path.join(repoRoot, 'scripts/tiger-sync'),
    path.join(repo, 'scripts/tiger-sync'),
    { recursive: true },
  );
  fs.cpSync(
    path.join(repoRoot, 'scripts/build-grammars.js'),
    path.join(repo, 'scripts/build-grammars.js'),
  );
  fs.cpSync(path.join(repoRoot, 'grammars'), path.join(repo, 'grammars'), {
    recursive: true,
  });
  fs.cpSync(path.join(repoRoot, 'syntaxes'), path.join(repo, 'syntaxes'), {
    recursive: true,
  });
  const loc = JSON.parse(
    fs.readFileSync(path.join(repo, 'grammars/localization.json'), 'utf8'),
  );
  loc.repository['builtin-function-without-para'] = { match: 'legacy_unused' };
  put(repo, 'grammars/localization.json', JSON.stringify(loc));
  put(repo, 'run.js', "require('./scripts/tiger-sync').run();\n");
  put(tiger, '.git/HEAD', 'ref: refs/heads/adapt/ck3-1.20\n');
  put(tiger, '.git/refs/heads/adapt/ck3-1.20', `${revision}\n`);
  const sources = {
    'src/ck3/tables/effects.rs':
      'const SCOPE_EFFECT: &[T] = &[(Scope, "fixture_effect")];',
    'src/ck3/tables/triggers.rs':
      'const TRIGGER: &[T] = &[(Scope, "fixture_trigger")]; const TRIGGER_COMPLEX: &[T] = &[(Scope, "fixture_complex")];',
    'src/ck3/tables/targets.rs':
      'const SCOPE_PREFIX: &[T] = &[(Scope, "fixture_prefix")]; const SCOPE_TO_SCOPE: &[T] = &[(Scope, "fixture_scope")];',
    'src/ck3/tables/modifs.rs':
      'const MODIF_TABLE: &[T] = &[("fixture_modifier", Scope)];',
    'src/ck3/tables/iterators.rs':
      'const ITERATOR: &[T] = &[(Scope, "fixture_iterator")];',
    'src/ck3/tables/defines.rs':
      'const DEFINES: &[T] = &[("NFixture|KEY", Scope)];',
    'src/ck3/tables/on_action.rs':
      'const ON_ACTION_SCOPES: &str = "on_fixture = {}";',
    'src/ck3/tables/rules.rs':
      'const SCRIPTED_RULES: &str = "fixture_rule = {}";',
    'src/ck3/tables/sounds.rs': 'const SOUNDS: &[&str] = &["event:/fixture"];',
    'src/ck3/tables/misc.rs':
      'const COMMON_DIRS: &[&str] = &["common/fixture"]; const CUSTOM_RELIGION_LOCAS: &[&str] = &["fixture_loca"]; const BANNED_TITLE_HISTORY_TYPES: &[&str] = &["fixture_history"];',
    'src/ck3/tables/localization.rs':
      'const COMPLEX_TOOLTIPS: &[T] = &[("FIXTURE", Scope)]; const BUILTIN_MACROS: &[&str] = &["FIXTURE_MACRO"];',
    'src/ck3/events.rs': 'const EVENT_TYPES: &[&str] = &["fixture_event"];',
    'src/ck3/effect_validation.rs':
      'vd.field_item("fixture_name", Item::Localization);',
    'src/ck3/validate.rs': '',
    'src/ck3/data/fixture.rs':
      'vd.field_choice("fixture_choice", &["fixture_value"]);',
    'src/gui/properties.rs':
      'enum WidgetProperty {\n FixtureProperty,\n}\n const ALIGN: &[&str] = &["left"];',
    'src/gui/builtins.rs': 'enum BuiltinWidget {\n FixtureWidget,\n}',
    'guiproperties.txt': 'fixture_gui = {}',
    'src/data/customloca.rs': 'vd.req_field("fixture_text");',
    'src/data/effect_localization.rs': '',
    'src/data/trigger_localization.rs': '',
    'tiger-tables/src/ck3/include/data_global_promotes.rs':
      '&[("FixtureRoot", Args::Args(&[]), Scope)]',
    'tiger-tables/src/ck3/include/data_global_functions.rs':
      '&[("GetFixture", Args::Args(&[]), Scope)]',
    'tiger-tables/src/ck3/include/data_promotes.rs':
      '&[("GetOtherFixture", Ck3(Character), Args::Args(&[]), Scope)]',
    'tiger-tables/src/ck3/include/data_functions.rs':
      '&[("FixtureWithArg", Ck3(Character), Args::Args(&[Arg]), Scope)]',
  };
  for (const [file, text] of Object.entries(sources)) put(tiger, file, text);
  return { root, repo, tiger, sources };
}

function run(f, ...args) {
  return spawnSync(
    process.execPath,
    [path.join(f.repo, 'run.js'), f.tiger, ...args],
    {
      encoding: 'utf8',
      env: { ...process.env, CK3_TIGER_ROOT: '' },
    },
  );
}

test('validator extractors ignore nested comments and calls inside string literals', () => {
  const source = String.raw`
// vd.field_item("line_comment", Item::Localization);
/* outer /* nested */ vd.field_item("block_comment", Item::Localization); */
let example = r#"vd.field_item("string_example", Item::Localization)"#;
vd.field_item("live_field", Item::Localization);
vd.field_choice("live_choice", &["https://fixture", "/*literal*/"]);
`;
  assert.deepEqual(rust.extractFieldNamesFromValidatorSources([{ source }]), [
    'live_field',
    'live_choice',
  ]);
  assert.deepEqual(
    rust.extractItemFieldNamesFromValidatorSources(
      [{ source }],
      ['Localization'],
    ),
    ['live_field'],
  );
  assert.deepEqual(
    rust.extractChoiceValuesFromValidatorSources(
      [{ filePath: 'fixture', source }],
      new Map(),
      new Map(),
    ),
    ['https://fixture', '/*literal*/'],
  );
});

test('constant and enum lookups use full identifiers, not prefixes or comments', () => {
  const source = `// const TABLE: &[T] = &[("commented",)];
const TABLE_EXTRA: &[T] = &[("prefix",)];
const TABLE: &[T] = &[("right",)];`;
  assert.deepEqual(rust.extractTupleFieldStrings(source, 'TABLE', 0), [
    'right',
  ]);
  assert.throws(
    () =>
      rust.extractTupleFieldStrings(
        'const TABLE_EXTRA: &[T] = &[("wrong",)];',
        'TABLE',
        0,
      ),
    /TABLE/,
  );
  assert.deepEqual(
    rust.extractEnumVariants(
      'enum WidgetExtra { Wrong, }\nenum Widget {\n Right,\n}',
      'Widget',
    ),
    ['Right'],
  );
  assert.deepEqual(
    rust.extractTopLevelKeysFromConstString(
      'const KEYS_EXTRA: &str = "wrong = {}"; const KEYS: &str = "right = {}";',
      'KEYS',
    ),
    ['right'],
  );
});

test('commented bindings and GUI choices do not become live values', () => {
  const source = `// const GONE: &[&str] = &["gone"];
const LIVE: &[&str] = &["live"];
/* Choice(&["commented"]) */ Choice(LIVE)`;
  const bindings = rust.collectStringArrayBindings(source);
  assert.equal(bindings.has('GONE'), false);
  assert.deepEqual(rust.extractGuiChoiceValues(source, bindings), ['live']);
});

test('invalid later grammar leaves every earlier output unchanged', (t) => {
  const f = fixture(t);
  put(f.repo, 'generated/tiger/ck3-keywords.json', '{"old":true}\n');
  put(f.repo, 'grammars/paradox.json', '{invalid');
  const before = snapshot(f.repo);
  const result = run(f);
  assert.equal(result.status, 1);
  assert.deepEqual(snapshot(f.repo), before);
});

for (const [name, value] of [
  ['invalid JSON', '{invalid'],
  ['invalid shape', '{"complex-tooltip-tags":"wrong"}'],
  ['invalid item', '{"complex-tooltip-tags":[42]}'],
]) {
  test(`${name} manual supplement fails without writing`, (t) => {
    const f = fixture(t);
    put(
      f.repo,
      'scripts/tiger-sync/data/localization-formats.manual.json',
      value,
    );
    const before = snapshot(f.repo);
    const result = run(f);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /localization-formats\.manual\.json/);
    assert.deepEqual(snapshot(f.repo), before);
  });
}

test('dry-run and check never write, including missing generated directories', (t) => {
  const f = fixture(t);
  const before = snapshot(f.repo);
  assert.equal(run(f, '--dry-run').status, 0);
  assert.deepEqual(snapshot(f.repo), before);
  assert.equal(run(f, '--check').status, 1);
  assert.deepEqual(snapshot(f.repo), before);
});

test('sync records deterministic revision and content hashes, keeps additive keywords, removes only the dead rule', (t) => {
  const f = fixture(t);
  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(f.repo, 'generated/tiger/manifest.json'), 'utf8'),
  );
  assert.ok(manifest.provenance, 'manifest must identify the source content');
  assert.equal(manifest.provenance.upstream.revision, revision);
  assert.equal(
    manifest.provenance.upstream.inputs['src/ck3/tables/effects.rs'],
    hash(f.sources['src/ck3/tables/effects.rs']),
  );
  assert.match(
    manifest.provenance.supplements[
      'scripts/tiger-sync/data/localization-formats.manual.json'
    ],
    /^[a-f0-9]{64}$/,
  );
  assert.equal(manifest.updateMode.grammars, 'additive');
  assert.doesNotMatch(
    JSON.stringify(manifest.provenance),
    /[A-Z]:[\\/]|tiger-sync-test-|timestamp|generatedAt/,
  );
  const ck3 = JSON.parse(
    fs.readFileSync(path.join(f.repo, 'syntaxes/ck3.tmLanguage.json'), 'utf8'),
  );
  assert.match(ck3.repository.effects.match, /fixture_effect/);
  assert.match(ck3.repository.effects.match, /add_gold/);
  const loc = JSON.parse(
    fs.readFileSync(
      path.join(f.repo, 'syntaxes/localization.tmLanguage.json'),
      'utf8',
    ),
  );
  assert.equal(
    Object.hasOwn(loc.repository, 'builtin-function-without-para'),
    false,
  );
  assert.ok(loc.repository['function-without-para']);
  assert.ok(loc.repository['function-with-para']);
  assert.ok(
    loc.repository.data_type.patterns.some(
      (pattern) => pattern.include === '#function-without-para',
    ),
  );
  assert.ok(
    loc.repository.data_type.patterns.some(
      (pattern) => pattern.include === '#function-with-para',
    ),
  );
  const before = snapshot(f.repo);
  assert.equal(run(f, '--check').status, 0);
  assert.equal(run(f).status, 0);
  assert.deepEqual(snapshot(f.repo), before);
  put(
    f.tiger,
    'src/ck3/tables/effects.rs',
    `${f.sources['src/ck3/tables/effects.rs']}\n// local edit`,
  );
  assert.equal(run(f).status, 0);
  const dirty = JSON.parse(
    fs.readFileSync(path.join(f.repo, 'generated/tiger/manifest.json'), 'utf8'),
  );
  assert.equal(dirty.provenance.upstream.revision, revision);
  assert.notEqual(
    dirty.provenance.upstream.inputs['src/ck3/tables/effects.rs'],
    manifest.provenance.upstream.inputs['src/ck3/tables/effects.rs'],
  );
});

test('missing Git revision fails without writes instead of inventing provenance', (t) => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.tiger, '.git/HEAD'));
  const before = snapshot(f.repo);
  const result = run(f);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Git|revision|HEAD/);
  assert.deepEqual(snapshot(f.repo), before);
});

test('prepared output commit rolls back an earlier replacement on failure', (t) => {
  assert.equal(typeof shared.prepareJsonOutput, 'function');
  assert.equal(typeof shared.commitOutputs, 'function');
  const root = tempDir(t);
  const first = put(root, 'first.json', '{"old":1}\n');
  const second = put(root, 'second.json', '{"old":2}\n');
  const before = snapshot(root);
  const outputs = [first, second].map((file) =>
    shared.prepareJsonOutput(file, { next: true }),
  );
  const rename = fs.renameSync;
  let failed = false;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === second && !failed) {
      failed = true;
      throw new Error('fixture replacement failure');
    }
    return rename(from, to);
  });
  assert.throws(
    () => shared.commitOutputs(outputs, {}),
    /fixture replacement failure/,
  );
  assert.deepEqual(snapshot(root), before);
  assert.ok(outputs.every((output) => !output.wrote));
});

test('stale preparation never overwrites an intervening edit', (t) => {
  assert.equal(typeof shared.prepareJsonOutput, 'function');
  const root = tempDir(t);
  const file = put(root, 'output.json', '{}\n');
  const output = shared.prepareJsonOutput(file, { next: true });
  fs.writeFileSync(file, '{"concurrent":true}\n');
  assert.throws(() => shared.commitOutputs([output], {}), /changed|modified/i);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"concurrent":true}\n');
});

test('staging failure leaves original outputs and directories untouched', (t) => {
  const root = tempDir(t);
  const first = put(root, 'first.json', '{}\n');
  const outputs = [
    shared.prepareJsonOutput(first, { next: 1 }),
    shared.prepareJsonOutput(path.join(root, 'new/nested/second.json'), {
      next: 2,
    }),
  ];
  const before = snapshot(root);
  const write = fs.writeFileSync;
  let staged = 0;
  t.mock.method(fs, 'writeFileSync', (file, ...args) => {
    if (path.basename(file) === 'next.json' && ++staged === 2)
      throw new Error('fixture staging failure');
    return write(file, ...args);
  });
  assert.throws(() => shared.commitOutputs(outputs), /fixture staging failure/);
  assert.deepEqual(snapshot(root), before);
  assert.deepEqual(fs.readdirSync(root), ['first.json']);
});

test('commit failure removes newly created outputs and empty output directories', (t) => {
  const root = tempDir(t);
  const existing = put(root, 'existing.json', '{"old":true}\n');
  const before = snapshot(root);
  const outputs = [
    shared.prepareJsonOutput(path.join(root, 'new/first.json'), { next: 1 }),
    shared.prepareJsonOutput(existing, { next: 2 }),
  ];
  const rename = fs.renameSync;
  let failed = false;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === existing && !failed) {
      failed = true;
      throw new Error('fixture commit failure');
    }
    return rename(from, to);
  });
  assert.throws(() => shared.commitOutputs(outputs), /fixture commit failure/);
  assert.deepEqual(snapshot(root), before);
  assert.deepEqual(fs.readdirSync(root), ['existing.json']);
});

test('an edit during commit is preserved while already replaced outputs roll back', (t) => {
  const root = tempDir(t);
  const first = put(root, 'first.json', '{"old":1}\n');
  const second = put(root, 'second.json', '{"old":2}\n');
  const outputs = [first, second].map((file) =>
    shared.prepareJsonOutput(file, { next: true }),
  );
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    rename(from, to);
    if (to === first && path.basename(from) === 'next.json')
      fs.writeFileSync(second, '{"concurrent":true}\n');
  });
  assert.throws(
    () => shared.commitOutputs(outputs),
    /changed since preparation/,
  );
  assert.equal(fs.readFileSync(first, 'utf8'), '{"old":1}\n');
  assert.equal(fs.readFileSync(second, 'utf8'), '{"concurrent":true}\n');
});

test('output directory links are rejected before any target is changed', (t) => {
  const root = tempDir(t);
  const target = put(root, 'outside/output.json', '{}\n');
  fs.symlinkSync(
    path.join(root, 'outside'),
    path.join(root, 'linked'),
    'junction',
  );
  const output = shared.prepareJsonOutput(
    path.join(root, 'linked/output.json'),
    { next: true },
  );
  assert.throws(() => shared.commitOutputs([output]), /Unsafe sync output/);
  assert.equal(fs.readFileSync(target, 'utf8'), '{}\n');
});

test('rollback failure retains the original backup for manual recovery', (t) => {
  const root = tempDir(t);
  const file = put(root, 'output.json', '{"old":true}\n');
  const output = shared.prepareJsonOutput(file, { next: true });
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === file) throw new Error('fixture persistent failure');
    return rename(from, to);
  });
  assert.throws(() => shared.commitOutputs([output]), /Rollback incomplete/);
  const backupDir = fs
    .readdirSync(root)
    .find((name) => name.startsWith('.tiger-sync-'));
  assert.ok(backupDir);
  assert.equal(
    fs.readFileSync(path.join(root, backupDir, 'previous.json'), 'utf8'),
    '{"old":true}\n',
  );
  assert.equal(output.wrote, false);
});

test('Git provenance supports detached HEAD, packed refs and linked worktrees', (t) => {
  const { readGitRevision } = require('../scripts/tiger-sync/lib/provenance');
  const root = tempDir(t);
  put(root, '.git/HEAD', `${revision}\n`);
  assert.equal(readGitRevision(root), revision);
  put(root, '.git/HEAD', 'ref: refs/heads/adapt\n');
  put(root, '.git/packed-refs', `# pack-refs\n${revision} refs/heads/adapt\n`);
  assert.equal(readGitRevision(root), revision);
  const worktree = path.join(root, 'worktree');
  put(worktree, '.git', 'gitdir: ../.git/worktrees/fixture\n');
  put(root, '.git/worktrees/fixture/commondir', '../..\n');
  put(root, '.git/worktrees/fixture/HEAD', 'ref: refs/heads/adapt\n');
  assert.equal(readGitRevision(worktree), revision);
  put(root, '.git/worktrees/fixture/HEAD', 'ref: refs/../outside\n');
  assert.throws(() => readGitRevision(worktree), /Invalid/);
});

test('provenance bytes do not depend on checkout location', (t) => {
  const left = fixture(t);
  const right = fixture(t);
  assert.equal(run(left).status, 0);
  assert.equal(run(right).status, 0);
  assert.equal(
    fs.readFileSync(
      path.join(left.repo, 'generated/tiger/manifest.json'),
      'utf8',
    ),
    fs.readFileSync(
      path.join(right.repo, 'generated/tiger/manifest.json'),
      'utf8',
    ),
  );
});

test('Tiger sync keeps ordered compatibility fragments in canonical sources and offline rebuilds', (t) => {
  const f = fixture(t);
  const keywordFile = 'grammars/keywords/ck3-effects.json';
  put(
    f.repo,
    keywordFile,
    JSON.stringify(['legacy_optional(?:_suffix)?', 'scope:old_compat']),
  );
  const rhsFile = path.join(
    f.repo,
    'grammars/keywords/paradox-parameters-rhs.json',
  );
  assert.ok(
    JSON.parse(fs.readFileSync(rhsFile, 'utf8')).includes(
      '(?i:rgb|hex|hsv|hsv360)',
    ),
  );
  assert.equal(run(f).status, 0);
  const keywords = JSON.parse(
    fs.readFileSync(path.join(f.repo, keywordFile), 'utf8'),
  );
  assert.deepEqual(keywords.slice(0, 3), [
    'legacy_optional(?:_suffix)?',
    'scope:old_compat',
    'fixture_effect',
  ]);
  assert.equal(
    keywords.filter((value) => value === 'fixture_effect').length,
    1,
  );
  const manifest = JSON.parse(
    fs.readFileSync(path.join(f.repo, 'generated/tiger/manifest.json'), 'utf8'),
  );
  assert.equal(
    manifest.provenance.grammars[keywordFile],
    hash(fs.readFileSync(path.join(f.repo, keywordFile))),
  );
  assert.equal(
    manifest.provenance.grammars['grammars/tiger/ck3-keywords.json'],
    hash(
      fs.readFileSync(path.join(f.repo, 'grammars/tiger/ck3-keywords.json')),
    ),
  );
  put(
    f.tiger,
    'src/ck3/tables/effects.rs',
    'const SCOPE_EFFECT: &[T] = &[(Scope, "replacement_effect")];',
  );
  put(
    f.repo,
    'syntaxes/ck3.tmLanguage.json',
    '{corrupt runtime is not a source',
  );
  assert.equal(run(f).status, 0);
  const ck3 = JSON.parse(
    fs.readFileSync(path.join(f.repo, 'syntaxes/ck3.tmLanguage.json'), 'utf8'),
  );
  assert.ok(
    ck3.repository.effects.match.startsWith(
      '(?i)\\b(?:legacy_optional(?:_suffix)?|scope:old_compat|fixture_effect|',
    ),
  );
  assert.ok(ck3.repository.effects.match.endsWith('|replacement_effect)\\b'));
  const before = snapshot(f.repo);
  const offline = spawnSync(
    process.execPath,
    [path.join(f.repo, 'scripts/build-grammars.js'), '--check'],
    { encoding: 'utf8' },
  );
  assert.equal(offline.status, 0, offline.stdout + offline.stderr);
  assert.deepEqual(snapshot(f.repo), before);
  assert.equal(run(f, '--check').status, 0);
});

test('a runtime replacement failure rolls back canonical Tiger and keyword updates too', (t) => {
  const f = fixture(t);
  put(
    f.repo,
    'run.js',
    `
const fs = require('node:fs');
const path = require('node:path');
const rename = fs.renameSync;
let failed = false;
fs.renameSync = (from, to) => {
	if (!failed && path.basename(from) === 'next.json' && to === path.join(__dirname, 'syntaxes/ck3.tmLanguage.json')) {
		failed = true;
		throw new Error('fixture runtime replacement failure');
	}
	return rename(from, to);
};
require('./scripts/tiger-sync').run();
`,
  );
  const before = snapshot(f.repo);
  const result = run(f);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fixture runtime replacement failure/);
  assert.deepEqual(snapshot(f.repo), before);
});
