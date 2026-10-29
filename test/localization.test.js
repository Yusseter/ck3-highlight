const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const tm = require('vscode-textmate');
const onig = require('vscode-oniguruma');
const manifest = require('../package.json');

let registry;
test.before(async () => {
  await onig.loadWASM(
    fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')),
  );
  registry = new tm.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (p) => new onig.OnigScanner(p),
      createOnigString: (s) => new onig.OnigString(s),
    }),
    loadGrammar: async (scope) => {
      const entry = manifest.contributes.grammars.find(
        (g) => g.scopeName === scope,
      );
      if (!entry) return null;
      const file = path.join(__dirname, '..', entry.path);
      return tm.parseRawGrammar(fs.readFileSync(file, 'utf8'), file);
    },
    getInjections: (scope) =>
      manifest.contributes.grammars
        .filter((g) =>
          g.injectTo?.some(
            (target) => scope === target || scope.startsWith(target + '.'),
          ),
        )
        .map((g) => g.scopeName),
  });
});
test.after(() => registry?.dispose());

test('CK3 script tokenization retains the internal base grammar without a public Paradox mode', async () => {
  const records = await tokenize(
    ['namespace = test', 'test.1 = {', ' add_gold = 10 # comment', '}'],
    'source.paradox.ck3',
  );
  assert(
    scopes(records[2], 'add_gold').includes(
      'support.function.effect.paradox.ck3',
    ),
  );
  assert(
    scopes(records[2], '10').some((scope) =>
      scope.startsWith('constant.numeric'),
    ),
  );
  assert(
    scopes(records[2], '# comment').some((scope) =>
      scope.startsWith('comment'),
    ),
  );
});

async function tokenize(lines, scope = 'source.paradox.localization') {
  const grammar = await registry.loadGrammar(scope);
  let stack = tm.INITIAL;
  return lines.map((line) => {
    const result = grammar.tokenizeLine(line, stack);
    stack = result.ruleStack;
    return { line, tokens: result.tokens };
  });
}
function scopes(record, text) {
  const index = record.line.indexOf(text);
  assert.notEqual(index, -1, 'missing test token ' + text);
  return record.tokens.find((t) => index >= t.startIndex && index < t.endIndex)
    .scopes;
}
function noInvalid(records) {
  for (const record of records)
    assert.ok(
      !record.tokens.some((t) =>
        t.scopes.some((s) => s.startsWith('invalid.')),
      ),
      record.line,
    );
}

test('first entry may have any numeric version; following entries can omit it', async () => {
  for (const version of ['0', '1', '23423423']) {
    const records = await tokenize([
      'l_english:',
      ' FIRST:' + version + ' "Text"',
      ' NEXT: "After"',
      ' LAST:2 "Last"',
    ]);
    noInvalid(records);
    assert.ok(
      scopes(records[1], ':' + version).includes(
        'punctuation.separator.map.value.yaml',
      ),
    );
    assert.ok(
      scopes(records[1], version).includes(
        'punctuation.separator.map.value.yaml',
      ),
    );
    assert.ok(
      scopes(records[2], 'After').includes('string.quoted.double.yaml'),
    );
  }
});

test('all bundled YAML variants support a first numbered entry', async () => {
  for (const suffix of ['1.0', '1.1', '1.2', '1.3']) {
    const directive = suffix === '1.0' ? '%YAML:1.0' : '%YAML ' + suffix;
    const records = await tokenize([
      directive,
      '---',
      'l_english:',
      ' FIRST:123 "Text"',
      ' NEXT: "After"',
    ]);
    noInvalid(records);
    assert.ok(
      scopes(records[3], ':123').includes(
        'punctuation.separator.map.value.yaml',
      ),
      suffix,
    );
    assert.ok(
      scopes(records[4], 'After').includes('string.quoted.double.yaml'),
      suffix,
    );
  }
  noInvalid(
    await tokenize(
      ['l_english:', ' FIRST:123 "Text"'],
      'source.paradox.localization.embedded',
    ),
  );
});

test('keeps comments separate from localization formatting', async () => {
  const records = await tokenize([
    'l_english:',
    ' #no-space #EMP comment',
    ' # spaced comment',
    ' KEY:0 "Text" #Changed #EMP',
  ]);
  noInvalid(records);
  for (const [record, token] of [
    [records[1], '#no-space'],
    [records[2], '# spaced'],
    [records[3], '#Changed'],
  ]) {
    assert.ok(scopes(record, token).some((s) => s.startsWith('comment.')));
    assert.ok(!scopes(record, token).includes('markup.bold'));
  }
});

test('RGB scopes end at the brace and the body keeps its normal localization rules', async () => {
  const [, record] = await tokenize([
    'l_english:',
    ' KEY:0 "#color:{0.82,0.77,0.5};bold 녹색 $NAME$ has 2,3 items#!"',
  ]);
  assert.ok(
    scopes(record, '0.82').includes('constant.numeric.float.paradox.loc'),
  );
  assert.ok(scopes(record, '$NAME$').includes('variable.other.paradox.loc'));
  assert.ok(
    !scopes(record, '2,3').some((s) => s.startsWith('constant.numeric')),
  );
  assert.ok(
    !scopes(record, '녹색').includes('support.constant.color.paradox.loc'),
  );
});

test('literal braces in the body are not a second RGB header', async () => {
  const [, record] = await tokenize([
    'l_english:',
    ' KEY:0 "#color:{0.1,0.2,0.3};bold $NAME$ literal {42,43}#!"',
  ]);
  assert.ok(scopes(record, '$NAME$').includes('variable.other.paradox.loc'));
  assert.ok(
    !scopes(record, '42').some((s) => s.startsWith('constant.numeric')),
  );
});

test('escaped quotes, multiline values and nested formats do not poison the next key', async () => {
  const records = await tokenize([
    'l_english:',
    ' ESC:0 "#EMP A \\"quoted\\" $NAME$#!"',
    ' MULTI:0 "first',
    '   second"',
    ' NEXT: "#P $VALUE$#!"',
  ]);
  noInvalid(records);
  assert.ok(scopes(records[1], '$NAME$').includes('markup.bold'));
  assert.ok(
    scopes(records[4], '$VALUE$').includes('variable.other.paradox.loc'),
  );
});

test('invalid indentation is still marked instead of being hidden by an injection', async () => {
  const records = await tokenize([
    'l_english:',
    ' FIRST:0 "Text"',
    '  WRONG:0 "Too deep"',
  ]);
  assert.ok(
    records[2].tokens.some((t) =>
      t.scopes.some((s) => s.startsWith('invalid.')),
    ),
  );
});

test('has no injection registered against ordinary YAML', () => {
  assert.ok(
    manifest.contributes.grammars.every(
      (g) => !g.injectTo?.includes('source.yaml'),
    ),
  );
});
