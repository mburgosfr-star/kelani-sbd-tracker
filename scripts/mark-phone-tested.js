#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

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
} = require('./release-common');

function main() {
  if (!process.argv.includes('--confirmed')) {
    fail(
      'Phone testing must be explicitly confirmed.\n' +
      'Run: npm run release:phone-tested -- --confirmed'
    );
  }

  assertCleanSourceTreeExceptRelease(root);

  run('node', [
    'scripts/check-release-build-manifest.js',
  ]);

  const expected = readVersionInfo(root);
  const commit = getHeadCommit(root);
  const manifest = readJson(
    path.join(root, 'release/build-manifest.json')
  );
  const publicApk = path.join(root, manifest.apk.path);
  const phoneApk = path.join(
    root,
    'release/kelani-sbd-tracker-phone-test.apk'
  );
  const proofPath = path.join(
    root,
    'release/phone-test-proof.json'
  );
  const preflightProof = path.join(
    root,
    'release/preflight-proof.json'
  );

  const devices = output('adb', ['devices'])
    .split('\n')
    .slice(1)
    .map(line => line.trim())
    .filter(line => /\tdevice$/.test(line))
    .map(line => line.split('\t')[0]);

  if (devices.length !== 1) {
    fail(
      `Expected exactly one connected Android device, ` +
      `found ${devices.length}`
    );
  }

  const packageInfo = output('adb', [
    '-s',
    devices[0],
    'shell',
    'dumpsys',
    'package',
    expected.packageName,
  ]);

  const installedVersionName =
    packageInfo.match(/versionName=([^\s]+)/)?.[1];
  const installedVersionCode =
    packageInfo.match(/versionCode=(\d+)/)?.[1];

  if (installedVersionName !== expected.versionName) {
    fail(
      `Installed versionName is ${installedVersionName}, ` +
      `expected ${expected.versionName}`
    );
  }

  if (
    installedVersionCode !== String(expected.versionCode)
  ) {
    fail(
      `Installed versionCode is ${installedVersionCode}, ` +
      `expected ${expected.versionCode}`
    );
  }

  fs.copyFileSync(publicApk, phoneApk);

  const apkHash = sha256File(publicApk);

  const proof = {
    schema: 1,
    confirmedByUser: true,
    confirmedAt: new Date().toISOString(),
    commit,
    packageName: expected.packageName,
    versionName: expected.versionName,
    versionCode: expected.versionCode,
    deviceSerial: devices[0],
    apk: {
      publicPath: path.relative(root, publicApk),
      phoneTestPath: path.relative(root, phoneApk),
      sha256: apkHash,
    },
  };

  fs.writeFileSync(
    proofPath,
    `${JSON.stringify(proof, null, 2)}\n`
  );

  fs.rmSync(preflightProof, { force: true });

  console.log('\n✅ Phone test recorded');
  console.log(`✅ Device: ${devices[0]}`);
  console.log(
    `✅ ${expected.versionName}/${expected.versionCode}`
  );
  console.log(`✅ APK SHA-256: ${apkHash}`);
}

try {
  main();
} catch (error) {
  console.error(`\nERROR: ${error.message}`);
  process.exitCode = 1;
}
