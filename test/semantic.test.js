const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const sourceRoot = path.resolve(__dirname, '../src/semantic');

class Emitter {
  constructor() {
    this.listeners = new Set();
    this.event = (listener) => {
      this.listeners.add(listener);
      return { dispose: () => this.listeners.delete(listener) };
    };
  }
  fire(value) {
    for (const listener of this.listeners) listener(value);
  }
  dispose() {
    this.listeners.clear();
  }
}

function document(filePath, text, languageId = 'ck3') {
  const doc = {
    uri: { scheme: 'file', fsPath: filePath },
    languageId,
    version: 1,
    getText: () => text,
    setText(value) {
      text = value;
      this.version++;
    },
    positionAt(offset) {
      const prefix = text.slice(0, offset).split('\n');
      return { line: prefix.length - 1, character: prefix.at(-1).length };
    },
    offsetAt(position) {
      const lines = text.split('\n');
      return (
        lines
          .slice(0, position.line)
          .reduce((size, line) => size + line.length + 1, 0) +
        position.character
      );
    },
  };
  return doc;
}

async function waitFor(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    assert(Date.now() < deadline, 'semantic service did not settle');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function fixture(t, fsOverrides = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ck3-semantic-'));
  const main = path.join(dir, 'main');
  const game = path.join(dir, 'CK3');
  const settings = {
    ck3tiger: { ck3Path: game, modPath: path.join(main, 'descriptor.mod') },
    ck3Highlight: {},
  };
  const events = {},
    watchers = new Set(),
    messages = [],
    services = [];
  const put = async (file, text) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text);
  };
  await put(settings.ck3tiger.modPath, 'name = "Main"');
  const workspace = {
    textDocuments: [],
    isTrusted: true,
    workspaceFolders: [],
    getConfiguration: (section) => ({
      get: (key, fallback) => settings[section]?.[key] ?? fallback,
    }),
    createFileSystemWatcher(pattern) {
      const watcher = { pattern, events: {} };
      for (const name of ['Create', 'Change', 'Delete']) {
        watcher.events[name] = new Emitter();
        watcher[`onDid${name}`] = watcher.events[name].event;
      }
      watcher.dispose = () => {
        watchers.delete(watcher);
        for (const event of Object.values(watcher.events)) event.dispose();
      };
      watchers.add(watcher);
      return watcher;
    },
  };
  for (const name of [
    'OpenTextDocument',
    'CloseTextDocument',
    'ChangeTextDocument',
    'SaveTextDocument',
    'ChangeConfiguration',
    'GrantWorkspaceTrust',
    'ChangeWorkspaceFolders',
  ]) {
    events[name] = new Emitter();
    workspace[`onDid${name}`] = events[name].event;
  }
  const vscode = {
    workspace,
    EventEmitter: Emitter,
    Uri: class {},
    RelativePattern: class {
      constructor(base, pattern) {
        this.base = base;
        this.pattern = pattern;
      }
    },
    SemanticTokensLegend: class {
      constructor(tokenTypes, tokenModifiers) {
        Object.assign(this, { tokenTypes, tokenModifiers });
      }
    },
    Range: class {
      constructor(start, end) {
        Object.assign(this, { start, end });
      }
    },
    SemanticTokensBuilder: class {
      constructor() {
        this.tokens = [];
      }
      push(range) {
        this.tokens.push(range);
      }
      build() {
        const data = [];
        let line = 0,
          character = 0;
        this.tokens.sort(
          (a, b) =>
            a.start.line - b.start.line ||
            a.start.character - b.start.character,
        );
        for (const token of this.tokens) {
          data.push(
            token.start.line - line,
            token.start.line === line
              ? token.start.character - character
              : token.start.character,
            token.end.character - token.start.character,
            0,
            0,
          );
          line = token.start.line;
          character = token.start.character;
        }
        return { data: new Uint32Array(data) };
      }
    },
    window: {
      showInformationMessage: (message) => {
        messages.push(message);
        return Promise.resolve();
      },
      showWarningMessage: (message) => {
        messages.push(message);
        return Promise.resolve();
      },
    },
  };
  const cache = new Map();
  function load(name) {
    const filename = path.resolve(
      sourceRoot,
      name.endsWith('.js') ? name : `${name}.js`,
    );
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const localRequire = (id) => {
      if (id === 'vscode') return vscode;
      if (id === 'fs/promises' || id === 'node:fs/promises')
        return { ...fs, ...fsOverrides };
      return id.startsWith('.')
        ? load(path.resolve(path.dirname(filename), id))
        : require(id);
    };
    vm.runInThisContext(
      `(function(require,module,exports,__filename,__dirname){${fsSync.readFileSync(filename, 'utf8')}\n})`,
      { filename },
    )(localRequire, module, module.exports, filename, path.dirname(filename));
    return module.exports;
  }
  const api = {
    dir,
    main,
    game,
    settings,
    workspace,
    events,
    watchers,
    messages,
    put,
    load,
    file: (name = 'defs.txt', family = 'effects', root = main) =>
      path.join(root, `common/scripted_${family}`, name),
    async service() {
      const { ScriptedSemanticService } = load('scriptedSemanticService');
      const service = new ScriptedSemanticService({ subscriptions: [] });
      services.push(service);
      await service.initialize();
      await waitFor(() => !service.rebuilding && !service.fullRebuildTimer);
      return service;
    },
    emit(name, value) {
      events[name].fire(value);
    },
    fsEvent(name, file) {
      for (const watcher of [...watchers]) {
        const relative = path
          .relative(watcher.pattern.base, file)
          .split(path.sep)
          .join('/');
        if (path.matchesGlob(relative, watcher.pattern.pattern))
          watcher.events[name].fire({ scheme: 'file', fsPath: file });
      }
    },
    keys(service, doc) {
      const { data } = service.provideDocumentSemanticTokens(doc);
      const keys = [];
      let line = 0,
        character = 0;
      for (let index = 0; index < data.length; index += 5) {
        character =
          data[index] === 0 ? character + data[index + 1] : data[index + 1];
        line += data[index];
        const start = doc.offsetAt({ line, character });
        keys.push(doc.getText().slice(start, start + data[index + 2]));
      }
      return keys;
    },
  };
  t.after(async () => {
    for (const service of services) service.dispose();
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
    assert(path.basename(dir).startsWith('ck3-semantic-'));
    await fs.rm(dir, { recursive: true, force: true });
  });
  return api;
}

