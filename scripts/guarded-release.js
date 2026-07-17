#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  root,
  fail,
  run,
  output,
  sha256File,
  readJson,
  readVersionInfo,
  getHeadCommit,
  assertCleanSourceTreeExceptRelease,
  readReleaseNotes,
  releaseScriptHashes,
} = require('./release-common');

const releaseMode = process.argv.includes('--release');
const checkOnly =
  process.argv.includes('--check') || !releaseMode;

function commandSucceeds(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    stdio: 'ignore',
    shell: false,
  }).status === 0;
}

function remoteTagCommit(tag) {
  const text = output('git', [
    'ls-remote',
    'origin',
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ]);

  if (!text) return null;

  const lines = text.split('\n').filter(Boolean);
  const peeled = lines.find(line =>
    line.endsWith(`refs/tags/${tag}^{}`)
  );
  const direct = lines.find(line =>
    line.endsWith(`refs/tags/${tag}`)
  );

  return (peeled || direct)?.split(/\s+/)[0] || null;
}

function main() {
  assertCleanSourceTreeExceptRelease(root);

  const expected = readVersionInfo(root);
  const commit = getHeadCommit(root);
  const tag = `v${expected.versionName}`;

  const branch = output('git', [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ]);

  if (branch !== 'main') {
    fail(`Release must run from main, not ${branch}.`);
  }

  run('node', [
    'scripts/check-release-build-manifest.js',
  ]);

  const proofPath = path.join(
    root,
    'release/preflight-proof.json'
  );

  if (!fs.existsSync(proofPath)) {
    fail(
      'Missing preflight proof. Run:\n' +
      'npm run release:preflight'
    );
  }

  const proof = readJson(proofPath);
  const notes = readReleaseNotes(
    expected.versionName,
    root
  );
  const publicApk = path.join(root, proof.apk?.publicPath || '');
  const phoneApk = path.join(
    root,
    proof.apk?.phoneTestPath || ''
  );
  const publicSha = path.join(
    root,
    `release/kelani-sbd-tracker-v` +
    `${expected.versionName}.apk.sha256`
  );

  if (
    proof.schema !== 1 ||
    proof.generatedBy !==
      'scripts/release-preflight.js' ||
    proof.commit !== commit ||
    proof.packageName !== expected.packageName ||
    proof.versionName !== expected.versionName ||
    proof.versionCode !== expected.versionCode
  ) {
    fail(
      'Preflight proof does not match HEAD and version.'
    );
  }

  const publicHash = sha256File(publicApk);
  const phoneHash = sha256File(phoneApk);

  if (
    publicHash !== proof.apk.sha256 ||
    phoneHash !== proof.apk.sha256
  ) {
    fail('Release APK changed after preflight.');
  }

  const shaText = fs.readFileSync(publicSha, 'utf8');
  if (!shaText.includes(publicHash)) {
    fail('SHA file changed after preflight.');
  }

  if (
    notes.relativePath !== proof.releaseNotes?.path ||
    notes.sha256 !== proof.releaseNotes?.sha256
  ) {
    fail('Release notes changed after preflight.');
  }

  const currentScriptHashes = releaseScriptHashes(root);
  if (
    JSON.stringify(currentScriptHashes) !==
    JSON.stringify(proof.scripts)
  ) {
    fail('Release automation changed after preflight.');
  }

  if (
    !proof.checks?.sourceClean ||
    !proof.checks?.phoneTestProof ||
    !proof.checks?.localV2Signing ||
    !proof.checks?.cleanUnsignedBuild ||
    !proof.checks?.publicAssetsByteIdentical ||
    !proof.checks?.assetHygiene
  ) {
    fail('Preflight proof is incomplete.');
  }

  run('git', ['fetch', 'origin', 'main', '--tags']);

  const originMain = output('git', [
    'rev-parse',
    'origin/main',
  ]);

  if (
    !commandSucceeds('git', [
      'merge-base',
      '--is-ancestor',
      originMain,
      commit,
    ])
  ) {
    fail(
      'HEAD has diverged from origin/main. ' +
      'Resolve it before release.'
    );
  }

  const localTagExists = commandSucceeds('git', [
    'show-ref',
    '--verify',
    '--quiet',
    `refs/tags/${tag}`,
  ]);

  if (localTagExists) {
    const localTagCommit = output('git', [
      'rev-list',
      '-n',
      '1',
      tag,
    ]);

    if (localTagCommit !== commit) {
      fail(`${tag} exists locally on another commit.`);
    }
  }

  const remoteCommit = remoteTagCommit(tag);
  if (remoteCommit && remoteCommit !== commit) {
    fail(`${tag} exists remotely on another commit.`);
  }

  const releaseExists = commandSucceeds('gh', [
    'release',
    'view',
    tag,
  ]);

  if (releaseExists) {
    fail(
      `GitHub Release ${tag} already exists. ` +
      `It must never be overwritten.`
    );
  }

  if (checkOnly) {
    console.log('\n✅ Release gate passed');
    console.log(
      originMain === commit
        ? '✅ main is already pushed'
        : '✅ main can be fast-forward pushed'
    );
    console.log(
      remoteCommit
        ? `✅ ${tag} already points to HEAD`
        : `✅ ${tag} can be created`
    );
    return;
  }

  if (originMain !== commit) {
    run('git', ['push', 'origin', 'main']);
  }

  if (!localTagExists) {
    run('git', [
      '-c',
      'tag.gpgSign=false',
      'tag',
      '-a',
      tag,
      '-m',
      `Kelani SBD Tracker ${tag}`,
    ]);
  }

  if (!remoteCommit) {
    run('git', ['push', 'origin', tag]);
  }

  run('gh', [
    'release',
    'create',
    tag,
    publicApk,
    publicSha,
    '--verify-tag',
    '--title',
    `Kelani SBD Tracker ${tag}`,
    '--notes-file',
    notes.fullPath,
  ]);

  console.log(`\n✅ GitHub Release ${tag} created`);
  console.log(`✅ APK SHA-256: ${publicHash}`);
}

try {
  main();
} catch (error) {
  console.error(`\nERROR: ${error.message}`);
  process.exitCode = 1;
}
