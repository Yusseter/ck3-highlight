const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const grammarPaths = {
  ck3: path.join(repoRoot, 'syntaxes', 'ck3.tmLanguage.json'),
  paradox: path.join(repoRoot, 'syntaxes', 'paradox.tmLanguage.json'),
  localization: path.join(repoRoot, 'syntaxes', 'localization.tmLanguage.json'),
};
const generatedDir = path.join(repoRoot, 'generated', 'tiger');

function fail(message) {
  throw new Error(message);
}

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    fail(`Missing ck3-tiger source for ${label}: ${filePath}`);
  }
}

function ensureDir(dirPath, label) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    fail(`Missing ck3-tiger directory for ${label}: ${dirPath}`);
  }
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function prepareJsonOutput(
  filePath,
  value,
  currentText = readOptionalText(filePath),
) {
  const nextText = `${JSON.stringify(value, null, 2)}\n`;
  JSON.parse(nextText);
  return {
    filePath,
    currentText,
    nextText,
    changed: currentText !== nextText,
    wrote: false,
  };
}

function readOptionalText(filePath) {
  try {
    return readText(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertOutputUnchanged(output) {
  for (let current = output.filePath; ; current = path.dirname(current)) {
    try {
      const stat = fs.lstatSync(current);
      if (
        stat.isSymbolicLink() ||
        (current === output.filePath && !stat.isFile())
      ) {
        fail(`Unsafe sync output: ${current}`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (current === path.dirname(current)) break;
  }
  if (readOptionalText(output.filePath) !== output.currentText) {
    fail(`Sync output changed since preparation: ${output.filePath}`);
  }
}

function commitOutputs(outputs, options = {}) {
  const seen = new Set();
  for (const output of outputs) {
    const key = path.resolve(output.filePath);
    if (seen.has(key)) fail(`Duplicate sync output: ${key}`);
    seen.add(key);
    JSON.parse(output.nextText);
    assertOutputUnchanged(output);
  }
  if (options.dryRun || options.check) return;

  const staged = [];
  const createdDirs = [];
  try {
    for (const output of outputs.filter((entry) => entry.changed)) {
      const missing = [];
      for (
        let dir = path.dirname(output.filePath);
        !fs.existsSync(dir);
        dir = path.dirname(dir)
      )
        missing.push(dir);
      for (const dir of missing.reverse()) {
        fs.mkdirSync(dir);
        createdDirs.push(dir);
      }
      const dir = fs.mkdtempSync(
        path.join(path.dirname(output.filePath), '.tiger-sync-'),
      );
      const entry = {
        output,
        dir,
        next: path.join(dir, 'next.json'),
        backup: path.join(dir, 'previous.json'),
      };
      staged.push(entry);
      fs.writeFileSync(entry.next, output.nextText, {
        flag: 'wx',
        mode:
          output.currentText === null
            ? 0o666
            : fs.statSync(output.filePath).mode,
      });
    }
    for (const output of outputs) assertOutputUnchanged(output);
    for (const entry of staged) {
      assertOutputUnchanged(entry.output);
      if (entry.output.currentText !== null) {
        fs.renameSync(entry.output.filePath, entry.backup);
        entry.backedUp = true;
      }
      fs.renameSync(entry.next, entry.output.filePath);
      entry.installed = true;
    }
  } catch (error) {
    const recoveryErrors = [];
    // shortcut: caught I/O failures roll back; crash/power-loss recovery needs a persistent journal.
    for (const entry of [...staged].reverse()) {
      try {
        if (entry.installed) {
          if (readOptionalText(entry.output.filePath) !== entry.output.nextText)
            fail('Output modified during rollback');
          fs.unlinkSync(entry.output.filePath);
        }
        if (entry.backedUp) {
          fs.renameSync(entry.backup, entry.output.filePath);
          entry.backedUp = false;
        }
      } catch (recoveryError) {
        recoveryErrors.push(
          `${entry.output.filePath}: ${recoveryError.message}; backup: ${entry.backup}`,
        );
      }
    }
    if (recoveryErrors.length)
      throw new Error(
        `${error.message}\nRollback incomplete:\n${recoveryErrors.join('\n')}`,
        { cause: error },
      );
    throw error;
  } finally {
    const committed =
      staged.length > 0 && staged.every((entry) => entry.installed);
    for (const entry of staged) {
      try {
        if (committed && entry.backedUp) fs.unlinkSync(entry.backup);
        if (!fs.existsSync(entry.backup)) {
          if (fs.existsSync(entry.next)) fs.unlinkSync(entry.next);
          fs.rmdirSync(entry.dir);
        }
      } catch (error) {
        console.warn(
          `Sync temporary files retained at ${entry.dir}: ${error.message}`,
        );
      }
    }
    if (!committed) {
      for (const dir of createdDirs.reverse()) {
        try {
          fs.rmdirSync(dir);
        } catch (error) {
          if (error.code !== 'ENOTEMPTY') throw error;
        }
      }
    }
  }
  for (const entry of staged) entry.output.wrote = true;
}

function readManualSupplement(filePath, keys) {
  try {
    const parsed = JSON.parse(readText(filePath));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
      fail('Expected an object');
    for (const key of keys) {
      if (
        !Array.isArray(parsed[key]) ||
        parsed[key].some((value) => typeof value !== 'string' || !value.trim())
      ) {
        fail(`Expected ${key} to be an array of non-empty strings`);
      }
    }
    return parsed;
  } catch (error) {
    fail(
      `Invalid manual supplement ${path.basename(filePath)}: ${error.message}`,
    );
  }
}

function walkFiles(dirPath, extension) {
  const results = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath, extension));
      continue;
    }
    if (!extension || fullPath.endsWith(extension)) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mergeUnique(...lists) {
  const values = [];
  const seen = new Set();
  for (const list of lists) {
    for (const value of list || []) {
      if (!value || seen.has(value)) {
        continue;
      }
      seen.add(value);
      values.push(value);
    }
  }
  return values;
}

function normalizeRelativePath(rootPath, filePath) {
  return path.relative(rootPath, filePath).split(path.sep).join('/');
}

module.exports = {
  repoRoot,
  grammarPaths,
  generatedDir,
  fail,
  ensureFile,
  ensureDir,
  readText,
  prepareJsonOutput,
  commitOutputs,
  readManualSupplement,
  walkFiles,
  escapeRegex,
  mergeUnique,
  normalizeRelativePath,
};
