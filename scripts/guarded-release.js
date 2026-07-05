#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const releaseMode = process.argv.includes('--release');
const checkOnly = process.argv.includes('--check') || !releaseMode;

function fail(message) {
  console.error(`\nERROR: ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`✅ ${message}`);
}

function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    env: { ...process.env, ...(options.env || {}) },
  });

  if (result.status !== 0) {
    const stderr = result.stderr ? result.stderr.trim() : '';
    const stdout = result.stdout ? result.stdout.trim() : '';
    fail(`${command} ${args.join(' ')} failed${stderr ? `\n${stderr}` : ''}${stdout ? `\n${stdout}` : ''}`);
  }

  return (result.stdout || '').trim();
}

function fileHash(filePath) {
  if (!fs.existsSync(filePath)) fail(`Missing file: ${filePath}`);
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readJson(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) fail(`Missing file: ${relativePath}`);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function assertNoForbiddenPublicNotes(text) {
  const forbidden = [
    /izzy/i,
    /neostore/i,
    /neo\s*store/i,
    /reproduc/i,
    /preflight/i,
    /store process/i,
  ];

  const hit = forbidden.find(pattern => pattern.test(text));
  if (hit) fail(`Public release notes contain forbidden internal wording: ${hit}`);
}

function releaseNotes(version) {
  const candidates = [
    path.join(root, `release-notes-v${version}.md`),
    path.join(root, 'RELEASE.md'),
  ];

  const existing = candidates.find(file => fs.existsSync(file));
  const notes = existing
    ? fs.readFileSync(existing, 'utf8').trim()
    : `Kelani SBD Tracker v${version}

Mobile UI and Smart workout polish release.

* Added a fixed compact app top bar with generated Kelani wordmark.
* Improved mobile workout spacing for warm-ups, work sets, and action buttons.
* Moved Smart workout details into a cleaner info modal.
* Reorganized Stats into compact sections: Lifts, Total, Comp., Health, and Meet.
* Simplified body data input and removed less useful body metrics from the main UI.
* Kept the v1.3.3 cycle-boundary fix that prevents Start new cycle from appearing after a normal training workout.`;

  assertNoForbiddenPublicNotes(notes);
  return notes;
}

const pkg = readJson('package.json');
const lock = readJson('package-lock.json');

const version = pkg.version;
if (!version) fail('package.json version missing.');

if (lock.version && lock.version !== version) {
  fail(`package-lock.json root version mismatch: ${lock.version} !== ${version}`);
}

if (lock.packages?.['']?.version && lock.packages[''].version !== version) {
  fail(`package-lock packages[""].version mismatch: ${lock.packages[''].version} !== ${version}`);
}

ok(`package version ${version}`);

const buildGradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
const versionNameMatch = buildGradle.match(/versionName\s+"([^"]+)"/);
const versionCodeMatch = buildGradle.match(/versionCode\s+(\d+)/);

if (!versionNameMatch) fail('Could not read Android versionName.');
if (!versionCodeMatch) fail('Could not read Android versionCode.');

const versionName = versionNameMatch[1];
const versionCode = Number(versionCodeMatch[1]);

if (versionName !== version) {
  fail(`Android versionName mismatch: ${versionName} !== ${version}`);
}

if (!Number.isFinite(versionCode) || versionCode <= 0) {
  fail(`Invalid Android versionCode: ${versionCode}`);
}

ok(`Android versionCode ${versionCode}, versionName ${versionName}`);

const statusLines = run('git', ['status', '--porcelain'])
  .split('\n')
  .map(line => line.trim())
  .filter(Boolean)
  .filter(line => !line.endsWith('release/') && !line.includes(' release/'));

if (statusLines.length > 0) {
  fail(`Working tree has non-release changes:\n${statusLines.join('\n')}`);
}

ok('working tree clean except release output');

run('git', ['fetch', 'origin', 'main', '--tags']);

const head = run('git', ['rev-parse', 'HEAD']);
const originMain = run('git', ['rev-parse', 'origin/main']);

if (head !== originMain) {
  fail(`HEAD is not origin/main.\nHEAD:        ${head}\norigin/main: ${originMain}`);
}

ok('HEAD matches origin/main');

const tag = `v${version}`;
const remoteTagLine = run('git', ['ls-remote', 'origin', `refs/tags/${tag}`]);
const remoteTagHash = remoteTagLine ? remoteTagLine.split(/\s+/)[0] : null;

if (remoteTagHash && remoteTagHash !== head) {
  fail(`Remote tag ${tag} points to wrong commit.\nTag:  ${remoteTagHash}\nHEAD: ${head}\nDelete/fix tag manually before release.`);
}

ok(remoteTagHash ? `remote tag ${tag} points to HEAD` : `remote tag ${tag} does not exist yet`);

const releaseView = spawnSync('gh', ['release', 'view', tag, '--json', 'tagName,name,isPrerelease,assets'], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'pipe',
});

if (releaseView.status === 0) {
  fail(`GitHub Release ${tag} already exists. Refusing to overwrite.`);
}

ok(`GitHub Release ${tag} does not exist yet`);

const phoneApk = path.join(root, 'release', 'kelani-sbd-tracker-phone-test.apk');
const publicApk = path.join(root, 'release', `kelani-sbd-tracker-v${version}.apk`);
const publicSha = path.join(root, 'release', `kelani-sbd-tracker-v${version}.apk.sha256`);

const phoneHash = fileHash(phoneApk);
const publicHash = fileHash(publicApk);

if (phoneHash !== publicHash) {
  fail(`Phone-tested APK hash differs from public APK hash.\nphone:  ${phoneHash}\npublic: ${publicHash}`);
}

const shaText = fs.existsSync(publicSha) ? fs.readFileSync(publicSha, 'utf8') : '';
if (!shaText.includes(publicHash)) {
  fail(`${path.relative(root, publicSha)} does not contain APK hash ${publicHash}`);
}

ok(`phone-tested APK matches public APK: ${publicHash}`);

console.log('\nRunning required internal store/preflight build test...');
run('npm', ['run', 'android:izzy-test'], { stdio: 'inherit' });
ok('required internal store/preflight build test passed');

const notes = releaseNotes(version);
ok('public release notes passed internal-wording scan');

if (checkOnly) {
  console.log('\n✅ Release gate passed. No tag or GitHub Release was created.');
  console.log(`To create the public release, run: npm run android:guarded-release`);
  process.exit(0);
}

if (!remoteTagHash) {
  run('git', ['tag', tag, head], { stdio: 'inherit' });
  run('git', ['push', 'origin', tag], { stdio: 'inherit' });
  ok(`created and pushed tag ${tag}`);
}

run('gh', [
  'release',
  'create',
  tag,
  publicApk,
  publicSha,
  '--title',
  `Kelani SBD Tracker ${tag}`,
  '--notes',
  notes,
], { stdio: 'inherit' });

ok(`GitHub Release ${tag} created`);
