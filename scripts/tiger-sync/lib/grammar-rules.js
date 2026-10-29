const path = require('path');
const {
  escapeRegex,
  mergeUnique,
  readManualSupplement,
  fail,
} = require('./shared');
const { patternBuilders } = require('./grammar-sources');

function applyGrammarRules(id, grammar, feeds) {
  const byId = new Map(feeds.map((feed) => [feed.id, feed]));
  const values = (feed, section) =>
    byId.get(feed)?.sections[section]?.values || [];
  const builtins = collectLocalizationBuiltinSets(
    byId.get('localization-builtins'),
  );
  if (id === 'paradox') {
    const sounds = uniqueCaseInsensitive(values('ck3-static-tables', 'sounds'));
    setPattern(
      grammar,
      'sound-string',
      'match',
      sounds.length ? `(?i:${sounds.map(escapeRegex).join('|')})` : '(?!)',
    );
    const fields = uniqueCaseInsensitive(
      values('localization-symbols', 'localization-key-fields'),
    ).filter(isIdentifier);
    const fieldsPattern = fields.length
      ? fields.map(escapeRegex).join('|')
      : '(?!)';
    const keyPattern =
      '[A-Za-z0-9_][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_][A-Za-z0-9_-]*)+';
    setPattern(
      grammar,
      'localization-key-assignment',
      'begin',
      `\\s*((?i:${fieldsPattern}))(\\s*)(\\?=|=)\\s*(?=${keyPattern})`,
    );
    applyBuiltinPatterns(grammar, 'quoted-localization-', builtins);
    const defines = values('ck3-static-tables', 'defines');
    if (defines.length) {
      const rule = buildTigerDefineReferenceRule(defines);
      for (const key of [
        'non-prefixable-comparable-rhs',
        'identifier',
        'calculation',
      ]) {
        const patterns = grammar.repository[key]?.patterns;
        if (!Array.isArray(patterns))
          fail(`Missing define reference target: ${key}`);
        upsertDefinePattern(
          patterns,
          rule,
          key === 'non-prefixable-comparable-rhs'
            ? 0
            : findIdentifierFallbackIndex(patterns),
        );
      }
      removeDefineParts(
        grammar,
        mergeUnique(
          values('ck3-static-tables', 'define-namespaces'),
          values('ck3-static-tables', 'define-keys'),
        ),
      );
      const groups = groupDefineValues(defines);
      grammar.repository['define-blocks'] = {
        patterns: groups.map((group) => ({ include: `#${group.blockKey}` })),
      };
      for (const group of groups) {
        grammar.repository[group.blockKey] = buildDefineBlockRule(group);
        grammar.repository[group.codeKey] = {
          patterns: [
            { include: '#comment' },
            { include: `#${group.statementKey}` },
            { include: '#rhs-item' },
          ],
        };
        grammar.repository[group.statementKey] = {
          patterns: [{ include: `#${group.lhsKey}` }, { include: '#rhs' }],
        };
        grammar.repository[group.lhsKey] = buildDefineLhsRule(group.keys);
      }
    }
  }
  if (id === 'localization') {
    // Only this unused legacy copy is removed; the consumed function rules stay in the source.
    delete grammar.repository['builtin-function-without-para'];
    applyBuiltinPatterns(grammar, '', builtins);
    const manual = readManualSupplement(
      path.join(__dirname, '..', 'data', 'localization-formats.manual.json'),
      ['complex-tooltip-tags'],
    );
    const tooltipTags = uniqueCaseInsensitive(
      mergeUnique(
        values('ck3-static-tables', 'complex-tooltip-tags'),
        builtins.builtinScopes,
        manual['complex-tooltip-tags'],
      ),
    ).filter(isIdentifier);
    grammar.repository['complex-tooltip'].patterns[2].match =
      `${buildWholeWordPattern(tooltipTags, { caseInsensitive: true })}(?=,)`;
    grammar.repository['complex-onclick'].patterns[6].match =
      `${buildWholeWordPattern(builtins.builtinScopes, { caseInsensitive: true })}(?=,)`;
  }
}

function setPattern(grammar, key, field, pattern) {
  const rule = grammar.repository[key];
  if (!rule || !Object.hasOwn(rule, field))
    fail(`Missing generated grammar pattern: ${key}/${field}`);
  // The source owns captures/scopes/order; only the feed-dependent regex is compiled here.
  rule[field] = pattern;
}

function applyBuiltinPatterns(
  grammar,
  prefix,
  { builtinScopes, builtinFunctions, builtinFunctionsWithArgs },
) {
  setPattern(
    grammar,
    `${prefix}scope`,
    'match',
    `(?<!\\.)(?:(${buildWholeWordPattern(builtinScopes, { caseInsensitive: true })})|(\\b(?!Get)\\w+\\b))(?!\\()`,
  );
  setPattern(
    grammar,
    `${prefix}function-without-para`,
    'match',
    `(?:(${buildWholeWordPattern(builtinFunctions, { caseInsensitive: true })})|(\\b[A-Z]\\w*\\b)|(\\.))(?!\\()`,
  );
  const fallback = prefix
    ? '[A-Za-z_]\\w*'
    : '(?:(?:(?<=\\[)[A-Z])|(?:(?<!\\[)\\w))\\w*';
  setPattern(
    grammar,
    `${prefix}function-with-para`,
    'begin',
    `(?:(?:(${buildWholeWordPattern(builtinFunctionsWithArgs, { caseInsensitive: true })}))|(${fallback}))(?=\\()`,
  );
}

