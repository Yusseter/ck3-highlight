const path = require('path');
const { grammarPaths, escapeRegex, fail, mergeUnique, readText, writeGrammarIfChanged } = require('./shared');
const { extractRegexAlternatives } = require('./rust');

const patternBuilders = {
	'whole-word': (pieces) => `(?i)\\b(?:${pieces.join('|')})\\b`,
	'localization-token': (pieces) => `(?i)(?<![\\w|=%.+\\-])(?:${pieces.join('|')})(?![\\w=%.+\\-])`,
	'scope-word': (pieces) => `(?i)(?<!:)\\b(?:${pieces.join('|')})\\b`,
	'event-target': (pieces) => `(?i)\\b(${pieces.join('|')})(:)([\\w$-]+)`,
	'parameters-lhs': (pieces) => `(?i)\\b(?:${pieces.join('|')})\\b(?=[^:])`,
	'parameters-rhs': (pieces) => `(?i)\\b(?:${pieces.join('|')})\\b(?!:)`
};

function syncGrammars(feeds, options) {
	const grammarSections = collectGrammarTargets(feeds);
	return Object.entries(grammarSections).map(([grammarId, sections]) => syncGrammar(grammarId, sections, feeds, options));
}

function syncGrammar(grammarId, sections, feeds, options) {
	const filePath = grammarPaths[grammarId];
	if (!filePath) {
		fail(`Unknown grammar target: ${grammarId}`);
	}

	const grammar = JSON.parse(readText(filePath));
	const sectionSummaries = [];
	let changed = false;

	for (const section of sections) {
		const repositoryEntry = grammar.repository?.[section.repositoryKey];
		if (!repositoryEntry || typeof repositoryEntry.match !== 'string') {
			fail(`Could not find grammar repository entry ${section.repositoryKey} in ${filePath}`);
		}

		const currentPieces = extractPatternPieces(repositoryEntry.match, section.patternBuilder);
		const mergedPieces = mergePatternPieces(currentPieces, section.values);
		const nextMatch = patternBuilders[section.patternBuilder](mergedPieces);
		if (nextMatch !== repositoryEntry.match) {
			repositoryEntry.match = nextMatch;
			changed = true;
		}

		sectionSummaries.push({
			label: section.repositoryKey,
			currentCount: currentPieces.length,
			sourceCount: section.values.length,
			mergedCount: mergedPieces.length,
			addedCount: mergedPieces.length - currentPieces.length,
			feedId: section.feedId,
			feedSection: section.feedSection
		});
	}

	const customSections = applyCustomGrammarSync(grammarId, grammar, feeds);
	if (customSections.sections.length > 0) {
		sectionSummaries.push(...customSections.sections);
	}
	if (customSections.changed) {
		changed = true;
	}

	const writeResult = writeGrammarIfChanged(filePath, grammar, options);
	return {
		name: `${grammarId}.tmLanguage.json`,
		filePath,
		changed: changed || writeResult.changed,
		wrote: writeResult.wrote,
		sections: sectionSummaries
	};
}

function collectGrammarTargets(feeds) {
	const grouped = {};
	for (const feed of feeds) {
		for (const [sectionName, section] of Object.entries(feed.sections)) {
			for (const target of section.targets) {
				if (!patternBuilders[target.patternBuilder]) {
					fail(`Unknown pattern builder: ${target.patternBuilder}`);
				}
				if (!grouped[target.grammarId]) {
					grouped[target.grammarId] = [];
				}
				grouped[target.grammarId].push({
					feedId: feed.id,
					feedSection: sectionName,
					repositoryKey: target.repositoryKey,
					patternBuilder: target.patternBuilder,
					values: section.values
				});
			}
		}
	}
	return grouped;
}

function extractPatternPieces(pattern, patternBuilder) {
	const normalizedPattern = stripLeadingCaseFlag(pattern);
	if (patternBuilder === 'scope-word') {
		return extractWrappedAlternatives(normalizedPattern, '(?<!:)\\b(?:', ')\\b').map((piece) =>
			piece === '?<!:' ? '' : piece.replace(/^\?<!:\|/, '')
		).filter(Boolean);
	}
	if (patternBuilder === 'whole-word') {
		return extractWrappedAlternatives(normalizedPattern, '\\b(?:', ')\\b');
	}
	if (patternBuilder === 'localization-token') {
		return extractWrappedAlternatives(normalizedPattern, '(?<![\\w|=%.+\\-])(?:', ')(?![\\w=%.+\\-])');
	}
	if (patternBuilder === 'parameters-lhs') {
		return extractWrappedAlternatives(normalizedPattern, '\\b(?:', ')\\b(?=[^:])');
	}
	if (patternBuilder === 'parameters-rhs') {
		return extractWrappedAlternatives(normalizedPattern, '\\b(?:', ')\\b(?!:)');
	}
	if (patternBuilder === 'event-target') {
		return extractWrappedAlternatives(normalizedPattern, '\\b(', ')(:)([\\w$-]+)');
	}
	return extractRegexAlternatives(normalizedPattern);
}

function extractWrappedAlternatives(pattern, prefix, suffix) {
	if (pattern.startsWith(prefix) && pattern.endsWith(suffix)) {
		return pattern.slice(prefix.length, pattern.length - suffix.length).split('|').filter(Boolean);
	}
	return extractRegexAlternatives(pattern);
}

function stripLeadingCaseFlag(pattern) {
	return pattern.startsWith('(?i)') ? pattern.slice(4) : pattern;
}

