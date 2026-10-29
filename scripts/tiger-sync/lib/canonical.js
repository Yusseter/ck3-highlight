const path = require('path');
const { sourceDir, readJsonSource } = require('./grammar-sources');
const { buildFeedDocument } = require('./generated');
const { prepareJsonOutput, fail } = require('./shared');

const feedIds = [
  'ck3-keywords',
  'ck3-context',
  'ck3-static-tables',
  'paradox-parameters',
  'gui-symbols',
  'localization-symbols',
  'localization-builtins',
];

function readCanonicalFeeds() {
  return feedIds.map((id) => {
    const file = `${id}.json`;
    const feed = readJsonSource(path.join(sourceDir, 'tiger', file));
    if (
      feed.schemaVersion !== 1 ||
      feed.id !== id ||
      !Array.isArray(feed.sourceFiles) ||
      !feed.sections ||
      typeof feed.sections !== 'object'
    ) {
      fail(`Invalid canonical Tiger feed: ${file}`);
    }
    for (const section of Object.values(feed.sections)) {
      if (
        !section ||
        !Array.isArray(section.values) ||
        section.values.some(
          (value) => typeof value !== 'string' || !value.trim(),
        ) ||
        !Array.isArray(section.targets)
      ) {
        fail(`Invalid canonical Tiger feed section: ${file}`);
      }
    }
    return { ...feed, outputFile: file };
  });
}

function prepareCanonicalFeeds(feeds, upstream) {
  return [
    ...feeds.map((feed) =>
      prepareJsonOutput(
        path.join(sourceDir, 'tiger', feed.outputFile),
        buildFeedDocument(feed),
      ),
    ),
    prepareJsonOutput(path.join(sourceDir, 'tiger', 'upstream.json'), upstream),
  ];
}

function readCanonicalUpstream() {
  const upstream = readJsonSource(
    path.join(sourceDir, 'tiger', 'upstream.json'),
  );
  if (
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(upstream?.revision) ||
    !upstream.inputs ||
    typeof upstream.inputs !== 'object' ||
    Array.isArray(upstream.inputs) ||
    !Object.keys(upstream.inputs).length
  ) {
    fail('Invalid canonical Tiger upstream provenance');
  }
  for (const [file, hash] of Object.entries(upstream.inputs)) {
    if (
      !file ||
      path.isAbsolute(file) ||
      file.split(/[\\/]/).includes('..') ||
      !/^[a-f0-9]{64}$/.test(hash)
    )
      fail('Invalid canonical Tiger upstream input');
  }
  return upstream;
}

module.exports = {
  readCanonicalFeeds,
  prepareCanonicalFeeds,
  readCanonicalUpstream,
};
