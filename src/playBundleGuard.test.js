const { assertPhoneProof, bundlePath, assertPayloadMatches } = require('../scripts/build-play-bundle.cjs');

const manifest = { git: { commit: 'tested-commit' }, packageName: 'com.kelani.sbdtracker',
  versionName: '2.0.61', versionCode: 161, apk: { sha256: 'tested-apk' } };
const proof = { schema: 1, confirmedByUser: true, commit: 'tested-commit',
  packageName: manifest.packageName, versionName: manifest.versionName, versionCode: 161,
  apk: { sha256: 'tested-apk' } };

test('requires phone confirmation for the exact APK, commit and identity', () => {
  expect(() => assertPhoneProof(proof, manifest)).not.toThrow();
  for (const change of [{ confirmedByUser: false }, { commit: 'other' },
    { packageName: 'other' }, { versionCode: 162 }, { versionName: 'other' },
    { apk: { sha256: 'other' } }, { schema: 2 }]) {
    expect(() => assertPhoneProof({ ...proof, ...change }, manifest)).toThrow(/matching confirmed phone test/);
  }
});

const apk = { 'classes.dex': Buffer.from('code'), 'assets/public/index.html': Buffer.from('web'),
  'lib/arm64-v8a/library.so': Buffer.from('native') };
const bundle = Object.fromEntries(Object.entries(apk).map(([name, data]) => [bundlePath(name), data]));
const compare = (a = apk, b = bundle) => assertPayloadMatches(Object.keys(a), Object.keys(b), n => a[n], n => b[n]);

test('compares all application code, web assets and native libraries', () => {
  expect(compare()).toBe(3);
});

test('rejects changed, missing or additional application payload', () => {
  for (const name of Object.keys(bundle)) {
    expect(() => compare(apk, { ...bundle, [name]: Buffer.from('changed') })).toThrow(/differ/);
    const missing = { ...bundle };
    delete missing[name];
    expect(() => compare(apk, missing)).toThrow(/differ/);
  }
  expect(() => compare(apk, { ...bundle, 'base/assets/extra': Buffer.from('extra') })).toThrow(/differ/);
  expect(() => compare(apk, { ...bundle, 'base/dex/classes2.dex': Buffer.from('extra') })).toThrow(/differ/);
});

test('rejects empty archives without comparing zero files as success', () => {
  expect(() => compare({}, {})).toThrow(/differ/);
});

test('excludes only the two APK-specific compiled baseline profiles', () => {
  expect(compare({ ...apk, 'assets/dexopt/baseline.prof': Buffer.from('profile'),
    'assets/dexopt/baseline.profm': Buffer.from('profile metadata') })).toBe(3);
  expect(() => compare({ ...apk, 'assets/dexopt/other': Buffer.from('unexpected') })).toThrow(/differ/);
});
