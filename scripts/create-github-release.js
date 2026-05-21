const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));

const version = pkg.version;
const tag = `v${version}`;
const apkPath = path.join(os.homedir(), 'Downloads', `kelani-sbd-tracker-v${version}.apk`);
const title = `Kelani SBD Tracker ${tag}`;
const notes = process.argv.slice(2).join(' ').trim();

function run(command, options = {}) {
  console.log(`\n> ${command}`);
  return execSync(command, {
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

try {
  run('command -v gh', { stdio: 'ignore' });
} catch {
  fail('GitHub CLI is not installed. Install it with: sudo apt install gh');
}

try {
  run('gh auth status', { stdio: 'ignore' });
} catch {
  fail('GitHub CLI is not authenticated. Run: gh auth login');
}

if (!fs.existsSync(apkPath)) {
  fail(`APK not found: ${apkPath}`);
}

if (!notes) {
  fail('Release notes are required. Example: npm run github:release -- "Added meet prep checklist."');
}

const status = output('git status --short');
if (status) {
  fail('Git working tree is not clean. Commit or stash changes before creating a release.');
}

let tagExists = true;
try {
  run(`git rev-parse ${tag}`, { stdio: 'ignore' });
} catch {
  tagExists = false;
}

if (!tagExists) {
  run(`git tag ${tag}`);
}

run('git push');
run(`git push origin ${tag}`);

try {
  run(`gh release view ${tag}`, { stdio: 'ignore' });
  fail(`GitHub release ${tag} already exists.`);
} catch {
  // Release does not exist; continue.
}

run([
  'gh release create',
  tag,
  `"${apkPath}"`,
  '--title',
  `"${title}"`,
  '--notes',
  `"${notes.replace(/"/g, '\\"')}"`
].join(' '));

console.log(`\n✅ GitHub release created: ${tag}`);
