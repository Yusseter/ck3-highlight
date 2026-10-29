const path = require('path');
const {
  repoRoot,
  readText,
  prepareJsonOutput,
  fail,
  escapeRegex,
  mergeUnique,
} = require('./shared');

const sourceDir = path.join(repoRoot, 'grammars');
const patternBuilders = {
  'whole-word': (pieces) => `(?i)\\b(?:${pieces.join('|')})\\b`,
  'localization-token': (pieces) =>
    `(?i)(?<![\\w|=%.+\\-])(?:${pieces.join('|')})(?![\\w=%.+\\-])`,
  'scope-word': (pieces) => `(?i)(?<!:)\\b(?:${pieces.join('|')})\\b`,
  'event-target': (pieces) => `(?i)\\b(${pieces.join('|')})(:)([\\w$-]+)`,
  'parameters-lhs': (pieces) => `(?i)\\b(?:${pieces.join('|')})\\b(?=[^:])`,
  'parameters-rhs': (pieces) => `(?i)\\b(?:${pieces.join('|')})\\b(?!:)`,
};

function readJsonSource(filePath) {
  try {
    return JSON.parse(readText(filePath));
  } catch (error) {
    fail(`Invalid grammar source ${filePath}: ${error.message}`);
  }
}

function mergePatternPieces(currentPieces, additions) {
  const merged = [...currentPieces];
  const seen = new Set(currentPieces);
  for (const value of mergeUnique(additions)) {
    const escaped = escapeRegex(value);
    if (!seen.has(escaped)) {
      seen.add(escaped);
      merged.push(escaped);
    }
  }
  return merged;
}

function loadGrammarSource(grammarId, sections, syncKeywords) {
  const grammar = readJsonSource(path.join(sourceDir, `${grammarId}.json`));
  if (!grammar?.repository || !Array.isArray(grammar.patterns))
    fail(`Invalid grammar structure: ${grammarId}`);
  const sources = [];
  const summaries = [];
  for (const [key, rule] of Object.entries(grammar.repository)) {
    const reference = rule.match;
    if (!reference || typeof reference !== 'object') continue;
    const builder = patternBuilders[reference.patternBuilder];
    if (!builder || !/^keywords\/[a-z0-9-]+\.json$/.test(reference.fragments)) {
      fail(`Invalid keyword source reference: ${grammarId}/${key}`);
    }
    const filePath = path.join(sourceDir, reference.fragments);
    let pieces = readJsonSource(filePath);
    if (
      !Array.isArray(pieces) ||
      pieces.some(
        (piece) =>
          typeof piece !== 'string' || !piece.trim() || /[\r\n]/.test(piece),
      )
    ) {
      fail(`Expected one non-empty regex fragment per item: ${filePath}`);
    }
    for (const section of sections.filter(
      (entry) => entry.repositoryKey === key,
    )) {
      if (section.patternBuilder !== reference.patternBuilder)
        fail(`Mismatched pattern builder: ${grammarId}/${key}`);
      const currentCount = pieces.length;
      if (syncKeywords) pieces = mergePatternPieces(pieces, section.values);
      summaries.push({
        label: key,
        currentCount,
        sourceCount: section.values.length,
        mergedCount: pieces.length,
        addedCount: pieces.length - currentCount,
        feedId: section.feedId,
        feedSection: section.feedSection,
      });
    }
    if (syncKeywords) sources.push(prepareJsonOutput(filePath, pieces));
    rule.match = builder(pieces);
  }
  for (const section of sections) {
    if (!summaries.some((summary) => summary.label === section.repositoryKey)) {
      fail(
        `Missing canonical keyword source: ${grammarId}/${section.repositoryKey}`,
      );
    }
  }
  return { grammar, sources, summaries };
}

module.exports = {
  sourceDir,
  readJsonSource,
  loadGrammarSource,
  patternBuilders,
};