test('comments between an assignment key and operator preserve the definition', async (t) => {
  const f = await fixture(t),
    parser = f.load('shallowScriptParser');
  assert.deepEqual(
    [
      ...parser.getParameterizedDefinitionsForFamily(
        'say # note\n = { add_gold = $X$ }',
      ),
    ],
    ['say'],
  );
});

test('direct-child lookups do not rescan all assignments', async (t) => {
  const f = await fixture(t),
    parser = f.load('shallowScriptParser');
  const parsed = parser.parseScript('foo = { X = 1 nested = { Y = 2 } Z = 3 }');
  parsed.assignments.filter = () => {
    throw new Error('full assignment scan');
  };
  assert.deepEqual(
    parser
      .getDirectChildren(parsed, parsed.assignments[0].blockId)
      .map((item) => item.lhs),
    ['X', 'nested', 'Z'],
  );
});

test('a last nonparameterized definition shadows an earlier definition in the same file', async (t) => {
  const f = await fixture(t),
    parser = f.load('shallowScriptParser');
  assert.deepEqual(
    [
      ...parser.getParameterizedDefinitionsForFamily(
        'foo = { add_gold = $X$ } foo = { add_gold = 1 }',
      ),
    ],
    [],
  );
  assert.deepEqual(
    [
      ...parser.getParameterizedDefinitionsForFamily(
        'foo = { # $X$\n debug_log = "$TEXT$" }',
      ),
    ],
    [],
  );
});

test('indexes ignore non-txt files in every scripted family', async (t) => {
  const f = await fixture(t);
  for (const family of ['effects', 'triggers', 'modifiers'])
    await f.put(f.file('old.txt.bak', family), 'ghost = { value = $X$ }');
  const s = await f.service();
  assert.deepEqual([...s.currentIndex.any], []);
});