function mergePatternPieces(currentPieces, additions) {
	const merged = [...currentPieces];
	const seenRaw = new Set(currentPieces);
	const seenLiteral = new Set(currentPieces.filter((piece) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(piece)));
	for (const value of mergeUnique(additions)) {
		const escaped = escapeRegex(value);
		if (!value || seenRaw.has(escaped) || seenLiteral.has(value)) {
			continue;
		}
		seenRaw.add(escaped);
		seenLiteral.add(value);
		merged.push(escaped);
	}
	return merged;
}

function uniqueCaseInsensitive(values) {
	const merged = [];
	const seen = new Set();
	for (const value of mergeUnique(values)) {
		const key = value.toLowerCase();
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		merged.push(value);
	}
	return merged;
}

function compareCaseVariants(left, right) {
	const leftIsAllUpper = left === left.toUpperCase();
	const rightIsAllUpper = right === right.toUpperCase();
	const leftIsAllLower = left === left.toLowerCase();
	const rightIsAllLower = right === right.toLowerCase();
	const leftScore = leftIsAllUpper ? 1 : leftIsAllLower ? 2 : 0;
	const rightScore = rightIsAllUpper ? 1 : rightIsAllLower ? 2 : 0;
	if (leftScore !== rightScore) {
		return leftScore - rightScore;
	}
	return left.localeCompare(right);
}

function choosePreferredCaseVariant(values) {
	return [...values].sort(compareCaseVariants)[0];
}

function applyCustomGrammarSync(grammarId, grammar, feeds) {
	let changed = false;
	const sections = [];

	if (grammarId === 'ck3') {
		changed ||= cleanupCk3ParameterBindingArtifacts(grammar);
	}
	if (grammarId === 'paradox') {
		const result = applyParadoxGrammarSync(grammar, feeds);
		changed ||= result.changed;
		sections.push(...result.sections);
	}
	if (grammarId === 'localization') {
		const result = applyLocalizationBuiltinSync(grammar, feeds);
		const tooltipResult = applyLocalizationComplexTooltipSync(grammar, feeds);
		changed ||= result.changed;
		changed ||= tooltipResult.changed;
		sections.push(...result.sections);
		sections.push(...tooltipResult.sections);
	}

	return { changed, sections };
}

function applyParadoxGrammarSync(grammar, feeds) {
	const staticTablesFeed = feeds.find((entry) => entry.id === 'ck3-static-tables');
	const localizationSymbolsFeed = feeds.find((entry) => entry.id === 'localization-symbols');
	const localizationBuiltinsFeed = feeds.find((entry) => entry.id === 'localization-builtins');
	const defineValues = staticTablesFeed?.sections?.defines?.values || [];
	const defineNamespaces = staticTablesFeed?.sections?.['define-namespaces']?.values || [];
	const defineKeys = staticTablesFeed?.sections?.['define-keys']?.values || [];
	const soundValues = staticTablesFeed?.sections?.sounds?.values || [];
	const localizationKeyFields = localizationSymbolsFeed?.sections?.['localization-key-fields']?.values || [];
	let changed = false;
	const sections = [];

	changed = syncParadoxDateRule(grammar) || changed;
	changed = syncParadoxReaderDirective(grammar) || changed;
	changed = syncParadoxSoundStrings(grammar, soundValues) || changed;
	changed = syncParadoxLocalizationKeyAssignments(grammar, localizationKeyFields) || changed;
	changed = syncParadoxMacroLocalizationExpressions(grammar, localizationBuiltinsFeed) || changed;
	changed = cleanupParadoxStructuralParameterBinding(grammar) || changed;

	sections.push(
		{
			label: 'date',
			currentCount: 1,
			sourceCount: 1,
			mergedCount: 1,
			addedCount: 0,
			feedId: 'paradox',
			feedSection: 'date'
		},
		{
			label: 'sound-string',
			currentCount: soundValues.length,
			sourceCount: soundValues.length,
			mergedCount: soundValues.length,
			addedCount: 0,
			feedId: 'ck3-static-tables',
			feedSection: 'sounds'
		},
		{
			label: 'localization-key-assignment',
			currentCount: localizationKeyFields.length,
			sourceCount: localizationKeyFields.length,
			mergedCount: localizationKeyFields.length,
			addedCount: 0,
			feedId: 'localization-symbols',
			feedSection: 'localization-key-fields'
		},
		{
			label: 'quoted-localization-expression',
			currentCount: 2,
			sourceCount: 2,
			mergedCount: 2,
			addedCount: 0,
			feedId: 'localization-builtins',
			feedSection: 'builtin-scopes+functions'
		}
	);

	if (!defineValues.length) {
		return { changed, sections };
	}

	const defineRule = buildTigerDefineReferenceRule(defineValues);

	const comparablePatterns = grammar.repository?.['non-prefixable-comparable-rhs']?.patterns;
	if (!Array.isArray(comparablePatterns)) {
		fail('Could not find comparable RHS patterns in paradox grammar');
	}
	changed = upsertDefinePattern(comparablePatterns, defineRule, 0) || changed;

	const identifierPatterns = grammar.repository?.identifier?.patterns;
	if (!Array.isArray(identifierPatterns)) {
		fail('Could not find identifier patterns in paradox grammar');
	}
	const identifierInsertIndex = findIdentifierFallbackIndex(identifierPatterns);
	changed = upsertDefinePattern(identifierPatterns, defineRule, identifierInsertIndex) || changed;

	const calculationPatterns = grammar.repository?.calculation?.patterns;
	if (!Array.isArray(calculationPatterns)) {
		fail('Could not find calculation patterns in paradox grammar');
	}
	const calculationInsertIndex = findIdentifierFallbackIndex(calculationPatterns);
	changed = upsertDefinePattern(calculationPatterns, defineRule, calculationInsertIndex) || changed;

	changed = removeDefinePartsFromGenericParametersLhs(grammar, defineNamespaces, defineKeys) || changed;
	changed = syncParadoxDefineBlocks(grammar, defineValues) || changed;

	sections.push(
		{
			label: 'define-reference',
			currentCount: defineValues.length,
			sourceCount: defineValues.length,
			mergedCount: defineValues.length,
			addedCount: 0,
			feedId: 'ck3-static-tables',
			feedSection: 'defines'
		},
		{
			label: 'define-declaration',
			currentCount: defineValues.length,
			sourceCount: defineValues.length,
			mergedCount: defineValues.length,
			addedCount: 0,
			feedId: 'ck3-static-tables',
			feedSection: 'define-namespaces+define-keys'
		}
	);

	return { changed, sections };
}

