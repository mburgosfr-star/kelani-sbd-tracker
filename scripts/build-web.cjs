const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { version } = require('../package.json');

// Set the same production version on Windows and POSIX shells.
const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const result = spawnSync(process.execPath, [vite, 'build'], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, VITE_APP_VERSION: version },
  stdio: 'inherit',
});
if (result.error) console.error(result.error);
process.exitCode = result.status ?? 1;
