const fs = require('fs');
const path = require('path');
const { packageName, releaseCertificateSha256 } = require('../scripts/release-common');

const root = path.join(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

// Every occurrence of a com.kelani.* Android application ID anywhere in the
// repository must be this exact string. scripts/release-common.js is the
// single source of truth; every other file below is expected to either
// import it directly or, where that is not possible (Gradle, XML, Markdown),
// simply repeat the same literal. This test is what actually enforces that,
// since nothing at build time otherwise notices one of these silently
// drifting from the others.
const PACKAGE_ID_PATTERN = /com\.kelani\.[a-zA-Z0-9_.]+/g;

// Same reasoning for the release signing-certificate SHA-256 fingerprint:
// scripts/release-common.js is the source of truth that actually gates
// releases (see check-release-apk-metadata.js), VERIFY.md documents it for
// users, and the in-app "About" screen shows it directly.
const SHA256_PATTERN = /\b[0-9a-f]{64}\b/g;

function findAll(text, pattern) {
  return Array.from(text.matchAll(pattern), match => match[0]);
}

function expectOnlyPackageId(relativePath) {
  const matches = findAll(read(relativePath), PACKAGE_ID_PATTERN);
  expect(matches.length).toBeGreaterThan(0);
  expect(new Set(matches)).toEqual(new Set([packageName]));
}

test('release-common.js exports the canonical package ID and certificate fingerprint', () => {
  expect(packageName).toBe('com.kelani.sbdtracker');
  expect(releaseCertificateSha256).toMatch(/^[0-9a-f]{64}$/);
});

test('the release-gating check scripts import the package ID instead of redeclaring it', () => {
  expect(read('scripts/check-release-build-manifest.js'))
    .toMatch(/require\(['"]\.\/release-common['"]\)/);
  expect(read('scripts/check-release-apk-metadata.js'))
    .toMatch(/require\(['"]\.\/release-common['"]\)/);
});

test('the Android Gradle build declares the canonical package ID', () => {
  expectOnlyPackageId('android/app/build.gradle');
});

test('the Android strings.xml declares the canonical package ID', () => {
  expectOnlyPackageId('android/app/src/main/res/values/strings.xml');
});

test('capacitor.config.ts declares the canonical package ID', () => {
  const source = read('capacitor.config.ts');
  const [appIdLine] = source.match(/appId:\s*'([^']+)'/) || [];
  expect(appIdLine).toBeTruthy();
  expectOnlyPackageId('capacitor.config.ts');
});

test('the synced Capacitor asset config has not drifted from capacitor.config.ts', () => {
  const synced = JSON.parse(read('android/app/src/main/assets/capacitor.config.json'));
  expect(synced.appId).toBe(packageName);
});

test('README, VERIFY and BRANDING only ever mention the canonical package ID', () => {
  expectOnlyPackageId('README.md');
  expectOnlyPackageId('VERIFY.md');
  expectOnlyPackageId('BRANDING.md');
  expectOnlyPackageId('docs/google-play-data-safety.md');
});

test('VERIFY.md documents the exact certificate fingerprint release-common.js enforces', () => {
  const shaMatches = findAll(read('VERIFY.md'), SHA256_PATTERN);
  expect(shaMatches).toEqual([releaseCertificateSha256]);
});

test('the in-app About screen shows the exact package ID and certificate fingerprint', () => {
  const source = read('src/App.js');
  const aboutSectionMatch = source.match(
    /function AboutSection[\s\S]*?\n}\n/
  );
  expect(aboutSectionMatch).toBeTruthy();
  const aboutSectionSource = aboutSectionMatch[0];

  expect(new Set(findAll(aboutSectionSource, PACKAGE_ID_PATTERN)))
    .toEqual(new Set([packageName]));
  expect(findAll(aboutSectionSource, SHA256_PATTERN)).toEqual([releaseCertificateSha256]);
});
