const path = require('path');
const {
  ensureDir,
  ensureFile,
  mergeUnique,
  normalizeRelativePath,
  readText,
  readManualSupplement,
  walkFiles,
} = require('./shared');
const {
  collectStringArrayBindings,
  extractChoiceValuesFromValidatorSources,
  extractEnumVariants,
  extractFieldNamesFromValidatorSources,
  extractItemFieldNamesFromValidatorSources,
  extractGuiChoiceValues,
  extractGuiPropertyNames,
  extractTopLevelKeysFromConstString,
  extractTupleFieldStrings,
  extractTupleFieldStringsByArgs,
  extractTupleFieldTypeNames,
  isKeywordIdentifier,
  normalizeEnumToken,
  pickBindingValues,
} = require('./rust');

function collectFeedData(tigerRoot) {
  const sources = resolveTigerSources(tigerRoot);
  const validatorFiles = [
    sources.effectValidation,
    sources.validate,
    sources.events,
    ...walkFiles(sources.dataDir, '.rs'),
  ];
  const validatorSources = validatorFiles.map((filePath) => ({
    filePath,
    source: readText(filePath),
  }));
  const validatorBindings = new Map(
    validatorSources.map(({ filePath, source }) => [
      filePath,
      collectStringArrayBindings(source),
    ]),
  );
  const miscSource = readText(sources.misc);
  const miscBindings = collectStringArrayBindings(miscSource);
  const eventsSource = readText(sources.events);
  const eventsBindings = collectStringArrayBindings(eventsSource);
  const guiPropertiesSource = readText(sources.guiProperties);
  const guiBuiltinsSource = readText(sources.guiBuiltins);
  const guiPropertiesTextSource = readText(sources.guiPropertiesText);
  const guiBindings = collectStringArrayBindings(guiPropertiesSource);
  const localizationTableSource = readText(sources.localizationTable);
  const localizationTableBindings = collectStringArrayBindings(
    localizationTableSource,
  );
  const dataGlobalPromotesSource = wrapInlineArrayConst(
    'GLOBAL_PROMOTES_CK3',
    readText(sources.dataGlobalPromotes),
  );
  const dataGlobalFunctionsSource = wrapInlineArrayConst(
    'GLOBAL_FUNCTIONS_CK3',
    readText(sources.dataGlobalFunctions),
  );
  const dataPromotesSource = wrapInlineArrayConst(
    'PROMOTES_CK3',
    readText(sources.dataPromotes),
  );
  const dataFunctionsSource = wrapInlineArrayConst(
    'FUNCTIONS_CK3',
    readText(sources.dataFunctionsInclude),
  );
  const localizationFiles = [
    sources.customLoca,
    sources.effectLocalization,
    sources.triggerLocalization,
  ];
  const localizationSources = localizationFiles.map((filePath) => ({
    filePath,
    source: readText(filePath),
  }));

  return [
    buildCk3KeywordsFeed(tigerRoot, sources),
    buildCk3ContextFeed(tigerRoot, sources),
    buildCk3StaticTablesFeed(tigerRoot, sources),
    buildParadoxParametersFeed(
      tigerRoot,
      sources,
      validatorSources,
      validatorBindings,
      miscBindings,
      eventsBindings,
    ),
    buildGuiSymbolsFeed(
      tigerRoot,
      sources,
      guiPropertiesSource,
      guiBuiltinsSource,
      guiPropertiesTextSource,
      guiBindings,
    ),
    buildLocalizationSymbolsFeed(
      tigerRoot,
      localizationSources,
      validatorSources,
    ),
    buildLocalizationBuiltinsFeed(
      tigerRoot,
      sources,
      localizationTableBindings,
      dataGlobalPromotesSource,
      dataGlobalFunctionsSource,
      dataPromotesSource,
      dataFunctionsSource,
    ),
  ];
}

