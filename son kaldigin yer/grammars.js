diff --git a/f:\Storage\Codding\vscode\Crusader Kings III Highlight\ck3-highlight\scripts/tiger-sync/lib/grammars.js b/f:\Storage\Codding\vscode\Crusader Kings III Highlight\ck3-highlight\scripts/tiger-sync/lib/grammars.js
new file mode 100644
--- /dev/null
+++ b/f:\Storage\Codding\vscode\Crusader Kings III Highlight\ck3-highlight\scripts/tiger-sync/lib/grammars.js
@@ -0,0 +1,104 @@
+const { grammarPaths, escapeRegex, fail, mergeUnique, readText, writeGrammarIfChanged } = require('./shared');
+const { extractRegexAlternatives } = require('./rust');
+
+const patternBuilders = {
+	'whole-word': (pieces) => `\\b(?:${pieces.join('|')})\\b`,
+	'scope-word': (pieces) => `(?<!:)\\b(?:${pieces.join('|')})\\b`,
+	'event-target': (pieces) => `\\b(${pieces.join('|')})(:)([\\w$-]+)`,
+	'parameters-lhs': (pieces) => `\\b(?:${pieces.join('|')})\\b(?=[^:])`,
+	'parameters-rhs': (pieces) => `\\b(?:${pieces.join('|')})\\b(?!:)`
+};
+
+function syncGrammars(feeds, options) {
+	const grammarSections = collectGrammarTargets(feeds);
+	return Object.entries(grammarSections).map(([grammarId, sections]) => syncGrammar(grammarId, sections, options));
+}
+
+function syncGrammar(grammarId, sections, options) {
+	const filePath = grammarPaths[grammarId];
+	if (!filePath) {
+		fail(`Unknown grammar target: ${grammarId}`);
+	}
+
+	const grammar = JSON.parse(readText(filePath));
+	const sectionSummaries = [];
+	let changed = false;
+
+	for (const section of sections) {
+		const repositoryEntry = grammar.repository?.[section.repositoryKey];
+		if (!repositoryEntry || typeof repositoryEntry.match !== 'string') {
+			fail(`Could not find grammar repository entry ${section.repositoryKey} in ${filePath}`);
+		}
+
+		const currentPieces = extractRegexAlternatives(repositoryEntry.match);
+		const mergedPieces = mergePatternPieces(currentPieces, section.values);
+		const nextMatch = patternBuilders[section.patternBuilder](mergedPieces);
+		if (nextMatch !== repositoryEntry.match) {
+			repositoryEntry.match = nextMatch;
+			changed = true;
+		}
+
+		sectionSummaries.push({
+			label: section.repositoryKey,
+			currentCount: currentPieces.length,
+			sourceCount: section.values.length,
+			mergedCount: mergedPieces.length,
+			addedCount: mergedPieces.length - currentPieces.length,
+			feedId: section.feedId,
+			feedSection: section.feedSection
+		});
+	}
+
+	const writeResult = writeGrammarIfChanged(filePath, grammar, options);
+	return {
+		name: `${grammarId}.tmLanguage.json`,
+		filePath,
+		changed: changed || writeResult.changed,
+		wrote: writeResult.wrote,
+		sections: sectionSummaries
+	};
+}
+
+function collectGrammarTargets(feeds) {
+	const grouped = {};
+	for (const feed of feeds) {
+		for (const [sectionName, section] of Object.entries(feed.sections)) {
+			for (const target of section.targets) {
+				if (!patternBuilders[target.patternBuilder]) {
+					fail(`Unknown pattern builder: ${target.patternBuilder}`);
+				}
+				if (!grouped[target.grammarId]) {
+					grouped[target.grammarId] = [];
+				}
+				grouped[target.grammarId].push({
+					feedId: feed.id,
+					feedSection: sectionName,
+					repositoryKey: target.repositoryKey,
+					patternBuilder: target.patternBuilder,
+					values: section.values
+				});
+			}
+		}
+	}
+	return grouped;
+}
+
+function mergePatternPieces(currentPieces, additions) {
+	const merged = [...currentPieces];
+	const seenRaw = new Set(currentPieces);
+	const seenLiteral = new Set(currentPieces.filter((piece) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(piece)));
+	for (const value of mergeUnique(additions)) {
+		const escaped = escapeRegex(value);
+		if (!value || seenRaw.has(escaped) || seenLiteral.has(value)) {
+			continue;
+		}
+		seenRaw.add(escaped);
+		seenLiteral.add(value);
+		merged.push(escaped);
+	}
+	return merged;
+}
+
+module.exports = {
+	syncGrammars
+};
