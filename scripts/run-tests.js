#!/usr/bin/env node

const { spawnSync } = require('child_process');
const { version } = require('../package.json');

const unsupportedJestArguments = new Set([
  '--runInBand',
  '--runTestsByPath',
]);
const forwardedArguments = process.argv
  .slice(2)
  .filter(argument => !unsupportedJestArguments.has(argument));
const boundaryCheck = spawnSync(
  process.execPath,
  ['scripts/check-public-repository-boundary.js'],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false,
  }
);

if (boundaryCheck.error) {
  console.error(`Could not start repository boundary check: ${boundaryCheck.error.message}`);
  process.exit(1);
}

if (boundaryCheck.status !== 0) {
  process.exit(boundaryCheck.status ?? 1);
}

const result = spawnSync(
  process.platform === 'win32' ? 'vitest.cmd' : 'vitest',
  ['run', ...forwardedArguments],
  {
    cwd: process.cwd(),
    // Match the isolated distribution build even during ordinary local tests.
    // An explicit version remains available for targeted development scenarios.
    env: { ...process.env, VITE_APP_VERSION: process.env.VITE_APP_VERSION || version },
    stdio: 'inherit',
    shell: false,
  }
);

if (result.error) {
  console.error(`Could not start Vitest: ${result.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
