const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function runHost(t, result) {
  const file = path.resolve(__dirname, '..', 'scripts/lib/editor-test-host.js');
  let temp;
  const sandbox = {
    module: { exports: {} },
    __dirname: path.dirname(file),
    process,
    console: { log() {}, error() {} },
    require(name) {
      if (name !== 'node:child_process') return require(name);
      return {
        spawnSync(executable, args, options) {
          fs.writeFileSync(
            options.env.CK3_HIGHLIGHT_TEST_RESULT,
            JSON.stringify({ passed: ['completed assertions'] }),
          );
          return result;
        },
      };
    },
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, {
    filename: file,
  });
  t.after(() => {
    if (temp) fs.rmSync(temp, { recursive: true, force: true });
  });
  const outcome = sandbox.module.exports.runEditorTestHost({
    executable: process.execPath,
    testDirectory: 'test',
    prepare(directory) {
      temp = directory;
      return directory;
    },
  });
  return { ...outcome, temp };
}

for (const [name, result] of [
  [
    'timeout',
    { status: null, signal: 'SIGTERM', error: { message: 'spawn ETIMEDOUT' } },
  ],
  ['signal termination', { status: null, signal: 'SIGTERM' }],
  ['missing exit status', { status: null }],
  ['nonzero exit', { status: 2 }],
]) {
  test(
    'editor host rejects ' +
      name +
      ' even after assertions wrote a success report',
    (t) => {
      const outcome = runHost(t, result);
      assert.notEqual(outcome.status, 0);
      assert(outcome.report.error);
      assert(
        fs.existsSync(outcome.temp),
        'failed diagnostics must be retained',
      );
    },
  );
}

test('editor host cleans up a genuinely successful run', (t) => {
  const outcome = runHost(t, { status: 0 });
  assert.equal(outcome.status, 0);
  assert.equal(fs.existsSync(outcome.temp), false);
});
