const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const {
  repoRoot,
  readText,
  walkFiles,
  normalizeRelativePath,
  fail,
} = require('./shared');

function readGitRevision(root) {
  let gitDir = path.join(root, '.git');
  if (fs.statSync(gitDir).isFile()) {
    const match = readText(gitDir)
      .trim()
      .match(/^gitdir: (.+)$/);
    if (!match) fail('Invalid Git directory pointer');
    gitDir = path.resolve(root, match[1]);
  }
  const commonFile = path.join(gitDir, 'commondir');
  const commonDir = fs.existsSync(commonFile)
    ? path.resolve(gitDir, readText(commonFile).trim())
    : gitDir;
  let value = readText(path.join(gitDir, 'HEAD')).trim();
  const seen = new Set();
  while (value.startsWith('ref: ')) {
    const ref = value.slice(5);
    if (
      !/^refs\/[A-Za-z0-9._/-]+$/.test(ref) ||
      ref.split('/').some((part) => !part || part === '.' || part === '..') ||
      seen.has(ref)
    ) {
      fail('Invalid or cyclic Git revision reference');
    }
    seen.add(ref);
    const looseRef = [gitDir, commonDir]
      .map((dir) => path.join(dir, ref))
      .find((file) => fs.existsSync(file));
    if (looseRef) {
      value = readText(looseRef).trim();
      continue;
    }
    const packedFile = path.join(commonDir, 'packed-refs');
    const line = fs.existsSync(packedFile)
      ? readText(packedFile)
          .split(/\r?\n/)
          .find((entry) => entry.endsWith(` ${ref}`))
      : null;
    if (!line) fail(`Missing Git revision for ${ref}`);
    value = line.split(' ')[0];
  }
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value))
    fail('Invalid Git HEAD revision');
  return value.toLowerCase();
}

function hashFiles(root, files, pending = []) {
  const prepared = new Map(
    pending.map((output) => [path.resolve(output.filePath), output.nextText]),
  );
  return Object.fromEntries(
    [...new Set(files)].sort().map((file) => {
      if (path.isAbsolute(file) || file.split('/').includes('..'))
        fail('Provenance input must be repository-relative');
      const fullPath = path.resolve(root, file);
      return [
        file,
        createHash('sha256')
          .update(
            prepared.has(fullPath)
              ? prepared.get(fullPath)
              : fs.readFileSync(fullPath),
          )
          .digest('hex'),
      ];
    }),
  );
}

function buildUpstreamProvenance(tigerRoot, feeds) {
  return {
    revision: readGitRevision(tigerRoot),
    // Hash the actual inputs, including local edits; a clean Git checkout is not assumed.
    inputs: hashFiles(
      tigerRoot,
      feeds.flatMap((feed) => feed.sourceFiles),
    ),
  };
}

function buildLocalProvenance(upstream, pending = []) {
  const scriptRoot = path.join(repoRoot, 'scripts', 'tiger-sync');
  const sourceRoot = path.join(repoRoot, 'grammars');
  const sourceFiles = [
    ...walkFiles(sourceRoot, '.json'),
    ...pending.map((output) => output.filePath),
  ].map((file) => normalizeRelativePath(repoRoot, file));
  return {
    upstream,
    supplements: hashFiles(
      repoRoot,
      walkFiles(path.join(scriptRoot, 'data'), '.json').map((file) =>
        normalizeRelativePath(repoRoot, file),
      ),
    ),
    generator: hashFiles(repoRoot, [
      ...walkFiles(scriptRoot, '.js').map((file) =>
        normalizeRelativePath(repoRoot, file),
      ),
      'scripts/build-grammars.js',
    ]),
    grammars: hashFiles(repoRoot, sourceFiles, pending),
  };
}

module.exports = {
  buildUpstreamProvenance,
  buildLocalProvenance,
  readGitRevision,
};
