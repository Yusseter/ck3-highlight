const { fail, mergeUnique, escapeRegex } = require('./shared');

function scanRust(source) {
  const text = source.split('');
  const code = text.slice();
  const blank = (chars, start, end) => {
    for (let j = start; j < end; j += 1)
      if (chars[j] !== '\n' && chars[j] !== '\r') chars[j] = ' ';
  };
  for (let i = 0; i < source.length;) {
    const start = i;
    if (source.startsWith('//', i)) {
      i = source.indexOf('\n', i);
      if (i === -1) i = source.length;
      blank(text, start, i);
      blank(code, start, i);
    } else if (source.startsWith('/*', i)) {
      let depth = 1;
      i += 2;
      while (i < source.length && depth) {
        if (source.startsWith('/*', i)) {
          depth += 1;
          i += 2;
        } else if (source.startsWith('*/', i)) {
          depth -= 1;
          i += 2;
        } else i += 1;
      }
      if (depth) fail('Unterminated Rust block comment');
      blank(text, start, i);
      blank(code, start, i);
    } else {
      const raw = source[i] === 'r' ? source.slice(i).match(/^r(#*)"/) : null;
      if (raw) {
        const endMarker = `"${raw[1]}`;
        const end = source.indexOf(endMarker, i + raw[0].length);
        if (end === -1) fail('Unterminated Rust raw string');
        i = end + endMarker.length;
        blank(code, start, i);
      } else if (source[i] === '"') {
        i += 1;
        while (i < source.length && source[i] !== '"')
          i += source[i] === '\\' ? 2 : 1;
        if (i >= source.length) fail('Unterminated Rust string');
        i += 1;
        blank(code, start, i);
      } else {
        const character =
          source[i] === "'"
            ? source
                .slice(i)
                .match(
                  /^'(?:\\(?:u\{[a-fA-F0-9]+\}|x[a-fA-F0-9]{2}|[^\r\n])|[^'\\\r\n])'/,
                )
            : null;
        i += character ? character[0].length : 1;
        if (character) blank(code, start, i);
      }
    }
  }
  return { text: text.join(''), code: code.join('') };
}

function* rustMatches(source, pattern) {
  const { text, code } = scanRust(source);
  for (const match of text.matchAll(pattern)) {
    if (code[match.index]?.trim()) yield match;
  }
}

function declarationIndex(code, kind, name) {
  const match = new RegExp(`\\b${kind}\\s+${escapeRegex(name)}\\b`).exec(code);
  if (!match) fail(`Could not find ${kind} ${name}`);
  return match.index;
}

function extractTupleFieldStrings(source, constName, fieldIndex) {
  const body = extractArrayBody(source, constName);
  const tuples = extractTopLevelTuples(body);
  const values = [];
  for (const tuple of tuples) {
    const fields = splitTopLevel(tuple.slice(1, -1), ',');
    if (fieldIndex < fields.length) {
      const value = parseRustString(fields[fieldIndex].trim());
      if (value !== null) {
        values.push(value);
      }
    }
  }
  return mergeUnique(values);
}

function extractTopLevelKeysFromConstString(source, constName) {
  const body = extractConstStringBody(source, constName);
  const values = [];
  let depth = 0;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) {
      continue;
    }
    if (depth === 0) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (match) {
        values.push(match[1]);
      }
    }
    for (const ch of line) {
      if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
      }
    }
  }
  return mergeUnique(values);
}

function extractTupleFieldStringsByArgs(
  source,
  constName,
  fieldIndex,
  argsIndex,
  mode,
) {
  const body = extractArrayBody(source, constName);
  const tuples = extractTopLevelTuples(body);
  const values = [];
  for (const tuple of tuples) {
    const fields = splitTopLevel(tuple.slice(1, -1), ',');
    if (fieldIndex >= fields.length || argsIndex >= fields.length) {
      continue;
    }
    const argsField = fields[argsIndex].trim();
    const isNoArgs = normalizeArgsField(argsField) === 'Args::Args(&[])';
    if (
      (mode === 'no-args' && !isNoArgs) ||
      (mode === 'with-args' && isNoArgs)
    ) {
      continue;
    }
    const value = parseRustString(fields[fieldIndex].trim());
    if (value !== null) {
      values.push(value);
    }
  }
  return mergeUnique(values);
}

