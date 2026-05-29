const path = require('path');
const vscode = require('vscode');

const { getDirectChildren, normalizePathKey, parseScript } = require('./shallowScriptParser');
const { buildLoadOrderIndex } = require('./loadOrderIndex');
const { OpenDocumentOverlay } = require('./openDocumentOverlay');
const { resolveTigerCompatibleLoadOrder } = require('./tigerCompatibleResolver');

class ScriptedSemanticService {
	constructor(context) {
		this.context = context;
		this.overlay = new OpenDocumentOverlay();
		this.legend = new vscode.SemanticTokensLegend(['scriptedParameter'], []);
		this.changeEmitter = new vscode.EventEmitter();
		this.onDidChangeSemanticTokens = this.changeEmitter.event;
		this.currentIndex = null;
		this.resolvedLoadOrder = null;
		this.fullRebuildTimer = null;
		this.semanticRefreshTimer = null;
		this.missingSettingsShown = false;
		this.rebuilding = false;
		this.pendingRebuild = false;
	}

	dispose() {
		this.changeEmitter.dispose();
		if (this.fullRebuildTimer) {
			clearTimeout(this.fullRebuildTimer);
		}
		if (this.semanticRefreshTimer) {
			clearTimeout(this.semanticRefreshTimer);
		}
	}

	async initialize() {
		for (const document of vscode.workspace.textDocuments) {
			if (this.supportsDocument(document)) {
				this.overlay.update(document);
			}
		}

		this.registerWorkspaceHooks();
		this.scheduleFullRebuild(0);
	}

	supportsDocument(document) {
		return document && document.uri.scheme === 'file' && ['ck3', 'paradox'].includes(document.languageId);
	}

