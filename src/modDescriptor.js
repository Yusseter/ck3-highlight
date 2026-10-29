const fs = require('node:fs/promises');
const path = require('node:path');
const {
  normalizePathKey,
  normalizeRelativePath,
  parseScript,
  stripBom,
} = require('./semantic/shallowScriptParser');

function normalizeFsPath(inputPath) {
  return path.normalize(inputPath.replace(/[\\/]+/g, path.sep));
}

function unquote(value) {
  if (!value) {
    return '';
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

async function readTextFile(filePath, overlay, signal) {
  signal?.throwIfAborted();
  const overlayText = overlay?.getText?.(filePath);
  if (typeof overlayText === 'string') {
    return overlayText;
  }

  const raw = await fs.readFile(filePath, { encoding: 'utf8', signal });
  return stripBom(raw);
}

async function pathExists(targetPath, signal) {
  signal?.throwIfAborted();
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
}

async function parseDescriptorFile(descriptorPath, overlay, signal) {
  const descriptorText = await readTextFile(descriptorPath, overlay, signal);
  const parsed = parseScript(descriptorText);
  const topLevel = parsed.assignments.filter(
    (assignment) => assignment.depth === 0 && assignment.operator === '=',
  );

  let baseDir = path.dirname(descriptorPath);
  if (path.basename(descriptorPath).toLowerCase() === 'descriptor.mod') {
    baseDir = path.dirname(descriptorPath);
  } else if (path.basename(baseDir).toLowerCase() === 'mod') {
    baseDir = path.dirname(baseDir);
  }

  let explicitPath = null;
  const replacePaths = [];

  for (const assignment of topLevel) {
    if (assignment.lhs === 'path' && assignment.valueKind === 'simple') {
      explicitPath = unquote(assignment.simpleValue);
    }
    if (
      assignment.lhs === 'replace_path' &&
      assignment.valueKind === 'simple'
    ) {
      replacePaths.push(normalizeRelativePath(unquote(assignment.simpleValue)));
    }
  }

  let modRoot = baseDir;
  let explicitPathResolved = false;
  if (explicitPath) {
    const deduced = path.resolve(baseDir, normalizeFsPath(explicitPath));
    if (await pathExists(deduced, signal)) {
      modRoot = deduced;
      explicitPathResolved = true;
    }
  }

  return {
    descriptorPath: path.resolve(descriptorPath),
    descriptorKey: normalizePathKey(descriptorPath),
    modRoot: path.resolve(modRoot),
    explicitPathResolved,
    replacePaths,
  };
}

module.exports = {
  normalizeFsPath,
  unquote,
  readTextFile,
  pathExists,
  parseDescriptorFile,
};
