const path = require('path');
const { generatedDir, writeJsonIfChanged } = require('./shared');

function writeGeneratedFeeds(feeds, options) {
	const feedSummaries = feeds.map((feed) => {
		const filePath = path.join(generatedDir, feed.outputFile);
		const data = buildFeedDocument(feed);
		const writeResult = writeJsonIfChanged(filePath, data, options);
		return {
			id: feed.id,
			filePath: writeResult.filePath,
			changed: writeResult.changed,
			wrote: writeResult.wrote,
			sections: Object.entries(feed.sections).map(([name, section]) => ({
				name,
				count: section.values.length
			}))
		};
	});

	const manifest = buildManifest(feeds);
	const manifestResult = writeJsonIfChanged(path.join(generatedDir, 'manifest.json'), manifest, options);

	return {
		feeds: feedSummaries,
		manifest: manifestResult,
		changed: manifestResult.changed || feedSummaries.some((summary) => summary.changed)
	};
}

function buildFeedDocument(feed) {
	return {
		schemaVersion: 1,
		id: feed.id,
		description: feed.description,
		sourceFiles: [...feed.sourceFiles],
		sections: Object.fromEntries(
			Object.entries(feed.sections).map(([name, section]) => [
				name,
				{
					description: section.description,
					extractor: section.extractor,
					updateMode: section.updateMode,
					targets: section.targets,
					values: section.values
				}
			])
		)
	};
}

function buildManifest(feeds) {
	return {
		schemaVersion: 1,
		feeds: feeds.map((feed) => ({
			id: feed.id,
			file: feed.outputFile,
			description: feed.description,
			sourceFiles: [...feed.sourceFiles],
			sections: Object.entries(feed.sections).map(([name, section]) => ({
				name,
				count: section.values.length,
				extractor: section.extractor,
				updateMode: section.updateMode,
				targets: section.targets
			}))
		}))
	};
}

module.exports = {
	writeGeneratedFeeds
};