test('last definitions win across files, including nonparameterized overrides', async (t) => {
  const f = await fixture(t);
  for (const family of ['effects', 'triggers', 'modifiers']) {
    await f.put(
      f.file('a.txt', family, path.join(f.game, 'game')),
      'dup = { value = $X$ }',
    );
    await f.put(f.file('z.txt', family), 'dup = { value = 1 }');
  }
  const s = await f.service();
  assert.deepEqual([...s.currentIndex.any], []);
});

test('definition precedence follows filename order, not root order alone', async (t) => {
  const f = await fixture(t);
  await f.put(
    f.file('z.txt', 'effects', path.join(f.game, 'game')),
    'dup = { add_gold = 1 }',
  );
  await f.put(f.file('a.txt'), 'dup = { add_gold = $X$ }');
  const s = await f.service();
  assert(!s.currentIndex.any.has('dup'));
});

test('same-path file replacement and exact replace_path semantics remain intact', async (t) => {
  const f = await fixture(t),
    vanilla = path.join(f.game, 'game');
  await f.put(f.file('a.txt', 'effects', vanilla), 'hidden = { value = $X$ }');
  await f.put(f.file('a.txt'), 'visible = { value = $X$ }');
  await f.put(
    f.file('sub/nested.txt', 'effects', vanilla),
    'nested = { value = $X$ }',
  );
  await f.put(
    path.join(f.main, 'descriptor.mod'),
    'replace_path = "common/scripted_effects"',
  );
  const s = await f.service();
  assert.deepEqual([...s.currentIndex.any].sort(), ['nested', 'visible']);
});

test('saving and closing a definition cannot resurrect an old disk snapshot', async (t) => {
  const f = await fixture(t),
    a = f.file('a.txt'),
    b = f.file('b.txt');
  await f.put(a, 'old = { add_gold = $X$ }');
  await f.put(b, 'other = { add_gold = $X$ }');
  const s = await f.service(),
    doc = document(a, 'new = { add_gold = $X$ }');
  f.emit('ChangeTextDocument', { document: doc });
  await f.put(a, doc.getText());
  f.emit('SaveTextDocument', doc);
  f.emit('CloseTextDocument', doc);
  await waitFor(() => !s.rebuilding && !s.fullRebuildTimer);
  f.emit('ChangeTextDocument', {
    document: document(b, 'other = { add_gold = $X$ } # edit'),
  });
  assert(s.currentIndex.any.has('new'));
  assert(!s.currentIndex.any.has('old'));
});

test('closing an unsaved overlay restores disk definitions', async (t) => {
  const f = await fixture(t),
    a = f.file();
  await f.put(a, 'disk = { add_gold = $X$ }');
  const s = await f.service(),
    doc = document(a, 'unsaved = { add_gold = $X$ }');
  f.emit('ChangeTextDocument', { document: doc });
  assert(s.currentIndex.any.has('unsaved'));
  f.emit('CloseTextDocument', doc);
  await waitFor(() => !s.rebuilding && !s.fullRebuildTimer);
  assert.deepEqual([...s.currentIndex.any], ['disk']);
});

test('new definition files are indexed when opened and saved', async (t) => {
  const f = await fixture(t),
    s = await f.service(),
    file = f.file('new.txt');
  await f.put(file, 'added = { add_gold = $X$ }');
  const doc = document(file, await fs.readFile(file, 'utf8'));
  f.emit('OpenTextDocument', doc);
  f.emit('SaveTextDocument', doc);
  await waitFor(() => !s.rebuilding && !s.fullRebuildTimer);
  assert(s.currentIndex.any.has('added'));
});

test('filesystem create, change and delete update closed definition files', async (t) => {
  const f = await fixture(t),
    file = f.file(),
    s = await f.service();
  await f.put(file, 'added = { add_gold = $X$ }');
  f.fsEvent('Create', file);
  await waitFor(() => s.currentIndex.any.has('added'));
  await f.put(file, 'changed = { add_gold = $X$ }');
  f.fsEvent('Change', file);
  await waitFor(() => s.currentIndex.any.has('changed'));
  assert(!s.currentIndex.any.has('added'));
  await fs.unlink(file);
  f.fsEvent('Delete', file);
  await waitFor(() => s.currentIndex.any.size === 0);
});

