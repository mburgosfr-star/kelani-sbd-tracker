#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = process.cwd();
const pkg = require(path.join(root, 'package.json'));
const expectedVersionName = pkg.version;
const expectedPackageName = 'com.kel.powerlifting';

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readExpectedVersionCode() {
  const gradlePath = path.join(root, 'android/app/build.gradle');
  const gradle = fs.readFileSync(gradlePath, 'utf8');
  const match = gradle.match(/versionCode\s+([0-9]+)/);
  if (!match) {
    fail('Could not find versionCode in android/app/build.gradle');
  }
  return match[1];
}

function findAapt() {
  const candidates = [];

  for (const envName of ['ANDROID_HOME', 'ANDROID_SDK_ROOT']) {
    if (process.env[envName]) {
      candidates.push(path.join(process.env[envName], 'build-tools'));
    }
  }

  candidates.push(path.join(process.env.HOME || '', 'Android/Sdk/build-tools'));

  for (const buildToolsDir of candidates) {
    if (!buildToolsDir || !fs.existsSync(buildToolsDir)) continue;

    const versions = fs.readdirSync(buildToolsDir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const version of versions.reverse()) {
      const aapt = path.join(buildToolsDir, version, 'aapt');
      if (fs.existsSync(aapt)) return aapt;
    }
  }

  fail('Could not find Android build-tools aapt');
}

function getBadging(aapt, apkPath) {
  try {
    return execFileSync(aapt, ['dump', 'badging', apkPath], { encoding: 'utf8' });
  } catch {
    fail(`Could not read APK metadata: ${apkPath}`);
  }
}

function parsePackageLine(badging, apkFile) {
  const line = badging.split('\n').find((value) => value.startsWith('package: '));
  if (!line) {
    fail(`Could not find package metadata in APK: ${apkFile}`);
  }

  const name = line.match(/name='([^']+)'/)?.[1];
  const versionCode = line.match(/versionCode='([^']+)'/)?.[1];
  const versionName = line.match(/versionName='([^']+)'/)?.[1];

  if (!name || !versionCode || !versionName) {
    fail(`Could not parse package metadata in APK: ${apkFile}`);
  }

  return { name, versionCode, versionName };
}

const expectedVersionCode = readExpectedVersionCode();
const aapt = findAapt();

const envFiles = process.env.KELANI_APK_METADATA_FILES
  ? process.env.KELANI_APK_METADATA_FILES.split(':').filter(Boolean)
  : null;

const apkFiles = envFiles || [
  'release/kelani-sbd-tracker-phone-test.apk',
  `release/kelani-sbd-tracker-v${expectedVersionName}.apk`,
];

for (const apkFile of apkFiles) {
  const apkPath = path.resolve(root, apkFile);

  if (!fs.existsSync(apkPath)) {
    fail(`Missing APK for metadata check: ${apkFile}`);
  }

  const badging = getBadging(aapt, apkPath);
  const actual = parsePackageLine(badging, apkFile);

  if (actual.name !== expectedPackageName) {
    fail(`${apkFile} has package name ${actual.name}, expected ${expectedPackageName}`);
  }

  if (actual.versionCode !== expectedVersionCode) {
    fail(`${apkFile} has versionCode ${actual.versionCode}, expected ${expectedVersionCode}`);
  }

  if (actual.versionName !== expectedVersionName) {
    fail(`${apkFile} has versionName ${actual.versionName}, expected ${expectedVersionName}`);
  }

  console.log(`✅ APK metadata check passed: ${apkFile} (${actual.name} ${actual.versionName}/${actual.versionCode})`);
}
