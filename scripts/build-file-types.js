const fs = require('node:fs');
const path = require('node:path');
const fileTypes = require('../src/file-types.json');

function pattern(names, extensions, prefix = '') {
  const directories = names.length === 1 ? names[0] : `{${names.join(',')}}`;
  return `**/${directories}/${prefix}**/*.{${extensions.map((extension) => extension.slice(1)).join(',')}}`;
}

function buildFileTypeContributions(languages) {
  const ck3 = fileTypes.ck3;
  return languages
    .filter((language) => ['ck3', 'ck3-localization'].includes(language.id))
    .map((language) => {
      if (language.id === 'ck3') {
        return {
          ...language,
          extensions: [ck3.extension],
          filenames: fileTypes.ck3Filenames,
          filenamePatterns: [
            pattern(ck3.paths, [ck3.extension, ...fileTypes.scriptExtensions]),
            pattern(
              ck3.paths.filter((name) => name !== '1158310'),
              fileTypes.ck3GameExtensions,
              'game/',
            ),
            pattern(['1158310'], fileTypes.ck3GameExtensions),
          ],
        };
      }
      return language;
    });
}

function main() {
  if (process.argv.slice(2).some((argument) => argument !== '--check')) {
    throw new Error('Usage: node scripts/build-file-types.js [--check]');
  }
  const file = path.resolve(__dirname, '..', 'package.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const next = buildFileTypeContributions(manifest.contributes.languages);
  const changed =
    JSON.stringify(next) !== JSON.stringify(manifest.contributes.languages);
  if (process.argv.includes('--check')) {
    if (changed)
      throw new Error(
        'Language file types are stale; run pnpm run build:file-types.',
      );
  } else if (changed) {
    manifest.contributes.languages = next;
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  }
  console.log('Language file types ' + (changed ? 'updated.' : 'are in sync.'));
}

if (require.main === module) main();
module.exports = { buildFileTypeContributions };
