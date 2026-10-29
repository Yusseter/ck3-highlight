const fs = require('node:fs');
const path = require('node:path');
const { runEditorTestHost } = require('./lib/editor-test-host');

function resolveModRoot(project) {
  for (const candidate of [
    path.resolve(project),
    path.resolve(project, 'mod'),
  ]) {
    const descriptor = path.join(candidate, 'descriptor.mod');
    if (fs.existsSync(descriptor) && fs.statSync(descriptor).isFile())
      return candidate;
  }
  throw new Error(
    'Pass a mod folder containing descriptor.mod or a repository with mod/descriptor.mod.',
  );
}

function main() {
  const [executable, game, project] = process.argv.slice(2);
  if (!executable || !game || !project || process.argv.length !== 5) {
    throw new Error(
      'Usage: node scripts/test-project.js <VS Code executable> <CK3 installation root> <mod or repository>',
    );
  }
  const gameRoot = path.resolve(game);
  if (!fs.existsSync(path.join(gameRoot, 'game', 'common')))
    throw new Error('CK3 path must contain game/common.');
  const modRoot = resolveModRoot(project);
  const { status, report } = runEditorTestHost({
    executable,
    testDirectory: 'project',
    timeoutMs: 180000,
    prepare(temp) {
      const workspace = path.join(temp, 'workspace');
      fs.mkdirSync(workspace);
      return workspace;
    },
    settings: {
      'ck3Highlight.gamePath': gameRoot,
      'ck3Highlight.modPath': modRoot,
    },
    env: { CK3_HIGHLIGHT_PROJECT: modRoot },
  });
  const reportPath = path.resolve(
    __dirname,
    '..',
    '.cache',
    'project-test.json',
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  if (report.metrics) console.log(JSON.stringify(report.metrics, null, 2));
  console.log('Local report: ' + reportPath);
  process.exitCode = status;
}

if (require.main === module) main();
module.exports = { resolveModRoot };
