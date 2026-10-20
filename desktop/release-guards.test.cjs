const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { guard, validateProofIdentity, validatePreflight, compareApplications, publicationArguments } = require('../scripts/ubuntu-release.cjs');

const identity = { commit: 'abc', sourceHash: 'source', version: '2.0.59', revision: 4, packageVersion: '2.0.59~prototype.4', tag: 'ubuntu-v2.0.59-prototype.4' };
test('Ubuntu evidence rejects a changed commit, source, version, revision, tag or proof phase', () => {
  const proof = { schema: 1, generatedBy: 'scripts/ubuntu-release.cjs', phase: 'build', ...identity };
  assert.doesNotThrow(() => validateProofIdentity(proof, identity, 'build'));
  for (const key of Object.keys(identity)) {
    assert.throws(() => validateProofIdentity({ ...proof, [key]: 'changed' }, identity, 'build'));
  }
  assert.throws(() => validateProofIdentity(proof, identity, 'tested'));
  assert.throws(() => validateProofIdentity({ ...proof, generatedBy: 'other' }, identity, 'build'));
});
test('Ubuntu preflight binds package, notes, clean build, approval and desktop-test evidence', () => {
  const build = { sha256: 'package', notesSha256: 'notes' };
  const hashes = { buildProofSha256: 'build-proof', testedProofSha256: 'desktop-proof', preparationProofSha256: 'approval-proof' };
  const proof = { ...build, ...hashes, cleanClone: true, identicalApplication: true };
  assert.doesNotThrow(() => validatePreflight(proof, build, hashes));
  for (const key of Object.keys(proof)) {
    assert.throws(() => validatePreflight({ ...proof, [key]: 'changed' }, build, hashes));
  }
});
test('desktop approval cannot be reused for changed, extra or missing application bytes', () => {
  const application = { 'asar:build/app.js': 'app', 'resources/rest-timer.wav': 'sound', 'kelani-desktop-prototype': 'electron' };
  compareApplications(application, { ...application });
  for (const key of Object.keys(application)) {
    assert.throws(() => compareApplications(application, { ...application, [key]: 'changed' }));
    const removed = { ...application }; delete removed[key];
    assert.throws(() => compareApplications(application, removed));
  }
  assert.throws(() => compareApplications(application, { ...application, unexpected: 'extra' }));
});
test('publication refuses missing final approval before running external commands', async () => {
  await assert.rejects(guard({ publish: true }), /separate explicit approval/);
});
test('the Ubuntu helper cannot directly publish outside the canonical entry point', () => {
  const result = spawnSync(process.execPath, ['scripts/ubuntu-release.cjs', 'publish', '--confirmed'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /canonical npm run release:check or release:publish/);
});
test('Ubuntu publication cannot use an Android tag or become the stable Latest release', () => {
  const options = { tag: identity.tag, packageVersion: identity.packageVersion, deb: 'package.deb', publishedNotes: 'notes.md' };
  const args = publicationArguments(options);
  for (const flag of ['--prerelease', '--latest=false', '--verify-tag', '--notes-file']) assert(args.includes(flag));
  assert(!args.includes('--generate-notes'));
  assert.throws(() => publicationArguments({ ...options, tag: 'v2.0.59' }));
});