test('plaintext config edits and close use their current overlay then disk state', async (t) => {
  const f = await fixture(t),
    dependency = path.join(f.dir, 'dependency');
  await f.put(path.join(dependency, 'descriptor.mod'), 'name = "Dependency"');
  await f.put(
    f.file('dep.txt', 'effects', dependency),
    'dependency = { value = $X$ }',
  );
  const configPath = path.join(f.main, 'ck3-tiger.conf');
  await f.put(configPath, '');
  const s = await f.service(),
    config = document(
      configPath,
      'load_mod = { modfile = "../dependency/descriptor.mod" }',
      'plaintext',
    );
  f.emit('ChangeTextDocument', { document: config });
  await waitFor(() => !s.rebuilding && !s.fullRebuildTimer);
  assert(s.currentIndex.any.has('dependency'));
  f.emit('CloseTextDocument', config);
  await waitFor(() => !s.rebuilding && !s.fullRebuildTimer);
  assert(!s.currentIndex.any.has('dependency'));
});

test('external plaintext config and descriptor changes invalidate load order', async (t) => {
  const f = await fixture(t),
    dependency = path.join(f.dir, 'dep');
  await f.put(path.join(dependency, 'descriptor.mod'), 'name = "Dependency"');
  await f.put(
    f.file('dep.txt', 'effects', dependency),
    'dependency = { value = $X$ }',
  );
  const s = await f.service(),
    config = path.join(f.main, 'ck3-tiger.conf');
  await f.put(config, 'load_mod = { modfile = "../dep/descriptor.mod" }');
  f.fsEvent('Create', config);
  await waitFor(() => s.currentIndex.any.has('dependency'));
  const descriptor = path.join(f.main, 'descriptor.mod');
  await f.put(descriptor, 'replace_path = "common/scripted_effects"');
  f.fsEvent('Change', descriptor);
  await waitFor(() => !s.currentIndex.any.has('dependency'));
});

test('plaintext descriptor overlays update replace_path without language filtering', async (t) => {
  const f = await fixture(t);
  await f.put(
    f.file('base.txt', 'effects', path.join(f.game, 'game')),
    'base = { value = $X$ }',
  );
  const s = await f.service(),
    doc = document(
      path.join(f.main, 'descriptor.mod'),
      'replace_path = "common/scripted_effects"',
      'plaintext',
    );
  f.emit('ChangeTextDocument', { document: doc });
  await waitFor(() => !s.rebuilding && !s.fullRebuildTimer);
  assert(!s.currentIndex.any.has('base'));
});

test('Workshop fallback is used when modfile does not exist', async (t) => {
  const f = await fixture(t),
    paradox = path.join(f.dir, 'PDX'),
    dependency = path.join(f.dir, 'workshop');
  f.settings.ck3tiger.modPath = path.join(paradox, 'mod/main.mod');
  await f.put(
    f.settings.ck3tiger.modPath,
    `path = "${f.main.replace(/\\/g, '/')}"`,
  );
  await f.put(
    path.join(paradox, 'mod/ugc_123.mod'),
    `path = "${dependency.replace(/\\/g, '/')}"`,
  );
  await f.put(
    f.file('dep.txt', 'effects', dependency),
    'dependency = { value = $X$ }',
  );
  await f.put(
    path.join(f.main, 'ck3-tiger.conf'),
    'load_mod = { modfile = "missing.mod" workshop_id = 123 }',
  );
  const s = await f.service();
  assert(s.currentIndex.any.has('dependency'));
});

test('own path settings override Tiger and empty defaults fall back to Tiger', async (t) => {
  const f = await fixture(t),
    own = path.join(f.dir, 'own');
  await f.put(path.join(own, 'descriptor.mod'), 'name = "Own"');
  await f.put(f.file('own.txt', 'effects', own), 'own = { value = $X$ }');
  await f.put(f.file(), 'tiger = { value = $X$ }');
  f.settings.ck3Highlight.modPath = own;
  f.settings.ck3Highlight.gamePath = f.game;
  const s = await f.service();
  assert(s.currentIndex.any.has('own'));
  assert(!s.currentIndex.any.has('tiger'));
  f.settings.ck3Highlight.modPath = '';
  f.settings.ck3Highlight.gamePath = '';
  f.emit('ChangeConfiguration', {
    affectsConfiguration: (name) => name === 'ck3Highlight.modPath',
  });
  await waitFor(() => !s.rebuilding && !s.fullRebuildTimer);
  assert(s.currentIndex.any.has('tiger'));
  assert(!s.currentIndex.any.has('own'));
});

