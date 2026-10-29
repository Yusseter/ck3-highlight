const fs = require('fs/promises');
const path = require('path');
const vscode = require('vscode');
const { getSemanticSettings } = require('./semanticSettings');
const {
  normalizeFsPath,
  unquote,
  readTextFile,
  pathExists,
  parseDescriptorFile,
} = require('../modDescriptor');

const {
  getDirectChildren,
  normalizePathKey,
  parseScript,
} = require('./shallowScriptParser');

function inferParadoxDirFromDescriptorPath(descriptorPath) {
  const modDir = path.dirname(descriptorPath);
  if (path.basename(modDir).toLowerCase() === 'mod') {
    return path.dirname(modDir);
  }
  return null;
}

async function resolveDescriptorPath(modPathSetting, signal) {
  signal?.throwIfAborted();
  if (!modPathSetting) {
    return null;
  }

  const resolved = path.resolve(modPathSetting);
  try {
    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
      return path.join(resolved, 'descriptor.mod');
    }
    return resolved;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return resolved;
    throw error;
  }
}

async function resolveLoadMods(
  configPath,
  paradoxDir,
  overlay,
  watchPaths,
  signal,
) {
  if (!(await pathExists(configPath, signal))) {
    return [];
  }

  const configText = await readTextFile(configPath, overlay, signal);
  const parsed = parseScript(configText);
  const loadModBlocks = parsed.assignments.filter(
    (assignment) =>
      assignment.depth === 0 &&
      assignment.operator === '=' &&
      assignment.lhs === 'load_mod' &&
      assignment.valueKind === 'block',
  );

  const resolved = [];
  for (let index = 0; index < loadModBlocks.length; index++) {
    signal?.throwIfAborted();
    const block = loadModBlocks[index];
    const children = getDirectChildren(parsed, block.blockId);
    let label = `MOD${index}`;
    let modfileValue = null;
    let workshopId = null;

    for (const child of children) {
      if (child.lhs === 'label' && child.valueKind === 'simple') {
        label = unquote(child.simpleValue) || label;
      }
      if (child.lhs === 'modfile' && child.valueKind === 'simple') {
        modfileValue = unquote(child.simpleValue);
      }
      if (child.lhs === 'workshop_id' && child.valueKind === 'simple') {
        workshopId = unquote(child.simpleValue);
      }
    }

    let descriptorPath = null;
    if (modfileValue) {
      descriptorPath = path.resolve(
        path.dirname(configPath),
        normalizeFsPath(modfileValue),
      );
      watchPaths.add(descriptorPath);
    }
    if (
      (!descriptorPath || !(await pathExists(descriptorPath, signal))) &&
      workshopId &&
      paradoxDir
    ) {
      descriptorPath = path.resolve(paradoxDir, 'mod', `ugc_${workshopId}.mod`);
      watchPaths.add(descriptorPath);
    }

    if (!descriptorPath || !(await pathExists(descriptorPath, signal))) {
      continue;
    }

    const descriptor = await parseDescriptorFile(
      descriptorPath,
      overlay,
      signal,
    );
    resolved.push({
      kind: 'loadedMod',
      label,
      descriptorPath: descriptor.descriptorPath,
      descriptorKey: descriptor.descriptorKey,
      root: descriptor.modRoot,
      replacePaths: descriptor.replacePaths,
    });
  }

  return resolved;
}

async function resolveTigerCompatibleLoadOrder(overlay, signal) {
  const { enabled, ck3Path, modPath } = getSemanticSettings();
  if (!enabled || vscode.workspace.isTrusted === false) {
    return {
      ready: false,
      reason: enabled ? 'untrusted' : 'disabled',
      watchPaths: new Set(),
    };
  }

  const descriptorPath = await resolveDescriptorPath(modPath, signal);
  const watchPaths = new Set(descriptorPath ? [descriptorPath] : []);
  if (!descriptorPath) {
    return {
      ready: false,
      reason: 'missing-settings',
      watchPaths,
      ck3Path: ck3Path || null,
      modPath: descriptorPath || null,
    };
  }

  if (!(await pathExists(descriptorPath, signal))) {
    return {
      ready: false,
      reason: 'missing-descriptor',
      watchPaths,
      ck3Path,
      modPath: descriptorPath,
    };
  }

  const mainMod = await parseDescriptorFile(descriptorPath, overlay, signal);

  const configPath = path.resolve(mainMod.modRoot, 'ck3-tiger.conf');
  const paradoxDir = inferParadoxDirFromDescriptorPath(mainMod.descriptorPath);
  watchPaths.add(configPath);
  const loadedMods = await resolveLoadMods(
    configPath,
    paradoxDir,
    overlay,
    watchPaths,
    signal,
  );

  return {
    ready: true,
    ck3Path: ck3Path ? path.resolve(ck3Path) : null,
    watchPaths,
    main: {
      kind: 'mainMod',
      label: 'MOD',
      descriptorPath: mainMod.descriptorPath,
      descriptorKey: mainMod.descriptorKey,
      root: mainMod.modRoot,
      replacePaths: mainMod.replacePaths,
    },
    configPath,
    configKey: normalizePathKey(configPath),
    paradoxDir,
    loadedMods,
    descriptorKeys: new Set([
      mainMod.descriptorKey,
      ...loadedMods.map((entry) => entry.descriptorKey),
    ]),
  };
}

module.exports = {
  resolveTigerCompatibleLoadOrder,
};
