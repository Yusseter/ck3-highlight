const fs = require('fs/promises');
const path = require('path');

const {
	extractParameterizedTopLevelDefinitions,
	normalizePathKey,
	normalizeRelativePath,
	parseScript,
	stripBom
} = require('./shallowScriptParser');

const FAMILY_DIRECTORIES = {
	effects: 'common/scripted_effects',
	triggers: 'common/scripted_triggers',
	modifiers: 'common/scripted_modifiers'
};

async function pathExists(targetPath) {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}

async function readText(filePath, overlay) {
	const overlayText = overlay?.getText?.(filePath);
	if (typeof overlayText === 'string') {
		return overlayText;
	}

	const raw = await fs.readFile(filePath, 'utf8');
	return stripBom(raw);
}

async function collectFilesRecursively(dirPath, rootPath, bucket) {
	const entries = await fs.readdir(dirPath, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.name === '.git') {
			continue;
		}

		const fullPath = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			await collectFilesRecursively(fullPath, rootPath, bucket);
			continue;
		}

		if (!entry.isFile()) {
			continue;
		}

		const relativeFilePath = path.relative(rootPath, fullPath).split(path.sep).join('/');
		const relativeParentPath = normalizeRelativePath(path.posix.dirname(relativeFilePath));
		bucket.push({
			absolutePath: path.resolve(fullPath),
			pathKey: normalizePathKey(fullPath),
			relativeFilePath,
			relativeParentPath
		});
	}
}

async function collectRootFiles(root, familyDirectory) {
	const absoluteDir = path.resolve(root.root, familyDirectory);
	if (!(await pathExists(absoluteDir))) {
		return [];
	}

	const bucket = [];
	await collectFilesRecursively(absoluteDir, root.root, bucket);
	bucket.sort((left, right) => left.relativeFilePath.localeCompare(right.relativeFilePath));
	return bucket;
}

async function buildFamilyRecords(familyName, familyDirectory, roots, overlay) {
	const seenFiles = new Set();
	const replacedDirectories = new Set();
	const selected = [];

	for (let index = roots.length - 1; index >= 0; index--) {
		const root = roots[index];
		const files = await collectRootFiles(root, familyDirectory);
		for (const file of files) {
			if (seenFiles.has(file.relativeFilePath)) {
				continue;
			}
			if (replacedDirectories.has(file.relativeParentPath)) {
				continue;
			}

			let definitions = new Set();
			try {
				const text = await readText(file.absolutePath, overlay);
				definitions = extractParameterizedTopLevelDefinitions(parseScript(text));
			} catch {
				definitions = new Set();
			}

			selected.push({
				family: familyName,
				absolutePath: file.absolutePath,
				pathKey: file.pathKey,
				relativeFilePath: file.relativeFilePath,
				relativeParentPath: file.relativeParentPath,
				rootKind: root.kind,
				rootLabel: root.label,
				definitions
			});
			seenFiles.add(file.relativeFilePath);
		}

		for (const replacePath of root.replacePaths || []) {
			replacedDirectories.add(normalizeRelativePath(replacePath));
		}
	}

	return selected.reverse();
}

function combineFamilies(recordsByFamily) {
	const sourceFiles = new Map();
	const effects = new Set();
	const triggers = new Set();
	const modifiers = new Set();

	for (const record of recordsByFamily.effects) {
		sourceFiles.set(record.pathKey, record);
		for (const definition of record.definitions) {
			effects.add(definition);
		}
	}

	for (const record of recordsByFamily.triggers) {
		sourceFiles.set(record.pathKey, record);
		for (const definition of record.definitions) {
			triggers.add(definition);
		}
	}

	for (const record of recordsByFamily.modifiers) {
		sourceFiles.set(record.pathKey, record);
		for (const definition of record.definitions) {
			modifiers.add(definition);
		}
	}

	return {
		effects,
		triggers,
		modifiers,
		sourceFiles
	};
}

async function buildLoadOrderIndex(resolvedLoadOrder, overlay) {
	const roots = [
		{
			kind: 'vanilla',
			label: 'VANILLA',
			root: path.resolve(resolvedLoadOrder.ck3Path, 'game'),
			replacePaths: []
		},
		...resolvedLoadOrder.loadedMods,
		resolvedLoadOrder.main
	];

	const recordsByFamily = {
		effects: await buildFamilyRecords('effects', FAMILY_DIRECTORIES.effects, roots, overlay),
		triggers: await buildFamilyRecords('triggers', FAMILY_DIRECTORIES.triggers, roots, overlay),
		modifiers: await buildFamilyRecords('modifiers', FAMILY_DIRECTORIES.modifiers, roots, overlay)
	};

	return {
		roots,
		recordsByFamily,
		...combineFamilies(recordsByFamily)
	};
}

module.exports = {
	buildLoadOrderIndex,
	FAMILY_DIRECTORIES
};