function syncParadoxDateRule(grammar) {
	const nextDateRule = {
		comment: 'Dot-seperated date (-1000.10.10)',
		match: '(?<![A-Za-z0-9_.])-?\\d+\\.\\d+\\.\\d+\\b',
		name: 'constant.numeric.date.paradox'
	};

	if (JSON.stringify(grammar.repository?.date) === JSON.stringify(nextDateRule)) {
		return false;
	}

	grammar.repository.date = nextDateRule;
	return true;
}

function buildTigerDefineReferenceRule(values) {
	return {
		match: buildTigerDefineReferencePattern(values),
		name: 'markup.bold',
		captures: {
			1: { name: 'support.type.scope.event_target.paradox.ck3' },
			2: { name: 'support.type.scope.event_target.paradox.ck3 punctuation.definition.event_target.paradox.ck3' },
			3: { name: 'variable.parameter.event_target.paradox.ck3' },
			4: { name: 'support.type.scope.event_target.paradox.ck3 punctuation.definition.event_target.paradox.ck3' },
			5: { name: 'variable.parameter.event_target.paradox.ck3' }
		}
	};
}

function upsertDefinePattern(patterns, defineRule, insertIndex) {
	const currentIndex = patterns.findIndex(
		(pattern) =>
			typeof pattern?.match === 'string' &&
			/define/i.test(pattern.match) &&
			pattern.captures?.['5']?.name === 'variable.parameter.event_target.paradox.ck3'
	);
	const nextRule = cloneJson(defineRule);

	if (currentIndex >= 0) {
		if (JSON.stringify(patterns[currentIndex]) === JSON.stringify(nextRule)) {
			return false;
		}
		patterns[currentIndex] = nextRule;
		return true;
	}

	patterns.splice(insertIndex, 0, nextRule);
	return true;
}

function findIdentifierFallbackIndex(patterns) {
	const index = patterns.findIndex(
		(pattern) => typeof pattern?.match === 'string' && pattern.name === 'variable.other.identifier.paradox'
	);
	return index >= 0 ? index : patterns.length;
}

function cloneJson(value) {
	return JSON.parse(JSON.stringify(value));
}

function syncParadoxReaderDirective(grammar) {
	const nextReaderDirectiveRule = {
		match: '(@:)((?i:define|insert|log|load_variable|register_variable|assert))\\b',
		name: 'markup.bold meta.directive.paradox',
		captures: {
			1: { name: 'punctuation.definition.directive.paradox' },
			2: { name: 'keyword.control.directive.paradox' }
		}
	};

	if (JSON.stringify(grammar.repository?.['reader-directive']) === JSON.stringify(nextReaderDirectiveRule)) {
		return false;
	}

	grammar.repository['reader-directive'] = nextReaderDirectiveRule;
	return true;
}

function syncParadoxSoundStrings(grammar, soundValues) {
	const sounds = uniqueCaseInsensitive(soundValues);
	const soundPattern = sounds.length
		? `(?i:${sounds.map((value) => escapeRegex(value)).join('|')})`
		: '(?!)';

	const nextSoundRule = {
		match: soundPattern,
		name: 'markup.bold support.constant.parameter.rhs.paradox string.quoted.double.paradox'
	};

	const nextStringRule = {
		begin: '"',
		beginCaptures: { '0': { name: 'punctuation.definition.string.begin.paradox' } },
		end: '"',
		endCaptures: { '0': { name: 'punctuation.definition.string.end.paradox' } },
		name: 'string.quoted.double.paradox',
		patterns: [
			{ include: '#sound-string' },
			{
				match: '\\\\[n"]',
				name: 'constant.character.escape.paradox'
			}
		]
	};

	let changed = false;
	if (JSON.stringify(grammar.repository?.['sound-string']) !== JSON.stringify(nextSoundRule)) {
		grammar.repository['sound-string'] = nextSoundRule;
		changed = true;
	}

	if (JSON.stringify(grammar.repository?.strings) !== JSON.stringify(nextStringRule)) {
		grammar.repository.strings = nextStringRule;
		changed = true;
	}

	return changed;
}

function syncParadoxLocalizationKeyAssignments(grammar, localizationKeyFields) {
	const fields = uniqueCaseInsensitive(localizationKeyFields).filter(isIdentifier);
	const fieldsPattern = fields.length
		? fields.map((value) => escapeRegex(value)).join('|')
		: '(?!)';
	const localizationKeyPattern = '[A-Za-z0-9_][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_][A-Za-z0-9_-]*)+';
	const nextAssignmentRule = {
		begin: `\\s*((?i:${fieldsPattern}))(\\s*)(\\?=|=)\\s*(?=${localizationKeyPattern})`,
		beginCaptures: {
			1: { name: 'markup.bold support.constant.parameter.lhs.paradox' },
			3: { name: 'punctuation.equal.paradox' }
		},
		end: '(?=\\s*(?:#|$))',
		patterns: [{ include: '#localization-key-value' }]
	};
	const nextValueRule = {
		match: localizationKeyPattern,
		name: 'variable.other.identifier.paradox'
	};

	let changed = false;

	if (JSON.stringify(grammar.repository?.['localization-key-assignment']) !== JSON.stringify(nextAssignmentRule)) {
		grammar.repository['localization-key-assignment'] = nextAssignmentRule;
		changed = true;
	}

	if (JSON.stringify(grammar.repository?.['localization-key-value']) !== JSON.stringify(nextValueRule)) {
		grammar.repository['localization-key-value'] = nextValueRule;
		changed = true;
	}

	changed = ensureCodePatternInclude(grammar, '#localization-key-assignment', '#statement') || changed;
	return changed;
}

