const fs = require('fs/promises');
const path = require('path');

const {
  extractTopLevelDefinitions,
  normalizePathKey,
  normalizeRelativePath,
  parseScript,
  stripBom,
} = require('./shallowScriptParser');

const FAMILY_DIRECTORIES = {
  effects: 'common/scripted_effects',
  triggers: 'common/scripted_triggers',
  modifiers: 'common/scripted_modifiers',
};

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

async function readText(filePath, signal) {
  const raw = await fs.readFile(filePath, { encoding: 'utf8', signal });
  return stripBom(raw);
}

async function collectFilesRecursively(dirPath, rootPath, bucket, signal) {
  signal?.throwIfAborted();
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    signal?.throwIfAborted();
    if (entry.name === '.git') {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await collectFilesRecursively(fullPath, rootPath, bucket, signal);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.txt')) {
      continue;
    }

    const relativeFilePath = path
      .relative(rootPath, fullPath)
      .split(path.sep)
      .join('/');
    const relativeParentPath = normalizeRelativePath(
      path.posix.dirname(relativeFilePath),
    );
    bucket.push({
      absolutePath: path.resolve(fullPath),
      pathKey: normalizePathKey(fullPath),
      relativeFilePath,
      relativeParentPath,
    });
  }
}

async function collectRootFiles(root, familyDirectory, signal) {
  const absoluteDir = path.resolve(root.root, familyDirectory);
  if (!(await pathExists(absoluteDir, signal))) {
    return [];
  }

  const bucket = [];
  await collectFilesRecursively(absoluteDir, root.root, bucket, signal);
  return bucket;
}

async function buildFamilyRecords(familyName, familyDirectory, roots, signal) {
  const seenFiles = new Set();
  const replacedDirectories = new Set();
  const selected = [];

  for (let index = roots.length - 1; index >= 0; index--) {
    const root = roots[index];
    const files = await collectRootFiles(root, familyDirectory, signal);
    for (const file of files) {
      signal?.throwIfAborted();
      if (seenFiles.has(file.relativeFilePath)) {
        continue;
      }
      if (replacedDirectories.has(file.relativeParentPath)) {
        continue;
      }

      let definitions;
      try {
        // Keep the disk snapshot separate so closing an overlay cannot restore unsaved data.
        definitions = extractTopLevelDefinitions(
          parseScript(await readText(file.absolutePath, signal)),
        );
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }

      selected.push({
        family: familyName,
        absolutePath: file.absolutePath,
        pathKey: file.pathKey,
        relativeFilePath: file.relativeFilePath,
        relativeParentPath: file.relativeParentPath,
        rootKind: root.kind,
        rootLabel: root.label,
        definitions,
      });
      seenFiles.add(file.relativeFilePath);
    }

    for (const replacePath of root.replacePaths || []) {
      replacedDirectories.add(normalizeRelativePath(replacePath));
    }
  }

  return selected.sort((left, right) =>
    left.relativeFilePath < right.relativeFilePath
      ? -1
      : left.relativeFilePath > right.relativeFilePath
        ? 1
        : 0,
  );
}

function combineFamilies(recordsByFamily, overlay) {
  const sourceFiles = new Map();
  const families = {};
  for (const [family, records] of Object.entries(recordsByFamily)) {
    const winners = new Map();
    for (const record of records) {
      sourceFiles.set(record.pathKey, record);
      const open = overlay?.get(record.absolutePath);
      const definitions =
        open?.family === family ? open.definitions : record.definitions;
      for (const [name, parameterized] of definitions) {
        winners.set(name, parameterized);
      }
    }
    families[family] = new Set(
      [...winners]
        .filter(([, parameterized]) => parameterized)
        .map(([name]) => name),
    );
  }
  return {
    ...families,
    any: new Set([
      ...families.effects,
      ...families.triggers,
      ...families.modifiers,
    ]),
    sourceFiles,
  };
}

async function buildLoadOrderIndex(resolvedLoadOrder, signal) {
  const roots = [
    ...(resolvedLoadOrder.ck3Path
      ? [
          {
            kind: 'vanilla',
            label: 'VANILLA',
            root: path.resolve(resolvedLoadOrder.ck3Path, 'game'),
            replacePaths: [],
          },
        ]
      : []),
    ...resolvedLoadOrder.loadedMods,
    resolvedLoadOrder.main,
  ];

  const recordsByFamily = {
    effects: await buildFamilyRecords(
      'effects',
      FAMILY_DIRECTORIES.effects,
      roots,
      signal,
    ),
    triggers: await buildFamilyRecords(
      'triggers',
      FAMILY_DIRECTORIES.triggers,
      roots,
      signal,
    ),
    modifiers: await buildFamilyRecords(
      'modifiers',
      FAMILY_DIRECTORIES.modifiers,
      roots,
      signal,
    ),
  };

  return {
    roots,
    recordsByFamily,
    ...combineFamilies(recordsByFamily),
  };
}

module.exports = {
  buildLoadOrderIndex,
  combineFamilies,
  FAMILY_DIRECTORIES,
};
