const fs = require('node:fs/promises');
const path = require('node:path');
const fileTypes = require('./file-types.json');
const { parseDescriptorFile } = require('./modDescriptor');

const scriptExtensions = new Set([
  ...fileTypes.scriptExtensions,
  ...fileTypes.ck3GameExtensions,
  '.ck3',
]);
const ck3Paths = new Set(fileTypes.ck3.paths.map((name) => name.toLowerCase()));

function containsPath(root, file) {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return (
    relative === '' ||
    (!relative.startsWith('..' + path.sep) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function classifyDocument(
  document,
  workspaceRoots = [],
  configuredModPath = '',
) {
  if (
    document.uri.scheme !== 'file' ||
    !['plaintext', 'yaml', 'ck3'].includes(document.languageId)
  ) {
    return null;
  }
  const file = document.uri.fsPath;
  const extension = path.extname(file).toLowerCase();
  if (fileTypes.ck3Filenames.includes(path.basename(file).toLowerCase()))
    return 'ck3';
  if (extension === fileTypes.localizationExtension) {
    const firstContent = document
      .getText()
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .find((line) => line.trim() && !line.trimStart().startsWith('#'));
    return firstContent &&
      /^l_[A-Za-z_]+:\s*(?:#.*)?$/.test(firstContent.trim())
      ? 'ck3-localization'
      : null;
  }
  if (!scriptExtensions.has(extension)) {
    return null;
  }
  const parts = file.replace(/\\/g, '/').toLowerCase().split('/');
  const ck3Root = parts.findIndex((part) => ck3Paths.has(part));
  if (
    fileTypes.ck3GameExtensions.includes(extension) &&
    ck3Root >= 0 &&
    ['clausewitz', 'jomini'].includes(parts[ck3Root + 1])
  ) {
    return null;
  }
  if (extension === '.ck3' || ck3Root >= 0) {
    return 'ck3';
  }
  let configuredRoot = configuredModPath;
  if (configuredRoot && configuredRoot.toLowerCase().endsWith('.mod')) {
    try {
      const descriptor = await parseDescriptorFile(configuredRoot);
      configuredRoot =
        path.basename(configuredRoot).toLowerCase() === 'descriptor.mod' ||
        descriptor.explicitPathResolved
          ? descriptor.modRoot
          : '';
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      configuredRoot = '';
    }
  }
  if (configuredRoot && containsPath(configuredRoot, file)) {
    return 'ck3';
  }

  const workspaceRoot = workspaceRoots
    .filter((root) => containsPath(root, file))
    .sort((a, b) => b.length - a.length)[0];
  let directory = path.dirname(file);
  for (let level = 0; level < 12; level++) {
    if (await exists(path.join(directory, 'descriptor.mod'))) {
      const ck3Markers = [
        'ck3-tiger.conf',
        'common/genes',
        'common/dynasty_houses',
        'common/culture/pillars',
      ];
      for (const marker of ck3Markers) {
        if (await exists(path.join(directory, marker))) {
          return 'ck3';
        }
      }
      return null;
    }
    if (directory === workspaceRoot || path.dirname(directory) === directory) {
      break;
    }
    directory = path.dirname(directory);
  }
  return null;
}

module.exports = { classifyDocument };
