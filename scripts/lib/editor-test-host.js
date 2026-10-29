const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function runEditorTestHost({
  executable,
  testDirectory,
  prepare,
  settings = {},
  env = {},
  timeoutMs = 120000,
}) {
  if (!executable || !fs.statSync(executable).isFile())
    throw new Error('Pass a VS Code executable path.');
  const root = path.resolve(__dirname, '..', '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-highlight-editor-'));
  const workspace = prepare(temp);
  const profile = path.join(temp, 'profile');
  fs.mkdirSync(path.join(profile, 'User'), { recursive: true });
  fs.writeFileSync(
    path.join(profile, 'User', 'settings.json'),
    JSON.stringify({
      'files.autoSave': 'off',
      'files.hotExit': 'off',
      'task.allowAutomaticTasks': 'off',
      'git.enabled': false,
      'extensions.ignoreRecommendations': true,
      ...settings,
    }),
  );
  const resultFile = path.join(temp, 'result.json');
  const hostEnv = {
    ...process.env,
    ...env,
    CK3_HIGHLIGHT_TEST_RESULT: resultFile,
    CK3_HIGHLIGHT_TEST_TEMP: temp,
  };
  delete hostEnv.ELECTRON_RUN_AS_NODE;
  delete hostEnv.VSCODE_IPC_HOOK_CLI;
  const result = spawnSync(
    executable,
    [
      '--user-data-dir=' + profile,
      '--extensions-dir=' + path.join(temp, 'extensions'),
      '--extensionDevelopmentPath=' + root,
      '--extensionTestsPath=' + path.join(root, 'test', testDirectory),
      '--disable-extensions',
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-gpu',
      '--wait',
      workspace,
    ],
    {
      env: hostEnv,
      windowsHide: true,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  const report = fs.existsSync(resultFile)
    ? JSON.parse(fs.readFileSync(resultFile, 'utf8'))
    : {
        passed: [],
        error:
          result.error?.message ||
          (result.stderr || result.stdout || '').slice(-5000) ||
          'No editor test result.',
      };
  if (!report.error && (result.error || result.signal || result.status !== 0)) {
    report.error =
      result.error?.message ||
      (result.signal
        ? 'Editor terminated by ' + result.signal
        : 'Editor exited with status ' + result.status);
  }
  const status = report.error ? 1 : 0;
  for (const item of report.passed) console.log('PASS ' + item);
  if (report.error) console.error(report.error);
  if (status === 0)
    fs.rmSync(temp, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  else console.error('Integration profile: ' + temp);
  return { status, report };
}

module.exports = { runEditorTestHost };