function buildCk3KeywordsFeed(tigerRoot, sources) {
  const iteratorBases = extractTupleFieldStrings(
    readText(sources.iterators),
    'ITERATOR',
    1,
  );
  const iteratorVariants = expandIteratorVariants(iteratorBases, [
    'any',
    'every',
    'ordered',
    'random',
  ]);
  return {
    id: 'ck3-keywords',
    description: 'Core CK3 keyword lists extracted from ck3 tables.',
    outputFile: 'ck3-keywords.json',
    sourceFiles: [
      sources.effects,
      sources.triggers,
      sources.targets,
      sources.modifiers,
      sources.iterators,
    ].map((filePath) => normalizeRelativePath(tigerRoot, filePath)),
    sections: {
      effects: {
        description: 'Built-in CK3 effects.',
        extractor: 'tuple-field:SCOPE_EFFECT[1]+iterator-variants',
        updateMode: 'additive',
        values: mergeUnique(
          extractTupleFieldStrings(
            readText(sources.effects),
            'SCOPE_EFFECT',
            1,
          ),
          iteratorVariants,
        ),
        targets: [
          {
            grammarId: 'ck3',
            repositoryKey: 'effects',
            patternBuilder: 'whole-word',
          },
        ],
      },
      triggers: {
        description: 'Built-in CK3 triggers and complex triggers.',
        extractor: 'tuple-field:TRIGGER[1]+TRIGGER_COMPLEX[1]',
        updateMode: 'additive',
        values: mergeUnique(
          extractTupleFieldStrings(readText(sources.triggers), 'TRIGGER', 1),
          extractTupleFieldStrings(
            readText(sources.triggers),
            'TRIGGER_COMPLEX',
            1,
          ),
        ),
        targets: [
          {
            grammarId: 'ck3',
            repositoryKey: 'triggers',
            patternBuilder: 'whole-word',
          },
        ],
      },
      event_targets: {
        description: 'Built-in CK3 scope prefixes used as event targets.',
        extractor: 'tuple-field:SCOPE_PREFIX[1]',
        updateMode: 'additive',
        values: extractTupleFieldStrings(
          readText(sources.targets),
          'SCOPE_PREFIX',
          1,
        ),
        targets: [
          {
            grammarId: 'ck3',
            repositoryKey: 'event_targets',
            patternBuilder: 'event-target',
          },
        ],
      },
      scopes: {
        description: 'Built-in CK3 scope-to-scope links.',
        extractor: 'tuple-field:SCOPE_TO_SCOPE[1]',
        updateMode: 'additive',
        values: extractTupleFieldStrings(
          readText(sources.targets),
          'SCOPE_TO_SCOPE',
          1,
        ),
        targets: [
          {
            grammarId: 'ck3',
            repositoryKey: 'scopes',
            patternBuilder: 'scope-word',
          },
        ],
      },
      modifiers: {
        description: 'Built-in CK3 modifiers.',
        extractor: 'tuple-field:MODIF_TABLE[0]',
        updateMode: 'additive',
        values: extractTupleFieldStrings(
          readText(sources.modifiers),
          'MODIF_TABLE',
          0,
        ),
        targets: [
          {
            grammarId: 'ck3',
            repositoryKey: 'modifiers',
            patternBuilder: 'whole-word',
          },
        ],
      },
    },
  };
}

function buildCk3ContextFeed(tigerRoot, sources) {
  return {
    id: 'ck3-context',
    description:
      'CK3 built-in on_actions and scripted rule names extracted from tiger tables.',
    outputFile: 'ck3-context.json',
    sourceFiles: [sources.onActions, sources.rules]
      .map((filePath) => normalizeRelativePath(tigerRoot, filePath))
      .sort(),
    sections: {
      'on-actions': {
        description:
          'Built-in CK3 on_action identifiers used in definitions and references.',
        extractor: 'const-string:ON_ACTION_SCOPES top-level keys',
        updateMode: 'additive',
        values: extractTopLevelKeysFromConstString(
          readText(sources.onActions),
          'ON_ACTION_SCOPES',
        ),
        targets: [
          {
            grammarId: 'paradox',
            repositoryKey: 'parameters-lhs',
            patternBuilder: 'parameters-lhs',
          },
          {
            grammarId: 'paradox',
            repositoryKey: 'parameters-rhs',
            patternBuilder: 'parameters-rhs',
          },
        ],
      },
      'scripted-rules': {
        description:
          'Built-in CK3 scripted rule identifiers that behave like trigger names.',
        extractor: 'const-string:SCRIPTED_RULES top-level keys',
        updateMode: 'additive',
        values: extractTopLevelKeysFromConstString(
          readText(sources.rules),
          'SCRIPTED_RULES',
        ),
        targets: [
          {
            grammarId: 'ck3',
            repositoryKey: 'triggers',
            patternBuilder: 'whole-word',
          },
        ],
      },
    },
  };
}

