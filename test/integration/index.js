const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

async function waitFor(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(predicate(), 'editor state did not settle');
}

async function run() {
  const results = [];
  try {
    const manifest = require('../../package.json');
    const extension = vscode.extensions.getExtension(
      `${manifest.publisher}.${manifest.name}`,
    );
    assert.ok(extension, 'development extension is registered');
    const configUris = [
      '.markdownlint-cli2.jsonc',
      'language-configuration.json',
      'localization-language-configuration.json',
      'package.json',
    ].map((file) => vscode.Uri.file(path.join(extension.extensionPath, file)));
    const checked = new Set();
    let lastDiagnosticChange = 0;
    const configKeys = new Set(configUris.map((uri) => uri.toString()));
    const diagnostics = vscode.languages.onDidChangeDiagnostics((event) => {
      for (const uri of event.uris) {
        if (configKeys.has(uri.toString())) {
          checked.add(uri.toString());
          lastDiagnosticChange = Date.now();
        }
      }
    });
    try {
      for (const uri of configUris) {
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, { preview: false });
        await vscode.commands.executeCommand(
          'vscode.executeDocumentSymbolProvider',
          uri,
        );
      }
      // The debounced manifest linter publishes separately from JSON validation.
      await waitFor(
        () =>
          configUris.every((uri) => checked.has(uri.toString())) &&
          Date.now() - lastDiagnosticChange >= 1000,
      );
      const warnings = configUris.flatMap((uri) =>
        vscode.languages
          .getDiagnostics(uri)
          .filter((item) => item.severity <= vscode.DiagnosticSeverity.Warning)
          .map((item) => path.basename(uri.fsPath) + ': ' + item.message),
      );
      assert.deepEqual(warnings, [], 'source configuration diagnostics');
    } finally {
      diagnostics.dispose();
    }
    results.push('source configurations have no JSON/schema warnings');
    const languageIds = await vscode.languages.getLanguages();
    assert(languageIds.includes('ck3'));
    assert(languageIds.includes('ck3-localization'));
    assert(!languageIds.includes('paradox-localization'));
    assert(!languageIds.includes('paradox'));
    results.push('only CK3 script/localization language modes are registered');
    const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const loc = await vscode.workspace.openTextDocument(
      path.join(folder, 'test_l_english.yml'),
    );
    const editor = await vscode.window.showTextDocument(loc);
    await waitFor(() => extension.isActive);
    await waitFor(() => loc.languageId === 'ck3-localization');
    results.push('localization language registration');
    let line = loc.lineAt(1).text;
    editor.selection = new vscode.Selection(
      1,
      line.length - 1,
      1,
      line.length - 1,
    );
    await vscode.commands.executeCommand('type', { text: '$' });
    assert.equal(loc.lineAt(1).text, ' KEY:0 "$$"');
    results.push('native dollar auto-closing inside a localization string');
    await editor.edit((edit) =>
      edit.replace(
        new vscode.Range(1, 0, 1, loc.lineAt(1).text.length),
        ' KEY:0 "word"',
      ),
    );
    line = loc.lineAt(1).text;
    const start = line.indexOf('word');
    editor.selection = new vscode.Selection(1, start, 1, start + 4);
    await vscode.commands.executeCommand('type', { text: '$' });
    assert.equal(loc.lineAt(1).text, ' KEY:0 "$word$"');
    results.push('native dollar surrounding of selected text');
    const localizationLine = loc.lineAt(1).text;
    editor.selection = new vscode.Selection(1, 0, 1, 0);
    await vscode.commands.executeCommand('editor.action.commentLine');
    assert.match(
      loc.lineAt(1).text,
      /^[\t ]*#/,
      'Unexpected commented localization line: ' +
        JSON.stringify(loc.lineAt(1).text),
    );
    await vscode.commands.executeCommand('editor.action.commentLine');
    assert.equal(loc.lineAt(1).text, localizationLine);
    results.push(
      'native localization comments preserve indentation and toggle back',
    );

    const yamlWithHeader = await vscode.workspace.openTextDocument(
      path.join(folder, 'not_ck3_l_english.yaml'),
    );
    await vscode.window.showTextDocument(yamlWithHeader);
    assert.equal(yamlWithHeader.languageId, 'yaml');
    results.push('.yaml stays YAML even with a CK3-style header and filename');

    const yaml = await vscode.workspace.openTextDocument(
      path.join(folder, 'normal.yaml'),
    );
    const yamlEditor = await vscode.window.showTextDocument(yaml);
    assert.equal(yaml.languageId, 'yaml');
    line = yaml.lineAt(0).text;
    yamlEditor.selection = new vscode.Selection(
      0,
      line.length - 1,
      0,
      line.length - 1,
    );
    await vscode.commands.executeCommand('type', { text: '$' });
    assert.equal(yaml.getText(), 'title: "$"');
    results.push('ordinary YAML keeps its own language and typing behavior');

    const script = await vscode.workspace.openTextDocument(
      path.join(folder, 'events', 'example.txt'),
    );
    const scriptEditor = await vscode.window.showTextDocument(script);
    await waitFor(() => script.languageId === 'ck3');
    scriptEditor.options = { tabSize: 2, insertSpaces: true };
    await waitFor(() => scriptEditor.options.tabSize === 2);
    await vscode.commands.executeCommand('editor.action.formatDocument');
    assert.equal(
      script.getText(),
      'root = {\n  x = "first\n      keep spaces  \n   last"\n}',
    );
    results.push(
      'project detection and real Format Document preserve multiline text',
    );
    const scriptLine = script.lineAt(1).text;
    scriptEditor.selection = new vscode.Selection(1, 0, 1, 0);
    await vscode.commands.executeCommand('editor.action.commentLine');
    assert(script.lineAt(1).text.startsWith('  #'));
    await vscode.commands.executeCommand('editor.action.commentLine');
    assert.equal(script.lineAt(1).text, scriptLine);
    results.push(
      'native CK3 script comments preserve indentation and toggle back',
    );

    fs.mkdirSync(path.join(folder, 'fonts'), { recursive: true });
    fs.writeFileSync(
      path.join(folder, 'fonts', 'example.font'),
      'fontfiles = { name = "Example" }',
    );
    const font = await vscode.workspace.openTextDocument(
      path.join(folder, 'fonts', 'example.font'),
    );
    await waitFor(() => font.languageId === 'ck3');
    fs.writeFileSync(
      path.join(folder, '..', 'unrelated.font'),
      'ordinary application data',
    );
    const unrelated = await vscode.workspace.openTextDocument(
      path.join(folder, '..', 'unrelated.font'),
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(unrelated.languageId, 'plaintext');
    results.push(
      'additional game formats are detected only in the mod context',
    );

    const configuredMod = path.join(folder, '..', 'configured-mod');
    fs.mkdirSync(path.join(configuredMod, 'events'), { recursive: true });
    const descriptor = path.join(configuredMod, 'descriptor.mod');
    fs.writeFileSync(descriptor, 'name = "Configured project"');
    const launcher = path.join(folder, '..', 'configured.mod');
    fs.writeFileSync(
      launcher,
      'path = "' + configuredMod.replace(/\\/g, '/') + '"',
    );
    for (const [index, setting] of [
      configuredMod,
      descriptor,
      launcher,
    ].entries()) {
      await vscode.workspace
        .getConfiguration('ck3Highlight')
        .update('modPath', setting, vscode.ConfigurationTarget.Workspace);
      const file = path.join(configuredMod, 'events', 'mode-' + index + '.txt');
      fs.writeFileSync(file, 'root = { value = yes }');
      const configured = await vscode.workspace.openTextDocument(file);
      await waitFor(() => configured.languageId === 'ck3');
    }
    await vscode.workspace
      .getConfiguration('ck3Highlight')
      .update('modPath', '', vscode.ConfigurationTarget.Workspace);
    results.push(
      'configured folders and both descriptor forms select marker-free mods',
    );

    const otherMod = path.join(folder, '..', 'EU4');
    fs.mkdirSync(otherMod, { recursive: true });
    fs.writeFileSync(
      path.join(otherMod, 'descriptor.mod'),
      'name = "Other game mod"',
    );
    fs.writeFileSync(
      path.join(otherMod, 'example.txt'),
      'country_event = { id = test.1 }',
    );
    fs.writeFileSync(
      path.join(otherMod, 'example.gui'),
      'window = { name = "Other game" }',
    );
    for (const name of ['example.txt', 'example.gui']) {
      const otherScript = await vscode.workspace.openTextDocument(
        path.join(otherMod, name),
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(otherScript.languageId, 'plaintext');
    }
    results.push('another game mod is not relabeled as CK3');

    await vscode.workspace
      .getConfiguration('ck3Highlight')
      .update('autoDetect', false, vscode.ConfigurationTarget.Workspace);
    for (const [relative, expected] of [
      ['Crusader Kings III/game/fonts/manifest.font', 'ck3'],
      ['1158310/123/fonts/manifest.font', 'ck3'],
      ['Crusader Kings III/jomini/fonts/engine.font', 'plaintext'],
    ]) {
      const file = path.join(folder, '..', relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, 'fontfiles = { name = "Example" }');
      const doc = await vscode.workspace.openTextDocument(file);
      assert.equal(doc.languageId, expected, relative);
    }
    await vscode.workspace
      .getConfiguration('ck3Highlight')
      .update('autoDetect', true, vscode.ConfigurationTarget.Workspace);
    results.push(
      'native game/Workshop associations exclude engine-only resource paths',
    );

    await vscode.workspace
      .getConfiguration('files')
      .update(
        'associations',
        { '*.txt': 'plaintext', '*.yml': 'yaml' },
        vscode.ConfigurationTarget.Workspace,
      );
    fs.writeFileSync(path.join(folder, 'events', 'override.txt'), 'x = yes');
    fs.writeFileSync(
      path.join(folder, 'override.yml'),
      'l_english:\n KEY:0 "Text"',
    );
    const plain = await vscode.workspace.openTextDocument(
      path.join(folder, 'events', 'override.txt'),
    );
    const associatedYaml = await vscode.workspace.openTextDocument(
      path.join(folder, 'override.yml'),
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(plain.languageId, 'plaintext');
    assert.equal(associatedYaml.languageId, 'yaml');
    results.push(
      'basename user file associations take precedence over detection',
    );
    fs.writeFileSync(
      process.env.CK3_HIGHLIGHT_TEST_RESULT,
      JSON.stringify({ passed: results }),
    );
  } catch (error) {
    fs.writeFileSync(
      process.env.CK3_HIGHLIGHT_TEST_RESULT,
      JSON.stringify({ passed: results, error: error.stack }),
    );
    throw error;
  }
}

module.exports = { run };
