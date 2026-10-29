const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { classifyDocument } = require('../src/documents');

function document(file, text = '', languageId = 'plaintext') {
  return {
    uri: { scheme: 'file', fsPath: file },
    languageId,
    getText: () => text,
  };
}

test('leaves ordinary text and YAML files alone', async () => {
  assert.equal(
    await classifyDocument(
      document(path.join(os.tmpdir(), 'notes.txt'), 'hello'),
    ),
    null,
  );
  assert.equal(
    await classifyDocument(
      document(path.join(os.tmpdir(), 'config.yaml'), 'name: example', 'yaml'),
    ),
    null,
  );
});

test('recognizes localization by its language header, including BOM/comments', async () => {
  assert.equal(
    await classifyDocument(
      document(
        '/example/test.yml',
        '\uFEFF# comment\nl_english:\n key:0 "Text"',
        'yaml',
      ),
    ),
    'ck3-localization',
  );
});

test('does not automatically classify .yaml files as CK3 localization', async () => {
  for (const file of ['/example/test.yaml', '/example/test_l_english.yaml']) {
    assert.equal(
      await classifyDocument(
        document(file, 'l_english:\n key:0 "Text"', 'yaml'),
      ),
      null,
      file,
    );
  }
});

test('does not replace explicitly selected unrelated languages', async () => {
  assert.equal(
    await classifyDocument(
      document('/example/CK3/test.txt', 'x = yes', 'javascript'),
    ),
    null,
  );
});

test('leaves ambiguous descriptor-based mods alone until CK3 context is available', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ck3-project-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'descriptor.mod'), 'name = "Example"');
  const doc = document(path.join(root, 'events', 'example.txt'), 'x = yes');
  assert.equal(await classifyDocument(doc, [root]), null);
  await fs.mkdir(path.join(root, 'common', 'genes'), { recursive: true });
  assert.equal(await classifyDocument(doc, [root]), 'ck3');
});

test('recognizes configured CK3 mod folders without renaming them', async () => {
  const root = path.join(os.tmpdir(), 'arbitrary-mod-folder');
  assert.equal(
    await classifyDocument(
      document(path.join(root, 'events', 'test.txt')),
      [root],
      root,
    ),
    'ck3',
  );
  assert.equal(
    await classifyDocument(
      document(path.join(root + '-other', 'test.txt')),
      [],
      root,
    ),
    null,
  );
});

test('configured mod folders and descriptors select the same marker-free project', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mod-detection-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const mod = path.join(root, 'mod', 'example');
  await fs.mkdir(mod, { recursive: true });
  const descriptor = path.join(mod, 'descriptor.mod');
  await fs.writeFile(descriptor, 'name = "Example"');
  const launcher = path.join(root, 'mod', 'example.mod');
  await fs.writeFile(launcher, 'path = "mod/example"');
  const doc = document(path.join(mod, 'events', 'example.txt'));
  assert.equal(await classifyDocument(doc, [mod]), null);
  for (const configured of [mod, descriptor, launcher]) {
    assert.equal(
      await classifyDocument(doc, [mod], configured),
      'ck3',
      configured,
    );
    assert.equal(
      await classifyDocument(
        document(path.join(root, 'other', 'notes.txt')),
        [],
        configured,
      ),
      null,
    );
  }
});

test('invalid launcher descriptors do not claim the surrounding mod collection', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mod-detection-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const launcher = path.join(root, 'mod', 'missing.mod');
  await fs.mkdir(path.dirname(launcher), { recursive: true });
  const doc = document(path.join(root, 'unrelated', 'notes.txt'));
  for (const text of ['name = "No path"', 'path = "mod/does-not-exist"']) {
    await fs.writeFile(launcher, text);
    assert.equal(await classifyDocument(doc, [], launcher), null);
  }
  assert.equal(
    await classifyDocument(doc, [], path.join(root, 'missing.mod')),
    null,
  );
});

test('recognizes additional vanilla game formats only in CK3 project context', async () => {
  const root = path.join(os.tmpdir(), 'arbitrary-ck3-mod');
  for (const extension of [
    '.audio2',
    '.compound',
    '.font',
    '.heightmap',
    '.lines',
    '.lookup',
    '.particle',
    '.skin',
    '.terrain',
    '.vertical_borders',
  ]) {
    assert.equal(
      await classifyDocument(
        document(path.join(root, 'example' + extension)),
        [root],
        root,
      ),
      'ck3',
      extension,
    );
    assert.equal(
      await classifyDocument(
        document(path.join(os.tmpdir(), 'other', 'example' + extension)),
      ),
      null,
      extension,
    );
  }
});

test('does not add engine-only formats or take over other file formats', async () => {
  const root = path.join(os.tmpdir(), 'CK3');
  for (const extension of [
    '.curves',
    '.layout',
    '.fxh',
    '.fnt',
    '.csv',
    '.json',
    '.meta',
    '.dds',
    '.mesh',
    '.anim',
  ]) {
    assert.equal(
      await classifyDocument(
        document(path.join(root, 'example' + extension)),
        [root],
        root,
      ),
      null,
      extension,
    );
  }
  assert.equal(
    await classifyDocument(
      document(path.join(root, 'example.json'), '{}', 'json'),
      [root],
      root,
    ),
    null,
  );
});

test('recognizes the Tiger config filename without claiming arbitrary conf files', async () => {
  const root = path.join(os.tmpdir(), 'arbitrary-ck3-mod');
  assert.equal(
    await classifyDocument(document(path.join(root, 'ck3-tiger.conf')), [root]),
    'ck3',
  );
  assert.equal(
    await classifyDocument(
      document(path.join(root, 'other.conf')),
      [root],
      root,
    ),
    null,
  );
});

test('limits new installed-game coverage to game rather than the engine directories', async () => {
  const root = path.join(os.tmpdir(), 'Crusader Kings III');
  assert.equal(
    await classifyDocument(
      document(path.join(root, 'game', 'fonts', 'fonts.font')),
    ),
    'ck3',
  );
  for (const folder of ['clausewitz', 'jomini']) {
    assert.equal(
      await classifyDocument(
        document(path.join(root, folder, 'fonts', 'fonts.font')),
      ),
      null,
    );
  }
});
