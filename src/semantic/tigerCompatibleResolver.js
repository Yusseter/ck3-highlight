const fs = require('fs/promises');
const path = require('path');
const vscode = require('vscode');

const {
	getDirectChildren,
	normalizePathKey,
	normalizeRelativePath,
	parseScript,
	stripBom
} = require('./shallowScriptParser');

function normalizeFsPath(inputPath) {
	return path.normalize(inputPath.replace(/[\\/]+/g, path.sep));
}

function unquote(value) {
	if (!value) {
		return '';
	}

	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}

	return value;
}

async function readTextFile(filePath, overlay) {
	const overlayText = overlay?.getText?.(filePath);
	if (typeof overlayText === 'string') {
		return overlayText;
	}

	const raw = await fs.readFile(filePath, 'utf8');
	return stripBom(raw);
}

async function pathExists(targetPath) {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}

async function parseDescriptorFile(descriptorPath, overlay) {
	const descriptorText = await readTextFile(descriptorPath, overlay);
	const parsed = parseScript(descriptorText);
	const topLevel = parsed.assignments.filter((assignment) => assignment.depth === 0 && assignment.operator === '=');

	let baseDir = path.dirname(descriptorPath);
	if (path.basename(descriptorPath).toLowerCase() === 'descriptor.mod') {
		baseDir = path.dirname(descriptorPath);
	} else if (path.basename(baseDir).toLowerCase() === 'mod') {
		baseDir = path.dirname(baseDir);
	}

	let explicitPath = null;
	const replacePaths = [];

	for (const assignment of topLevel) {
		if (assignment.lhs === 'path' && assignment.valueKind === 'simple') {
			explicitPath = unquote(assignment.simpleValue);
		}
		if (assignment.lhs === 'replace_path' && assignment.valueKind === 'simple') {
			replacePaths.push(normalizeRelativePath(unquote(assignment.simpleValue)));
		}
	}

	let modRoot = baseDir;
	if (explicitPath) {
		const deduced = path.resolve(baseDir, normalizeFsPath(explicitPath));
		if (await pathExists(deduced)) {
			modRoot = deduced;
		}
	}

	return {
		descriptorPath: path.resolve(descriptorPath),
		descriptorKey: normalizePathKey(descriptorPath),
		modRoot: path.resolve(modRoot),
		replacePaths
	};
}

function inferParadoxDirFromDescriptorPath(descriptorPath) {
	const modDir = path.dirname(descriptorPath);
	if (path.basename(modDir).toLowerCase() === 'mod') {
		return path.dirname(modDir);
	}
	return null;
}

async function resolveDescriptorPath(modPathSetting) {
	if (!modPathSetting) {
		return null;
	}

	const resolved = path.resolve(modPathSetting);
	try {
		const stat = await fs.stat(resolved);
		if (stat.isDirectory()) {
			return path.join(resolved, 'descriptor.mod');
		}
		return resolved;
	} catch {
		return resolved;
	}
}

async function resolveLoadMods(configPath, paradoxDir, overlay) {
	if (!(await pathExists(configPath))) {
		return [];
	}

	const configText = await readTextFile(configPath, overlay);
	const parsed = parseScript(configText);
	const loadModBlocks = parsed.assignments.filter(
		(assignment) => assignment.depth === 0 && assignment.operator === '=' && assignment.lhs === 'load_mod' && assignment.valueKind === 'block'
	);

	const resolved = [];
	for (let index = 0; index < loadModBlocks.length; index++) {
		const block = loadModBlocks[index];
		const children = getDirectChildren(parsed, block.blockId);
		let label = `MOD${index}`;
		let modfileValue = null;
		let workshopId = null;

		for (const child of children) {
			if (child.lhs === 'label' && child.valueKind === 'simple') {
				label = unquote(child.simpleValue) || label;
			}
			if (child.lhs === 'modfile' && child.valueKind === 'simple') {
				modfileValue = unquote(child.simpleValue);
			}
			if (child.lhs === 'workshop_id' && child.valueKind === 'simple') {
				workshopId = unquote(child.simpleValue);
			}
		}

		let descriptorPath = null;
		if (modfileValue) {
			descriptorPath = path.resolve(path.dirname(configPath), normalizeFsPath(modfileValue));
		} else if (workshopId && paradoxDir) {
			descriptorPath = path.resolve(paradoxDir, 'mod', `ugc_${workshopId}.mod`);
		}

		if (!descriptorPath || !(await pathExists(descriptorPath))) {
			continue;
		}

		try {
			const descriptor = await parseDescriptorFile(descriptorPath, overlay);
			resolved.push({
				kind: 'loadedMod',
				label,
				descriptorPath: descriptor.descriptorPath,
				descriptorKey: descriptor.descriptorKey,
				root: descriptor.modRoot,
				replacePaths: descriptor.replacePaths
			});
		} catch {
			// Ignore invalid secondary mod descriptors and keep semantic highlighting available.
		}
	}

	return resolved;
}

async function resolveTigerCompatibleLoadOrder(overlay) {
	const config = vscode.workspace.getConfiguration('ck3tiger');
	const ck3Path = config.get('ck3Path');
	const modPath = config.get('modPath');

	const descriptorPath = await resolveDescriptorPath(modPath);
	if (!ck3Path || !descriptorPath) {
		return {
			ready: false,
			reason: 'missing-settings',
			ck3Path: ck3Path || null,
			modPath: descriptorPath || null
		};
	}

	if (!(await pathExists(descriptorPath))) {
		return {
			ready: false,
			reason: 'missing-descriptor',
			ck3Path,
			modPath: descriptorPath
		};
	}

	let mainMod;
	try {
		mainMod = await parseDescriptorFile(descriptorPath, overlay);
	} catch {
		return {
			ready: false,
			reason: 'invalid-descriptor',
			ck3Path,
			modPath: descriptorPath
		};
	}

	const configPath = path.resolve(mainMod.modRoot, 'ck3-tiger.conf');
	const paradoxDir = inferParadoxDirFromDescriptorPath(mainMod.descriptorPath);
	const loadedMods = await resolveLoadMods(configPath, paradoxDir, overlay);

	return {
		ready: true,
		ck3Path: path.resolve(ck3Path),
		main: {
			kind: 'mainMod',
			label: 'MOD',
			descriptorPath: mainMod.descriptorPath,
			descriptorKey: mainMod.descriptorKey,
			root: mainMod.modRoot,
			replacePaths: mainMod.replacePaths
		},
		configPath,
		configKey: normalizePathKey(configPath),
		paradoxDir,
		loadedMods,
		descriptorKeys: new Set([
			mainMod.descriptorKey,
			...loadedMods.map((entry) => entry.descriptorKey)
		])
	};
}

module.exports = {
	resolveTigerCompatibleLoadOrder
};
