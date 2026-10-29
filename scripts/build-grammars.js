const { prepareGrammars } = require('./tiger-sync/lib/grammars');
const {
  readCanonicalFeeds,
  readCanonicalUpstream,
} = require('./tiger-sync/lib/canonical');
const { prepareGeneratedFeeds } = require('./tiger-sync/lib/generated');
const { buildLocalProvenance } = require('./tiger-sync/lib/provenance');
const { commitOutputs } = require('./tiger-sync/lib/shared');

function run(args = process.argv.slice(2)) {
  try {
    if (args.some((arg) => arg !== '--check'))
      throw new Error('Usage: node scripts/build-grammars.js [--check]');
    const check = args.includes('--check');
    const feeds = readCanonicalFeeds();
    const { grammars } = prepareGrammars(feeds);
    const generated = prepareGeneratedFeeds(
      feeds,
      buildLocalProvenance(readCanonicalUpstream()),
    );
    const outputs = [...generated.feeds, generated.manifest, ...grammars];
    commitOutputs(outputs, { check });
    const changed = outputs.filter((output) => output.changed);
    for (const output of changed)
      console.log(`${check ? 'Out of date' : 'Built'}: ${output.filePath}`);
    if (!changed.length) console.log('Grammar outputs are up to date.');
    if (check && changed.length) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (require.main === module) run();
module.exports = { run };
