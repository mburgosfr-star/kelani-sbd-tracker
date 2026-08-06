#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function read(relativePath) {
  const fullPath = path.join(root, relativePath);

  if (!fs.existsSync(fullPath)) {
    fail(`Missing required file: ${relativePath}`);
  }

  return fs.readFileSync(fullPath, 'utf8');
}

const pkg = JSON.parse(read('package.json'));

const expectedScripts = {
  'release:build': 'node scripts/build-release-apk.js',
  'release:install': 'node scripts/install-apk.js',
  'release:web-tested':
    'node scripts/mark-web-tested.js',
  'release:prepare':
    'node scripts/prepare-release.js',
  'release:phone-tested':
    'node scripts/mark-phone-tested.js',
  'release:preflight':
    'node scripts/release-preflight.js',
  'release:check':
    'node scripts/guarded-release.js --check',
  'release:publish':
    'node scripts/guarded-release.js --release',
  'release:finish':
    'npm run release:preflight && npm run release:publish',
  'release:self-check':
    'node scripts/check-release-automation.js',
  'distribution:check':
    'node scripts/check-distribution.js',
  'android:izzy-test':
    'node scripts/test-izzy-build.js',
  'android:release-gate':
    'npm run release:preflight && npm run release:check',
  'android:guarded-release':
    'npm run release:finish',
  'github:release':
    'npm run release:publish',
};

for (const [name, expected] of Object.entries(expectedScripts)) {
  const actual = pkg.scripts?.[name];

  if (actual !== expected) {
    fail(
      `Incorrect package script ${name}\n` +
      `Expected: ${expected}\n` +
      `Actual:   ${actual}`
    );
  }
}

const requiredFiles = [
  'scripts/release-common.js',
  'scripts/build-release-apk.js',
  'scripts/mark-web-tested.js',
  'scripts/prepare-release.js',
  'scripts/test-izzy-build.js',
  'scripts/mark-phone-tested.js',
  'scripts/release-preflight.js',
  'scripts/guarded-release.js',
  'scripts/create-github-release.js',
  'scripts/check-distribution.js',
];

for (const file of requiredFiles) {
  read(file);
}

const webTestMarker = read('scripts/mark-web-tested.js');
const prepareRelease = read('scripts/prepare-release.js');
const preflight = read('scripts/release-preflight.js');
const guarded = read('scripts/guarded-release.js');
const izzy = read('scripts/test-izzy-build.js');
const directRelease = read('scripts/create-github-release.js');
const installApk = read('scripts/install-apk.js');
const releaseCommon = read('scripts/release-common.js');
const workflow = read(
  '.github/workflows/android-release-sanity.yml'
);
const distributionWorkflow = read(
  '.github/workflows/distribution-integrity.yml'
);
const distributionCheck = read(
  'scripts/check-distribution.js'
);
const androidManifest = read(
  'android/app/src/main/AndroidManifest.xml'
);
const androidFilePaths = read(
  'android/app/src/main/res/xml/file_paths.xml'
);

if (!androidManifest.includes('android:allowBackup="false"')) {
  fail('Android system backup must remain disabled for local training data.');
}

if (
  !androidFilePaths.includes('<cache-path') ||
  androidFilePaths.includes('<external-path') ||
  androidFilePaths.includes('<external-files-path')
) {
  fail('Android FileProvider must expose cache exports only.');
}

for (const signal of [
  'expectedGithubAssets',
  'assertIzzyPage',
  'assertSameMetadata',
  'assertSignedV2',
  'GitHub checksum asset does not match',
  'APK hash differs',
  'certificateSha256',
]) {
  if (!distributionCheck.includes(signal)) {
    fail(`Distribution check is missing required control: ${signal}`);
  }
}

for (const signal of [
  'schedule:',
  'workflow_dispatch:',
  'contents: read',
  'timeout-minutes: 15',
  'actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09',
  'actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444',
  'npm run distribution:check',
]) {
  if (!distributionWorkflow.includes(signal)) {
    fail(`Distribution workflow is missing required control: ${signal}`);
  }
}

for (const signal of [
  'releaseCertificateSha256',
  'certificate SHA-256 digest',
]) {
  if (!releaseCommon.includes(signal)) {
    fail(`Release signer pinning is missing required check: ${signal}`);
  }
}