function syncParadoxMacroLocalizationExpressions(grammar, builtinsFeed) {
	const {
		builtinScopes,
		builtinFunctions,
		builtinFunctionsWithArgs
	} = collectLocalizationBuiltinSets(builtinsFeed);

	const nextAssignmentRule = {
		begin: '\\s*((?i:definition|replace_with))(\\s*)(\\?=|=)(\\s*)(\")',
		beginCaptures: {
			1: { name: 'markup.bold support.constant.parameter.lhs.paradox' },
			3: { name: 'punctuation.equal.paradox' },
			5: { name: 'punctuation.definition.string.begin.paradox' }
		},
		end: '\"',
		endCaptures: { '0': { name: 'punctuation.definition.string.end.paradox' } },
		name: 'string.quoted.double.paradox',
		patterns: [{ include: '#quoted-localization-expression' }]
	};

	const nextExpressionRule = {
		patterns: [
			{ include: '#quoted-localization-string' },
			{ include: '#quoted-localization-scope' },
			{ include: '#quoted-localization-function-with-para' },
			{ include: '#quoted-localization-function-without-para' }
		]
	};

	const nextStringRule = {
		begin: '\'',
		beginCaptures: { '0': { name: 'punctuation.definition.string.begin.paradox.loc' } },
		end: '\'',
		endCaptures: { '0': { name: 'punctuation.definition.string.end.paradox.loc' } },
		name: 'markup.italic string.quoted.single.paradox.loc',
		patterns: [
			{
				match: '\\\\.',
				name: 'constant.character.escape.paradox.loc'
			}
		]
	};

	const nextParametersRule = {
		patterns: [
			{ include: '#quoted-localization-string' },
			{ include: '#quoted-localization-scope' },
			{ include: '#quoted-localization-function-with-para' },
			{ include: '#quoted-localization-function-without-para' }
		]
	};

	const nextScopeRule = {
		match: `(?<!\\.)(?:(${buildWholeWordPattern(builtinScopes, { caseInsensitive: true })})|(\\b(?!Get)\\w+\\b))(?!\\()`,
		captures: {
			1: {
				name: 'markup.italic support.variable.scope.builtin.paradox.loc support.variable.scope.paradox.loc'
			},
			2: { name: 'markup.italic support.variable.scope.paradox.loc' }
		}
	};

	const nextFunctionWithoutParaRule = {
		match: `(?:(${buildWholeWordPattern(builtinFunctions, { caseInsensitive: true })})|(\\b[A-Z]\\w*\\b)|(\\.))(?!\\()`,
		name: 'meta.function.without-para.paradox.loc',
		captures: {
			1: {
				name: 'markup.bold support.function.builtin.paradox.loc support.function.paradox.loc'
			},
			2: { name: 'markup.bold support.function.paradox.loc' },
			3: { name: 'markup.bold punctuation.separator.dot-access.paradox.loc' }
		}
	};

	const nextFunctionWithParaRule = {
		begin: `(?:(?:(${buildWholeWordPattern(builtinFunctionsWithArgs, { caseInsensitive: true })}))|([A-Za-z_]\\w*))(?=\\()`,
		beginCaptures: {
			1: {
				name: 'markup.bold support.function.builtin.paradox.loc support.function.paradox.loc'
			},
			2: { name: 'markup.bold support.function.paradox.loc' }
		},
		end: '(?<=\\))',
		name: 'meta.function.with-para.paradox.loc',
		patterns: [{ include: '#quoted-localization-parameters' }]
	};

	const nextEntries = {
		'quoted-localization-expression-assignment': nextAssignmentRule,
		'quoted-localization-expression': nextExpressionRule,
		'quoted-localization-string': nextStringRule,
		'quoted-localization-parameters': nextParametersRule,
		'quoted-localization-scope': nextScopeRule,
		'quoted-localization-function-without-para': nextFunctionWithoutParaRule,
		'quoted-localization-function-with-para': nextFunctionWithParaRule
	};

	let changed = false;
	for (const [key, value] of Object.entries(nextEntries)) {
		if (JSON.stringify(grammar.repository?.[key]) !== JSON.stringify(value)) {
			grammar.repository[key] = value;
			changed = true;
		}
	}

	changed = ensureCodePatternInclude(grammar, '#quoted-localization-expression-assignment', '#statement') || changed;
	return changed;
}

function removeDefinePartsFromGenericParametersLhs(grammar, defineNamespaces, defineKeys) {
	const repositoryEntry = grammar.repository?.['parameters-lhs'];
	if (!repositoryEntry || typeof repositoryEntry.match !== 'string') {
		fail('Could not find parameters-lhs in paradox grammar');
	}

	const currentPieces = extractPatternPieces(repositoryEntry.match, 'parameters-lhs');
	const nextPieces = removePatternPieces(currentPieces, mergeUnique(defineNamespaces, defineKeys));
	const nextMatch = patternBuilders['parameters-lhs'](nextPieces);
	if (nextMatch === repositoryEntry.match) {
		return false;
	}

	repositoryEntry.match = nextMatch;
	return true;
}

