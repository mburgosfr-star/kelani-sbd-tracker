const { assertCandidateProof, bundlePath, assertPayloadMatches } = require('../scripts/build-play-bundle.cjs');

const manifest = { git: { commit: 'tested-commit' }, packageName: 'com.kelani.sbdtracker',
  versionName: '2.0.61', versionCode: 161, apk: { sha256: 'tested-apk' } };
const proof = { commit: manifest.git.commit, ci: { runId: 123, publicAssetsSha256: 'assets' } };

test('builds a Play bundle before a phone test, only for the staged CI candidate', () => {
  expect(() => assertCandidateProof(proof, manifest, 'assets')).not.toThrow();
  for (const change of [{ commit: 'other' }, { ci: null },
    { ci: { runId: 0, publicAssetsSha256: 'assets' } }, { ci: { runId: 123 } }]) {
    expect(() => assertCandidateProof({ ...proof, ...change }, manifest, 'assets')).toThrow(/staged candidate/);
  }
  expect(() => assertCandidateProof(proof, manifest, 'different-assets')).toThrow();
  expect(() => assertCandidateProof(proof, manifest)).toThrow();
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
