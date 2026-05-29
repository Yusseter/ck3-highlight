diff --git a/f:\Storage\Codding\vscode\Crusader Kings III Highlight\ck3-highlight\scripts/tiger-sync/lib/shared.js b/f:\Storage\Codding\vscode\Crusader Kings III Highlight\ck3-highlight\scripts/tiger-sync/lib/shared.js
new file mode 100644
--- /dev/null
+++ b/f:\Storage\Codding\vscode\Crusader Kings III Highlight\ck3-highlight\scripts/tiger-sync/lib/shared.js
@@ -0,0 +1,112 @@
+const fs = require('fs');
+const path = require('path');
+
+const repoRoot = path.resolve(__dirname, '..', '..', '..');
+const grammarPaths = {
+	ck3: path.join(repoRoot, 'syntaxes', 'ck3.tmLanguage.json'),
+	paradox: path.join(repoRoot, 'syntaxes', 'paradox.tmLanguage.json')
+};
+const generatedDir = path.join(repoRoot, 'generated', 'tiger');
+
+function fail(message) {
+	throw new Error(message);
+}
+
+function ensureFile(filePath, label) {
+	if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
+		fail(`Missing ck3-tiger source for ${label}: ${filePath}`);
+	}
+}
+
+function ensureDir(dirPath, label) {
+	if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
+		fail(`Missing ck3-tiger directory for ${label}: ${dirPath}`);
+	}
+}
+
+function readText(filePath) {
+	return fs.readFileSync(filePath, 'utf8');
+}
+
+function writeJsonIfChanged(filePath, value, options) {
+	const nextText = `${JSON.stringify(value, null, '\t')}\n`;
+	const currentText = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
+	const changed = currentText !== nextText;
+	if (changed && !options.dryRun) {
+		fs.mkdirSync(path.dirname(filePath), { recursive: true });
+		fs.writeFileSync(filePath, nextText);
+	}
+	return {
+		filePath,
+		changed,
+		wrote: changed && !options.dryRun
+	};
+}
+
+function writeGrammarIfChanged(filePath, grammar, options) {
+	const nextText = `${JSON.stringify(grammar, null, '\t')}\n`;
+	const currentText = fs.readFileSync(filePath, 'utf8');
+	const changed = currentText !== nextText;
+	if (changed && !options.dryRun) {
+		fs.writeFileSync(filePath, nextText);
+	}
+	return {
+		filePath,
+		changed,
+		wrote: changed && !options.dryRun
+	};
+}
+
+function walkFiles(dirPath, extension) {
+	const results = [];
+	for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
+		const fullPath = path.join(dirPath, entry.name);
+		if (entry.isDirectory()) {
+			results.push(...walkFiles(fullPath, extension));
+			continue;
+		}
+		if (!extension || fullPath.endsWith(extension)) {
+			results.push(fullPath);
+		}
+	}
+	return results.sort();
+}
+
+function escapeRegex(value) {
+	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
+}
+
+function mergeUnique(...lists) {
+	const values = [];
+	const seen = new Set();
+	for (const list of lists) {
+		for (const value of list || []) {
+			if (!value || seen.has(value)) {
+				continue;
+			}
+			seen.add(value);
+			values.push(value);
+		}
+	}
+	return values;
+}
+
+function normalizeRelativePath(rootPath, filePath) {
+	return path.relative(rootPath, filePath).split(path.sep).join('/');
+}
+
+module.exports = {
+	repoRoot,
+	grammarPaths,
+	generatedDir,
+	fail,
+	ensureFile,
+	ensureDir,
+	readText,
+	writeJsonIfChanged,
+	writeGrammarIfChanged,
+	walkFiles,
+	escapeRegex,
+	mergeUnique,
+	normalizeRelativePath
+};
