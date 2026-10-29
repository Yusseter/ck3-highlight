const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveModRoot } = require('../scripts/test-project');

test('project runner accepts a mod directory or repository with a mod subdirectory', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-project-path-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'mod'));
  fs.writeFileSync(path.join(root, 'mod', 'descriptor.mod'), 'name = "Test"');
  assert.equal(resolveModRoot(root), path.join(root, 'mod'));
  assert.equal(resolveModRoot(path.join(root, 'mod')), path.join(root, 'mod'));
});

test('project runner does not silently select an archived or unrelated descriptor', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-project-path-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'dist', 'old'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'dist', 'old', 'descriptor.mod'),
    'name = "Old"',
  );
  assert.throws(() => resolveModRoot(root), /descriptor\.mod/);
});

test('project runner rejects a directory masquerading as descriptor.mod', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-project-path-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'descriptor.mod'));
  assert.throws(() => resolveModRoot(root), /descriptor\.mod/);
});
