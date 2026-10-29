const path = require('path');

const {
  extractTopLevelDefinitions,
  normalizePathKey,
  parseScript,
} = require('./shallowScriptParser');

function detectFamilyForPath(filePath) {
  if (path.extname(filePath) !== '.txt') {
    return null;
  }
  const normalized = filePath.replace(/[\\/]+/g, '/').toLowerCase();
  if (normalized.includes('/common/scripted_effects/')) {
    return 'effects';
  }
  if (normalized.includes('/common/scripted_triggers/')) {
    return 'triggers';
  }
  if (normalized.includes('/common/scripted_modifiers/')) {
    return 'modifiers';
  }
  return null;
}

class OpenDocumentOverlay {
  constructor() {
    this.records = new Map();
  }

  update(document) {
    if (document.uri.scheme !== 'file') {
      return null;
    }

    const filePath = path.resolve(document.uri.fsPath);
    const parsed = parseScript(document.getText());
    const family = detectFamilyForPath(filePath);
    const record = {
      filePath,
      pathKey: normalizePathKey(filePath),
      text: document.getText(),
      parsed,
      family,
      definitions: extractTopLevelDefinitions(parsed),
    };
    this.records.set(record.pathKey, record);
    return record;
  }

  remove(documentOrUri) {
    const uri = documentOrUri.uri || documentOrUri;
    if (!uri || uri.scheme !== 'file') {
      return;
    }
    this.records.delete(normalizePathKey(uri.fsPath));
  }

  get(filePath) {
    return this.records.get(normalizePathKey(filePath)) || null;
  }

  getText(filePath) {
    return this.get(filePath)?.text;
  }
}

module.exports = {
  OpenDocumentOverlay,
  detectFamilyForPath,
};