function buildCk3StaticTablesFeed(tigerRoot, sources) {
  const soundsBindings = collectStringArrayBindings(readText(sources.sounds));
  const miscBindings = collectStringArrayBindings(readText(sources.misc));
  const defineValues = extractTupleFieldStrings(
    readText(sources.defines),
    'DEFINES',
    0,
  );
  const defineParts = splitDefineEntries(defineValues);
  return {
    id: 'ck3-static-tables',
    description:
      'Static CK3 tiger tables tracked for future grammar and tooling use.',
    outputFile: 'ck3-static-tables.json',
    sourceFiles: [
      sources.defines,
      sources.localizationTable,
      sources.misc,
      sources.sounds,
    ]
      .map((filePath) => normalizeRelativePath(tigerRoot, filePath))
      .sort(),
    sections: {
      defines: {
        description:
          'CK3 full define names used in define:namespace|key access patterns.',
        extractor: 'tuple-field:DEFINES[0]',
        updateMode: 'additive',
        values: defineValues,
        targets: [],
      },
      'define-namespaces': {
        description:
          'CK3 define namespaces used on the left-hand side in common/defines files.',
        extractor: 'split:DEFINES namespace',
        updateMode: 'additive',
        values: defineParts.namespaces,
        targets: [],
      },
      'define-keys': {
        description:
          'CK3 define keys used on the left-hand side in common/defines files.',
        extractor: 'split:DEFINES key',
        updateMode: 'additive',
        values: defineParts.keys,
        targets: [],
      },
      sounds: {
        description: 'CK3 sound event and snapshot identifiers.',
        extractor: 'const-array:SOUNDS',
        updateMode: 'additive',
        values: pickBindingValues(soundsBindings, ['SOUNDS']),
        targets: [],
      },
      'complex-tooltip-tags': {
        description:
          'CK3 #TOOLTIP tag names used by localization complex tooltips.',
        extractor: 'tuple-field:COMPLEX_TOOLTIPS[0]',
        updateMode: 'additive',
        values: extractTupleFieldStrings(
          readText(sources.localizationTable),
          'COMPLEX_TOOLTIPS',
          0,
        ),
        targets: [],
      },
      'common-dirs': {
        description: 'CK3 common/ directory roots known to tiger.',
        extractor: 'const-array:COMMON_DIRS',
        updateMode: 'additive',
        values: pickBindingValues(miscBindings, ['COMMON_DIRS']),
        targets: [],
      },
      'custom-religion-locas': {
        description:
          'Custom religion localization placeholder keys tracked by tiger.',
        extractor: 'const-array:CUSTOM_RELIGION_LOCAS',
        updateMode: 'additive',
        values: pickBindingValues(miscBindings, ['CUSTOM_RELIGION_LOCAS']),
        targets: [],
      },
      'banned-title-history-types': {
        description: 'Title history type keys specially tracked by tiger.',
        extractor: 'const-array:BANNED_TITLE_HISTORY_TYPES',
        updateMode: 'additive',
        values: pickBindingValues(miscBindings, ['BANNED_TITLE_HISTORY_TYPES']),
        targets: [],
      },
    },
  };
}

function splitDefineEntries(values) {
  const namespaces = [];
  const keys = [];

  for (const value of values) {
    const separatorIndex = value.indexOf('|');
    if (separatorIndex <= 0 || separatorIndex >= value.length - 1) {
      continue;
    }
    namespaces.push(value.slice(0, separatorIndex));
    keys.push(value.slice(separatorIndex + 1));
  }

  return {
    namespaces: mergeUnique(namespaces).filter(isKeywordIdentifier),
    keys: mergeUnique(keys).filter(isKeywordIdentifier),
  };
}

