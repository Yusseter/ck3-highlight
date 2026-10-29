const { parseArgs, resolveTigerRoot } = require('./lib/args');
const { collectFeedData } = require('./lib/feeds');
const { prepareGeneratedFeeds } = require('./lib/generated');
const { prepareGrammars } = require('./lib/grammars');
const {
  buildUpstreamProvenance,
  buildLocalProvenance,
} = require('./lib/provenance');
const { prepareCanonicalFeeds } = require('./lib/canonical');
const { commitOutputs } = require('./lib/shared');
const { printRunSummary } = require('./lib/report');

function run(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    const tigerRoot = resolveTigerRoot(options);
    const feeds = collectFeedData(tigerRoot);
    const upstream = buildUpstreamProvenance(tigerRoot, feeds);
    const { grammars, sources } = prepareGrammars(feeds, {
      syncKeywords: true,
    });
    const canonical = [...prepareCanonicalFeeds(feeds, upstream), ...sources];
    const provenance = buildLocalProvenance(upstream, canonical);
    const generated = prepareGeneratedFeeds(feeds, provenance);
    commitOutputs(
      [...canonical, ...generated.feeds, generated.manifest, ...grammars],
      options,
    );
    printRunSummary({
      tigerRoot,
      options,
      feeds,
      generated,
      grammars,
      canonical,
    });

    if (
      options.check &&
      (generated.changed ||
        [...grammars, ...canonical].some((summary) => summary.changed))
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  run,
};
