const { assertInstalledPayload, assertInstallation, verifyPhoneProof } = require('../scripts/play-release-proof.cjs');

const expected = { packageName: 'com.example.app', versionName: '1.2.3', versionCode: 123 };
const installed = { installer: 'com.android.vending', ...expected };
const universal = { 'classes.dex': 'code', 'classes2.dex': 'more code',
  'assets/public/index.html': 'web', 'lib/arm64-v8a/native.so': 'arm',
  'lib/x86_64/native.so': 'x86' };
const arm = Object.fromEntries(Object.entries(universal).filter(([name]) => !name.includes('x86_64')));

test('accepts the exact Play version and rejects sideloads, missing installer and stale versions', () => {
  expect(() => assertInstallation(installed, expected)).not.toThrow();
  for (const change of [{ installer: null }, { installer: 'null' },
    { installer: 'com.obtainium' }, { versionCode: 122 }, { versionName: 'old' }]) {
    expect(() => assertInstallation({ ...installed, ...change }, expected)).toThrow(/Google Play/);
  }
});

test('matches code and assets plus the device ABI, without requiring universal APK packaging', () => {
  expect(assertInstalledPayload(universal, arm, ['arm64-v8a', 'armeabi-v7a'])).toBe(4);
});

test('rejects missing, changed and additional dex, web assets and native libraries', () => {
  for (const name of Object.keys(arm)) {
    expect(() => assertInstalledPayload(universal, { ...arm, [name]: 'changed' }, ['arm64-v8a'])).toThrow();
    const missing = { ...arm }; delete missing[name];
    expect(() => assertInstalledPayload(universal, missing, ['arm64-v8a'])).toThrow();
  }
  for (const name of ['classes3.dex', 'assets/extra', 'lib/arm64-v8a/extra.so']) {
    expect(() => assertInstalledPayload(universal, { ...arm, [name]: 'extra' }, ['arm64-v8a'])).toThrow();
  }
});

test('rejects absent, mixed and unsupported native ABIs and empty payloads', () => {
  expect(() => assertInstalledPayload(universal, universal, ['arm64-v8a', 'x86_64'])).toThrow(/ABI/);
  expect(() => assertInstalledPayload(universal, arm, ['x86_64'])).toThrow(/ABI/);
  expect(() => assertInstalledPayload({}, {}, [])).toThrow();
});

test('rejects legacy APK-copy proof and stale Play proof before reading archived phone files', () => {
  const build = { expected, manifest: { git: { commit: 'candidate' }, apk: { sha256: 'apk' } },
    bundle: { path: 'bundle', sha256: 'aab', metadataSha256: 'metadata' } };
  const valid = { schema: 2, delivery: 'google-play', confirmedByUser: true, commit: 'candidate',
    ...expected, apk: { sha256: 'apk' }, bundle: build.bundle,
    installed: { installer: 'com.android.vending', supportedAbis: ['arm64-v8a'],
      apks: [{ path: '../outside.apk', sha256: 'phone' }] } };
  const check = proof => verifyPhoneProof('/tmp/fictional-release', { readJson: () => proof }, build);
  for (const change of [{ schema: 1 }, { delivery: 'adb' }, { confirmedByUser: false },
    { commit: 'other' }, { packageName: 'other' }, { versionName: 'old' }, { versionCode: 122 },
    { apk: { sha256: 'other' } }, { bundle: { ...build.bundle, sha256: 'other' } },
    { installed: { ...valid.installed, apks: [] } }]) {
    expect(() => check({ ...valid, ...change })).toThrow(/stale Play/);
  }
  expect(() => check({ ...valid, installed: { ...valid.installed, installer: 'null' } })).toThrow(/Google Play/);
  expect(() => check(valid)).toThrow(/evidence path/);
  const changedArchive = { ...valid, installed: { ...valid.installed,
    apks: [{ path: 'release/play-phone-fixture/0.apk', sha256: 'original' }] } };
  expect(() => verifyPhoneProof('/tmp/fictional-release', {
    readJson: () => changedArchive, sha256File: () => 'changed',
  }, build)).toThrow(/Captured Play APK changed/);
});