function syncParadoxDefineBlocks(grammar, defineValues) {
	const groups = groupDefineValues(defineValues);
	const beforeSnapshot = collectDefineBlockSnapshot(grammar);
	let changed = false;

	changed = ensureCodePatternInclude(grammar, '#define-blocks', '#statement') || changed;

	deleteGeneratedDefineRepositories(grammar.repository);
	grammar.repository['define-blocks'] = {
		patterns: groups.map((group) => ({ include: `#${group.blockKey}` }))
	};

	for (const group of groups) {
		grammar.repository[group.blockKey] = buildDefineBlockRule(group);
		grammar.repository[group.codeKey] = {
			patterns: [
				{ include: '#comment' },
				{ include: `#${group.statementKey}` },
				{ include: '#rhs-item' }
			]
		};
		grammar.repository[group.statementKey] = {
			patterns: [
				{ include: `#${group.lhsKey}` },
				{ include: '#rhs' }
			]
		};
		grammar.repository[group.lhsKey] = buildDefineLhsRule(group.keys);
	}

	return changed || JSON.stringify(beforeSnapshot) !== JSON.stringify(collectDefineBlockSnapshot(grammar));
}

function cleanupParadoxStructuralParameterBinding(grammar) {
	let changed = false;

	changed = removeCodePatternInclude(grammar, '#scripted-call-parameter-blocks') || changed;
	deleteGeneratedScriptedCallRepositories(grammar.repository);
	for (const key of [
		'parameter-binding-uppercase-assignment',
		'parameter-binding-value',
		'parameter-binding-generic-assignment',
		'parameter-binding-macro-assignment',
		'nested-code',
		'scripted-call-like-blocks',
		'scripted-call-suffix-block',
		'scripted-call-like-code',
		'scripted-call-like-lhs'
	]) {
		if (grammar.repository?.[key]) {
			delete grammar.repository[key];
			changed = true;
		}
	}

	const nextBlockPatterns = [{ include: '#code' }];
	if (JSON.stringify(grammar.repository?.block?.patterns) !== JSON.stringify(nextBlockPatterns)) {
		grammar.repository.block.patterns = nextBlockPatterns;
		changed = true;
	}

	if (grammar.repository?.['comparable-rhs']?.end !== '\\s+') {
		grammar.repository['comparable-rhs'].end = '\\s+';
		changed = true;
	}

	if (grammar.repository?.['non-comparable-rhs']?.end !== '\\s+') {
		grammar.repository['non-comparable-rhs'].end = '\\s+';
		changed = true;
	}

	const nextNonPrefixableEnd = '(?![\\w:|$"@])';
	if (grammar.repository?.['non-prefixable-comparable-rhs']?.end !== nextNonPrefixableEnd) {
		grammar.repository['non-prefixable-comparable-rhs'].end = nextNonPrefixableEnd;
		changed = true;
	}
	if (grammar.repository?.['non-prefixable-non-comparable-rhs']?.end !== nextNonPrefixableEnd) {
		grammar.repository['non-prefixable-non-comparable-rhs'].end = nextNonPrefixableEnd;
		changed = true;
	}

	return changed;
}

function buildDefineBlockRule(group) {
	return {
		begin: `(?i)\\s*(${escapeRegex(group.namespace)})(\\s*)(=)(\\s*)(\\{)`,
		beginCaptures: {
			1: { name: 'markup.italic support.constant.parameter.lhs.paradox support.constant.define.namespace.paradox' },
			3: { name: 'punctuation.equal.paradox' },
			5: { name: 'punctuation.section.block.begin.paradox' }
		},
		end: '}',
		endCaptures: { '0': { name: 'punctuation.section.block.end.paradox' } },
		contentName: 'meta.block.paradox',
		patterns: [{ include: `#${group.codeKey}` }]
	};
}

function buildDefineLhsRule(keys) {
	return {
		begin: '\\s*(?=[\\w:.|$@-]+\\s*(?:\\?=|=))',
		end: '\\s*(\\?=|=)',
		endCaptures: { '1': { name: 'punctuation.equal.paradox' } },
		contentName: 'meta.lhs.non-comparable.paradox',
		patterns: [
			{ include: '#calculation' },
			{ include: '#date' },
			{ include: '#reader-directive' },
			{ include: '#prefix-scopes' },
			{ include: '#script_constants' },
			{
				match: `${buildWholeWordPattern(keys, { caseInsensitive: true })}(?=[^:])`,
				name: 'markup.bold support.constant.parameter.lhs.paradox support.constant.define.key.paradox'
			},
			{ include: '#identifier' }
		]
	};
}

function groupDefineValues(values) {
	const grouped = new Map();
	for (const value of values) {
		const separatorIndex = value.indexOf('|');
		if (separatorIndex <= 0 || separatorIndex >= value.length - 1) {
			continue;
		}
		const namespace = value.slice(0, separatorIndex);
		const key = value.slice(separatorIndex + 1);
		const canonicalNamespace = namespace.toLowerCase();
		if (!grouped.has(canonicalNamespace)) {
			grouped.set(canonicalNamespace, { namespaces: [], keys: [] });
		}
		const group = grouped.get(canonicalNamespace);
		group.namespaces.push(namespace);
		group.keys.push(key);
	}

	return Array.from(grouped.entries())
		.sort((left, right) => left[0].localeCompare(right[0]))
		.map(([slug, group]) => {
			const namespaces = uniqueCaseInsensitive(group.namespaces);
			return {
				namespace: choosePreferredCaseVariant(namespaces),
				keys: uniqueCaseInsensitive(group.keys),
				blockKey: `define-block-${slug}`,
				codeKey: `define-code-${slug}`,
				statementKey: `define-statement-${slug}`,
				lhsKey: `define-lhs-${slug}`
			};
		});
}

