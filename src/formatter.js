function formatScript(text, options = {}) {
  const tabSize =
    Number.isInteger(options.tabSize) && options.tabSize > 0
      ? options.tabSize
      : 4;
  const unit = options.insertSpaces === false ? '\t' : ' '.repeat(tabSize);
  const baseline = text.match(/^[\t ]*/)[0];
  const parts = text.split(/(\r\n|\n|\r)/);
  let depth = 0;
  let quote = null;

  for (let part = 0; part < parts.length; part += 2) {
    const line = parts[part];
    const startsInsideString = quote !== null;
    const body = line.replace(/^[\t ]*/, '');
    const leadingCloses = (body.match(/^(?:}[\t ]*)+/)?.[0].match(/}/g) || [])
      .length;

    if (!startsInsideString && body.length > 0) {
      parts[part] =
        baseline + unit.repeat(Math.max(0, depth - leadingCloses)) + body;
    }

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (quote) {
        if (char === '\\') {
          i++;
        } else if (char === quote) {
          quote = null;
        }
      } else if (char === '#') {
        break;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth = Math.max(0, depth - 1);
      }
    }
  }

  return parts.join('');
}

module.exports = { formatScript };
