const path = require('path');

function printRunSummary({
  tigerRoot,
  options,
  feeds,
  generated,
  grammars,
  canonical,
}) {
  const mode = options.check ? 'check' : options.dryRun ? 'dry-run' : 'write';
  console.log(`ck3-tiger sync (${mode})`);
  console.log(`  tiger: ${tigerRoot}`);
  console.log('canonical sources:');
  for (const source of canonical) {
    console.log(
      `  ${source.filePath}: ${source.changed ? 'changes detected' : 'already in sync'}`,
    );
  }

  console.log('generated feeds:');
  for (const feed of generated.feeds) {
    console.log(
      `  ${feed.id}: ${feed.changed ? 'changes detected' : 'already in sync'}`,
    );
    console.log(`    file: ${feed.filePath}`);
    for (const section of feed.sections) {
      console.log(`    ${section.name}: ${section.count}`);
    }
    if (feed.wrote) {
      console.log('    wrote generated feed file');
    }
  }

  console.log(
    `  manifest: ${generated.manifest.changed ? 'changes detected' : 'already in sync'}`,
  );
  console.log(`    file: ${generated.manifest.filePath}`);
  if (generated.manifest.wrote) {
    console.log('    wrote generated manifest');
  }

  console.log('grammar targets:');
  for (const summary of grammars) {
    console.log(
      `  ${path.basename(summary.filePath)}: ${summary.changed ? 'changes detected' : 'already in sync'}`,
    );
    console.log(`    file: ${summary.filePath}`);
    for (const section of summary.sections) {
      console.log(
        `    ${section.label}: current=${section.currentCount} source=${section.sourceCount} merged=${section.mergedCount} added=${section.addedCount} (${section.feedId}/${section.feedSection})`,
      );
    }
    if (summary.wrote) {
      console.log('    wrote updated grammar file');
    }
  }

  const feedIds = feeds.map((feed) => feed.id).join(', ');
  console.log(`feeds loaded: ${feedIds}`);
}

module.exports = {
  printRunSummary,
};
