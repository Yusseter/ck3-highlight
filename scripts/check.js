const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
);
const grammars = new Map();

for (const script of ['build-file-types.js', 'build-grammars.js']) {
  execFileSync(process.execPath, [path.join(__dirname, script), '--check'], {
    stdio: 'pipe',
  });
}

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.resolve(root, relative), 'utf8'));
}

for (const entry of manifest.contributes.grammars) {
  const grammar = readJson(entry.path);
  if (grammar.scopeName !== entry.scopeName)
    throw new Error('Scope mismatch: ' + entry.path);
  grammars.set(entry.scopeName, grammar);
}
for (const language of manifest.contributes.languages) {
  if (language.configuration) readJson(language.configuration);
}
function checkIncludes(value, scope) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'include' && !child.startsWith('$')) {
      const [target, rule] = child.startsWith('#')
        ? [scope, child.slice(1)]
        : child.split('#');
      if (
        !grammars.has(target) ||
        (rule && !grammars.get(target).repository?.[rule])
      ) {
        throw new Error(
          'Unresolved grammar include: ' + scope + ' -> ' + child,
        );
      }
    }
    if (child && typeof child === 'object') checkIncludes(child, scope);
  }
}
for (const [scope, grammar] of grammars) checkIncludes(grammar, scope);

let scripts = 0;
function checkDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) checkDirectory(file);
    else if (entry.name.endsWith('.js')) {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
      scripts++;
      if (directory.startsWith(path.join(root, 'src'))) {
        for (const match of fs
          .readFileSync(file, 'utf8')
          .matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
          if (
            !fs.existsSync(path.resolve(directory, match[1]) + '.js') &&
            !fs.existsSync(path.resolve(directory, match[1]))
          ) {
            throw new Error(
              'Missing runtime import: ' + file + ' -> ' + match[1],
            );
          }
        }
      }
    }
  }
}
for (const folder of ['src', 'scripts', 'test'])
  checkDirectory(path.join(root, folder));
console.log(
  'Validated ' +
    scripts +
    ' JavaScript files, ' +
    grammars.size +
    ' grammars and all language configurations.',
);