function extractTupleFieldTypeNames(source, constName, fieldIndex) {
  const body = extractArrayBody(source, constName);
  const tuples = extractTopLevelTuples(body);
  const values = [];
  for (const tuple of tuples) {
    const fields = splitTopLevel(tuple.slice(1, -1), ',');
    if (fieldIndex >= fields.length) {
      continue;
    }
    const value = parseRustTypeName(fields[fieldIndex].trim());
    if (value !== null) {
      values.push(value);
    }
  }
  return mergeUnique(values);
}

function extractFieldNamesFromValidatorSources(sources) {
  const values = [];
  const pattern =
    /\bvd\.(?:req_field|opt_field|field_[A-Za-z0-9_]+|multi_field_[A-Za-z0-9_]+)\(\s*"((?:\\.|[^"\\])*)"/g;
  for (const { source } of sources) {
    for (const match of rustMatches(source, pattern)) {
      values.push(parseRustString(`"${match[1]}"`));
    }
  }
  return mergeUnique(values);
}

function extractItemFieldNamesFromValidatorSources(sources, itemNames) {
  const values = [];
  if (!Array.isArray(itemNames) || itemNames.length === 0) {
    return values;
  }
  const itemAlternatives = itemNames.join('|');
  const pattern = new RegExp(
    `\\bvd\\.(?:field_item|multi_field_item)\\(\\s*"((?:\\\\.|[^"\\\\])*)"\\s*,\\s*Item::(?:${itemAlternatives})\\b`,
    'g',
  );
  for (const { source } of sources) {
    for (const match of rustMatches(source, pattern)) {
      values.push(parseRustString(`"${match[1]}"`));
    }
  }
  return mergeUnique(values);
}

function extractChoiceValuesFromValidatorSources(
  sources,
  perSourceBindings,
  globalBindings,
) {
  const values = [];
  for (const { filePath, source } of sources) {
    values.push(
      ...extractChoiceValuesFromSource(
        source,
        mergeBindingMaps(perSourceBindings.get(filePath), globalBindings),
      ),
    );
  }
  return mergeUnique(values);
}

function extractChoiceValuesFromSource(source, bindings) {
  const values = [];
  const pattern =
    /\bvd\.(?:field_choice|field_list_choice|multi_field_choice|multi_field_list_choice)\(\s*"((?:\\.|[^"\\])*)"\s*,\s*([^)]*?)\s*\)/g;
  for (const match of rustMatches(source, pattern)) {
    values.push(...resolveChoiceArgument(match[2], bindings));
  }
  return mergeUnique(values);
}

function extractGuiChoiceValues(source, bindings) {
  const values = [];
  const pattern = /\b(?:Choice|ChoiceSet|MouseButton)\(\s*([^)]*?)\s*\)/g;
  for (const match of rustMatches(source, pattern)) {
    values.push(...resolveChoiceArgument(match[1], bindings));
  }
  return mergeUnique(values);
}

function extractGuiPropertyNames(source) {
  return mergeUnique(
    Array.from(
      source.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/gm),
      (match) => match[1],
    ),
  );
}

function collectStringArrayBindings(source) {
  const scanned = scanRust(source);
  source = scanned.text;
  const bindings = new Map();
  const constPattern =
    /(?:pub\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*:[^=]*=\s*/g;
  let match;
  while ((match = constPattern.exec(scanned.code)) !== null) {
    const values = extractStringArrayAfterIndex(source, match.index);
    if (values.length > 0) {
      bindings.set(match[1], values);
    }
  }

  const letPattern =
    /\blet\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*:[^=]+)?\s*=\s*&\[/g;
  while ((match = letPattern.exec(scanned.code)) !== null) {
    const arrayIndex = source.indexOf('&[', match.index);
    if (arrayIndex === -1) {
      continue;
    }
    const end = findMatching(source, arrayIndex + 1, '[', ']');
    const values = parseStringArrayBody(source.slice(arrayIndex + 2, end));
    if (values.length > 0) {
      bindings.set(match[1], values);
    }
  }

  return bindings;
}

function mergeBindingMaps(...maps) {
  const merged = new Map();
  for (const map of maps) {
    if (!map) {
      continue;
    }
    for (const [name, values] of map.entries()) {
      merged.set(name, mergeUnique(merged.get(name), values));
    }
  }
  return merged;
}

function pickBindingValues(bindings, names) {
  const values = [];
  for (const name of names) {
    if (bindings.has(name)) {
      values.push(...bindings.get(name));
    }
  }
  return mergeUnique(values);
}

function extractEnumVariants(source, enumName) {
  const scanned = scanRust(source);
  source = scanned.text;
  const enumIndex = declarationIndex(scanned.code, 'enum', enumName);
  const openBraceIndex = source.indexOf('{', enumIndex);
  const closeBraceIndex = findMatching(source, openBraceIndex, '{', '}');
  const body = source.slice(openBraceIndex + 1, closeBraceIndex);
  const values = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.replace(/\/\/.*$/, '').trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*,?$/);
    if (match) {
      values.push(match[1]);
    }
  }
  return mergeUnique(values);
}