function removeDefineParts(grammar, removals) {
  const rule = grammar.repository['parameters-lhs'];
  const prefix = '(?i)\\b(?:';
  const suffix = ')\\b(?=[^:])';
  if (!rule.match.startsWith(prefix) || !rule.match.endsWith(suffix))
    fail('Invalid parameters-lhs pattern');
  const excluded = new Set(removals.map(escapeRegex));
  const pieces = rule.match
    .slice(prefix.length, -suffix.length)
    .split('|')
    .filter((piece) => !excluded.has(piece));
  rule.match = patternBuilders['parameters-lhs'](pieces);
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

function buildTigerDefineReferenceRule(values) {
  return {
    match: buildTigerDefineReferencePattern(values),
    name: 'markup.bold',
    captures: {
      1: { name: 'support.type.scope.event_target.paradox.ck3' },
      2: {
        name: 'support.type.scope.event_target.paradox.ck3 punctuation.definition.event_target.paradox.ck3',
      },
      3: { name: 'variable.parameter.event_target.paradox.ck3' },
      4: {
        name: 'support.type.scope.event_target.paradox.ck3 punctuation.definition.event_target.paradox.ck3',
      },
      5: { name: 'variable.parameter.event_target.paradox.ck3' },
    },
  };
}

function upsertDefinePattern(patterns, defineRule, insertIndex) {
  const currentIndex = patterns.findIndex(
    (pattern) =>
      typeof pattern?.match === 'string' &&
      /define/i.test(pattern.match) &&
      pattern.captures?.['5']?.name ===
        'variable.parameter.event_target.paradox.ck3',
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
    (pattern) =>
      typeof pattern?.match === 'string' &&
      pattern.name === 'variable.other.identifier.paradox',
  );
  return index >= 0 ? index : patterns.length;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildDefineBlockRule(group) {
  return {
    begin: `(?i)\\s*(${escapeRegex(group.namespace)})(\\s*)(=)(\\s*)(\\{)`,
    beginCaptures: {
      1: {
        name: 'markup.italic support.constant.parameter.lhs.paradox support.constant.define.namespace.paradox',
      },
      3: { name: 'punctuation.equal.paradox' },
      5: { name: 'punctuation.section.block.begin.paradox' },
    },
    end: '}',
    endCaptures: { 0: { name: 'punctuation.section.block.end.paradox' } },
    contentName: 'meta.block.paradox',
    patterns: [{ include: `#${group.codeKey}` }],
  };
}

function buildDefineLhsRule(keys) {
  return {
    begin: '\\s*(?=[\\w:.|$@-]+\\s*(?:\\?=|=))',
    end: '\\s*(\\?=|=)',
    endCaptures: { 1: { name: 'punctuation.equal.paradox' } },
    contentName: 'meta.lhs.non-comparable.paradox',
    patterns: [
      { include: '#calculation' },
      { include: '#date' },
      { include: '#reader-directive' },
      { include: '#prefix-scopes' },
      { include: '#script_constants' },
      {
        match: `${buildWholeWordPattern(keys, { caseInsensitive: true })}(?=[^:])`,
        name: 'markup.bold support.constant.parameter.lhs.paradox support.constant.define.key.paradox',
      },
      { include: '#identifier' },
    ],
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
        lhsKey: `define-lhs-${slug}`,
      };
    });
}

function collectLocalizationBuiltinSets(feed) {
  if (!feed) {
    return {
      builtinScopes: [],
      builtinFunctions: [],
      builtinFunctionsWithArgs: [],
    };
  }

  const builtinScopes = uniqueCaseInsensitive(
    mergeUnique(
      feed.sections['global-promotes']?.values || [],
      feed.sections['receiver-types']?.values || [],
      feed.sections['builtin-scopes']?.values || [],
    ),
  )
    .filter(isIdentifier)
    .filter((value) => !value.startsWith('Get'));
  const builtinScopeSet = new Set(
    builtinScopes.map((value) => value.toLowerCase()),
  );
  const builtinFunctions = uniqueCaseInsensitive(
    feed.sections['no-arg-functions']?.values || [],
  )
    .filter(isIdentifier)
    .filter((value) => !builtinScopeSet.has(value.toLowerCase()));
  const builtinFunctionsWithArgs = uniqueCaseInsensitive(
    feed.sections['with-arg-functions']?.values || [],
  )
    .filter(isIdentifier)
    .filter((value) => !builtinScopeSet.has(value.toLowerCase()));

  return {
    builtinScopes,
    builtinFunctions,
    builtinFunctionsWithArgs,
  };
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

module.exports = { applyGrammarRules };