for (const signal of [
  'phone-test-proof.json',
  'preflight-proof.json',
  'assertSignedV2',
  'assertUnsigned',
  'publicAssetManifest',
  'publicAssetsByteIdentical',
  'releaseScriptHashes',
]) {
  if (!preflight.includes(signal)) {
    fail(`Preflight is missing required check: ${signal}`);
  }
}

for (const signal of [
  '--confirmed',
  'web-test-proof.json',
  'confirmedByUser: true',
  'visibleWebTestPassed: true',
  'getHeadCommit',
]) {
  if (!webTestMarker.includes(signal)) {
    fail(`Web-test marker is missing required check: ${signal}`);
  }
}

for (const signal of [
  '--confirmed',
  '--version',
  '--version-code',
  'web-test-proof.json',
  'release-preparation-proof.json',
  'sourceCommit',
  'targetVersion',
  'targetVersionCode',
]) {
  if (!prepareRelease.includes(signal)) {
    fail(`Release preparation is missing required check: ${signal}`);
  }
}

const branchCheckPosition = guarded.indexOf(
  "if (branch !== 'main')"
);
const releaseNotesPosition = guarded.indexOf(
  'const notes = readReleaseNotes'
);

if (
  branchCheckPosition < 0 ||
  releaseNotesPosition < 0 ||
  branchCheckPosition > releaseNotesPosition
) {
  fail(
    'Publication must reject non-main branches before reading release notes.'
  );
}

for (const signal of [
  'preflight-proof.json',
  'Release APK changed after preflight.',
  'Release notes changed after preflight.',
  'Release automation changed after preflight.',
  'must never be overwritten',
]) {
  if (!guarded.includes(signal)) {
    fail(`Release guard is missing required check: ${signal}`);
  }
}

for (const signal of [
  '--no-local',
  'npm',
  'ci',
  '--no-build-cache',
  '--no-configuration-cache',
  'assertUnsigned',
  'assertApkHygiene',
]) {
  if (!izzy.includes(signal)) {
    fail(`Izzy build is missing required check: ${signal}`);
  }
}

if (
  !directRelease.includes(
    "KELANI_RELEASE_GATE_PASSED !== '1'"
  )
) {
  fail('Direct GitHub release creation is no longer blocked.');
}

for (const signal of [
  'npm run release:self-check',
  'npm test -- --runInBand',
  'npm run build',
  'npm run android:izzy-test',
  'git status --porcelain --untracked-files=no',
]) {
  if (!workflow.includes(signal)) {
    fail(`GitHub workflow is missing required step: ${signal}`);
  }
}

for (const signal of [
  'release/build-manifest.json',
  'manifest.apk?.path',
  'manifest.apk?.sha256',
  'assertApkMetadata',
  'assertSignedV2',
  'adb',
  'install',
  '-r',
]) {
  if (!installApk.includes(signal)) {
    fail(`Release installer is missing required check: ${signal}`);
  }
}

for (const requiredPath of [
  "package.json",
  "package-lock.json",
  "android/app/build.gradle",
  "scripts/mark-web-tested.js",
  "scripts/prepare-release.js",
  "scripts/install-apk.js",
  "scripts/create-github-release.js",
  "scripts/check-release-automation.js",
    ".github/workflows/android-release-sanity.yml",
    ".github/workflows/distribution-integrity.yml",
]) {
  if (!releaseCommon.includes(requiredPath)) {
    fail(
      `Preflight script hashes do not include: ${requiredPath}`
    );
  }
}

for (const signal of [
  'backup',
  'original',
  'copy',
  'temp',
  'source',
  'raw',
  'broken',
  'scope',
  'before-current',
  '.map',
]) {
  if (!releaseCommon.includes(signal)) {
    fail(`Asset hygiene is missing blocked signal: ${signal}`);
  }
}

for (const signal of [
  `const requiredOpening = "## What's new";`,
  'must not repeat the GitHub release title',
]) {
  if (!releaseCommon.includes(signal)) {
    fail(`Release-notes format guard is missing: ${signal}`);
  }
}

console.log('✅ Release safeguards are enforced by automation');
console.log('✅ Release automation wiring is complete');
console.log('✅ Direct publication remains blocked');
console.log('✅ Commit-bound preflight proof is required');
console.log('✅ Isolated unsigned Android build is required');
