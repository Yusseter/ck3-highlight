const path = require('path');
const { generatedDir, prepareJsonOutput } = require('./shared');

function prepareGeneratedFeeds(feeds, provenance) {
  const feedSummaries = feeds.map((feed) => {
    const filePath = path.join(generatedDir, feed.outputFile);
    const data = buildFeedDocument(feed);
    const output = prepareJsonOutput(filePath, data);
    return {
      ...output,
      id: feed.id,
      sections: Object.entries(feed.sections).map(([name, section]) => ({
        name,
        count: section.values.length,
      })),
    };
  });

  const manifest = buildManifest(feeds, provenance);
  const manifestResult = prepareJsonOutput(
    path.join(generatedDir, 'manifest.json'),
    manifest,
  );

  return {
    feeds: feedSummaries,
    manifest: manifestResult,
    changed:
      manifestResult.changed ||
      feedSummaries.some((summary) => summary.changed),
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
          values: section.values,
        },
      ]),
    ),
  };
}

function buildManifest(feeds, provenance) {
  return {
    schemaVersion: 2,
    provenance,
    updateMode: {
      feeds: 'replace',
      grammars: 'additive',
      description:
        'Canonical Tiger snapshots replace extracted data; canonical keyword fragments preserve existing alternatives for backwards compatibility. Runtime grammars and feeds are rebuilt from repository sources.',
    },
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
        targets: section.targets,
      })),
    })),
  };
}

module.exports = {
  prepareGeneratedFeeds,
  buildFeedDocument,
};
