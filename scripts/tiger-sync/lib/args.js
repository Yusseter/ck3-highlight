const path = require('path');
const { fail } = require('./shared');

function parseArgs(args) {
  const options = {
    path: null,
    dryRun: false,
    check: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--check') {
      options.check = true;
      options.dryRun = true;
      continue;
    }
    if (arg.startsWith('--')) {
      fail(`Unknown option: ${arg}`);
    }
    if (options.path !== null) {
      fail('Only one ck3-tiger path can be provided.');
    }
    options.path = arg;
  }

  return options;
}

function resolveTigerRoot(options) {
  const input = options.path || process.env.CK3_TIGER_ROOT;
  if (!input) {
    fail(
      'Usage: npm run sync:ck3-tiger -- "<path-to-amtep-tiger>" [--dry-run]\n' +
        'Or set the CK3_TIGER_ROOT environment variable.',
    );
  }
  return path.resolve(input);
}

module.exports = {
  parseArgs,
  resolveTigerRoot,
};
