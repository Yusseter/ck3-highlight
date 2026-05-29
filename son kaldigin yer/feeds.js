diff --git a/f:\Storage\Codding\vscode\Crusader Kings III Highlight\ck3-highlight\scripts/tiger-sync/lib/feeds.js b/f:\Storage\Codding\vscode\Crusader Kings III Highlight\ck3-highlight\scripts/tiger-sync/lib/feeds.js
new file mode 100644
--- /dev/null
+++ b/f:\Storage\Codding\vscode\Crusader Kings III Highlight\ck3-highlight\scripts/tiger-sync/lib/feeds.js
@@ -0,0 +1,231 @@
+const path = require('path');
+const {
+	ensureDir,
+	ensureFile,
+	fail,
+	mergeUnique,
+	normalizeRelativePath,
+	readText,
+	walkFiles
+} = require('./shared');
+const {
+	collectStringArrayBindings,
+	extractChoiceValuesFromValidatorSources,
+	extractEnumVariants,
+	extractFieldNamesFromValidatorSources,
+	extractGuiChoiceValues,
+	extractGuiPropertyNames,
+	extractTupleFieldStrings,
+	isKeywordIdentifier,
+	mergeBindingMaps,
+	normalizeEnumToken,
+	pickBindingValues
+} = require('./rust');
+
+function collectFeedData(tigerRoot) {
+	const sources = resolveTigerSources(tigerRoot);
+	const validatorFiles = [sources.effectValidation, sources.validate, ...walkFiles(sources.dataDir, '.rs')];
+	const validatorSources = validatorFiles.map((filePath) => ({
+		filePath,
+		source: readText(filePath)
+	}));
+	const validatorBindings = new Map(
+		validatorSources.map(({ filePath, source }) => [filePath, collectStringArrayBindings(source)])
+	);
+	const miscSource = readText(sources.misc);
+	const guiPropertiesSource = readText(sources.guiProperties);
+	const miscBindings = collectStringArrayBindings(miscSource);
+	const guiBindings = collectStringArrayBindings(guiPropertiesSource);
+	const globalChoiceBindings = mergeBindingMaps(miscBindings, guiBindings);
+
+	return [
+		buildCk3KeywordsFeed(tigerRoot, sources),
+		buildParadoxParametersFeed(tigerRoot, sources, validatorSources, validatorBindings, miscBindings, guiBindings, globalChoiceBindings)
+	];
+}
+
+function buildCk3KeywordsFeed(tigerRoot, sources) {
+	return {
+		id: 'ck3-keywords',
+		description: 'Core CK3 keyword lists extracted from ck3 tables.',
+		outputFile: 'ck3-keywords.json',
+		sourceFiles: [
+			sources.effects,
+			sources.triggers,
+			sources.targets,
+			sources.modifiers
+		].map((filePath) => normalizeRelativePath(tigerRoot, filePath)),
+		sections: {
+			effects: {
+				description: 'Built-in CK3 effects.',
+				extractor: 'tuple-field:SCOPE_EFFECT[1]',
+				updateMode: 'additive',
+				values: extractTupleFieldStrings(readText(sources.effects), 'SCOPE_EFFECT', 1),
+				targets: [
+					{
+						grammarId: 'ck3',
+						repositoryKey: 'effects',
+						patternBuilder: 'whole-word'
+					}
+				]
+			},
+			triggers: {
+				description: 'Built-in CK3 triggers and complex triggers.',
+				extractor: 'tuple-field:TRIGGER[1]+TRIGGER_COMPLEX[1]',
+				updateMode: 'additive',
+				values: mergeUnique(
+					extractTupleFieldStrings(readText(sources.triggers), 'TRIGGER', 1),
+					extractTupleFieldStrings(readText(sources.triggers), 'TRIGGER_COMPLEX', 1)
+				),
+				targets: [
+					{
+						grammarId: 'ck3',
+						repositoryKey: 'triggers',
+						patternBuilder: 'whole-word'
+					}
+				]
+			},
+			event_targets: {
+				description: 'Built-in CK3 scope prefixes used as event targets.',
+				extractor: 'tuple-field:SCOPE_PREFIX[1]',
+				updateMode: 'additive',
+				values: extractTupleFieldStrings(readText(sources.targets), 'SCOPE_PREFIX', 1),
+				targets: [
+					{
+						grammarId: 'ck3',
+						repositoryKey: 'event_targets',
+						patternBuilder: 'event-target'
+					}
+				]
+			},
+			scopes: {
+				description: 'Built-in CK3 scope-to-scope links.',
+				extractor: 'tuple-field:SCOPE_TO_SCOPE[1]',
+				updateMode: 'additive',
+				values: extractTupleFieldStrings(readText(sources.targets), 'SCOPE_TO_SCOPE', 1),
+				targets: [
+					{
+						grammarId: 'ck3',
+						repositoryKey: 'scopes',
+						patternBuilder: 'scope-word'
+					}
+				]
+			},
+			modifiers: {
+				description: 'Built-in CK3 modifiers.',
+				extractor: 'tuple-field:MODIF_TABLE[0]',
+				updateMode: 'additive',
+				values: extractTupleFieldStrings(readText(sources.modifiers), 'MODIF_TABLE', 0),
+				targets: [
+					{
+						grammarId: 'ck3',
+						repositoryKey: 'modifiers',
+						patternBuilder: 'whole-word'
+					}
+				]
+			}
+		}
+	};
+}
+
+function buildParadoxParametersFeed(
+	tigerRoot,
+	sources,
+	validatorSources,
+	validatorBindings,
+	miscBindings,
+	guiBindings,
+	globalChoiceBindings
+) {
+	const guiBuiltinSource = readText(sources.guiBuiltins);
+	return {
+		id: 'paradox-parameters',
+		description: 'CK3-specific shared Paradox parameter and value lists.',
+		outputFile: 'paradox-parameters.json',
+		sourceFiles: [
+			sources.effectValidation,
+			sources.validate,
+			sources.misc,
+			sources.guiProperties,
+			sources.guiBuiltins,
+			sources.guiPropertiesText,
+			...validatorSources.map(({ filePath }) => filePath)
+		]
+			.map((filePath) => normalizeRelativePath(tigerRoot, filePath))
+			.filter((value, index, list) => list.indexOf(value) === index)
+			.sort(),
+		sections: {
+			'parameters-lhs': {
+				description: 'Field names that appear on the left-hand side of CK3 script assignments.',
+				extractor: 'validator-fields+guiproperties',
+				updateMode: 'additive',
+				values: mergeUnique(
+					extractFieldNamesFromValidatorSources(validatorSources),
+					extractGuiPropertyNames(readText(sources.guiPropertiesText))
+				).filter(isKeywordIdentifier),
+				targets: [
+					{
+						grammarId: 'paradox',
+						repositoryKey: 'parameters-lhs',
+						patternBuilder: 'parameters-lhs'
+					}
+				]
+			},
+			'parameters-rhs': {
+				description: 'Known literal values and GUI enums that appear on the right-hand side.',
+				extractor: 'validator-choice+gui-choice+misc',
+				updateMode: 'additive',
+				values: mergeUnique(
+					extractEnumVariants(guiBuiltinSource, 'BuiltinWidget').map(normalizeEnumToken),
+					extractChoiceValuesFromValidatorSources(validatorSources, validatorBindings, globalChoiceBindings),
+					extractGuiChoiceValues(readText(sources.guiProperties), guiBindings),
+					pickBindingValues(miscBindings, [
+						'AI_TARGETS',
+						'ACTIVITY_STATES',
+						'AGENT_SLOT_CONTRIBUTION_TYPE',
+						'CURRENCIES_CK3',
+						'DLC_FEATURES_CK3'
+					]),
+					pickBindingValues(guiBindings, ['ALIGN', 'BLENDMODES', 'LAYOUT_POLICIES'])
+				).filter(isKeywordIdentifier),
+				targets: [
+					{
+						grammarId: 'paradox',
+						repositoryKey: 'parameters-rhs',
+						patternBuilder: 'parameters-rhs'
+					}
+				]
+			}
+		}
+	};
+}
+
+function resolveTigerSources(tigerRoot) {
+	const sources = {
+		effects: path.join(tigerRoot, 'src', 'ck3', 'tables', 'effects.rs'),
+		triggers: path.join(tigerRoot, 'src', 'ck3', 'tables', 'triggers.rs'),
+		targets: path.join(tigerRoot, 'src', 'ck3', 'tables', 'targets.rs'),
+		modifiers: path.join(tigerRoot, 'src', 'ck3', 'tables', 'modifs.rs'),
+		misc: path.join(tigerRoot, 'src', 'ck3', 'tables', 'misc.rs'),
+		validate: path.join(tigerRoot, 'src', 'ck3', 'validate.rs'),
+		effectValidation: path.join(tigerRoot, 'src', 'ck3', 'effect_validation.rs'),
+		dataDir: path.join(tigerRoot, 'src', 'ck3', 'data'),
+		guiProperties: path.join(tigerRoot, 'src', 'gui', 'properties.rs'),
+		guiBuiltins: path.join(tigerRoot, 'src', 'gui', 'builtins.rs'),
+		guiPropertiesText: path.join(tigerRoot, 'guiproperties.txt')
+	};
+
+	for (const [label, filePath] of Object.entries(sources)) {
+		if (label === 'dataDir') {
+			ensureDir(filePath, label);
+			continue;
+		}
+		ensureFile(filePath, label);
+	}
+
+	return sources;
+}
+
+module.exports = {
+	collectFeedData
+};
