#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = process.cwd();
const pkg = require(path.join(root, 'package.json'));
const version = pkg.version;

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function listApkEntries(apkPath) {
  try {
    return execFileSync('unzip', ['-Z1', apkPath], { encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    fail(`Could not inspect APK with unzip: ${apkPath}`);
  }
}

const envFiles = process.env.KELANI_APK_HYGIENE_FILES
  ? process.env.KELANI_APK_HYGIENE_FILES.split(':').filter(Boolean)
  : null;

const apkFiles = envFiles || [
  `release/kelani-sbd-tracker-phone-test.apk`,
  `release/kelani-sbd-tracker-v${version}.apk`,
];

const allowedKelaniPublicAssets = new Set([
  'assets/public/kelani-banner.png',
  'assets/public/kelani-wordmark.png',
]);

const bannedPublicAssetPatterns = [
  /(^|\/)[^/]*\.original[^/]*$/i,
  /(^|\/)[^/]*original-[^/]*$/i,
  /(^|\/)[^/]*\.orig[^/]*$/i,
  /(^|\/)[^/]*backup[^/]*$/i,
  /(^|\/)[^/]*\.bak[^/]*$/i,
  /(^|\/)[^/]*copy[^/]*$/i,
  /(^|\/)[^/]*tmp[^/]*$/i,
  /(^|\/)[^/]*temp[^/]*$/i,
  /(^|\/)[^/]*source[^/]*$/i,
  /(^|\/)[^/]*raw[^/]*$/i,
  /20\d{6}[-_]\d{6}/,
];

for (const apkFile of apkFiles) {
  const apkPath = path.resolve(root, apkFile);

  if (!fs.existsSync(apkPath)) {
    fail(`Missing APK for hygiene check: ${apkFile}`);
  }

  const entries = listApkEntries(apkPath);
  const badEntries = [];

  for (const entry of entries) {
    const normalized = entry.replace(/\\/g, '/');

    if (!normalized.startsWith('assets/public/')) {
      continue;
    }

    if (bannedPublicAssetPatterns.some((pattern) => pattern.test(normalized))) {
      badEntries.push(normalized);
      continue;
    }

    const base = path.posix.basename(normalized).toLowerCase();

    if (base.includes('kelani') && !allowedKelaniPublicAssets.has(normalized)) {
      badEntries.push(normalized);
    }
  }

  if (badEntries.length > 0) {
    console.error(`ERROR: APK contains blocked temporary/public asset entries: ${apkFile}`);
    for (const entry of badEntries) {
      console.error(`  - ${entry}`);
    }
    process.exit(1);
  }

  console.log(`✅ APK asset hygiene check passed: ${apkFile}`);
}
