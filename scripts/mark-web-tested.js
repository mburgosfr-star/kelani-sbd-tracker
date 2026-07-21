#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  root,
  fail,
  output,
  readVersionInfo,
  getHeadCommit,
  assertCleanSourceTreeExceptRelease,
} = require('./release-common');

function main() {
  if (!process.argv.includes('--confirmed')) {
    fail(
      'A visible web test must be explicitly confirmed.\n' +
      'Run: npm run release:web-tested -- --confirmed'
    );
  }

  assertCleanSourceTreeExceptRelease(root);

  const branch = output('git', [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ]);

  if (branch !== 'main') {
    fail(
      `Web-test confirmation must run from main, not ${branch}.`
    );
  }

  const version = readVersionInfo(root);
  const commit = getHeadCommit(root);
  const releaseDir = path.join(root, 'release');
  const proofPath = path.join(
    releaseDir,
    'web-test-proof.json'
  );

  fs.mkdirSync(releaseDir, { recursive: true });

  const proof = {
    schema: 1,
    generatedBy: 'scripts/mark-web-tested.js',
    confirmedByUser: true,
    confirmedAt: new Date().toISOString(),
    visibleWebTestPassed: true,
    branch,
    commit,
    packageName: version.packageName,
    versionName: version.versionName,
    versionCode: version.versionCode,
  };

  fs.writeFileSync(
    proofPath,
    `${JSON.stringify(proof, null, 2)}\n`
  );

  for (const staleFile of [
    'release-preparation-proof.json',
    'build-manifest.json',
    'phone-test-proof.json',
    'preflight-proof.json',
  ]) {
    fs.rmSync(
      path.join(releaseDir, staleFile),
      { force: true }
    );
  }

  console.log('\n✅ Visible web test recorded');
  console.log(`✅ Commit: ${commit}`);
  console.log(
    `✅ Version: ${version.versionName}/${version.versionCode}`
  );
  console.log(
    '✅ Release preparation still requires separate explicit permission'
  );
}

try {
  main();
} catch (error) {
  console.error(`\nERROR: ${error.message}`);
  process.exitCode = 1;
}