test('an explicit mod path works without a game installation', async (t) => {
  const f = await fixture(t);
  f.settings.ck3tiger = {};
  f.settings.ck3Highlight.modPath = f.main;
  await f.put(f.file(), 'mod_only = { value = $X$ }');
  const s = await f.service();
  assert.deepEqual(
    f.keys(
      s,
      document(path.join(f.main, 'events/event.txt'), 'mod_only = { X = 1 }'),
    ),
    ['X'],
  );
});

test('missing settings allow CK3 local highlighting but do not enable other language modes', async (t) => {
  const f = await fixture(t);
  f.settings.ck3tiger = {};
  const s = await f.service(),
    text = 'local = { value = $X$ } wrapper = { local = { X = 1 } }';
  assert.deepEqual(
    f.keys(s, document(path.join(f.dir, 'local.txt'), text, 'ck3')),
    ['X'],
  );
  assert.deepEqual(
    f.keys(s, document(path.join(f.dir, 'local.txt'), text, 'paradox')),
    [],
  );
  assert.deepEqual(
    f.keys(s, document(path.join(f.dir, 'local.yml'), text, 'yaml')),
    [],
  );
  assert.deepEqual(f.messages, []);
});

test('CK3 globals cannot contaminate other games or sibling-prefix directories', async (t) => {
  const f = await fixture(t);
  await f.put(f.file(), 'country_event = { value = $X$ }');
  const s = await f.service(),
    text = 'country_event = { id = test.1 title = test.1.t desc = test.1.d }';
  for (const root of [path.join(f.dir, 'EU4'), `${f.main}-other`])
    assert.deepEqual(
      f.keys(s, document(path.join(root, 'event.eu4'), text, 'paradox')),
      [],
    );
  assert.deepEqual(
    f.keys(s, document(path.join(f.main, 'events/event.txt'), text, 'paradox')),
    [],
  );
  assert.deepEqual(
    f.keys(s, document(path.join(f.main, 'events/event.txt'), text, 'ck3')),
    ['id', 'title', 'desc'],
  );
});

test('semantic.enabled disables tokens and filesystem activity until enabled again', async (t) => {
  const f = await fixture(t);
  f.settings.ck3Highlight['semantic.enabled'] = false;
  await f.put(f.file(), 'global = { value = $X$ }');
  const s = await f.service();
  const doc = document(
    path.join(f.main, 'event.txt'),
    'local = { value = $X$ } wrapper = { local = { X = 1 } }',
  );
  assert.deepEqual(f.keys(s, doc), []);
  assert.equal(f.watchers.size, 0);
  f.settings.ck3Highlight['semantic.enabled'] = true;
  f.emit('ChangeConfiguration', {
    affectsConfiguration: (name) => name === 'ck3Highlight.semantic.enabled',
  });
  await waitFor(() => !s.rebuilding && !s.fullRebuildTimer);
  assert.deepEqual(f.keys(s, doc), ['X']);
  assert(s.currentIndex.any.has('global'));
  f.settings.ck3Highlight['semantic.enabled'] = false;
  f.emit('ChangeConfiguration', {
    affectsConfiguration: (name) => name === 'ck3Highlight.semantic.enabled',
  });
  await waitFor(() => !s.rebuilding && !s.fullRebuildTimer);
  assert.equal(f.watchers.size, 0);
  assert.deepEqual(f.keys(s, doc), []);
});

