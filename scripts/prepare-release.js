#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  root,
  fail,
  output,
  sha256File,
  readJson,
  readVersionInfo,
  getHeadCommit,
  assertCleanSourceTreeExceptRelease,
} = require('./release-common');

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function parseVersion(value) {
  if (!/^\d+\.\d+\.\d+$/.test(value || '')) {
    fail('Version must use the form X.Y.Z.');
  }

  return value.split('.').map(Number);
}

function isHigherVersion(next, current) {
  for (let index = 0; index < 3; index += 1) {
    if (next[index] > current[index]) return true;
    if (next[index] < current[index]) return false;
  }

  return false;
}

function localTagExists(tag) {
  return spawnSync(
    'git',
    ['show-ref', '--verify', '--quiet', `refs/tags/${tag}`],
    { cwd: root, stdio: 'ignore', shell: false }
  ).status === 0;
}

function main() {
  if (!process.argv.includes('--confirmed')) {
    fail(
      'Release preparation requires separate explicit permission.\n' +
      'Run: npm run release:prepare -- ' +
      '--version X.Y.Z --version-code N --confirmed'
    );
  }

  const targetVersion = argumentValue('--version');
  const targetVersionCode = Number(
    argumentValue('--version-code')
  );
  const nextVersion = parseVersion(targetVersion);

  if (
    !Number.isInteger(targetVersionCode) ||
    targetVersionCode <= 0
  ) {
    fail('versionCode must be a positive integer.');
  }

  assertCleanSourceTreeExceptRelease(root);

  const branch = output('git', [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ]);

  if (branch !== 'main') {
    fail(`Release preparation must run from main, not ${branch}.`);
  }

  const current = readVersionInfo(root);
  const currentVersion = parseVersion(current.versionName);
  const sourceCommit = getHeadCommit(root);

  if (!isHigherVersion(nextVersion, currentVersion)) {
    fail(
      `${targetVersion} must be higher than ${current.versionName}.`
    );
  }

  if (targetVersionCode <= current.versionCode) {
    fail(
      `versionCode ${targetVersionCode} must be higher than ` +
      `${current.versionCode}.`
    );
  }

  const releaseDir = path.join(root, 'release');
  const webProofPath = path.join(
    releaseDir,
    'web-test-proof.json'
  );
  const preparationProofPath = path.join(
    releaseDir,
    'release-preparation-proof.json'
  );
  const notesPath = path.join(
    root,
    `release-notes-v${targetVersion}.md`
  );

  if (!fs.existsSync(webProofPath)) {
    fail(
      'Missing web-test proof. First run:\n' +
      'npm run release:web-tested -- --confirmed'
    );
  }

  const webProof = readJson(webProofPath);

  if (
    webProof.schema !== 1 ||
    webProof.generatedBy !== 'scripts/mark-web-tested.js' ||
    webProof.confirmedByUser !== true ||
    webProof.visibleWebTestPassed !== true ||
    webProof.commit !== sourceCommit ||
    webProof.versionName !== current.versionName ||
    webProof.versionCode !== current.versionCode
  ) {
    fail(
      'Web-test proof does not match current HEAD and version.'
    );
  }

  if (fs.existsSync(notesPath)) {
    fail(
      `Release notes already exist: ${path.basename(notesPath)}`
    );
  }

  const tag = `v${targetVersion}`;

  if (localTagExists(tag)) {
    fail(`Local tag ${tag} already exists.`);
  }

  const remoteTag = output('git', [
    'ls-remote',
    'origin',
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ]);

  if (remoteTag) {
    fail(`Remote tag ${tag} already exists.`);
  }

  const files = [
    'package.json',
    'package-lock.json',
    'android/app/build.gradle',
  ];

  const originals = Object.fromEntries(
    files.map(file => [
      file,
      fs.readFileSync(path.join(root, file), 'utf8'),
    ])
  );

  try {
    const pkg = JSON.parse(originals['package.json']);
    const lock = JSON.parse(originals['package-lock.json']);

    pkg.version = targetVersion;
    lock.version = targetVersion;

    if (lock.packages?.['']) {
      lock.packages[''].version = targetVersion;
    }

    fs.writeFileSync(
      path.join(root, 'package.json'),
      `${JSON.stringify(pkg, null, 2)}\n`
    );
    fs.writeFileSync(
      path.join(root, 'package-lock.json'),
      `${JSON.stringify(lock, null, 2)}\n`
    );

    let gradle = originals['android/app/build.gradle'];

    const oldName = `versionName "${current.versionName}"`;
    const oldCode = `versionCode ${current.versionCode}`;

    if (
      gradle.split(oldName).length !== 2 ||
      gradle.split(oldCode).length !== 2
    ) {
      fail('Could not identify the current Android version fields.');
    }

    gradle = gradle
      .replace(oldName, `versionName "${targetVersion}"`)
      .replace(oldCode, `versionCode ${targetVersionCode}`);

    fs.writeFileSync(
      path.join(root, 'android/app/build.gradle'),
      gradle
    );

    const prepared = readVersionInfo(root);

    if (
      prepared.versionName !== targetVersion ||
      prepared.versionCode !== targetVersionCode
    ) {
      fail('Prepared version fields do not match the request.');
    }

    fs.mkdirSync(releaseDir, { recursive: true });

    fs.writeFileSync(
      preparationProofPath,
      `${JSON.stringify({
        schema: 1,
        generatedBy: 'scripts/prepare-release.js',
        confirmedByUser: true,
        confirmedAt: new Date().toISOString(),
        sourceCommit,
        sourceVersion: current.versionName,
        sourceVersionCode: current.versionCode,
        targetVersion,
        targetVersionCode,
        webTestCommit: webProof.commit,
        webTestProofSha256: sha256File(webProofPath),
      }, null, 2)}\n`
    );
  } catch (error) {
    for (const [file, text] of Object.entries(originals)) {
      fs.writeFileSync(path.join(root, file), text);
    }

    fs.rmSync(preparationProofPath, { force: true });
    throw error;
  }

  console.log('\n✅ Release preparation explicitly authorized');
  console.log(`✅ Source commit: ${sourceCommit}`);
  console.log(
    `✅ ${current.versionName}/${current.versionCode} → ` +
    `${targetVersion}/${targetVersionCode}`
  );
}

try {
  main();
} catch (error) {
  console.error(`\nERROR: ${error.message}`);
  process.exitCode = 1;
}
