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
  /^\.private\//,
  /^backups\//,
  /^exports\//,
  /^release\//,
  /^\.vscode\//,
  /^android\/\.idea\//,
  /^android\/app\/release\//,
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

const privateContentPatterns = [
  {
    label: 'an absolute user home path',
    pattern: /(?:^|[\s"'`(])\/home\/[^/\s]+\//m,
  },
  {
    label: 'private collaboration instructions',
    pattern: /personal working agreements|private kelani sbd tracker release checklist|alles wat tussen kel en de assistent is/i,
  },
];
const leakedPrivateContent = [];

for (const file of trackedFiles) {
  if (file === 'scripts/check-public-repository-boundary.js') continue;

  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) continue;

  const buffer = fs.readFileSync(fullPath);
  if (buffer.includes(0)) continue;

  const content = buffer.toString('utf8');
  for (const { label, pattern } of privateContentPatterns) {
    if (pattern.test(content)) leakedPrivateContent.push(`${file}: ${label}`);
  }
}

if (leakedPrivateContent.length > 0) {
  fail(
    'Tracked files contain private local information:\n' +
    leakedPrivateContent.map(item => `- ${item}`).join('\n')
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
for (const requiredRule of ['/.private/', '/backups/', '/exports/']) {
  if (!gitignore.split(/\r?\n/).includes(requiredRule)) {
    fail(`Missing mandatory local-only ignore rule: ${requiredRule}`);
  }
}

console.log('Public/private repository boundary check passed.');
