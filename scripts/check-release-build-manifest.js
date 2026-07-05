#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = process.cwd();
const pkg = require(path.join(root, 'package.json'));
const version = pkg.version;
const expectedPackageName = 'com.kel.powerlifting';

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function run(command, args) {
  try {
    return execFileSync(command, args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    fail(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function readExpectedVersionCode() {
  const gradlePath = path.join(root, 'android/app/build.gradle');
  const gradle = fs.readFileSync(gradlePath, 'utf8');
  const match = gradle.match(/versionCode\s+([0-9]+)/);
  if (!match) fail('Could not find versionCode in android/app/build.gradle');
  return match[1];
}

function assertCleanSourceTreeExceptRelease() {
  const status = run('git', ['status', '--porcelain']);
  const bad = status
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => {
      const file = line.slice(3);
      return !file.startsWith('release/');
    });

  if (bad.length > 0) {
    console.error('ERROR: source tree has non-release changes:');
    for (const line of bad) console.error(`  ${line}`);
    process.exit(1);
  }
}

const manifestPath = path.join(root, 'release/build-manifest.json');
if (!fs.existsSync(manifestPath)) {
  fail('Missing release/build-manifest.json. Run npm run android:release-apk first.');
}

assertCleanSourceTreeExceptRelease();

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const expectedCommit = run('git', ['rev-parse', 'HEAD']);
const expectedVersionCode = readExpectedVersionCode();
const expectedApkRel = `release/kelani-sbd-tracker-v${version}.apk`;
const expectedShaRel = `release/kelani-sbd-tracker-v${version}.apk.sha256`;

if (manifest.schema !== 1) {
  fail('build-manifest.json has unsupported schema');
}

if (manifest.builtBy !== 'scripts/build-release-apk.js') {
  fail(`build-manifest.json builtBy is ${manifest.builtBy}, expected scripts/build-release-apk.js`);
}

if (!manifest.git || manifest.git.commit !== expectedCommit) {
  fail(`build-manifest git commit does not match HEAD. manifest=${manifest.git?.commit}, HEAD=${expectedCommit}`);
}

if (manifest.git.dirty !== false) {
  fail('build-manifest says source tree was dirty at build time');
}

if (manifest.packageName !== expectedPackageName) {
  fail(`build-manifest packageName is ${manifest.packageName}, expected ${expectedPackageName}`);
}

if (manifest.versionName !== version) {
  fail(`build-manifest versionName is ${manifest.versionName}, expected ${version}`);
}

if (String(manifest.versionCode) !== expectedVersionCode) {
  fail(`build-manifest versionCode is ${manifest.versionCode}, expected ${expectedVersionCode}`);
}

if (!manifest.gradle || manifest.gradle.clean !== true) {
  fail('build-manifest must prove Gradle clean was used');
}

if (!manifest.apk || manifest.apk.path !== expectedApkRel) {
  fail(`build-manifest APK path is ${manifest.apk?.path}, expected ${expectedApkRel}`);
}

const apkPath = path.join(root, expectedApkRel);
const shaPath = path.join(root, expectedShaRel);

if (!fs.existsSync(apkPath)) {
  fail(`Missing APK listed by manifest: ${expectedApkRel}`);
}

if (!fs.existsSync(shaPath)) {
  fail(`Missing SHA file: ${expectedShaRel}`);
}

const actualHash = sha256File(apkPath);
const shaFile = fs.readFileSync(shaPath, 'utf8');

if (manifest.apk.sha256 !== actualHash) {
  fail(`build-manifest APK hash is ${manifest.apk.sha256}, actual is ${actualHash}`);
}

if (!shaFile.includes(actualHash)) {
  fail(`SHA file does not contain actual APK hash ${actualHash}`);
}

console.log(`✅ release build manifest check passed: ${expectedApkRel} (${version}/${expectedVersionCode}, ${actualHash})`);
