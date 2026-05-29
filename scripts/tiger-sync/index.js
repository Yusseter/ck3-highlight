const { parseArgs, resolveTigerRoot } = require('./lib/args');
const { collectFeedData } = require('./lib/feeds');
const { writeGeneratedFeeds } = require('./lib/generated');
const { syncGrammars } = require('./lib/grammars');
const { printRunSummary } = require('./lib/report');

function run(argv = process.argv.slice(2)) {
	try {
		const options = parseArgs(argv);
		const tigerRoot = resolveTigerRoot(options);
		const feeds = collectFeedData(tigerRoot);
		const generated = writeGeneratedFeeds(feeds, options);
		const grammars = syncGrammars(feeds, options);
		printRunSummary({ tigerRoot, options, feeds, generated, grammars });

		if (options.check && (generated.changed || grammars.some((summary) => summary.changed))) {
			process.exitCode = 1;
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}

module.exports = {
	run
};