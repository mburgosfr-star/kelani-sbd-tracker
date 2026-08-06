const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const packageName = 'com.kelani.sbdtracker';
const releaseCertificateSha256 = '15d23f2e5ee95ebc2a530b48be6f27dad7a568f722bc819f4571b3470a2ff39d';
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

  const certificateSha256 = text.match(
    /certificate SHA-256 digest:\s*([0-9a-f]+)/i
  )?.[1]?.toLowerCase();

  if (certificateSha256 !== releaseCertificateSha256) {
    fail(
      `APK signer certificate is ${certificateSha256 || 'missing'}, ` +
      `expected ${releaseCertificateSha256}: ${apkPath}`
    );
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

// Looks for exactly one successful `workflow` run on `branch` whose headSha
// is an exact match for `commit`. Never throws: any deviation from a clean,
// unambiguous result (gh missing/unauthenticated, non-zero exit, timeout,
// unparsable output, zero or multiple matches) returns null so the caller
// always has a safe, explicit "no evidence" signal to fall back on.
function findMatchingCiRun(commit, {
  workflow = 'android-release-sanity.yml',
  branch = 'main',
  timeoutMs = 20000,
} = {}) {
  const result = spawnSync('gh', [
    'run', 'list',
    '--workflow', workflow,
    '--branch', branch,
    '--commit', commit,
    '--status', 'success',
    '--json', 'databaseId,headSha,status,conclusion,createdAt,updatedAt,url',
    '--limit', '20',
  ], {
    cwd: root,
    encoding: 'utf8',
    timeout: timeoutMs,
  });

  if (result.error || result.signal || result.status !== 0 || !result.stdout) {
    return null;
  }

  let runs;

  try {
    runs = JSON.parse(result.stdout);
  } catch {
    return null;
  }

  if (!Array.isArray(runs)) return null;

  // Never trust --commit filtering alone: confirm the exact SHA ourselves.
  const matches = runs.filter(entry =>
    entry &&
    entry.headSha === commit &&
    entry.status === 'completed' &&
    entry.conclusion === 'success'
  );

  return matches.length === 1 ? matches[0] : null;
}

// Extracts the sha256 that scripts/test-izzy-build.js printed as
// "Public assets manifest: <sha256>" from a CI run's full log. Returns null
// (never throws) unless the log yields exactly one distinct hash, so a
// missing run, fetch failure, timeout, or unexpected/duplicate log content
// all fall back the same way as findMatchingCiRun.
function fetchCiPublicAssetsSha256(runId, { timeoutMs = 30000 } = {}) {
  const result = spawnSync('gh', [
    'run', 'view', String(runId), '--log',
  ], {
    cwd: root,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 64,
  });

  if (result.error || result.signal || result.status !== 0 || !result.stdout) {
    return null;
  }

  const hashes = [...result.stdout.matchAll(
    /Public assets manifest:\s*([0-9a-f]{64})/g
  )].map(match => match[1]);

  const distinct = [...new Set(hashes)];

  return distinct.length === 1 ? distinct[0] : null;
}

function readReleaseNotes(version, base = root) {
  const relativePath = `docs/releases/release-notes-v${version}.md`;
  const fullPath = path.join(base, relativePath);

  if (!fs.existsSync(fullPath)) {
    fail(
      `Missing committed public release notes: ${relativePath}`
    );
  }

  const text = fs.readFileSync(fullPath, 'utf8').trim();

  if (!text) fail(`Release notes are empty: ${relativePath}`);

  const requiredOpening = "## What's new";
  const firstLine = text.split(/\r?\n/, 1)[0];

  if (firstLine !== requiredOpening) {
    fail(
      `Release notes must start with "${requiredOpening}" and ` +
      `must not repeat the GitHub release title: ${relativePath}`
    );
  }

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
    "scripts/mark-web-tested.js",
    "scripts/prepare-release.js",
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
    "scripts/check-distribution.js",
    "scripts/check-release-automation.js",
    ".github/workflows/android-release-sanity.yml",
    ".github/workflows/distribution-integrity.yml",
  ];

  return Object.fromEntries(
    paths.map(relativePath => [
      relativePath,
      sha256File(path.join(base, relativePath)),
    ])
  );
}