	registerWorkspaceHooks() {
		this.context.subscriptions.push(
			vscode.workspace.onDidOpenTextDocument((document) => {
				if (!this.supportsDocument(document)) {
					return;
				}
				this.overlay.update(document);
				this.handleDocumentChange(document, true);
			}),
			vscode.workspace.onDidCloseTextDocument((document) => {
				if (!this.supportsDocument(document)) {
					return;
				}
				this.overlay.remove(document);
				this.refreshSemanticTokens();
			}),
			vscode.workspace.onDidChangeTextDocument((event) => {
				if (!this.supportsDocument(event.document)) {
					return;
				}
				this.overlay.update(event.document);
				this.handleDocumentChange(event.document, false);
			}),
			vscode.workspace.onDidSaveTextDocument((document) => {
				if (!this.supportsDocument(document)) {
					return;
				}
				this.overlay.update(document);
				this.handleDocumentSave(document);
			}),
			vscode.workspace.onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration('ck3tiger.ck3Path') || event.affectsConfiguration('ck3tiger.modPath')) {
					this.scheduleFullRebuild(0);
				}
			})
		);
	}

	handleDocumentChange(document) {
		if (this.isHeavyRebuildDocument(document)) {
			this.scheduleFullRebuild(180);
			return;
		}

		if (this.isTrackedGlobalScriptedDocument(document)) {
			this.recomputeGlobalSymbols();
		}

		this.refreshSemanticTokens();
	}

	handleDocumentSave(document) {
		if (this.isHeavyRebuildDocument(document)) {
			this.scheduleFullRebuild(0);
			return;
		}

		if (this.isTrackedGlobalScriptedDocument(document)) {
			this.recomputeGlobalSymbols();
		}

		this.refreshSemanticTokens();
	}

	isHeavyRebuildDocument(document) {
		const fileKey = normalizePathKey(document.uri.fsPath);
		if (this.resolvedLoadOrder?.configKey === fileKey) {
			return true;
		}
		return Boolean(this.resolvedLoadOrder?.descriptorKeys?.has(fileKey));
	}

	isTrackedGlobalScriptedDocument(document) {
		const fileKey = normalizePathKey(document.uri.fsPath);
		return Boolean(this.currentIndex?.sourceFiles?.has(fileKey));
	}

	scheduleFullRebuild(delayMs) {
		if (this.fullRebuildTimer) {
			clearTimeout(this.fullRebuildTimer);
		}
		this.fullRebuildTimer = setTimeout(() => {
			this.fullRebuildTimer = null;
			void this.rebuildIndex();
		}, delayMs);
	}

	async rebuildIndex() {
		if (this.rebuilding) {
			this.pendingRebuild = true;
			return;
		}

		this.rebuilding = true;
		try {
			const resolvedLoadOrder = await resolveTigerCompatibleLoadOrder(this.overlay);
			this.resolvedLoadOrder = resolvedLoadOrder;
			if (!resolvedLoadOrder.ready) {
				this.currentIndex = null;
				this.showMissingSettingsInfoOnce(resolvedLoadOrder.reason);
				this.refreshSemanticTokens();
				return;
			}

			this.currentIndex = await buildLoadOrderIndex(resolvedLoadOrder, this.overlay);
			this.recomputeGlobalSymbols();
			this.refreshSemanticTokens();
		} finally {
			this.rebuilding = false;
			if (this.pendingRebuild) {
				this.pendingRebuild = false;
				this.scheduleFullRebuild(0);
			}
		}
	}

	showMissingSettingsInfoOnce(reason) {
		if (this.missingSettingsShown) {
			return;
		}
		if (reason === 'missing-settings' || reason === 'missing-descriptor') {
			this.missingSettingsShown = true;
			void vscode.window.showInformationMessage(
				'Scripted semantic highlighting needs valid ck3tiger.ck3Path and ck3tiger.modPath settings.'
			);
		}
	}

	recomputeGlobalSymbols() {
		if (!this.currentIndex) {
			return;
		}

		const effects = new Set();
		const triggers = new Set();
		const modifiers = new Set();

		const addDefinitions = (record, targetSet) => {
			const overlayRecord = this.overlay.get(record.absolutePath);
			const definitions = overlayRecord && overlayRecord.family === record.family
				? overlayRecord.familyDefinitions
				: record.definitions;
			for (const definition of definitions) {
				targetSet.add(definition);
			}
		};

		for (const record of this.currentIndex.recordsByFamily.effects) {
			addDefinitions(record, effects);
		}
		for (const record of this.currentIndex.recordsByFamily.triggers) {
			addDefinitions(record, triggers);
		}
		for (const record of this.currentIndex.recordsByFamily.modifiers) {
			addDefinitions(record, modifiers);
		}

		this.currentIndex.effects = effects;
		this.currentIndex.triggers = triggers;
		this.currentIndex.modifiers = modifiers;
		this.currentIndex.any = new Set([...effects, ...triggers, ...modifiers]);
	}

	refreshSemanticTokens() {
		if (this.semanticRefreshTimer) {
			clearTimeout(this.semanticRefreshTimer);
		}
		this.semanticRefreshTimer = setTimeout(() => {
			this.semanticRefreshTimer = null;
			this.changeEmitter.fire();
		}, 120);
	}

	provideDocumentSemanticTokens(document) {
		const overlayRecord = this.overlay.update(document) || {
			parsed: parseScript(document.getText()),
			localDefinitions: new Set()
		};
		const localDefinitionIds = new Set(
			overlayRecord.parsed.assignments
				.filter(
					(assignment) =>
						assignment.depth === 0 &&
						assignment.operator === '=' &&
						assignment.valueKind === 'block' &&
						overlayRecord.localDefinitions?.has(assignment.lhs)
				)
				.map((assignment) => assignment.id)
		);
		const combinedNames = new Set(this.currentIndex?.any || []);
		for (const localName of overlayRecord.localDefinitions || []) {
			combinedNames.add(localName);
		}

		const builder = new vscode.SemanticTokensBuilder(this.legend);
		if (combinedNames.size === 0) {
			return builder.build();
		}

		const callAssignments = overlayRecord.parsed.assignments.filter(
			(assignment) =>
				!localDefinitionIds.has(assignment.id) &&
				assignment.operator === '=' &&
				assignment.valueKind === 'block' &&
				combinedNames.has(assignment.lhs)
		);

		for (const call of callAssignments) {
			const directChildren = getDirectChildren(overlayRecord.parsed, call.blockId);
			for (const child of directChildren) {
				const start = document.positionAt(child.lhsStart);
				const end = document.positionAt(child.lhsEnd);
				builder.push(
					new vscode.Range(start, end),
					'scriptedParameter'
				);
			}
		}

		return builder.build();
	}
}

module.exports = {
	ScriptedSemanticService
};
