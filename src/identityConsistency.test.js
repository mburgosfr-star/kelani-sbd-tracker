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

// The official GitHub owner/repo. There is no single importable source for
// this the way there is for the package ID (it is not build config, just
// a string repeated in docs, links and a couple of scripts), so this test
// file is itself the source of truth it checks everything else against.
const REPO_SLUG = 'mburgosfr-star/kelani-sbd-tracker';
// Matches any "github.com/<owner>/kelani-sbd-tracker" link regardless of
// owner, so a typo'd or swapped owner is caught rather than silently
// accepted because the repo name half still matched.
const REPO_URL_PATTERN = /github\.com\/([\w.-]+)\/kelani-sbd-tracker/g;
// Same reasoning for the official IzzyOnDroid download location: catches a
// link that still looks like an IzzyOnDroid package page but points at the
// wrong Android package.
const IZZY_PACKAGE_PATTERN = /apt\.izzysoft\.de\/packages\/([\w.-]+)/g;

function findAll(text, pattern) {
  return Array.from(text.matchAll(pattern), match => match[0]);
}

function findAllGroups(text, pattern) {
  return Array.from(text.matchAll(pattern), match => match[1]);
}

function expectOnlyPackageId(relativePath) {
  const matches = findAll(read(relativePath), PACKAGE_ID_PATTERN);
  expect(matches.length).toBeGreaterThan(0);
  expect(new Set(matches)).toEqual(new Set([packageName]));
}

function expectOnlyOfficialRepoLinks(relativePath) {
  const owners = findAllGroups(read(relativePath), REPO_URL_PATTERN);
  expect(owners.length).toBeGreaterThan(0);
  expect(new Set(owners)).toEqual(new Set([REPO_SLUG.split('/')[0]]));
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

test('README, VERIFY, BRANDING and the safety doc only ever link to the official repository', () => {
  expectOnlyOfficialRepoLinks('README.md');
  expectOnlyOfficialRepoLinks('VERIFY.md');
  expectOnlyOfficialRepoLinks('BRANDING.md');
  expectOnlyOfficialRepoLinks('docs/google-play-data-safety.md');
});

test('VERIFY.md and README point at the real official download locations', () => {
  const verify = read('VERIFY.md');
  const readme = read('README.md');

  // Official repository, releases page and IzzyOnDroid package - not just
  // "a github.com link", but the exact expected paths.
  expect(verify).toContain(`https://github.com/${REPO_SLUG}\``);
  expect(verify).toContain(`https://github.com/${REPO_SLUG}/releases\``);
  expect(verify).toContain(`https://apt.izzysoft.de/packages/${packageName}\``);
  expect(readme).toContain(`https://github.com/${REPO_SLUG}/releases/latest`);
  expect(readme).toContain(`https://apt.izzysoft.de/packages/${packageName}`);

  const izzyPackages = new Set([
    ...findAllGroups(verify, IZZY_PACKAGE_PATTERN),
    ...findAllGroups(readme, IZZY_PACKAGE_PATTERN),
  ]);
  expect(izzyPackages).toEqual(new Set([packageName]));
});

test('the distribution-integrity check script targets the official repository', () => {
  const distributionCheck = read('scripts/check-distribution.js');
  expect(distributionCheck).toMatch(
    new RegExp(`defaultRepository\\s*=\\s*'${REPO_SLUG}'`)
  );
  expect(distributionCheck).toMatch(
    new RegExp(`trustedSourceRepository\\s*=\\s*'${REPO_SLUG}'`)
  );
});

test('the in-app Support and About sections only ever link to the official repository', () => {
  expectOnlyOfficialRepoLinks('src/App.js');
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
