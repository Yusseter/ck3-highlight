const path = require('path');
const vscode = require('vscode');

const {
	extractParameterizedTopLevelDefinitions,
	normalizePathKey,
	parseScript
} = require('./shallowScriptParser');

function detectFamilyForPath(filePath) {
	const normalized = filePath.replace(/[\\/]+/g, '/').toLowerCase();
	if (normalized.includes('/common/scripted_effects/')) {
		return 'effects';
	}
	if (normalized.includes('/common/scripted_triggers/')) {
		return 'triggers';
	}
	if (normalized.includes('/common/scripted_modifiers/')) {
		return 'modifiers';
	}
	return null;
}

class OpenDocumentOverlay {
	constructor() {
		this.records = new Map();
	}

	update(document) {
		if (document.uri.scheme !== 'file') {
			return null;
		}

		const filePath = path.resolve(document.uri.fsPath);
		const parsed = parseScript(document.getText());
		const definitions = extractParameterizedTopLevelDefinitions(parsed);
		const family = detectFamilyForPath(filePath);
		const record = {
			filePath,
			pathKey: normalizePathKey(filePath),
			version: document.version,
			text: document.getText(),
			parsed,
			family,
			familyDefinitions: family ? definitions : new Set(),
			localDefinitions: definitions
		};
		this.records.set(record.pathKey, record);
		return record;
	}

	remove(documentOrUri) {
		const uri = documentOrUri instanceof vscode.Uri ? documentOrUri : documentOrUri.uri;
		if (!uri || uri.scheme !== 'file') {
			return;
		}
		this.records.delete(normalizePathKey(uri.fsPath));
	}

	get(filePath) {
		return this.records.get(normalizePathKey(filePath)) || null;
	}

	getText(filePath) {
		return this.get(filePath)?.text;
	}
}

module.exports = {
	OpenDocumentOverlay
};
