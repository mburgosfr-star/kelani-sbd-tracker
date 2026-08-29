#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function gitOutput(args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    fail(`Could not inspect the public repository boundary: ${error.message}`);
  }
}

const trackedFiles = gitOutput(['ls-files', '-z'])
  .split('\0')
  .filter(Boolean);
const tracked = new Set(trackedFiles);

const privatePathPatterns = [
  /^AGENTS\.md$/,
  /^\.private\//,
  /^backups\//,
  /^exports\//,
  /^release\//,
  /^docs\/archive\/planning\//,
  /^marketing\/video-youtube-structure\.md$/,
  /^\.vscode\//,
  /^android\/\.idea\//,
  /__scratch/,
  /\.kelani-backup\.json$/,
  /\.(?:jks|keystore|p12|pfx)$/i,
];

const leakedPrivateFiles = trackedFiles.filter(file =>
  privatePathPatterns.some(pattern => pattern.test(file))
);

if (leakedPrivateFiles.length > 0) {
  fail(
    'Private local files must never be tracked:\n' +
    leakedPrivateFiles.map(file => `- ${file}`).join('\n')
  );
}

const requiredPublicFiles = [
  'README.md',
  'docs/privacy-policy.md',
  'VERIFY.md',
  'BRANDING.md',
  'LICENSE',
];
const missingPublicFiles = requiredPublicFiles.filter(file => !tracked.has(file));

if (missingPublicFiles.length > 0) {
  fail(
    'Essential user-facing files must remain public and tracked:\n' +
    missingPublicFiles.map(file => `- ${file}`).join('\n')
  );
}

const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
for (const requiredRule of ['/.private/', '/AGENTS.md']) {
  if (!gitignore.split(/\r?\n/).includes(requiredRule)) {
    fail(`Missing mandatory local-only ignore rule: ${requiredRule}`);
  }
}

console.log('Public/private repository boundary check passed.');
