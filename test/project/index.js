const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const vscode = require('vscode');
const {
  resolveTigerCompatibleLoadOrder,
} = require('../../src/semantic/tigerCompatibleResolver');
const { buildLoadOrderIndex } = require('../../src/semantic/loadOrderIndex');
const {
  OpenDocumentOverlay,
} = require('../../src/semantic/openDocumentOverlay');
const { formatScript } = require('../../src/formatter');

function textFiles(root) {
  const result = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'dist'].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (
        entry.isFile() &&
        /\.(?:txt|gui|asset|settings|yml|yaml|font|terrain|heightmap|mod)$/.test(
          entry.name,
        )
      )
        result.push(file);
    }
  }
  walk(root);
  return result.sort();
}

function hash(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function waitFor(check, message) {
  const deadline = performance.now() + 30000;
  while (performance.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out: ' + message);
}

async function tokenKeys(document) {
  const tokens = await vscode.commands.executeCommand(
    'vscode.provideDocumentSemanticTokens',
    document.uri,
  );
  if (!tokens) return null;
  const keys = [];
  let line = 0,
    column = 0;
  for (let i = 0; i < tokens.data.length; i += 5) {
    line += tokens.data[i];
    column =
      tokens.data[i] === 0 ? column + tokens.data[i + 1] : tokens.data[i + 1];
    keys.push(
      document.lineAt(line).text.slice(column, column + tokens.data[i + 2]),
    );
  }
  return keys;
}

async function run() {
  const passed = [],
    metrics = {};
  const root = process.env.CK3_HIGHLIGHT_PROJECT;
  const temp = process.env.CK3_HIGHLIGHT_TEST_TEMP;
  let snapshots = new Map(),
    lag;
  try {
    snapshots = new Map(textFiles(root).map((file) => [file, hash(file)]));
    const extension = vscode.extensions.getExtension('Yusseter.ck3-highlight');
    await extension.activate();
    lag = monitorEventLoopDelay({ resolution: 20 });
    lag.enable();
    const start = performance.now();
    const resolved = await resolveTigerCompatibleLoadOrder(
      new OpenDocumentOverlay(),
    );
    assert(resolved.ready, resolved.reason);
    const index = await buildLoadOrderIndex(resolved);
    lag.disable();
    metrics.indexMs = Math.round(performance.now() - start);
    metrics.scriptedFiles = index.sourceFiles.size;
    metrics.parameterizedDefinitions = index.any.size;
    metrics.eventLoopMaxMs = Math.round(lag.max / 1e6);
    assert(
      index.sourceFiles.size > 0 && index.any.size > 0,
      'vanilla scripted definitions were not indexed',
    );
    passed.push('real game and mod load order/index are readable');

    const sampled = [...snapshots.keys()]
      .filter((file) => !file.endsWith('.mod'))
      .slice(0, 12);
    assert(sampled.length > 0, 'no real text files found');
    metrics.sampledFiles = sampled.map((file) => path.relative(root, file));
    for (const file of sampled) {
      const doc = await vscode.workspace.openTextDocument(file);
      const localization =
        /\.ya?ml$/.test(file) &&
        /^\uFEFF?[\s\S]*?l_[A-Za-z_]+:/m.test(doc.getText());
      await waitFor(
        () => doc.languageId === (localization ? 'ck3-localization' : 'ck3'),
        'language detection: ' + file,
      );
      if (!localization) {
        const options = { tabSize: 4, insertSpaces: false };
        const formatted = formatScript(doc.getText(), options);
        assert.equal(
          formatScript(formatted, options),
          formatted,
          'formatter is not idempotent: ' + file,
        );
        const edits = await vscode.commands.executeCommand(
          'vscode.executeFormatDocumentProvider',
          doc.uri,
          options,
        );
        assert(Array.isArray(edits), 'no formatter result: ' + file);
        let preview = doc.getText();
        for (const edit of [...edits].sort(
          (a, b) => doc.offsetAt(b.range.start) - doc.offsetAt(a.range.start),
        )) {
          preview =
            preview.slice(0, doc.offsetAt(edit.range.start)) +
            edit.newText +
            preview.slice(doc.offsetAt(edit.range.end));
        }
        assert.equal(preview, formatted, 'format preview differs: ' + file);
        assert.equal(
          doc.isDirty,
          false,
          'format preview modified a real document',
        );
      }
    }
    passed.push(
      'sampled real script/localization files open and formatting remains a read-only preview',
    );

    const overlay = path.join(temp, 'probe-mod');
    const effects = path.join(overlay, 'common', 'scripted_effects');
    fs.mkdirSync(effects, { recursive: true });
    fs.writeFileSync(
      path.join(overlay, 'descriptor.mod'),
      'name = "Editor test overlay"',
    );
    const realDescriptor = path
      .join(root, 'descriptor.mod')
      .replace(/\\/g, '/');
    fs.writeFileSync(
      path.join(overlay, 'ck3-tiger.conf'),
      'load_mod = { modfile = "' + realDescriptor + '" }',
    );
    const definition = path.join(effects, 'probe.txt');
    const parameterized =
      'codex_highlight_project_probe = { debug_log = $MESSAGE$ }';
    fs.writeFileSync(definition, parameterized);
    const probeFile = path.join(overlay, 'probe.txt');
    fs.writeFileSync(
      probeFile,
      'root = {\n codex_highlight_project_probe = { MESSAGE = yes }\n codex_highlight_project_created = { VALUE = yes }\n}',
    );
    await vscode.workspace
      .getConfiguration('ck3Highlight')
      .update('modPath', overlay, vscode.ConfigurationTarget.Global);
    const overlayLoadOrder = await resolveTigerCompatibleLoadOrder(
      new OpenDocumentOverlay(),
    );
    assert(
      overlayLoadOrder.loadedMods.some(
        (mod) => path.resolve(mod.root) === path.resolve(root),
      ),
      'temporary overlay must load the real source mod',
    );
    const probe = await vscode.workspace.openTextDocument(probeFile);
    await waitFor(
      async () => (await tokenKeys(probe))?.join(',') === 'MESSAGE',
      'global scripted-parameter token',
    );
    passed.push(
      'real extension provider resolves parameters through the game/mod index',
    );

    const changeStart = performance.now();
    fs.writeFileSync(
      definition,
      'codex_highlight_project_probe = { debug_log = "constant" }',
    );
    await waitFor(
      async () => (await tokenKeys(probe))?.length === 0,
      'watcher update after external save',
    );
    metrics.externalSaveMs = Math.round(performance.now() - changeStart);
    fs.writeFileSync(definition, parameterized);
    await waitFor(
      async () => (await tokenKeys(probe))?.join(',') === 'MESSAGE',
      'parameter restoration',
    );
    passed.push('external save refreshes scripted definitions');

    const created = path.join(effects, 'created.txt');
    fs.writeFileSync(
      created,
      'codex_highlight_project_created = { debug_log = $VALUE$ }',
    );
    await waitFor(
      async () => (await tokenKeys(probe))?.join(',') === 'MESSAGE,VALUE',
      'new definition file',
    );
    fs.unlinkSync(created);
    await waitFor(
      async () => (await tokenKeys(probe))?.join(',') === 'MESSAGE',
      'deleted definition file',
    );
    passed.push('native filesystem watchers handle file creation and deletion');

    const effectDoc = await vscode.workspace.openTextDocument(definition);
    const editor = await vscode.window.showTextDocument(effectDoc);
    await editor.edit((edit) =>
      edit.replace(
        new vscode.Range(
          effectDoc.positionAt(0),
          effectDoc.positionAt(effectDoc.getText().length),
        ),
        'codex_highlight_project_probe = { debug_log = "unsaved" }',
      ),
    );
    await waitFor(
      async () => (await tokenKeys(probe))?.length === 0,
      'unsaved definition edit',
    );
    await effectDoc.save();
    fs.writeFileSync(definition, parameterized);
    await waitFor(
      async () => (await tokenKeys(probe))?.join(',') === 'MESSAGE',
      'saved/reloaded definition',
    );
    passed.push(
      'unsaved and saved editor changes refresh the semantic overlay',
    );
  } catch (error) {
    metrics.error = error.stack;
  } finally {
    lag?.disable();
    try {
      for (const [file, original] of snapshots) {
        if (hash(file) !== original)
          metrics.error = 'Real source text changed during the test: ' + file;
      }
    } catch (error) {
      metrics.error = 'Cannot verify real source text: ' + error.message;
    }
    if (!metrics.error) passed.push('real source text hashes are unchanged');
    fs.writeFileSync(
      process.env.CK3_HIGHLIGHT_TEST_RESULT,
      JSON.stringify({ passed, metrics, error: metrics.error }),
    );
  }
  if (metrics.error) throw new Error(metrics.error);
}

module.exports = { run };
