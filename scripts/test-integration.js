const fs = require('node:fs');
const path = require('node:path');
const { runEditorTestHost } = require('./lib/editor-test-host');

const executable = process.argv[2] || process.env.VSCODE_EXECUTABLE;
if (!executable)
  throw new Error('Pass a VS Code executable path or set VSCODE_EXECUTABLE.');
const { status } = runEditorTestHost({
  executable,
  testDirectory: 'integration',
  prepare(temp) {
    const workspace = path.join(temp, 'mod');
    fs.mkdirSync(path.join(workspace, 'events'), { recursive: true });
    fs.mkdirSync(path.join(workspace, 'common', 'genes'), { recursive: true });
    fs.mkdirSync(path.join(workspace, '.vscode'));
    fs.writeFileSync(
      path.join(workspace, 'descriptor.mod'),
      'name = "Integration Test"',
    );
    fs.writeFileSync(
      path.join(workspace, 'test_l_english.yml'),
      'l_english:\n KEY:0 ""',
    );
    fs.writeFileSync(path.join(workspace, 'normal.yaml'), 'title: ""');
    fs.writeFileSync(
      path.join(workspace, 'events', 'example.txt'),
      'root = {\n x = "first\n      keep spaces  \n   last"\n}',
    );
    fs.writeFileSync(
      path.join(workspace, '.vscode', 'settings.json'),
      JSON.stringify({
        'ck3Highlight.semantic.enabled': false,
        'editor.tabSize': 2,
        'editor.insertSpaces': true,
        'editor.autoDetectIndentation': false,
        'editor.autoClosingBrackets': 'always',
        'editor.autoSurround': 'languageDefined',
      }),
    );
    return workspace;
  },
});
process.exitCode = status;
