const path = require('path');
const vscode = require('vscode');
const { normalizePathKey } = require('./shallowScriptParser');

function getSemanticSettings() {
  const own = vscode.workspace.getConfiguration('ck3Highlight');
  const tiger = vscode.workspace.getConfiguration('ck3tiger');
  const asPath = (value) => (typeof value === 'string' ? value.trim() : '');
  return {
    enabled: own.get('semantic.enabled', true) !== false,
    ck3Path: asPath(own.get('gamePath')) || asPath(tiger.get('ck3Path')),
    modPath: asPath(own.get('modPath')) || asPath(tiger.get('modPath')),
  };
}

function isPathWithin(filePath, rootPath) {
  const relative = path.relative(
    normalizePathKey(rootPath),
    normalizePathKey(filePath),
  );
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

module.exports = { getSemanticSettings, isPathWithin };