function buildParadoxParametersFeed(
  tigerRoot,
  sources,
  validatorSources,
  validatorBindings,
  miscBindings,
  eventsBindings,
) {
  return {
    id: 'paradox-parameters',
    description: 'CK3-specific shared Paradox parameter and value lists.',
    outputFile: 'paradox-parameters.json',
    sourceFiles: [
      sources.effectValidation,
      sources.validate,
      sources.misc,
      sources.events,
      ...validatorSources.map(({ filePath }) => filePath),
    ]
      .map((filePath) => normalizeRelativePath(tigerRoot, filePath))
      .filter((value, index, list) => list.indexOf(value) === index)
      .sort(),
    sections: {
      'parameters-lhs': {
        description:
          'Field names that appear on the left-hand side of CK3 script assignments.',
        extractor: 'validator-fields',
        updateMode: 'additive',
        values:
          extractFieldNamesFromValidatorSources(validatorSources).filter(
            isKeywordIdentifier,
          ),
        targets: [
          {
            grammarId: 'paradox',
            repositoryKey: 'parameters-lhs',
            patternBuilder: 'parameters-lhs',
          },
        ],
      },
      'parameters-rhs': {
        description:
          'Known literal values that appear on the right-hand side of CK3 script assignments.',
        extractor: 'validator-choice+misc',
        updateMode: 'additive',
        values: mergeUnique(
          extractChoiceValuesFromValidatorSources(
            validatorSources,
            validatorBindings,
            miscBindings,
          ),
          pickBindingValues(eventsBindings, ['EVENT_TYPES']),
          pickBindingValues(miscBindings, [
            'AI_TARGETS',
            'ACTIVITY_STATES',
            'AGENT_SLOT_CONTRIBUTION_TYPE',
            'ARTIFACT_HISTORY',
            'ARTIFACT_RARITIES',
            'CURRENCIES_CK3',
            'DANGER_TYPES',
            'DLC_FEATURES_CK3',
            'DLC_MUSIC',
            'GOVERNMENT_RULES',
            'LEGEND_QUALITY',
            'OUTBREAK_INTENSITIES',
            'PRISON_TYPES',
            'PROVINCE_FILTERS',
            'REWARD_ITEMS',
            'SEXUALITIES',
            'SKILLS',
            'SUPPORT_TYPES',
            'TITLE_HISTORY_TYPES',
            'TRAIT_CATEGORIES',
          ]),
        ).filter(isKeywordIdentifier),
        targets: [
          {
            grammarId: 'paradox',
            repositoryKey: 'parameters-rhs',
            patternBuilder: 'parameters-rhs',
          },
        ],
      },
    },
  };
}

function buildGuiSymbolsFeed(
  tigerRoot,
  sources,
  guiPropertiesSource,
  guiBuiltinsSource,
  guiPropertiesTextSource,
  guiBindings,
) {
  return {
    id: 'gui-symbols',
    description:
      'GUI widget properties, builtins, and enumerated GUI value tokens.',
    outputFile: 'gui-symbols.json',
    sourceFiles: [
      sources.guiProperties,
      sources.guiBuiltins,
      sources.guiPropertiesText,
    ]
      .map((filePath) => normalizeRelativePath(tigerRoot, filePath))
      .sort(),
    sections: {
      'widget-properties': {
        description:
          'GUI property keys that appear on the left-hand side of assignments.',
        extractor: 'enum:WidgetProperty+guiproperties',
        updateMode: 'additive',
        values: mergeUnique(
          extractEnumVariants(guiPropertiesSource, 'WidgetProperty').map(
            normalizeEnumToken,
          ),
          extractGuiPropertyNames(guiPropertiesTextSource),
        ).filter(isKeywordIdentifier),
        targets: [
          {
            grammarId: 'paradox',
            repositoryKey: 'parameters-lhs',
            patternBuilder: 'parameters-lhs',
          },
        ],
      },
      'widget-types': {
        description:
          'Builtin GUI widget names that appear as block/type keys on the left-hand side.',
        extractor: 'enum:BuiltinWidget',
        updateMode: 'additive',
        values: extractEnumVariants(guiBuiltinsSource, 'BuiltinWidget')
          .map(normalizeEnumToken)
          .filter(isKeywordIdentifier),
        targets: [
          {
            grammarId: 'paradox',
            repositoryKey: 'parameters-lhs',
            patternBuilder: 'parameters-lhs',
          },
        ],
      },
      'widget-choice-values': {
        description:
          'Constrained GUI value tokens used on the right-hand side of assignments.',
        extractor: 'gui-choice',
        updateMode: 'additive',
        values: mergeUnique(
          extractGuiChoiceValues(guiPropertiesSource, guiBindings),
          pickBindingValues(guiBindings, [
            'ALIGN',
            'BLENDMODES',
            'LAYOUT_POLICIES',
          ]),
        ).filter(isKeywordIdentifier),
        targets: [
          {
            grammarId: 'paradox',
            repositoryKey: 'parameters-rhs',
            patternBuilder: 'parameters-rhs',
          },
        ],
      },
    },
  };
}

