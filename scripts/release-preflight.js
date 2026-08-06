#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  root,
  fail,
  run,
  sha256File,
  readJson,
  readVersionInfo,
  getHeadCommit,
  assertCleanSourceTreeExceptRelease,
  findAndroidSdk,
  assertApkMetadata,
  assertSignedV2,
  assertUnsigned,
  assertApkHygiene,
  publicAssetManifest,
  findMatchingCiRun,
  fetchCiPublicAssetsSha256,
  readReleaseNotes,
  releaseScriptHashes,
  assertReleasePreparationProof,
} = require('./release-common');

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function main() {
  assertCleanSourceTreeExceptRelease(root);

  const expected = readVersionInfo(root);
  const commit = getHeadCommit(root);
  const releasePreparation =
    assertReleasePreparationProof(root);
  const notes = readReleaseNotes(
    expected.versionName,
    root
  );

  run('node', [
    'scripts/check-release-build-manifest.js',
  ]);

  const manifest = readJson(
    path.join(root, 'release/build-manifest.json')
  );
  const publicApk = path.join(root, manifest.apk.path);
  const publicSha = path.join(
    root,
    `release/kelani-sbd-tracker-v` +
    `${expected.versionName}.apk.sha256`
  );
  const phoneApk = path.join(
    root,
    'release/kelani-sbd-tracker-phone-test.apk'
  );
  const phoneProofPath = path.join(
    root,
    'release/phone-test-proof.json'
  );
  const izzyReportPath = path.join(
    root,
    'release/izzy-report.json'
  );
  const proofPath = path.join(
    root,
    'release/preflight-proof.json'
  );

  if (!fs.existsSync(phoneProofPath)) {
    fail(
      'Missing phone-test proof. Run:\n' +
      'npm run release:phone-tested -- --confirmed'
    );
  }

  const phoneProof = readJson(phoneProofPath);
  const publicHash = sha256File(publicApk);
  const phoneHash = sha256File(phoneApk);

  if (
    phoneProof.commit !== commit ||
    phoneProof.versionName !== expected.versionName ||
    phoneProof.versionCode !== expected.versionCode ||
    phoneProof.apk?.sha256 !== publicHash ||
    phoneHash !== publicHash
  ) {
    fail(
      'Phone-test proof does not match the current ' +
      'commit and release APK.'
    );
  }

  const shaText = fs.readFileSync(publicSha, 'utf8');
  if (!shaText.includes(publicHash)) {
    fail('Public SHA file does not match the release APK.');
  }

  fs.rmSync(izzyReportPath, { force: true });
  fs.rmSync(proofPath, { force: true });

  const sdkDir = findAndroidSdk(root);
  const localAssets = publicAssetManifest(publicApk);

  assertApkMetadata(publicApk, expected, sdkDir);
  assertSignedV2(publicApk, sdkDir);
  assertApkHygiene(publicApk);

  // Optional fast path: if a workflow run already built and verified this
  // exact commit cleanly on CI, reuse its result instead of repeating the
  // ~2 minute isolated clean-clone rebuild locally. Safety over speed: any
  // ambiguity at all (gh missing, no run, more than one run, log fetch
  // failure, more than one distinct hash) falls back to the full local
  // rebuild below, no exceptions. A real hash mismatch is NOT treated as
  // ambiguous — it fails loudly, the same way a local rebuild mismatch
  // always has.
  const ciRun = findMatchingCiRun(commit);
  const ciAssetsSha256 = ciRun
    ? fetchCiPublicAssetsSha256(ciRun.databaseId)
    : null;

  let cleanBuild;

  if (ciRun && ciAssetsSha256) {
    if (ciAssetsSha256 !== localAssets.sha256) {
      fail(
        'Public assets differ from the verified CI build for this ' +
        `commit (workflow run ${ciRun.databaseId}).`
      );
    }

    console.log(
      `\n✅ Reusing verified CI build for commit ${commit} ` +
      `(workflow run ${ciRun.databaseId}) — skipping local clean-clone rebuild`
    );

    cleanBuild = {
      source: 'ci',
      workflowRunId: ciRun.databaseId,
      workflowRunUrl: ciRun.url,
      ciRunCompletedAt: ciRun.updatedAt,
      verifiedAt: new Date().toISOString(),
      publicAssetsSha256: ciAssetsSha256,
    };
  } else {
    run('node', [
      'scripts/test-izzy-build.js',
    ], {
      env: {
        ...process.env,
        KELANI_IZZY_REPORT_PATH:
          path.relative(root, izzyReportPath),
        KELANI_IZZY_KEEP_WORKDIR: '1',
      },
    });

    const izzy = readJson(izzyReportPath);
    const cleanApk = izzy.cleanApk?.path;

    if (
      izzy.commit !== commit ||
      izzy.versionName !== expected.versionName ||
      izzy.versionCode !== expected.versionCode ||
      !cleanApk ||
      !fs.existsSync(cleanApk)
    ) {
      fail('Izzy report does not match this release.');
    }

    assertApkMetadata(cleanApk, expected, sdkDir);
    assertUnsigned(cleanApk, sdkDir);
    assertApkHygiene(cleanApk);

    const cleanAssets = publicAssetManifest(cleanApk);

    if (
      localAssets.sha256 !== cleanAssets.sha256 ||
      localAssets.text !== cleanAssets.text
    ) {
      fail(
        'Signed and clean unsigned APK public assets differ.'
      );
    }

    cleanBuild = {
      source: 'local',
      reportPath: path.relative(root, izzyReportPath),
      cleanApkSha256: izzy.cleanApk.sha256,
      publicAssetsSha256: cleanAssets.sha256,
      checks: izzy.checks,
    };

    fs.rmSync(izzy.workDir, { recursive: true, force: true });
  }

  const scripts = releaseScriptHashes(root);

  const proof = {
    schema: 1,
    generatedBy: 'scripts/release-preflight.js',
    createdAt: new Date().toISOString(),
    commit,
    packageName: expected.packageName,
    versionName: expected.versionName,
    versionCode: expected.versionCode,
    releasePreparation: {
      sourceCommit:
        releasePreparation.preparationProof.sourceCommit,
      webTestCommit:
        releasePreparation.webProof.commit,
      preparationProofSha256:
        sha256File(
          releasePreparation.preparationProofPath
        ),
      webTestProofSha256:
        sha256File(releasePreparation.webProofPath),
    },
    releaseNotes: {
      path: notes.relativePath,
      sha256: notes.sha256,
    },
    apk: {
      publicPath: path.relative(root, publicApk),
      phoneTestPath: path.relative(root, phoneApk),
      sha256: publicHash,
      sizeBytes: fs.statSync(publicApk).size,
      signedV2: true,
    },
    phoneTest: {
      proofPath: path.relative(root, phoneProofPath),
      confirmedAt: phoneProof.confirmedAt,
      deviceSerial: phoneProof.deviceSerial,
      valid: true,
    },
    cleanBuild,
    scripts,
    checks: {
      sourceClean: true,
      webTestProof: true,
      releasePreparationProof: true,
      buildManifest: true,
      phoneTestProof: true,
      apkHashesMatch: true,
      packageMetadata: true,
      localV2Signing: true,
      cleanUnsignedBuild: true,
      publicAssetsByteIdentical: true,
      assetHygiene: true,
      releaseNotesSafe: true,
    },
  };

  if (!sameJson(scripts, releaseScriptHashes(root))) {
    fail('Release scripts changed during preflight.');
  }

  fs.writeFileSync(
    proofPath,
    `${JSON.stringify(proof, null, 2)}\n`
  );

  console.log(
    '\n✅ IZZY/NEOSTORE-PREFLIGHT VOLLEDIG GESLAAGD'
  );
  console.log(`✅ Commit: ${commit}`);
  console.log(`✅ APK SHA-256: ${publicHash}`);
  console.log(`✅ Proof: ${path.relative(root, proofPath)}`);
}

try {
  main();
} catch (error) {
  console.error(`\nERROR: ${error.message}`);
  process.exitCode = 1;
}
