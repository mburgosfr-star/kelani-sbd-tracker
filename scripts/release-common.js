const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const packageName = 'com.kel.powerlifting';
const fallbackJavaHome = '/usr/lib/jvm/java-21-openjdk-amd64';

function fail(message) {
  const error = new Error(message);
  error.name = 'ReleaseError';
  throw error;
}

function run(command, args = [], options = {}) {
  const capture = Boolean(options.capture);
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? 'pipe' : 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    const stdout = capture ? String(result.stdout || '').trim() : '';
    const stderr = capture ? String(result.stderr || '').trim() : '';

    fail([
      `Command failed: ${command} ${args.join(' ')}`,
      stdout,
      stderr,
    ].filter(Boolean).join('\n'));
  }

  return capture ? String(result.stdout || '').trim() : '';
}

function output(command, args = [], options = {}) {
  return run(command, args, {
    ...options,
    capture: true,
  });
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256File(filePath) {
  if (!fs.existsSync(filePath)) fail(`Missing file: ${filePath}`);
  return sha256Buffer(fs.readFileSync(filePath));
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) fail(`Missing file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readVersionInfo(base = root) {
  const pkg = readJson(path.join(base, 'package.json'));
  const lock = readJson(path.join(base, 'package-lock.json'));
  const gradle = fs.readFileSync(
    path.join(base, 'android/app/build.gradle'),
    'utf8'
  );

  const versionName = pkg.version;
  const versionNameMatch = gradle.match(/versionName\s+"([^"]+)"/);
  const versionCodeMatch = gradle.match(/versionCode\s+(\d+)/);

  if (!versionName) fail('package.json version is missing.');
  if (!versionNameMatch) fail('Android versionName is missing.');
  if (!versionCodeMatch) fail('Android versionCode is missing.');

  if (versionNameMatch[1] !== versionName) {
    fail(
      `Android versionName mismatch: ` +
      `${versionNameMatch[1]} !== ${versionName}`
    );
  }

  if (lock.version && lock.version !== versionName) {
    fail(
      `package-lock.json version mismatch: ` +
      `${lock.version} !== ${versionName}`
    );
  }

  if (
    lock.packages?.['']?.version &&
    lock.packages[''].version !== versionName
  ) {
    fail(
      `package-lock root version mismatch: ` +
      `${lock.packages[''].version} !== ${versionName}`
    );
  }

  return {
    versionName,
    versionCode: Number(versionCodeMatch[1]),
    packageName,
  };
}

function getHeadCommit(base = root) {
  return output('git', ['rev-parse', 'HEAD'], { cwd: base });
}

function getStatusLines(base = root) {
  const status = output('git', ['status', '--porcelain'], {
    cwd: base,
  });

  return status
    .split('\n')
    .map(line => line.trimEnd())
    .filter(Boolean);
}

function assertCleanSourceTreeExceptRelease(base = root) {
  const bad = getStatusLines(base).filter(line => {
    const file = line.slice(3);
    return !file.startsWith('release/');
  });

  if (bad.length > 0) {
    fail(
      `Source tree has non-release changes:\n` +
      bad.map(line => `  ${line}`).join('\n')
    );
  }
}

function findAndroidSdk(base = root) {
  const localProperties = path.join(
    base,
    'android/local.properties'
  );

  if (fs.existsSync(localProperties)) {
    const match = fs
      .readFileSync(localProperties, 'utf8')
      .match(/^sdk\.dir=(.+)$/m);

    if (match && fs.existsSync(match[1].trim())) {
      return match[1].trim();
    }
  }

  for (const candidate of [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), 'Android/Sdk'),
  ]) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }

  fail('Could not determine Android SDK location.');
}

function findBuildTool(toolName, sdkDir) {
  const buildToolsDir = path.join(sdkDir, 'build-tools');

  if (!fs.existsSync(buildToolsDir)) {
    fail(`Android build-tools directory is missing: ${buildToolsDir}`);
  }

  const versions = fs.readdirSync(buildToolsDir)
    .sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    )
    .reverse();

  for (const version of versions) {
    const tool = path.join(buildToolsDir, version, toolName);
    if (fs.existsSync(tool)) return tool;
  }

  fail(`Could not find Android build tool: ${toolName}`);
}

function getApkMetadata(apkPath, sdkDir) {
  const aapt = findBuildTool('aapt', sdkDir);
  const badging = output(aapt, ['dump', 'badging', apkPath]);
  const line = badging
    .split('\n')
    .find(value => value.startsWith('package: '));

  if (!line) fail(`Package metadata missing in APK: ${apkPath}`);

  const name = line.match(/name='([^']+)'/)?.[1];
  const versionCode = line.match(/versionCode='([^']+)'/)?.[1];
  const versionName = line.match(/versionName='([^']+)'/)?.[1];

  if (!name || !versionCode || !versionName) {
    fail(`Could not parse APK metadata: ${apkPath}`);
  }

  return {
    name,
    versionCode,
    versionName,
  };
}

function assertApkMetadata(apkPath, expected, sdkDir) {
  const actual = getApkMetadata(apkPath, sdkDir);

  if (actual.name !== expected.packageName) {
    fail(
      `${apkPath} package is ${actual.name}, ` +
      `expected ${expected.packageName}`
    );
  }

  if (actual.versionCode !== String(expected.versionCode)) {
    fail(
      `${apkPath} versionCode is ${actual.versionCode}, ` +
      `expected ${expected.versionCode}`
    );
  }

  if (actual.versionName !== expected.versionName) {
    fail(
      `${apkPath} versionName is ${actual.versionName}, ` +
      `expected ${expected.versionName}`
    );
  }

  return actual;
}

function assertSignedV2(apkPath, sdkDir) {
  const apksigner = findBuildTool('apksigner', sdkDir);
  const result = spawnSync(
    apksigner,
    ['verify', '--verbose', '--print-certs', apkPath],
    {
      encoding: 'utf8',
      stdio: 'pipe',
    }
  );

  if (result.status !== 0) {
    fail(
      `Signed APK verification failed: ${apkPath}\n` +
      String(result.stdout || '') +
      String(result.stderr || '')
    );
  }

  const text =
    String(result.stdout || '') +
    String(result.stderr || '');

  if (
    !text.includes(
      'Verified using v2 scheme ' +
      '(APK Signature Scheme v2): true'
    )
  ) {
    fail(`APK does not have valid v2 signing: ${apkPath}`);
  }

  return text;
}

function assertUnsigned(apkPath, sdkDir) {
  const apksigner = findBuildTool('apksigner', sdkDir);
  const result = spawnSync(apksigner, ['verify', apkPath], {
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status === 0) {
    fail(`APK is unexpectedly signed: ${apkPath}`);
  }
}

function listApkEntries(apkPath) {
  return output('unzip', ['-Z1', apkPath])
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function assertApkHygiene(apkPath) {
  const entries = listApkEntries(apkPath);

  const allowedKelaniPublicAssets = new Set([
    "assets/public/kelani-banner.png",
    "assets/public/kelani-wordmark.png",
  ]);

  const blockedFragments = [
    "backup",
    "original",
    "broken",
    "scope",
    "before-current",
    "copy",
    "tmp",
    "temp",
    "source",
    "raw",
  ];

  const suspicious = entries.filter(entry => {
    const normalized = entry.replace(/\\/g, "/");

    if (!normalized.startsWith("assets/public/")) {
      return false;
    }

    const base = path.posix.basename(normalized).toLowerCase();

    if (
      base.endsWith(".map") ||
      base.endsWith(".orig") ||
      base.endsWith(".bak") ||
      blockedFragments.some(fragment => base.includes(fragment)) ||
      /20\d{6}[-_]\d{6}/.test(base)
    ) {
      return true;
    }

    return (
      base.includes("kelani") &&
      !allowedKelaniPublicAssets.has(normalized)
    );
  });

  if (suspicious.length > 0) {
    fail(
      `Blocked public APK assets in ${apkPath}:\n` +
      suspicious.map(entry => `  ${entry}`).join("\n")
    );
  }
}

function publicAssetManifest(apkPath) {
  const entries = listApkEntries(apkPath)
    .filter(entry =>
      entry.startsWith('assets/public/') &&
      !entry.endsWith('/')
    )
    .sort();

  const lines = entries.map(entry => {
    const content = execFileSync(
      'unzip',
      ['-p', apkPath, entry],
      { encoding: null }
    );

    return `${sha256Buffer(content)}  ${entry}`;
  });

  const text = `${lines.join('\n')}\n`;

  return {
    count: lines.length,
    text,
    sha256: sha256Buffer(Buffer.from(text)),
  };
}

function readReleaseNotes(version, base = root) {
  const relativePath = `release-notes-v${version}.md`;
  const fullPath = path.join(base, relativePath);

  if (!fs.existsSync(fullPath)) {
    fail(
      `Missing committed public release notes: ${relativePath}`
    );
  }

  const text = fs.readFileSync(fullPath, 'utf8').trim();

  if (!text) fail(`Release notes are empty: ${relativePath}`);

  const forbidden = [
    /izzy/i,
    /neostore/i,
    /neo\s*store/i,
    /preflight/i,
    /clean clone/i,
    /reproduc/i,
    /internal release/i,
  ];

  const hit = forbidden.find(pattern => pattern.test(text));
  if (hit) {
    fail(
      `Public release notes contain internal wording: ${hit}`
    );
  }

  return {
    relativePath,
    fullPath,
    text,
    sha256: sha256File(fullPath),
  };
}

function releaseScriptHashes(base = root) {
  const paths = [
    "package.json",
    "package-lock.json",
    "android/app/build.gradle",
    "scripts/build-release-apk.js",
    "scripts/install-apk.js",
    "scripts/test-izzy-build.js",
    "scripts/mark-phone-tested.js",
    "scripts/release-preflight.js",
    "scripts/guarded-release.js",
    "scripts/release-common.js",
    "scripts/create-github-release.js",
    "scripts/check-release-build-manifest.js",
    "scripts/check-release-apk-metadata.js",
    "scripts/check-release-apk-hygiene.js",
    "scripts/check-release-automation.js",
    "docs/RELEASE_CHECKLIST.md",
    "docs/release-checklist.md",
    ".github/workflows/android-release-sanity.yml",
  ];

  return Object.fromEntries(
    paths.map(relativePath => [
      relativePath,
      sha256File(path.join(base, relativePath)),
    ])
  );
}

function sanitizedBuildEnv(extra = {}) {
  const env = { ...process.env };

  for (const name of Object.keys(env)) {
    if (
      name.startsWith('KELANI_RELEASE_') ||
      name.startsWith('ORG_GRADLE_PROJECT_KELANI_')
    ) {
      delete env[name];
    }
  }

  return {
    ...env,
    ...extra,
  };
}

module.exports = {
  root,
  packageName,
  fallbackJavaHome,
  fail,
  run,
  output,
  sha256File,
  readJson,
  readVersionInfo,
  getHeadCommit,
  getStatusLines,
  assertCleanSourceTreeExceptRelease,
  findAndroidSdk,
  findBuildTool,
  getApkMetadata,
  assertApkMetadata,
  assertSignedV2,
  assertUnsigned,
  assertApkHygiene,
  publicAssetManifest,
  readReleaseNotes,
  releaseScriptHashes,
  sanitizedBuildEnv,
};
