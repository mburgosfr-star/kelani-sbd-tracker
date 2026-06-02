const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));

const version = pkg.version;
const tag = `v${version}`;
const title = `Kelani SBD Tracker ${tag}`;
const apkPath = path.join(os.homedir(), 'Downloads', `kelani-sbd-tracker-v${version}.apk`);
const buildGradlePath = path.join(root, 'android/app/build.gradle');

function run(command, args = [], options = {}) {
  console.log(`\n> ${[command, ...args].join(' ')}`);
  return execFileSync(command, args, {
    stdio: options.stdio || 'inherit',
    cwd: options.cwd || root,
    encoding: 'utf8',
  });
}

function output(command) {
  return execSync(command, {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: root,
    encoding: 'utf8',
  }).trim();
}

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

function readVersionCode() {
  const buildGradle = fs.readFileSync(buildGradlePath, 'utf8');
  const match = buildGradle.match(/versionCode\s+(\d+)/);

  if (!match) {
    fail('Could not read versionCode from android/app/build.gradle');
  }

  return match[1];
}

function validateReleaseNotes(notes) {
  const forbiddenPatterns = [
    /\/home\//,
    /\/Downloads\//,
    /Downloads/,
    /\.apk\b/i,
    /kelani-sbd-tracker-v.*\.apk/i,
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(notes)) {
      fail(`Release notes look unsafe and may contain a local path or APK filename. Refusing to create release.`);
    }
  }
}

if (process.argv.length > 2) {
  fail([
    'Do not pass release notes, tags, versions, or APK paths as arguments.',
    'This script reads version from package.json, APK from ~/Downloads, and notes from Fastlane changelog.',
    'Run it as: node scripts/create-github-release.js',
  ].join('\n'));
}

try {
  run('gh', ['--version'], { stdio: 'ignore' });
} catch {
  fail('GitHub CLI is not installed. Install it with: sudo apt install gh');
}

try {
  run('gh', ['auth', 'status'], { stdio: 'ignore' });
} catch {
  fail('GitHub CLI is not authenticated. Run: gh auth login');
}

if (!fs.existsSync(apkPath)) {
  fail(`APK not found: ${apkPath}`);
}

const versionCode = readVersionCode();
const changelogPath = path.join(root, 'fastlane/metadata/android/en-US/changelogs', `${versionCode}.txt`);

if (!fs.existsSync(changelogPath)) {
  fail(`Fastlane changelog not found: ${changelogPath}`);
}

const notes = fs.readFileSync(changelogPath, 'utf8').trim();

if (!notes) {
  fail(`Fastlane changelog is empty: ${changelogPath}`);
}

validateReleaseNotes(notes);

const status = output('git status --short');
if (status) {
  fail('Git working tree is not clean. Commit or stash changes before creating a release.');
}

let tagExists = true;
try {
  run('git', ['rev-parse', tag], { stdio: 'ignore' });
} catch {
  tagExists = false;
}

if (!tagExists) {
  run('git', ['tag', tag]);
}

run('git', ['push']);
run('git', ['push', 'origin', tag]);

try {
  run('gh', ['release', 'view', tag], { stdio: 'ignore' });
  fail(`GitHub release ${tag} already exists.`);
} catch {
  // Release does not exist; continue.
}

run('gh', [
  'release',
  'create',
  tag,
  apkPath,
  '--title',
  title,
  '--notes-file',
  changelogPath,
]);

console.log(`\n✅ GitHub release created: ${tag}`);
console.log(`Notes source: ${changelogPath}`);
console.log(`APK: ${apkPath}`);