function deleteGeneratedDefineRepositories(repository) {
	for (const key of Object.keys(repository)) {
		if (
			key === 'define-blocks' ||
			key.startsWith('define-block-') ||
			key.startsWith('define-code-') ||
			key.startsWith('define-statement-') ||
			key.startsWith('define-lhs-')
		) {
			delete repository[key];
		}
	}
}

function deleteGeneratedScriptedCallRepositories(repository) {
	for (const key of Object.keys(repository)) {
		if (
			key === 'scripted-call-parameter-blocks' ||
			key === 'scripted-call-parameter-block-value' ||
			key.startsWith('scripted-call-block-') ||
			key.startsWith('scripted-call-code-') ||
			key.startsWith('scripted-call-assignment-')
		) {
			delete repository[key];
		}
	}
}

function collectDefineBlockSnapshot(grammar) {
	const repository = grammar.repository || {};
	const generatedEntries = Object.fromEntries(
		Object.entries(repository)
			.filter(([key]) =>
				key === 'define-blocks' ||
				key.startsWith('define-block-') ||
				key.startsWith('define-code-') ||
				key.startsWith('define-statement-') ||
				key.startsWith('define-lhs-')
			)
			.sort(([left], [right]) => left.localeCompare(right))
	);

	return {
		codePatterns: cloneJson(repository.code?.patterns || []),
		generatedEntries: cloneJson(generatedEntries)
	};
}

function cleanupCk3ParameterBindingArtifacts(grammar) {
	let changed = false;

	if (grammar.repository?.['event-target-with-macro']) {
		delete grammar.repository['event-target-with-macro'];
		changed = true;
	}

	if (!grammar.injections || typeof grammar.injections !== 'object') {
		return changed;
	}

	const nextInjections = {};
	for (const [key, value] of Object.entries(grammar.injections)) {
		const normalizedKey = key.replace(' - meta.parameter-binding.block.paradox', '');
		const nextValue = cloneJson(value);
		if (Array.isArray(nextValue?.patterns)) {
			const nextPatterns = nextValue.patterns.filter((pattern) => pattern?.include !== '#event-target-with-macro');
			if (nextPatterns.length !== nextValue.patterns.length) {
				nextValue.patterns = nextPatterns;
				changed = true;
			}
		}
		if (normalizedKey !== key) {
			changed = true;
		}
		nextInjections[normalizedKey] = nextValue;
	}

	if (JSON.stringify(grammar.injections) !== JSON.stringify(nextInjections)) {
		grammar.injections = nextInjections;
		changed = true;
	}

	return changed;
}

function ensureCodePatternInclude(grammar, includeKey, beforeIncludeKey) {
	const patterns = grammar.repository?.code?.patterns;
	if (!Array.isArray(patterns)) {
		fail('Could not find code patterns in paradox grammar');
	}

	const alreadyIndex = patterns.findIndex((pattern) => pattern?.include === includeKey);
	const insertIndex = patterns.findIndex((pattern) => pattern?.include === beforeIncludeKey);
	if (alreadyIndex === -1) {
		patterns.splice(insertIndex >= 0 ? insertIndex : patterns.length, 0, { include: includeKey });
		return true;
	}

	if (insertIndex === -1 || alreadyIndex < insertIndex) {
		return false;
	}

	const [existing] = patterns.splice(alreadyIndex, 1);
	const nextInsertIndex = patterns.findIndex((pattern) => pattern?.include === beforeIncludeKey);
	patterns.splice(nextInsertIndex >= 0 ? nextInsertIndex : patterns.length, 0, existing);
	return true;
}

function removeCodePatternInclude(grammar, includeKey) {
	const patterns = grammar.repository?.code?.patterns;
	if (!Array.isArray(patterns)) {
		fail('Could not find code patterns in paradox grammar');
	}

	const index = patterns.findIndex((pattern) => pattern?.include === includeKey);
	if (index === -1) {
		return false;
	}

	patterns.splice(index, 1);
	return true;
}

function removePatternPieces(currentPieces, removals) {
	const removalRaw = new Set(removals.map((value) => escapeRegex(value)));
	const removalLiteral = new Set(removals);
	return currentPieces.filter((piece) => !removalRaw.has(piece) && !removalLiteral.has(piece));
}

function collectLocalizationBuiltinSets(feed) {
	if (!feed) {
		return {
			builtinScopes: [],
			builtinFunctions: [],
			builtinFunctionsWithArgs: []
		};
	}

	const builtinScopes = uniqueCaseInsensitive(
		mergeUnique(
			feed.sections['global-promotes']?.values || [],
			feed.sections['receiver-types']?.values || [],
			feed.sections['builtin-scopes']?.values || []
		)
	)
		.filter(isIdentifier)
		.filter((value) => !value.startsWith('Get'));
	const builtinScopeSet = new Set(builtinScopes.map((value) => value.toLowerCase()));
	const builtinFunctions = uniqueCaseInsensitive(feed.sections['no-arg-functions']?.values || [])
		.filter(isIdentifier)
		.filter((value) => !builtinScopeSet.has(value.toLowerCase()));
	const builtinFunctionsWithArgs = uniqueCaseInsensitive(feed.sections['with-arg-functions']?.values || [])
		.filter(isIdentifier)
		.filter((value) => !builtinScopeSet.has(value.toLowerCase()));

	return {
		builtinScopes,
		builtinFunctions,
		builtinFunctionsWithArgs
	};
}