function buildLocalizationSymbolsFeed(
  tigerRoot,
  localizationSources,
  validatorSources,
) {
  const manualSupplement = readManualLocalizationSymbolsSupplement();
  return {
    id: 'localization-symbols',
    description:
      'Localization helper fields and CK3 localization-key fields used across Jomini helpers and validators.',
    outputFile: 'localization-symbols.json',
    sourceFiles: [...localizationSources, ...validatorSources]
      .map(({ filePath }) => normalizeRelativePath(tigerRoot, filePath))
      .filter((value, index, list) => list.indexOf(value) === index)
      .sort(),
    sections: {
      'localization-fields': {
        description:
          'Localization helper field names that behave like Paradox parameters.',
        extractor: 'validator-fields',
        updateMode: 'additive',
        values:
          extractFieldNamesFromValidatorSources(localizationSources).filter(
            isKeywordIdentifier,
          ),
        targets: [
          {
            grammarId: 'paradox',
            repositoryKey: 'parameters-lhs',
            patternBuilder: 'parameters-lhs',
          },
        ],
      },
      'localization-key-fields': {
        description:
          'Field names whose bare RHS values behave like localization keys.',
        extractor:
          'validator-item-fields:Item::Localization + manual-supplement',
        updateMode: 'additive',
        values: mergeUnique(
          extractItemFieldNamesFromValidatorSources(
            [...localizationSources, ...validatorSources],
            ['Localization'],
          ),
          manualSupplement['localization-key-fields'],
        ).filter(isKeywordIdentifier),
        targets: [],
      },
    },
  };
}

