#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  root,
  fallbackJavaHome,
  fail,
  run,
  output,
  sha256File,
  readVersionInfo,
  getHeadCommit,
  assertCleanSourceTreeExceptRelease,
  findAndroidSdk,
  assertApkMetadata,
  assertUnsigned,
  assertApkHygiene,
  publicAssetManifest,
  sanitizedBuildEnv,
} = require('./release-common');

function main() {
  assertCleanSourceTreeExceptRelease(root);

  const expected = readVersionInfo(root);
  const commit = getHeadCommit(root);
  const workDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kelani-izzy-')
  );
  const cloneDir = path.join(workDir, 'repo');
  const isolatedHome = path.join(workDir, 'home');
  const gradleHome = path.join(workDir, 'gradle');

  fs.mkdirSync(isolatedHome, { recursive: true });
  fs.mkdirSync(gradleHome, { recursive: true });

  console.log(`Izzy work directory: ${workDir}`);

  run('git', [
    'clone',
    '--no-local',
    root,
    cloneDir,
  ]);

  const cloneCommit = getHeadCommit(cloneDir);

  if (cloneCommit !== commit) {
    fail(
      `Clean clone commit mismatch: ` +
      `${cloneCommit} !== ${commit}`
    );
  }

  const sdkDir = findAndroidSdk(root);
  const javaHome =
    process.env.JAVA_HOME || fallbackJavaHome;

  fs.writeFileSync(
    path.join(cloneDir, 'android/local.properties'),
    `sdk.dir=${sdkDir}\n`
  );

  const env = sanitizedBuildEnv({
    HOME: isolatedHome,
    GRADLE_USER_HOME: gradleHome,
    ANDROID_HOME: sdkDir,
    ANDROID_SDK_ROOT: sdkDir,
    JAVA_HOME: javaHome,
    PATH:
      `${path.join(javaHome, 'bin')}:` +
      `${path.join(sdkDir, 'platform-tools')}:` +
      `${process.env.PATH}`,
    CI: 'true',
    GENERATE_SOURCEMAP: 'false',
    REACT_APP_VERSION: expected.versionName,
  });

  run('npm', ['ci'], {
    cwd: cloneDir,
    env,
  });

  run('npm', ['test', '--', '--runInBand'], {
    cwd: cloneDir,
    env,
  });

  run('npm', ['run', 'build'], {
    cwd: cloneDir,
    env,
  });

  run('npx', ['cap', 'sync', 'android'], {
    cwd: cloneDir,
    env,
  });

  run('./gradlew', [
    'clean',
    ':app:assembleRelease',
    '--no-build-cache',
    '--no-configuration-cache',
    '--no-daemon',
  ], {
    cwd: path.join(cloneDir, 'android'),
    env,
  });

  const outputDir = path.join(
    cloneDir,
    'android/app/build/outputs/apk/release'
  );

  const apkFiles = fs.readdirSync(outputDir)
    .filter(name => name.endsWith('.apk'))
    .map(name => path.join(outputDir, name));

  if (apkFiles.length !== 1) {
    fail(
      `Expected exactly one clean release APK, ` +
      `found ${apkFiles.length}`
    );
  }

  const cleanApk = apkFiles[0];

  if (!path.basename(cleanApk).includes('unsigned')) {
    fail(
      `Clean release APK is not explicitly unsigned: ` +
      `${cleanApk}`
    );
  }

  assertApkMetadata(cleanApk, expected, sdkDir);
  assertUnsigned(cleanApk, sdkDir);
  assertApkHygiene(cleanApk);

  const publicAssets = publicAssetManifest(cleanApk);
  const trackedStatus = output(
    'git',
    ['status', '--porcelain', '--untracked-files=no'],
    { cwd: cloneDir }
  );

  if (trackedStatus) {
    fail(
      `Clean clone changed tracked files:\n${trackedStatus}`
    );
  }

  const report = {
    schema: 1,
    generatedBy: 'scripts/test-izzy-build.js',
    commit,
    packageName: expected.packageName,
    versionName: expected.versionName,
    versionCode: expected.versionCode,
    workDir,
    cloneDir,
    cleanApk: {
      path: cleanApk,
      sha256: sha256File(cleanApk),
      sizeBytes: fs.statSync(cleanApk).size,
      signed: false,
    },
    publicAssets: {
      count: publicAssets.count,
      sha256: publicAssets.sha256,
    },
    checks: {
      cleanClone: true,
      npmCi: true,
      tests: true,
      productionBuild: true,
      capacitorSync: true,
      isolatedGradleHome: true,
      noSigningSecrets: true,
      noBuildCache: true,
      noConfigurationCache: true,
      cleanGradleBuild: true,
      unsignedApk: true,
      metadata: true,
      hygiene: true,
      repositoryClean: true,
    },
  };

  const reportPathValue =
    process.env.KELANI_IZZY_REPORT_PATH;
  const keepWorkDir =
    process.env.KELANI_IZZY_KEEP_WORKDIR === '1' ||
    Boolean(reportPathValue);

  if (reportPathValue) {
    const reportPath = path.resolve(root, reportPathValue);
    fs.mkdirSync(path.dirname(reportPath), {
      recursive: true,
    });
    fs.writeFileSync(
      reportPath,
      `${JSON.stringify(report, null, 2)}\n`
    );
    console.log(`Izzy report: ${reportPath}`);
  }

  console.log('\n✅ Isolated Izzy/NeoStore build passed');
  console.log(`✅ Clean unsigned APK: ${cleanApk}`);
  console.log(
    `✅ Public assets manifest: ${publicAssets.sha256}`
  );

  if (!keepWorkDir) {
    fs.rmSync(workDir, {
      recursive: true,
      force: true,
    });
  }
}

try {
  main();
} catch (error) {
  console.error(`\nERROR: ${error.message}`);
  process.exitCode = 1;
}