function assertReleasePreparationProof(base = root) {
  const current = readVersionInfo(base);
  const releaseCommit = getHeadCommit(base);
  const releaseDir = path.join(base, 'release');

  const webProofPath = path.join(
    releaseDir,
    'web-test-proof.json'
  );
  const preparationProofPath = path.join(
    releaseDir,
    'release-preparation-proof.json'
  );

  if (!fs.existsSync(webProofPath)) {
    fail(
      'Missing web-test proof. Run:\n' +
      'npm run release:web-tested -- --confirmed'
    );
  }

  if (!fs.existsSync(preparationProofPath)) {
    fail(
      'Missing release-preparation proof. Explicit permission is required:\n' +
      'npm run release:prepare -- ' +
      '--version X.Y.Z --version-code N --confirmed'
    );
  }

  const webProof = readJson(webProofPath);
  const preparationProof = readJson(preparationProofPath);

  if (
    webProof.schema !== 1 ||
    webProof.generatedBy !== 'scripts/mark-web-tested.js' ||
    webProof.confirmedByUser !== true ||
    webProof.visibleWebTestPassed !== true
  ) {
    fail('Web-test proof is invalid or was not explicitly confirmed.');
  }

  if (
    preparationProof.schema !== 1 ||
    preparationProof.generatedBy !==
      'scripts/prepare-release.js' ||
    preparationProof.confirmedByUser !== true
  ) {
    fail(
      'Release preparation is invalid or was not explicitly confirmed.'
    );
  }

  if (
    preparationProof.webTestProofSha256 !==
      sha256File(webProofPath) ||
    preparationProof.sourceCommit !== webProof.commit ||
    preparationProof.webTestCommit !== webProof.commit ||
    preparationProof.sourceVersion !== webProof.versionName ||
    preparationProof.sourceVersionCode !== webProof.versionCode
  ) {
    fail(
      'Release preparation does not match the confirmed visible web test.'
    );
  }

  if (
    current.versionName !== preparationProof.targetVersion ||
    current.versionCode !== preparationProof.targetVersionCode
  ) {
    fail(
      'Current version fields do not match the explicitly approved release.'
    );
  }

  const parentCommit = output(
    'git',
    ['rev-parse', `${releaseCommit}^`],
    { cwd: base }
  );

  if (parentCommit !== preparationProof.sourceCommit) {
    fail(
      'The release commit must directly follow the web-tested feature commit.'
    );
  }

  const expectedPaths = [
    'android/app/build.gradle',
    'package-lock.json',
    'package.json',
    `docs/releases/release-notes-v${current.versionName}.md`,
  ].sort();

  const changedPaths = output(
    'git',
    [
      'diff',
      '--name-only',
      preparationProof.sourceCommit,
      releaseCommit,
    ],
    { cwd: base }
  )
    .split('\n')
    .filter(Boolean)
    .sort();

  if (
    JSON.stringify(changedPaths) !==
    JSON.stringify(expectedPaths)
  ) {
    fail(
      'Release commit contains unexpected or missing files.\n' +
      `Expected exactly:\n  ${expectedPaths.join('\n  ')}\n` +
      `Found:\n  ${changedPaths.join('\n  ')}`
    );
  }

  return {
    webProof,
    webProofPath,
    preparationProof,
    preparationProofPath,
  };
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
  releaseCertificateSha256,
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
  findMatchingCiRun,
  fetchCiPublicAssetsSha256,
  readReleaseNotes,
  releaseScriptHashes,
  assertReleasePreparationProof,
  sanitizedBuildEnv,
};
