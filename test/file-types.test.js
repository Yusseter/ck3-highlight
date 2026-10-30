const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const manifest = require('../package.json');
const { buildFileTypeContributions } = require('../scripts/build-file-types');

test('file-type builds write package JSON with two-space indentation', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-types-style-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const relative of [
    'scripts/build-file-types.js',
    'src/file-types.json',
  ]) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.resolve(__dirname, '..', relative), target);
  }
  const fixture = structuredClone(manifest);
  fixture.contributes.languages.find(
    (language) => language.id === 'ck3',
  ).extensions = [];
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(fixture));
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'scripts/build-file-types.js')],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const output = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  assert.equal(output, JSON.stringify(JSON.parse(output), null, 2) + '\n');
});

test('manifest language associations match the shared file-type registry', () => {
  assert.deepEqual(
    buildFileTypeContributions(manifest.contributes.languages),
    manifest.contributes.languages,
  );
});

test('localization associations use the documented CK3 .yml extension', () => {
  const localization = manifest.contributes.languages.find(
    (language) => language.id === 'ck3-localization',
  );
  assert.deepEqual(localization.filenamePatterns, ['*_l_*.yml']);
});

test('only CK3 script and localization modes are registered', () => {
  assert.deepEqual(
    manifest.contributes.languages
      .map((language) => [language.id, language.aliases[0]])
      .sort(),
    [
      ['ck3', 'CK3 Script'],
      ['ck3-localization', 'CK3 Localization'],
    ],
  );
  for (const language of manifest.contributes.languages) {
    assert(!manifest.activationEvents.includes('onLanguage:' + language.id));
  }
  assert(manifest.activationEvents.includes('onLanguage:yaml'));
  assert(
    !manifest.activationEvents.includes('onLanguage:paradox-localization'),
  );
  assert.equal(
    manifest.contributes.grammars.find(
      (grammar) => grammar.scopeName === 'source.paradox.localization',
    ).language,
    'ck3-localization',
  );
  assert(!manifest.activationEvents.includes('onLanguage:paradox'));
  assert(
    !manifest.contributes.grammars.find(
      (grammar) => grammar.scopeName === 'source.paradox',
    ).language,
  );
  for (const language of manifest.contributes.languages) {
    assert(
      !language.filenamePatterns?.some((pattern) =>
        /Europa Universalis|Hearts of Iron|Victoria 3|eu4|eu5|hoi4|vic3/.test(
          pattern,
        ),
      ),
    );
  }
});

test('both CK3 languages supply packaged light and dark fallback icons', () => {
  for (const language of manifest.contributes.languages) {
    for (const theme of ['light', 'dark']) {
      assert(language.icon?.[theme], language.id + ': ' + theme);
      assert.equal(language.icon[theme], './icons/paradox-' + theme + '.png');
      const file = path.resolve(__dirname, '..', language.icon[theme]);
      const data = fs.readFileSync(file);
      assert.equal(
        data.subarray(0, 8).toString('hex'),
        '89504e470d0a1a0a',
        language.id + ': PNG signature',
      );
    }
  }
});

test('extension artwork is an attributed square PNG under icons', () => {
  assert.equal(manifest.icon, 'icons/icon.png');
  const data = fs.readFileSync(path.resolve(__dirname, '..', manifest.icon));
  assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(data.readUInt32BE(16), data.readUInt32BE(20));
  assert(data.readUInt32BE(16) >= 128);
  assert(
    data.readUInt32BE(16) <= 1024,
    'Marketplace extension icons must not exceed 1024x1024 pixels',
  );
  const license = fs.readFileSync(
    path.resolve(__dirname, '..', 'licenses/ParadoxModdingTools-MIT.txt'),
    'utf8',
  );
  assert(license.includes('Copyright (c) 2025 Ian Davis'));
  const notice = fs.readFileSync(
    path.resolve(__dirname, '..', 'NOTICE.md'),
    'utf8',
  );
  assert(notice.includes('idodavis/paradox-modding-tools'));
  assert(notice.includes('licenses/ParadoxModdingTools-MIT.txt'));
});

test('CK3 retains resource-file patterns without globally claiming shared extensions', () => {
  const ck3 = buildFileTypeContributions(manifest.contributes.languages).find(
    (language) => language.id === 'ck3',
  );
  assert.deepEqual(ck3.extensions, ['.ck3']);
  for (const extension of ['txt', 'gui', 'gfx', 'asset', 'mod']) {
    assert(
      ck3.filenamePatterns.some((pattern) => pattern.includes(extension)),
      extension,
    );
  }
});

test('additional CK3 extensions are project-scoped rather than globally claimed', () => {
  const languages = buildFileTypeContributions(manifest.contributes.languages);
  const ck3 = languages.find((language) => language.id === 'ck3');
  assert(
    ck3.filenamePatterns.some(
      (pattern) =>
        pattern.includes('/game/') && pattern.includes('vertical_borders'),
    ),
  );
  assert(
    ck3.filenamePatterns.some(
      (pattern) =>
        pattern.startsWith('**/1158310/') &&
        pattern.includes('vertical_borders'),
    ),
  );
  for (const language of languages) {
    assert(!language.extensions?.includes('.font'));
    assert(!language.extensions?.includes('.conf'));
    assert(
      !language.filenamePatterns?.some(
        (pattern) => pattern.includes('curves') || pattern.includes('layout'),
      ),
    );
  }
  assert.deepEqual(ck3.filenames, ['ck3-tiger.conf']);
});
