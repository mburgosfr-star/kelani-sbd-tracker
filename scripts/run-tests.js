#!/usr/bin/env node

const { spawnSync } = require('child_process');

const unsupportedJestArguments = new Set([
  '--runInBand',
  '--runTestsByPath',
]);
const forwardedArguments = process.argv
  .slice(2)
  .filter(argument => !unsupportedJestArguments.has(argument));
const result = spawnSync(
  process.platform === 'win32' ? 'vitest.cmd' : 'vitest',
  ['run', ...forwardedArguments],
  {
    cwd: process.cwd(),
    env: process.env,
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
