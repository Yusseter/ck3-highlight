const path = require('path');

let nextBlockId = 1;

function stripBom(text) {
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function normalizePathKey(filePath) {
	const resolved = path.resolve(filePath);
	return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function normalizeRelativePath(value) {
	if (!value) {
		return '';
	}

	return value
		.replace(/[\\/]+/g, '/')
		.replace(/^\.\//, '')
		.replace(/^\/+/, '')
		.replace(/\/+$/, '');
}

function isWhitespace(char) {
	return char === ' ' || char === '\t' || char === '\r' || char === '\n';
}

function isTokenTerminator(char) {
	return (
		char === undefined ||
		isWhitespace(char) ||
		char === '#' ||
		char === '{' ||
		char === '}' ||
		char === '"' ||
		char === "'" ||
		char === '=' ||
		char === '<' ||
		char === '>' ||
		char === '!' ||
		char === '?'
	);
}

function skipComment(text, index, end) {
	let cursor = index;
	while (cursor < end && text[cursor] !== '\n') {
		cursor++;
	}
	return cursor;
}

function skipTrivia(text, index, end) {
	let cursor = index;
	while (cursor < end) {
		const char = text[cursor];
		if (isWhitespace(char)) {
			cursor++;
			continue;
		}
		if (char === '#') {
			cursor = skipComment(text, cursor, end);
			continue;
		}
		break;
	}
	return cursor;
}

function skipWhitespaceOnly(text, index, end) {
	let cursor = index;
	while (cursor < end && isWhitespace(text[cursor])) {
		cursor++;
	}
	return cursor;
}

function readTokenEnd(text, index, end) {
	let cursor = index;
	while (cursor < end && !isTokenTerminator(text[cursor])) {
		cursor++;
	}
	return cursor;
}

function readOperator(text, index, end) {
	if (index >= end) {
		return null;
	}

	const first = text[index];
	const second = text[index + 1];

	if ((first === '!' || first === '?' || first === '<' || first === '>') && second === '=') {
		return first + second;
	}

	if (first === '=') {
		return '=';
	}

	if (first === '<' || first === '>') {
		return first;
	}

	return null;
}

function findQuotedStringEnd(text, start, end) {
	const quote = text[start];
	let cursor = start + 1;
	while (cursor < end) {
		const char = text[cursor];
		if (char === '\\') {
			cursor += 2;
			continue;
		}
		if (char === quote) {
			return cursor + 1;
		}
		cursor++;
	}
	return end;
}

function skipInlineSpaces(text, index, end) {
	let cursor = index;
	while (cursor < end && (text[cursor] === ' ' || text[cursor] === '\t')) {
		cursor++;
	}
	return cursor;
}

function hasUpcomingAssignment(text, index, end) {
	let cursor = skipInlineSpaces(text, index, end);
	if (cursor >= end) {
		return false;
	}

	const char = text[cursor];
	if (char === '#' || char === '\n' || char === '\r' || char === '}') {
		return false;
	}

	const lhsEnd = readTokenEnd(text, cursor, end);
	if (lhsEnd === cursor) {
		return false;
	}

	cursor = skipInlineSpaces(text, lhsEnd, end);
	return Boolean(readOperator(text, cursor, end));
}

function findSimpleValueEnd(text, start, end) {
	let cursor = start;
	while (cursor < end) {
		const char = text[cursor];
		if (char === '#') {
			return cursor;
		}
		if (char === '\n' || char === '\r' || char === '}') {
			return cursor;
		}
		if (char === '"' || char === "'") {
			cursor = findQuotedStringEnd(text, cursor, end);
			continue;
		}
		if ((char === ' ' || char === '\t') && hasUpcomingAssignment(text, cursor, end)) {
			return cursor;
		}
		cursor++;
	}
	return cursor;
}

function findMatchingBrace(text, start, end) {
	let cursor = start + 1;
	let depth = 1;
	while (cursor < end) {
		const char = text[cursor];
		if (char === '#') {
			cursor = skipComment(text, cursor, end);
			continue;
		}
		if (char === '"' || char === "'") {
			cursor = findQuotedStringEnd(text, cursor, end);
			continue;
		}
		if (char === '{') {
			depth++;
			cursor++;
			continue;
		}
		if (char === '}') {
			depth--;
			if (depth === 0) {
				return cursor;
			}
			cursor++;
			continue;
		}
		cursor++;
	}
	return end - 1;
}

function rangeHasPlaceholderMacro(text, start, end) {
	let cursor = start;
	while (cursor < end) {
		const char = text[cursor];
		if (char === '#') {
			cursor = skipComment(text, cursor, end);
			continue;
		}
		if (char === '"' || char === "'") {
			cursor = findQuotedStringEnd(text, cursor, end);
			continue;
		}
		if (char === '$') {
			const closing = text.indexOf('$', cursor + 1);
			if (closing !== -1 && closing < end && closing > cursor + 1) {
				return true;
			}
		}
		cursor++;
	}
	return false;
}

function parseSegment(text, start, end, depth, parentBlockId, assignments) {
	let cursor = start;

	while (cursor < end) {
		cursor = skipTrivia(text, cursor, end);
		if (cursor >= end) {
			break;
		}

		const current = text[cursor];
		if (current === '{' || current === '}') {
			cursor++;
			continue;
		}

		const lhsStart = cursor;
		const lhsEnd = readTokenEnd(text, cursor, end);
		if (lhsEnd === lhsStart) {
			cursor++;
			continue;
		}

		const lhs = text.slice(lhsStart, lhsEnd);
		cursor = skipWhitespaceOnly(text, lhsEnd, end);

		const operator = readOperator(text, cursor, end);
		if (!operator) {
			cursor = findSimpleValueEnd(text, cursor, end);
			continue;
		}

		cursor += operator.length;
		cursor = skipTrivia(text, cursor, end);
		if (cursor >= end) {
			break;
		}

		if (text[cursor] === '{') {
			const blockStart = cursor;
			const blockEnd = findMatchingBrace(text, blockStart, end);
			const blockId = nextBlockId++;
			assignments.push({
				id: assignments.length + 1,
				lhs,
				operator,
				depth,
				parentBlockId,
				valueKind: 'block',
				lhsStart,
				lhsEnd,
				valueStart: blockStart,
				valueEnd: blockEnd + 1,
				blockId
			});
			if (blockEnd > blockStart + 1) {
				parseSegment(text, blockStart + 1, blockEnd, depth + 1, blockId, assignments);
			}
			cursor = blockEnd + 1;
			continue;
		}

		const valueStart = cursor;
		const valueEnd = findSimpleValueEnd(text, valueStart, end);
		const simpleValue = text.slice(valueStart, valueEnd).trim();
		assignments.push({
			id: assignments.length + 1,
			lhs,
			operator,
			depth,
			parentBlockId,
			valueKind: 'simple',
			lhsStart,
			lhsEnd,
			valueStart,
			valueEnd,
			simpleValue
		});
		cursor = valueEnd;
	}
}

function parseScript(text) {
	const cleanText = stripBom(text || '');
	nextBlockId = 1;
	const assignments = [];
	parseSegment(cleanText, 0, cleanText.length, 0, null, assignments);
	return { text: cleanText, assignments };
}

function getDirectChildren(parsed, blockId) {
	return parsed.assignments.filter((assignment) => assignment.parentBlockId === blockId);
}

function extractParameterizedTopLevelDefinitions(parsed) {
	const definitions = new Set();
	for (const assignment of parsed.assignments) {
		if (assignment.depth !== 0 || assignment.operator !== '=' || assignment.valueKind !== 'block') {
			continue;
		}
		if (rangeHasPlaceholderMacro(parsed.text, assignment.valueStart + 1, assignment.valueEnd - 1)) {
			definitions.add(assignment.lhs);
		}
	}
	return definitions;
}

function getParameterizedDefinitionsForFamily(text) {
	return extractParameterizedTopLevelDefinitions(parseScript(text));
}

module.exports = {
	extractParameterizedTopLevelDefinitions,
	getDirectChildren,
	getParameterizedDefinitionsForFamily,
	normalizePathKey,
	normalizeRelativePath,
	parseScript,
	rangeHasPlaceholderMacro,
	stripBom
};