function normalizeEnumToken(token) {
  return /^[A-Z][A-Za-z0-9]*$/.test(token) ? token.toLowerCase() : token;
}

function isKeywordIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function extractRegexAlternatives(pattern) {
  const firstParen = pattern.indexOf('(');
  const closeParen = findMatching(pattern, firstParen, '(', ')');
  let inner = pattern.slice(firstParen + 1, closeParen);
  if (inner.startsWith('?:')) {
    inner = inner.slice(2);
  }
  return splitTopLevel(inner, '|');
}

function extractArrayBody(source, constName) {
  const scanned = scanRust(source);
  source = scanned.text;
  const constIndex = declarationIndex(scanned.code, 'const', constName);
  const equalsIndex = source.indexOf('=', constIndex);
  const arrayIndex = source.indexOf('&[', equalsIndex);
  if (arrayIndex === -1) {
    fail(`Could not find array body for const ${constName}`);
  }
  const end = findMatching(source, arrayIndex + 1, '[', ']');
  return source.slice(arrayIndex + 2, end);
}

function extractConstStringBody(source, constName) {
  const scanned = scanRust(source);
  source = scanned.text;
  const constIndex = declarationIndex(scanned.code, 'const', constName);
  const equalsIndex = source.indexOf('=', constIndex);
  const quoteIndex = source.indexOf('"', equalsIndex);
  if (quoteIndex === -1) {
    fail(`Could not find string body for const ${constName}`);
  }
  return parseRustString(source.slice(quoteIndex));
}

function extractTopLevelTuples(source) {
  const tuples = [];
  let i = 0;
  const state = createScanState();
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (advanceScanState(state, ch, next)) {
      i += state.skipNext ? 2 : 1;
      state.skipNext = false;
      continue;
    }
    if (ch === '(') {
      const end = findMatching(source, i, '(', ')');
      tuples.push(source.slice(i, end + 1));
      i = end + 1;
      continue;
    }
    i += 1;
  }
  return tuples;
}

function splitTopLevel(source, separator) {
  const parts = [];
  let start = 0;
  const state = createScanState();
  let round = 0;
  let square = 0;
  let curly = 0;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (advanceScanState(state, ch, next)) {
      if (state.skipNext) {
        i += 1;
        state.skipNext = false;
      }
      continue;
    }
    if (ch === '(') {
      round += 1;
      continue;
    }
    if (ch === ')') {
      round -= 1;
      continue;
    }
    if (ch === '[') {
      square += 1;
      continue;
    }
    if (ch === ']') {
      square -= 1;
      continue;
    }
    if (ch === '{') {
      curly += 1;
      continue;
    }
    if (ch === '}') {
      curly -= 1;
      continue;
    }
    if (ch === separator && round === 0 && square === 0 && curly === 0) {
      const value = source.slice(start, i).trim();
      if (value) {
        parts.push(value);
      }
      start = i + 1;
    }
  }

  const tail = source.slice(start).trim();
  if (tail) {
    parts.push(tail);
  }
  return parts;
}

function parseStringArrayBody(body) {
  return splitTopLevel(body, ',')
    .map((part) => parseRustString(part.trim()))
    .filter((value) => value !== null);
}

function parseRustString(source) {
  const normalized = stripLeadingRustTrivia(source);
  if (!normalized.startsWith('"')) {
    return null;
  }
  let value = '';
  let escaped = false;
  for (let i = 1; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (escaped) {
      switch (ch) {
        case 'n':
          value += '\n';
          break;
        case 'r':
          value += '\r';
          break;
        case 't':
          value += '\t';
          break;
        case '"':
        case '\\':
          value += ch;
          break;
        default:
          value += ch;
          break;
      }
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      return value;
    }
    value += ch;
  }
  fail(`Unterminated Rust string: ${normalized}`);
}