test('reenabling semantic highlighting refreshes documents edited while disabled', async (t) => {
  const f = await fixture(t);
  const file = f.file();
  await f.put(file, 'old = { value = $X$ }');
  const definition = document(file, 'old = { value = $X$ }');
  f.workspace.textDocuments.push(definition);
  const s = await f.service();
  assert(s.currentIndex.any.has('old'));
  f.settings.ck3Highlight['semantic.enabled'] = false;
  f.emit('ChangeConfiguration', {
    affectsConfiguration: (name) => name === 'ck3Highlight.semantic.enabled',
  });
  await waitFor(() => !s.rebuilding && !s.fullRebuildTimer);
  definition.setText('new = { value = $X$ }');
  await f.put(file, definition.getText());
  f.emit('ChangeTextDocument', { document: definition });
  f.emit('SaveTextDocument', definition);
  f.settings.ck3Highlight['semantic.enabled'] = true;
  f.emit('ChangeConfiguration', {
    affectsConfiguration: (name) => name === 'ck3Highlight.semantic.enabled',
  });
  await waitFor(() => !s.rebuilding && !s.fullRebuildTimer);
  assert(s.currentIndex.any.has('new'));
  assert(!s.currentIndex.any.has('old'));
  assert.deepEqual(
    f.keys(
      s,
      document(path.join(f.main, 'event.txt'), 'wrapper = { new = { X = 1 } }'),
    ),
    ['X'],
  );
});

test('I/O rebuild errors are reported, caught and do not leave a stale index', async (t) => {
  let denied = false;
  const f = await fixture(t, {
    readdir: async (...args) => {
      if (denied)
        throw Object.assign(new Error('fixture denied'), { code: 'EACCES' });
      return fs.readdir(...args);
    },
  });
  await f.put(f.file(), 'old = { value = $X$ }');
  const s = await f.service();
  denied = true;
  await assert.doesNotReject(s.rebuildIndex());
  assert.equal(s.currentIndex, null);
  assert(f.messages.some((message) => /denied|EACCES/.test(message)));
  denied = false;
  await s.rebuildIndex();
  assert(s.currentIndex.any.has('old'));
});

test('untrusted workspaces do not read external roots but local tokens still work', async (t) => {
  let reads = 0;
  const f = await fixture(t, {
    readFile: async (...args) => {
      reads++;
      return fs.readFile(...args);
    },
  });
  f.workspace.isTrusted = false;
  await f.put(f.file(), 'global = { value = $X$ }');
  const s = await f.service();
  assert.equal(reads, 0);
  assert.equal(f.watchers.size, 0);
  assert.deepEqual(
    f.keys(
      s,
      document(
        path.join(f.main, 'local.txt'),
        'local = { value = $X$ } wrapper = { local = { X = 1 } }',
      ),
    ),
    ['X'],
  );
  f.workspace.isTrusted = true;
  f.emit('GrantWorkspaceTrust');
  await waitFor(() => !s.rebuilding && !s.fullRebuildTimer);
  assert(s.currentIndex.any.has('global'));
});

test('dispose removes hooks, watchers, refreshes and queued rebuilds', async (t) => {
  let reads = 0;
  const f = await fixture(t, {
    readFile: async (...args) => {
      reads++;
      return fs.readFile(...args);
    },
  });
  await f.put(f.file(), 'global = { value = $X$ }');
  const s = await f.service();
  let refreshes = 0;
  s.onDidChangeSemanticTokens(() => refreshes++);
  s.scheduleFullRebuild(25);
  s.dispose();
  const before = reads;
  f.emit('OpenTextDocument', document(f.file(), 'next = { value = $X$ }'));
  f.emit('ChangeConfiguration', { affectsConfiguration: () => true });
  s.scheduleFullRebuild(0);
  await s.rebuildIndex();
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(reads, before);
  assert.equal(refreshes, 0);
  assert.equal(f.watchers.size, 0);
  assert.deepEqual(
    f.keys(
      s,
      document(
        f.file(),
        'local = { value = $X$ } wrapper = { local = { X = 1 } }',
      ),
    ),
    [],
  );
});

test('pending rebuilds publish the newest definitions after an in-flight build', async (t) => {
  let block = false,
    entered,
    release;
  const enteredPromise = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const f = await fixture(t, {
    readFile: async (...args) => {
      if (block && path.basename(args[0]) === 'descriptor.mod') {
        block = false;
        entered();
        await gate;
      }
      return fs.readFile(...args);
    },
  });
  await f.put(f.file(), 'old = { value = $X$ }');
  const s = await f.service();
  block = true;
  const building = s.rebuildIndex();
  await enteredPromise;
  await f.put(f.file(), 'new = { value = $X$ }');
  await s.rebuildIndex();
  release();
  await building;
  await waitFor(() => !s.rebuilding && !s.fullRebuildTimer);
  assert.deepEqual([...s.currentIndex.any], ['new']);
});