function buildLocalizationBuiltinsFeed(
  tigerRoot,
  sources,
  localizationTableBindings,
  dataGlobalPromotesSource,
  dataGlobalFunctionsSource,
  dataPromotesSource,
  dataFunctionsSource,
) {
  const manualSupplement = readManualLocalizationBuiltinsSupplement();
  return {
    id: 'localization-builtins',
    description:
      'Builtin localization macros and CK3 data function names extracted from tiger tables.',
    outputFile: 'localization-builtins.json',
    sourceFiles: [
      sources.localizationTable,
      sources.dataGlobalPromotes,
      sources.dataGlobalFunctions,
      sources.dataPromotes,
      sources.dataFunctionsInclude,
    ]
      .map((filePath) => normalizeRelativePath(tigerRoot, filePath))
      .sort(),
    sections: {
      'builtin-macros': {
        description: 'Builtin localization macro names.',
        extractor: 'const-array:BUILTIN_MACROS + manual-supplement',
        updateMode: 'additive',
        values: mergeUnique(
          pickBindingValues(localizationTableBindings, ['BUILTIN_MACROS']),
          manualSupplement['builtin-macros'],
        ),
        targets: [
          {
            grammarId: 'localization',
            repositoryKey: 'builtin-macro',
            patternBuilder: 'localization-token',
          },
        ],
      },
      'builtin-scopes': {
        description:
          'Manual builtin localization scope aliases missing from tiger tables.',
        extractor: 'manual-supplement',
        updateMode: 'additive',
        values: manualSupplement['builtin-scopes'],
        targets: [],
      },
      'no-arg-functions': {
        description:
          'Builtin localization accessors and data functions that do not take arguments.',
        extractor: 'tuple-field:*[0] filtered by Args::Args(&[])',
        updateMode: 'additive',
        values: mergeUnique(
          extractTupleFieldStringsByArgs(
            dataGlobalPromotesSource,
            'GLOBAL_PROMOTES_CK3',
            0,
            1,
            'no-args',
          ),
          extractTupleFieldStringsByArgs(
            dataGlobalFunctionsSource,
            'GLOBAL_FUNCTIONS_CK3',
            0,
            1,
            'no-args',
          ),
          extractTupleFieldStringsByArgs(
            dataPromotesSource,
            'PROMOTES_CK3',
            0,
            2,
            'no-args',
          ),
          extractTupleFieldStringsByArgs(
            dataFunctionsSource,
            'FUNCTIONS_CK3',
            0,
            2,
            'no-args',
          ),
        ),
        targets: [],
      },
      'with-arg-functions': {
        description:
          'Builtin localization accessors and data functions that take arguments.',
        extractor: 'tuple-field:*[0] filtered by Args != Args::Args(&[])',
        updateMode: 'additive',
        values: mergeUnique(
          extractTupleFieldStringsByArgs(
            dataGlobalPromotesSource,
            'GLOBAL_PROMOTES_CK3',
            0,
            1,
            'with-args',
          ),
          extractTupleFieldStringsByArgs(
            dataGlobalFunctionsSource,
            'GLOBAL_FUNCTIONS_CK3',
            0,
            1,
            'with-args',
          ),
          extractTupleFieldStringsByArgs(
            dataPromotesSource,
            'PROMOTES_CK3',
            0,
            2,
            'with-args',
          ),
          extractTupleFieldStringsByArgs(
            dataFunctionsSource,
            'FUNCTIONS_CK3',
            0,
            2,
            'with-args',
          ),
        ),
        targets: [],
      },
      'global-promotes': {
        description:
          'Global datatype promotion functions usable in localization data chains.',
        extractor: 'tuple-field:GLOBAL_PROMOTES_CK3[0]',
        updateMode: 'additive',
        values: extractTupleFieldStrings(
          dataGlobalPromotesSource,
          'GLOBAL_PROMOTES_CK3',
          0,
        ),
        targets: [],
      },
      'global-functions': {
        description:
          'Global datatype functions usable in localization data chains.',
        extractor: 'tuple-field:GLOBAL_FUNCTIONS_CK3[0]',
        updateMode: 'additive',
        values: extractTupleFieldStrings(
          dataGlobalFunctionsSource,
          'GLOBAL_FUNCTIONS_CK3',
          0,
        ),
        targets: [],
      },
      promotes: {
        description:
          'Scoped datatype promotion functions usable in localization data chains.',
        extractor: 'tuple-field:PROMOTES_CK3[0]',
        updateMode: 'additive',
        values: extractTupleFieldStrings(dataPromotesSource, 'PROMOTES_CK3', 0),
        targets: [],
      },
      functions: {
        description:
          'Scoped datatype functions usable in localization data chains.',
        extractor: 'tuple-field:FUNCTIONS_CK3[0]',
        updateMode: 'additive',
        values: extractTupleFieldStrings(
          dataFunctionsSource,
          'FUNCTIONS_CK3',
          0,
        ),
        targets: [],
      },
      'receiver-types': {
        description:
          'Scoped localization receiver/context datatypes usable as data chain roots.',
        extractor: 'tuple-field:* receiver type',
        updateMode: 'additive',
        values: mergeUnique(
          extractTupleFieldTypeNames(dataPromotesSource, 'PROMOTES_CK3', 1),
          extractTupleFieldTypeNames(dataFunctionsSource, 'FUNCTIONS_CK3', 1),
        ),
        targets: [],
      },
    },
  };
}