function stripLeadingRustTrivia(source) {
  let value = source;
  while (true) {
    const trimmed = value.trimStart();
    const withoutAttributes = trimmed.replace(/^(?:#\[[^\]]*\]\s*)+/, '');
    if (withoutAttributes !== trimmed) {
      value = withoutAttributes;
      continue;
    }
    if (trimmed.startsWith('//')) {
      const newlineIndex = trimmed.indexOf('\n');
      return newlineIndex === -1
        ? ''
        : stripLeadingRustTrivia(trimmed.slice(newlineIndex + 1));
    }
    if (trimmed.startsWith('/*')) {
      const endIndex = trimmed.indexOf('*/');
      return endIndex === -1
        ? trimmed
        : stripLeadingRustTrivia(trimmed.slice(endIndex + 2));
    }
    return trimmed;
  }
}

function parseRustTypeName(source) {
  const trimmed = source.trim();
  const match = trimmed.match(
    /^(?:Ck3|Jomini)\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)$/,
  );
  return match ? match[1] : null;
}

function resolveChoiceArgument(argument, bindings) {
  const value = argument.trim().replace(/,$/, '');
  if (value.startsWith('&[')) {
    return extractInlineStringArray(value);
  }
  const nameMatch = value.match(/^&?([A-Za-z_][A-Za-z0-9_]*)$/);
  if (nameMatch && bindings.has(nameMatch[1])) {
    return bindings.get(nameMatch[1]);
  }
  return [];
}

function extractInlineStringArray(source) {
  const start = source.indexOf('[');
  if (start === -1) {
    return [];
  }
  const end = findMatching(source, start, '[', ']');
  return parseStringArrayBody(source.slice(start + 1, end));
}

function extractStringArrayAfterIndex(source, startIndex) {
  const equalsIndex = source.indexOf('=', startIndex);
  if (equalsIndex === -1) {
    return [];
  }
  const arrayIndex = source.indexOf('&[', equalsIndex);
  if (arrayIndex === -1) {
    return [];
  }
  const semicolonIndex = source.indexOf(';', equalsIndex);
  const openBraceIndex = source.indexOf('{', equalsIndex);
  if (
    semicolonIndex !== -1 &&
    arrayIndex > semicolonIndex &&
    (openBraceIndex === -1 || openBraceIndex > semicolonIndex)
  ) {
    return [];
  }
  const end = findMatching(source, arrayIndex + 1, '[', ']');
  return parseStringArrayBody(source.slice(arrayIndex + 2, end));
}

function normalizeArgsField(value) {
  return value.replace(/\s+/g, '');
}

function findMatching(source, openIndex, openChar, closeChar) {
  let depth = 0;
  const state = createScanState();
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (advanceScanState(state, ch, next)) {
      if (state.skipNext) {
        i += 1;
        state.skipNext = false;
      }
      continue;
    }
    if (ch === openChar) {
      depth += 1;
      continue;
    }
    if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  fail(`Could not find matching ${closeChar} for ${openChar} at ${openIndex}`);
}

function createScanState() {
  return {
    inString: false,
    escaped: false,
    inLineComment: false,
    inBlockComment: false,
    skipNext: false,
  };
}

function advanceScanState(state, ch, next) {
  if (state.inLineComment) {
    if (ch === '\n') {
      state.inLineComment = false;
    }
    return true;
  }
  if (state.inBlockComment) {
    if (ch === '*' && next === '/') {
      state.inBlockComment = false;
      state.skipNext = true;
    }
    return true;
  }
  if (state.inString) {
    if (state.escaped) {
      state.escaped = false;
      return true;
    }
    if (ch === '\\') {
      state.escaped = true;
      return true;
    }
    if (ch === '"') {
      state.inString = false;
    }
    return true;
  }
  if (ch === '/' && next === '/') {
    state.inLineComment = true;
    state.skipNext = true;
    return true;
  }
  if (ch === '/' && next === '*') {
    state.inBlockComment = true;
    state.skipNext = true;
    return true;
  }
  if (ch === '"') {
    state.inString = true;
    return true;
  }
  return false;
}

module.exports = {
  collectStringArrayBindings,
  extractChoiceValuesFromValidatorSources,
  extractEnumVariants,
  extractFieldNamesFromValidatorSources,
  extractItemFieldNamesFromValidatorSources,
  extractGuiChoiceValues,
  extractGuiPropertyNames,
  extractRegexAlternatives,
  extractTopLevelKeysFromConstString,
  extractTupleFieldStrings,
  extractTupleFieldStringsByArgs,
  extractTupleFieldTypeNames,
  isKeywordIdentifier,
  mergeBindingMaps,
  normalizeEnumToken,
  pickBindingValues,
};
