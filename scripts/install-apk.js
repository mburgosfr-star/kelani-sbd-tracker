#!/usr/bin/env node

const path = require("path");

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
} = require("./release-common");

function main() {
  assertCleanSourceTreeExceptRelease(root);

  run("node", [
    "scripts/check-release-build-manifest.js",
  ]);

  const expected = readVersionInfo(root);
  const commit = getHeadCommit(root);
  const manifest = readJson(
    path.join(root, "release/build-manifest.json")
  );

  if (manifest.git?.commit !== commit) {
    fail(
      "Build manifest does not belong to the current commit."
    );
  }

  const apkPath = path.join(root, manifest.apk?.path || "");

  if (sha256File(apkPath) !== manifest.apk?.sha256) {
    fail("Release APK checksum differs from the build manifest.");
  }

  const sdkDir = findAndroidSdk(root);

  assertApkMetadata(apkPath, expected, sdkDir);
  assertSignedV2(apkPath, sdkDir);

  console.log(`Installing exact release APK: ${apkPath}`);
  console.log(`Commit: ${commit}`);
  console.log(`SHA-256: ${manifest.apk.sha256}`);

  run("adb", ["install", "-r", apkPath]);

  console.log("\n✅ Exact manifest-bound release APK installed");
}

try {
  main();
} catch (error) {
  console.error(`\nERROR: ${error.message}`);
  process.exitCode = 1;
}