function applyLocalizationBuiltinSync(grammar, feeds) {
	const feed = feeds.find((entry) => entry.id === 'localization-builtins');
	if (!feed) {
		return { changed: false, sections: [] };
	}

	const {
		builtinScopes,
		builtinFunctions,
		builtinFunctionsWithArgs
	} = collectLocalizationBuiltinSets(feed);

	let changed = false;

	const dataTypePatterns = [
		{ include: '#concept' },
		{ include: '#scope' },
		{ include: '#function-with-para' },
		{ include: '#function-without-para' },
		{ include: '#argument' }
	];
	if (JSON.stringify(grammar.repository?.data_type?.patterns) !== JSON.stringify(dataTypePatterns)) {
		grammar.repository.data_type.patterns = dataTypePatterns;
		changed = true;
	}

	const parameterPatterns = [
		{ include: '#string' },
		{ include: '#scope' },
		{ include: '#function-with-para' },
		{ include: '#function-without-para' }
	];
	if (JSON.stringify(grammar.repository?.parameters?.patterns) !== JSON.stringify(parameterPatterns)) {
		grammar.repository.parameters.patterns = parameterPatterns;
		changed = true;
	}

	const nextQuoteRule = {
		match: '(\\$)([\\w|=%^.+-]+)(\\$)',
		name: 'markup.italic variable.other.paradox.loc',
		captures: {
			1: { name: 'punctuation.definition.variable.begin.paradox.loc' },
			2: {
				patterns: [
					{ include: '#builtin-macro' },
					{ include: '#argument' }
				]
			},
			3: { name: 'punctuation.definition.variable.end.paradox.loc' }
		}
	};
	if (JSON.stringify(grammar.repository?.quote) !== JSON.stringify(nextQuoteRule)) {
		grammar.repository.quote = nextQuoteRule;
		changed = true;
	}

	const nextScopeRule = {
		match: `(?<!\\.)(?:(${buildWholeWordPattern(builtinScopes, { caseInsensitive: true })})|(\\b(?!Get)\\w+\\b))(?!\\()`,
		captures: {
			1: {
				name: 'markup.italic support.variable.scope.builtin.paradox.loc support.variable.scope.paradox.loc'
			},
			2: { name: 'markup.italic support.variable.scope.paradox.loc' }
		}
	};
	if (JSON.stringify(grammar.repository?.scope) !== JSON.stringify(nextScopeRule)) {
		grammar.repository.scope = nextScopeRule;
		changed = true;
	}

	const nextFunctionWithoutParaRule = {
		match: `(?:(${buildWholeWordPattern(builtinFunctions, { caseInsensitive: true })})|(\\b[A-Z]\\w*\\b)|(\\.))(?!\\()`,
		name: 'meta.function.without-para.paradox.loc',
		captures: {
			1: {
				name: 'markup.bold support.function.builtin.paradox.loc support.function.paradox.loc'
			},
			2: { name: 'markup.bold support.function.paradox.loc' },
			3: { name: 'markup.bold punctuation.separator.dot-access.paradox.loc' }
		}
	};
	if (JSON.stringify(grammar.repository?.['function-without-para']) !== JSON.stringify(nextFunctionWithoutParaRule)) {
		grammar.repository['function-without-para'] = nextFunctionWithoutParaRule;
		changed = true;
	}

	const nextFunctionWithParaRule = {
		begin: `(?:(?:(${buildWholeWordPattern(builtinFunctionsWithArgs, { caseInsensitive: true })}))|((?:(?:(?<=\\[)[A-Z])|(?:(?<!\\[)\\w))\\w*))(?=\\()`,
		beginCaptures: {
			1: {
				name: 'markup.bold support.function.builtin.paradox.loc support.function.paradox.loc'
			},
			2: { name: 'markup.bold support.function.paradox.loc' }
		},
		end: '(?<=\\))',
		name: 'meta.function.with-para.paradox.loc',
		patterns: [{ include: '#parameters' }]
	};
	if (JSON.stringify(grammar.repository?.['function-with-para']) !== JSON.stringify(nextFunctionWithParaRule)) {
		grammar.repository['function-with-para'] = nextFunctionWithParaRule;
		changed = true;
	}

	return {
		changed,
		sections: [
			{
				label: 'scope',
				currentCount: builtinScopes.length,
				sourceCount: builtinScopes.length,
				mergedCount: builtinScopes.length,
				addedCount: 0,
				feedId: 'localization-builtins',
				feedSection: 'global-promotes+receiver-types+builtin-scopes'
			},
			{
				label: 'function-without-para',
				currentCount: builtinFunctions.length,
				sourceCount: builtinFunctions.length,
				mergedCount: builtinFunctions.length,
				addedCount: 0,
				feedId: 'localization-builtins',
				feedSection: 'no-arg-functions'
			},
			{
				label: 'function-with-para',
				currentCount: builtinFunctionsWithArgs.length,
				sourceCount: builtinFunctionsWithArgs.length,
				mergedCount: builtinFunctionsWithArgs.length,
				addedCount: 0,
				feedId: 'localization-builtins',
				feedSection: 'with-arg-functions'
			}
		]
	};
}