function readManualLocalizationBuiltinsSupplement() {
  const manualFilePath = path.join(
    __dirname,
    '..',
    'data',
    'localization-builtins.manual.json',
  );
  return readManualSupplement(manualFilePath, [
    'builtin-macros',
    'builtin-scopes',
  ]);
}

function readManualLocalizationSymbolsSupplement() {
  const manualFilePath = path.join(
    __dirname,
    '..',
    'data',
    'localization-symbols.manual.json',
  );
  return readManualSupplement(manualFilePath, ['localization-key-fields']);
}

function resolveTigerSources(tigerRoot) {
  const sources = {
    effects: path.join(tigerRoot, 'src', 'ck3', 'tables', 'effects.rs'),
    defines: path.join(tigerRoot, 'src', 'ck3', 'tables', 'defines.rs'),
    triggers: path.join(tigerRoot, 'src', 'ck3', 'tables', 'triggers.rs'),
    targets: path.join(tigerRoot, 'src', 'ck3', 'tables', 'targets.rs'),
    modifiers: path.join(tigerRoot, 'src', 'ck3', 'tables', 'modifs.rs'),
    misc: path.join(tigerRoot, 'src', 'ck3', 'tables', 'misc.rs'),
    events: path.join(tigerRoot, 'src', 'ck3', 'events.rs'),
    sounds: path.join(tigerRoot, 'src', 'ck3', 'tables', 'sounds.rs'),
    validate: path.join(tigerRoot, 'src', 'ck3', 'validate.rs'),
    effectValidation: path.join(
      tigerRoot,
      'src',
      'ck3',
      'effect_validation.rs',
    ),
    dataDir: path.join(tigerRoot, 'src', 'ck3', 'data'),
    localizationTable: path.join(
      tigerRoot,
      'src',
      'ck3',
      'tables',
      'localization.rs',
    ),
    onActions: path.join(tigerRoot, 'src', 'ck3', 'tables', 'on_action.rs'),
    rules: path.join(tigerRoot, 'src', 'ck3', 'tables', 'rules.rs'),
    iterators: path.join(tigerRoot, 'src', 'ck3', 'tables', 'iterators.rs'),
    dataGlobalPromotes: path.join(
      tigerRoot,
      'tiger-tables',
      'src',
      'ck3',
      'include',
      'data_global_promotes.rs',
    ),
    dataGlobalFunctions: path.join(
      tigerRoot,
      'tiger-tables',
      'src',
      'ck3',
      'include',
      'data_global_functions.rs',
    ),
    dataPromotes: path.join(
      tigerRoot,
      'tiger-tables',
      'src',
      'ck3',
      'include',
      'data_promotes.rs',
    ),
    dataFunctionsInclude: path.join(
      tigerRoot,
      'tiger-tables',
      'src',
      'ck3',
      'include',
      'data_functions.rs',
    ),
    guiProperties: path.join(tigerRoot, 'src', 'gui', 'properties.rs'),
    guiBuiltins: path.join(tigerRoot, 'src', 'gui', 'builtins.rs'),
    guiPropertiesText: path.join(tigerRoot, 'guiproperties.txt'),
    customLoca: path.join(tigerRoot, 'src', 'data', 'customloca.rs'),
    effectLocalization: path.join(
      tigerRoot,
      'src',
      'data',
      'effect_localization.rs',
    ),
    triggerLocalization: path.join(
      tigerRoot,
      'src',
      'data',
      'trigger_localization.rs',
    ),
  };

  for (const [label, filePath] of Object.entries(sources)) {
    if (label === 'dataDir') {
      ensureDir(filePath, label);
      continue;
    }
    ensureFile(filePath, label);
  }

  return sources;
}

function wrapInlineArrayConst(constName, arraySource) {
  return `const ${constName} = ${arraySource.trim()};`;
}

function expandIteratorVariants(values, prefixes) {
  return mergeUnique(
    ...prefixes.map((prefix) => values.map((value) => `${prefix}_${value}`)),
  );
}

module.exports = {
  collectFeedData,
};
