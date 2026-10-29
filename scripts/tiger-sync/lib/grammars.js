const { grammarPaths, prepareJsonOutput, fail } = require('./shared');
const { loadGrammarSource, patternBuilders } = require('./grammar-sources');
const { applyGrammarRules } = require('./grammar-rules');

function prepareGrammars(feeds, { syncKeywords = false } = {}) {
  const targets = Object.fromEntries(
    Object.keys(grammarPaths).map((id) => [id, []]),
  );
  for (const feed of feeds) {
    for (const [name, section] of Object.entries(feed.sections)) {
      for (const target of section.targets) {
        if (
          !targets[target.grammarId] ||
          !patternBuilders[target.patternBuilder]
        )
          fail('Unknown grammar target or pattern builder');
        targets[target.grammarId].push({
          ...target,
          feedId: feed.id,
          feedSection: name,
          values: section.values,
        });
      }
    }
  }
  const sources = [];
  const grammars = Object.entries(targets).map(([id, sections]) => {
    const source = loadGrammarSource(id, sections, syncKeywords);
    sources.push(...source.sources);
    applyGrammarRules(id, source.grammar, feeds);
    return {
      ...prepareJsonOutput(grammarPaths[id], source.grammar),
      name: id + '.tmLanguage.json',
      sections: source.summaries,
    };
  });
  return { grammars, sources };
}

module.exports = { prepareGrammars };