function applyLocalizationComplexTooltipSync(grammar, feeds) {
	const staticTablesFeed = feeds.find((entry) => entry.id === 'ck3-static-tables');
	const builtinsFeed = feeds.find((entry) => entry.id === 'localization-builtins');
	const { builtinScopes } = collectLocalizationBuiltinSets(builtinsFeed);
	const manualSupplement = readManualLocalizationFormatsSupplement();
	const tooltipTags = uniqueCaseInsensitive(
		mergeUnique(
			staticTablesFeed?.sections?.['complex-tooltip-tags']?.values || [],
			builtinScopes,
			manualSupplement['complex-tooltip-tags'] || []
		)
	).filter(isIdentifier);
	const onclickTags = uniqueCaseInsensitive(builtinScopes).filter(isIdentifier);

	const topLevelPatterns = [
		{ include: '#quote' },
		{ include: '#data_type' },
		{ include: '#format_color' },
		{ include: '#complex-onclick' },
		{ include: '#complex-tooltip' },
		{ include: '#format' },
		{ include: '#icon' }
	];

	const nextComplexOnclickRule = {
		begin: '(#)((?i:onclick))(:)',
		beginCaptures: {
			1: { name: 'variable.language.format.paradox.loc punctuation.definition.format.begin.paradox.loc' },
			2: { name: 'variable.language.format.paradox.loc' },
			3: { name: 'punctuation.separator.parameter.colon.paradox.loc' }
		},
		end: '(?:#!)|(?=\")',
		endCaptures: {
			0: { name: 'variable.language.format.paradox.loc punctuation.definition.format.end.paradox.loc' }
		},
		name: 'markup.bold',
		patterns: [
			{ include: '#quote' },
			{ include: '#data_type' },
			{ include: '#format_color' },
			{ include: '#complex-tooltip' },
			{ include: '#format' },
			{ include: '#icon' },
			{
				match: `${buildWholeWordPattern(onclickTags, { caseInsensitive: true })}(?=,)`,
				name: 'markup.italic support.type.onclick.paradox.loc'
			},
			{
				match: '\\|',
				name: 'punctuation.separator.sequence.paradox.loc'
			},
			{
				match: ',',
				name: 'punctuation.separator.sequence.paradox.loc'
			},
			{
				match: '\\b[A-Za-z0-9_][A-Za-z0-9_.-]*\\b(?=(?:\\s|#!|\"))',
				name: 'variable.other.identifier.paradox.loc entity.name.reference.localization.paradox.loc'
			},
			{
				match: '\\b[A-Za-z0-9_][A-Za-z0-9_.-]*\\b',
				name: 'variable.other.identifier.paradox.loc'
			}
		]
	};

	const nextComplexTooltipRule = {
		begin: '(#)((?i:tooltip))(:)',
		beginCaptures: {
			1: { name: 'variable.language.format.paradox.loc punctuation.definition.format.begin.paradox.loc' },
			2: { name: 'variable.language.format.paradox.loc' },
			3: { name: 'punctuation.separator.parameter.colon.paradox.loc' }
		},
		end: '(?:#!)|(?=\")',
		endCaptures: {
			0: { name: 'variable.language.format.paradox.loc punctuation.definition.format.end.paradox.loc' }
		},
		name: 'markup.bold',
		patterns: [
			{ include: '#quote' },
			{ include: '#data_type' },
			{
				match: `${buildWholeWordPattern(tooltipTags, { caseInsensitive: true })}(?=,)`,
				name: 'markup.italic support.type.tooltip.paradox.loc'
			},
			{
				match: '\\|',
				name: 'punctuation.separator.sequence.paradox.loc'
			},
			{
				match: ',',
				name: 'punctuation.separator.sequence.paradox.loc'
			},
			{
				match: '\\b[A-Za-z0-9_][A-Za-z0-9_.-]*\\b',
				name: 'variable.other.identifier.paradox.loc'
			}
		]
	};

	let changed = false;

	if (JSON.stringify(grammar.patterns) !== JSON.stringify(topLevelPatterns)) {
		grammar.patterns = topLevelPatterns;
		changed = true;
	}

	if (JSON.stringify(grammar.repository?.['complex-onclick']) !== JSON.stringify(nextComplexOnclickRule)) {
		grammar.repository['complex-onclick'] = nextComplexOnclickRule;
		changed = true;
	}

	if (JSON.stringify(grammar.repository?.['complex-tooltip']) !== JSON.stringify(nextComplexTooltipRule)) {
		grammar.repository['complex-tooltip'] = nextComplexTooltipRule;
		changed = true;
	}

	return {
		changed,
		sections: [
			{
				label: 'complex-onclick',
				currentCount: onclickTags.length,
				sourceCount: onclickTags.length,
				mergedCount: onclickTags.length,
				addedCount: 0,
				feedId: 'localization-builtins',
				feedSection: 'builtin-scopes'
			},
			{
				label: 'complex-tooltip',
				currentCount: tooltipTags.length,
				sourceCount: tooltipTags.length,
				mergedCount: tooltipTags.length,
				addedCount: 0,
				feedId: 'ck3-static-tables',
				feedSection: 'complex-tooltip-tags'
			}
		]
	};
}

function readManualLocalizationFormatsSupplement() {
	const filePath = path.join(__dirname, '..', 'data', 'localization-formats.manual.json');
	try {
		const parsed = JSON.parse(readText(filePath));
		return {
			'complex-tooltip-tags': Array.isArray(parsed['complex-tooltip-tags']) ? parsed['complex-tooltip-tags'] : []
		};
	} catch (error) {
		return { 'complex-tooltip-tags': [] };
	}
}

function buildWholeWordPattern(values, options = {}) {
	if (!values.length) {
		return '(?!)';
	}
	const pattern = `\\b(?:${values.map((value) => escapeRegex(value)).join('|')})\\b`;
	return options.caseInsensitive ? `(?i:${pattern})` : pattern;
}

function buildTigerDefineReferencePattern(values) {
	if (!values.length) {
		return '(?i)\\b(define)(:)([A-Za-z_][A-Za-z0-9_]*)(\\|)([A-Za-z0-9_]+)\\b';
	}
	return `(?i)\\b(define)(:)(?=(?:${values.map((value) => escapeRegex(value)).join('|')})\\b)([A-Za-z_][A-Za-z0-9_]*)(\\|)([A-Za-z0-9_]+)\\b`;
}

function isIdentifier(value) {
	return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

module.exports = {
	syncGrammars
};
