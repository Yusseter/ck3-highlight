const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function activate(documents = [], associations = {}) {
  const registrations = {
    commands: new Map(),
    formatters: new Map(),
    languageConfigs: [],
    initializations: 0,
  };
  const disposable = () => ({ dispose() {} });
  class Range {
    constructor(a, b, c, d) {
      this.start = typeof a === 'number' ? { line: a, character: b } : a;
      this.end = typeof a === 'number' ? { line: c, character: d } : b;
    }
  }
  const vscode = {
    Range,
    EndOfLine: { CRLF: 2 },
    TextEdit: { replace: (range, text) => ({ range, text }) },
    window: {
      createOutputChannel: () => ({ ...disposable(), appendLine() {} }),
    },
    commands: {
      registerCommand: (name, fn) => {
        registrations.commands.set(name, fn);
        return disposable();
      },
      executeCommand: async () => {},
    },
    workspace: {
      textDocuments: documents,
      workspaceFolders: [],
      getConfiguration: (section) => ({
        get: (key, fallback) =>
          section === 'files' && key === 'associations'
            ? associations
            : fallback,
      }),
      onDidOpenTextDocument: disposable,
      onDidChangeConfiguration: disposable,
    },
    languages: {
      match: (selector, doc) =>
        ['**/*.txt', '**/*.yml'].includes(selector.pattern) &&
        doc.uri.fsPath.endsWith(selector.pattern.slice(4))
          ? 10
          : 0,
      setLanguageConfiguration: (id) => registrations.languageConfigs.push(id),
      setTextDocumentLanguage: async (doc, id) => {
        doc.languageId = id;
        return doc;
      },
      registerDocumentFormattingEditProvider: (id, provider) => {
        registrations.formatters.set(id, provider);
        return disposable();
      },
      registerDocumentRangeFormattingEditProvider: disposable,
      registerDocumentSemanticTokensProvider: disposable,
    },
  };
  class SemanticService {
    initialize() {
      registrations.initializations++;
    }
    dispose() {}
  }
  const entry = path.join(__dirname, '..', 'src', 'extension.js');
  const sandbox = {
    module: { exports: {} },
    require: (name) => {
      if (name === 'vscode') return vscode;
      if (name === './semantic/scriptedSemanticService')
        return { ScriptedSemanticService: SemanticService };
      return require(path.join(path.dirname(entry), name));
    },
  };
  vm.runInNewContext(fs.readFileSync(entry, 'utf8'), sandbox, {
    filename: entry,
  });
  const context = { subscriptions: [] };
  sandbox.module.exports.activate(context);
  return { ...registrations, context, vscode, registrations };
}

test('does not override YAML configuration or the global typing command', async () => {
  const doc = {
    uri: { scheme: 'file', fsPath: '/test/config.yml' },
    languageId: 'yaml',
    getText: () => 'name: example',
  };
  const result = activate([doc]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(result.registrations.initializations, 0);
  assert.equal(result.commands.has('type'), false);
  assert.deepEqual(result.languageConfigs, []);
});

test('registers script editing providers only for CK3', () => {
  assert.deepEqual([...activate().formatters.keys()], ['ck3']);
});

test('range formatting uses document context and does not delete the selected first-line indent', () => {
  const result = activate();
  const lines = ['outer = {', ' child = {', ' x = yes', ' }', '}'];
  const doc = {
    getText: () => lines.join('\n'),
    lineAt: (i) => ({ text: lines[i] }),
    eol: 1,
  };
  const provider = result.formatters.get('ck3');
  const [edit] = provider.provideDocumentRangeFormattingEdits(
    doc,
    new result.vscode.Range(1, 2, 3, 2),
    { tabSize: 2, insertSpaces: true },
  );
  assert.equal(edit.text, '  child = {\n    x = yes\n  }');
  assert.equal(edit.range.start.character, 0);
  assert.equal(edit.range.end.line, 3);
});

test('explicit user file associations take precedence over project detection', async () => {
  const doc = {
    uri: { scheme: 'file', fsPath: '/example/CK3/events/notes.txt' },
    languageId: 'plaintext',
    getText: () => 'notes',
  };
  activate([doc], { '**/*.txt': 'plaintext' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(doc.languageId, 'plaintext');
});

test('basename file association patterns are respected for scripts and localization', async () => {
  for (const [pattern, file, languageId, text] of [
    ['*.txt', '/example/CK3/events/notes.txt', 'plaintext', 'notes'],
    ['*.yml', '/example/text.yml', 'yaml', 'l_english:\n KEY:0 "Text"'],
  ]) {
    const doc = {
      uri: { scheme: 'file', fsPath: file },
      languageId,
      getText: () => text,
    };
    activate([doc], { [pattern]: languageId });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(doc.languageId, languageId);
  }
});
