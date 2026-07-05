#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const version = pkg.version;
const packageName = 'com.kel.powerlifting';

const javaHome = '/usr/lib/jvm/java-21-openjdk-amd64';
const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  PATH: `${path.join(javaHome, 'bin')}:${process.env.PATH}`,
  REACT_APP_VERSION: version,
  GENERATE_SOURCEMAP: 'false',
};

const releaseDir = path.join(root, 'release');
const publicApkRel = `release/kelani-sbd-tracker-v${version}.apk`;
const publicShaRel = `release/kelani-sbd-tracker-v${version}.apk.sha256`;
const phoneApkRel = 'release/kelani-sbd-tracker-phone-test.apk';
const manifestRel = 'release/build-manifest.json';

const publicApk = path.join(root, publicApkRel);
const publicSha = path.join(root, publicShaRel);
const phoneApk = path.join(root, phoneApkRel);
const manifestPath = path.join(root, manifestRel);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  console.log(`\n> ${[command, ...args].join(' ')}`);
  try {
    execFileSync(command, args, {
      cwd: options.cwd || root,
      stdio: 'inherit',
      env: options.env || env,
    });
  } catch {
    fail(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function output(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd || root,
      encoding: 'utf8',
      env: options.env || env,
    }).trim();
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
  const status = output('git', ['status', '--porcelain']);
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

function removeOldReleaseInputs() {
  fs.mkdirSync(releaseDir, { recursive: true });

  for (const filePath of [publicApk, publicSha, phoneApk, manifestPath]) {
    fs.rmSync(filePath, { force: true });
  }
}

const versionCode = readExpectedVersionCode();
const commit = output('git', ['rev-parse', 'HEAD']);

assertCleanSourceTreeExceptRelease();
removeOldReleaseInputs();

run('npm', ['run', 'build']);
run('npx', ['cap', 'sync', 'android']);

assertCleanSourceTreeExceptRelease();

run('./gradlew', ['clean', ':app:assembleRelease', '--no-daemon'], {
  cwd: path.join(root, 'android'),
});

const builtApk = path.join(root, 'android/app/build/outputs/apk/release/app-release.apk');
const unsignedApk = path.join(root, 'android/app/build/outputs/apk/release/app-release-unsigned.apk');

if (!fs.existsSync(builtApk)) {
  if (fs.existsSync(unsignedApk)) {
    fail('Only unsigned release APK was produced. Refusing to create release artifact.');
  }
  fail('Expected signed release APK not found: android/app/build/outputs/apk/release/app-release.apk');
}

fs.copyFileSync(builtApk, publicApk);
const hash = sha256File(publicApk);

fs.writeFileSync(publicSha, `${hash}  ${publicApkRel}\n`);

const manifest = {
  schema: 1,
  builtBy: 'scripts/build-release-apk.js',
  createdAt: new Date().toISOString(),
  git: {
    commit,
    dirty: false,
  },
  packageName,
  versionName: version,
  versionCode: Number(versionCode),
  gradle: {
    clean: true,
    task: 'clean :app:assembleRelease --no-daemon',
  },
  apk: {
    path: publicApkRel,
    sha256: hash,
    sizeBytes: fs.statSync(publicApk).size,
  },
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

run('node', ['scripts/check-release-build-manifest.js']);
run('node', ['scripts/check-release-apk-metadata.js'], {
  env: {
    ...env,
    KELANI_APK_METADATA_FILES: publicApkRel,
  },
});
run('node', ['scripts/check-release-apk-hygiene.js'], {
  env: {
    ...env,
    KELANI_APK_HYGIENE_FILES: publicApkRel,
  },
});

console.log(`\n✅ release APK built from clean source state: ${publicApkRel}`);
console.log(`✅ sha256: ${hash}`);
console.log('Next: install this APK on the phone, test it, then copy it to release/kelani-sbd-tracker-phone-test.apk.');