test('dispose during a pending rebuild prevents publication and further scans', async (t) => {
  let block = false,
    entered,
    release,
    scans = 0;
  const enteredPromise = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const f = await fixture(t, {
    readFile: async (...args) => {
      if (block && path.basename(args[0]) === 'descriptor.mod') {
        block = false;
        entered();
        await gate;
      }
      return fs.readFile(...args);
    },
    readdir: async (...args) => {
      scans++;
      return fs.readdir(...args);
    },
  });
  await f.put(f.file(), 'old = { value = $X$ }');
  const s = await f.service();
  block = true;
  const building = s.rebuildIndex();
  await enteredPromise;
  await s.rebuildIndex();
  const before = scans;
  s.dispose();
  release();
  await building;
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(scans, before);
  assert.equal(s.fullRebuildTimer, null);
});

test('nested scripted calls produce ordered nonoverlapping parameter tokens', async (t) => {
  const f = await fixture(t);
  await f.put(f.file(), 'foo = { value = $X$ }');
  const s = await f.service();
  const doc = document(
    path.join(f.main, 'events/event.txt'),
    'foo = { X = 1 foo = { Y = 2 } Z = 3 }',
  );
  assert.deepEqual(f.keys(s, doc), ['X', 'foo', 'Y', 'Z']);
});

test('already-open plaintext dependency descriptors keep their overlay when first loaded', async (t) => {
  const f = await fixture(t),
    dependency = path.join(f.dir, 'dependency');
  await f.put(path.join(dependency, 'descriptor.mod'), 'name = "Dependency"');
  await f.put(
    f.file('base.txt', 'effects', path.join(f.game, 'game')),
    'base = { value = $X$ }',
  );
  const s = await f.service();
  f.emit(
    'OpenTextDocument',
    document(
      path.join(dependency, 'descriptor.mod'),
      'replace_path = "common/scripted_effects"',
      'plaintext',
    ),
  );
  const config = path.join(f.main, 'ck3-tiger.conf');
  await f.put(
    config,
    'load_mod = { modfile = "../dependency/descriptor.mod" }',
  );
  f.fsEvent('Create', config);
  await waitFor(() => !s.rebuilding && !s.fullRebuildTimer);
  assert(!s.currentIndex.any.has('base'));
});

test('dispose during indexing stops subsequent filesystem reads', async (t) => {
  let block = false,
    entered,
    release,
    reads = 0;
  const enteredPromise = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const f = await fixture(t, {
    readFile: async (...args) => {
      reads++;
      if (block && path.basename(args[0]) === 'a.txt') {
        block = false;
        entered();
        await gate;
      }
      return fs.readFile(...args);
    },
  });
  await f.put(f.file('a.txt'), 'a = { value = $X$ }');
  await f.put(f.file('b.txt'), 'b = { value = $X$ }');
  const s = await f.service();
  block = true;
  const building = s.rebuildIndex();
  await enteredPromise;
  const before = reads;
  s.dispose();
  release();
  await building;
  assert.equal(reads, before);
});

test('editing an event file does not enumerate global definition records', async (t) => {
  const f = await fixture(t);
  await f.put(f.file(), 'foo = { value = $X$ }');
  const s = await f.service();
  let scans = 0;
  for (const record of s.currentIndex.recordsByFamily.effects) {
    record.definitions[Symbol.iterator] = function () {
      scans++;
      return Map.prototype[Symbol.iterator].call(this);
    };
  }
  const doc = document(
    path.join(f.main, 'events/event.txt'),
    'foo = { X = 1 }',
  );
  f.emit('ChangeTextDocument', { document: doc });
  assert.deepEqual(f.keys(s, doc), ['X']);
  assert.equal(scans, 0);
});

test('reopened document instances cannot reuse stale text at the same version', async (t) => {
  const f = await fixture(t),
    { OpenDocumentOverlay } = f.load('openDocumentOverlay');
  const overlay = new OpenDocumentOverlay(),
    file = f.file();
  overlay.update(document(file, 'old = { value = $X$ }'));
  const current = overlay.update(document(file, 'new = { value = $X$ }'));
  assert.deepEqual([...current.definitions.keys()], ['new']);
});
