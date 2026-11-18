const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { assertion, client, digest } = require('./play-api-client.cjs');
const { hash, assertPlan, assertApproval, assertNoPending, checkBundle, stage, submit } = require('./play-publisher.cjs');
const bytes = Buffer.from('fictional bundle');
const plan = { schema: 1, track: 'alpha', packageName: 'com.example.test', commit: 'commit',
  versionName: '1.2.3', versionCode: 123, bundleSha256: digest(bytes), bundleMetadataSha256: 'metadata',
  release: { name: '123 (1.2.3)', versionCodes: ['123'], status: 'completed',
    releaseNotes: ['ca', 'en-US', 'nl-NL'].map(language => ({ language, text: 'Approved text' })) }, listingChanges: [] };
const build = { expected: { packageName: plan.packageName, versionName: plan.versionName, versionCode: plan.versionCode },
  manifest: { git: { commit: plan.commit } }, bundle: { sha256: plan.bundleSha256, metadataSha256: plan.bundleMetadataSha256 } };
const clone = x => JSON.parse(JSON.stringify(x));
const published = { releases: [{ releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_PUBLISHED' }] };
function fake() {
  const state = { tracks: { tracks: [{ track: 'alpha', releases: [] }, { track: 'production', releases: [] }] },
    listings: { listings: [{ language: 'en-US', title: 'Original' }] }, bundles: { bundles: [] } };
  const calls = [];
  const api = { releases: async () => clone(published), request: async (method, url, data) => {
    calls.push({ method, url, data });
    if (method === 'POST' && url.endsWith('/edits')) return { id: '123456' };
    if (url.includes('/bundles?')) { const upload = { versionCode: 123, sha256: digest(bytes) }; state.bundles.bundles.push(upload); return upload; }
    if (method === 'PUT') { state.tracks.tracks[0] = clone(data); return data; }
    if (url.endsWith(':validate') || url.includes(':commit')) return {};
    return clone(state[url.split('/').at(-1)]);
  } };
  return { api, calls, state };
}
test('binds Alpha plan to exact candidate, notes, version and payload', () => {
  assertPlan(plan, build);
  for (const change of [{ track: 'production' }, { commit: 'other' }, { versionCode: 124 },
    { bundleSha256: 'other' }, { bundleMetadataSha256: 'other' }, { unexpected: true },
    { release: { ...plan.release, userFraction: 0.5 } },
    { release: { ...plan.release, releaseNotes: [] } }]) assert.throws(() => assertPlan({ ...plan, ...change }, build));
});
test('requires separate approval bound to exact plan contents', () => {
  assertApproval(plan, hash(plan), true);
  assert.throws(() => assertApproval(plan, hash(plan), false));
  assert.throws(() => assertApproval({ ...plan, listingChanges: [{ language: 'nl-NL' }] }, hash(plan), true));
});
test('rejects pending, rejected, missing and unknown track state', () => {
  assertNoPending(published);
  for (const state of [{}, { releases: [{}] }, { releases: [{ releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_IN_REVIEW' }] },
    { releases: [{ releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_NOT_APPROVED' }] }]) assert.throws(() => assertNoPending(state));
});
test('checks uploaded version and exact SHA before track mutation', () => {
  checkBundle({ versionCode: 123, sha256: digest(bytes) }, plan);
  assert.throws(() => checkBundle({ versionCode: 124, sha256: digest(bytes) }, plan));
  assert.throws(() => checkBundle({ versionCode: 123, sha256: 'changed' }, plan));
});
test('status is GET only and does not create or invalidate edits', async () => {
  const calls = [];
  const api = client('test-token', async (url, options) => { calls.push({ url, ...options }); return { ok: true, json: async () => published }; });
  assert.deepEqual(await api.releases(plan.packageName), published);
  assert.equal(calls.length, 1); assert.equal(calls[0].method, 'GET'); assert.ok(!calls[0].url.includes('/edits'));
});
test('no redirects or raw server bodies can leak a token into diagnostics', async () => {
  const api = client('private-token', async (_, opts) => {
    assert.equal(opts.redirect, 'error');
    return { ok: false, status: 403, json: () => { throw new Error('Do not read secret body'); } };
  });
  await assert.rejects(api.releases(plan.packageName), /^Error: Google Play request failed \(HTTP 403\)/);
});
test('JWT has exact official audience, narrow scope, expiry and a valid RSA signature', () => {
  const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const credentials = { type: 'service_account', client_email: 'test@example.iam.gserviceaccount.com',
    token_uri: 'https://oauth2.googleapis.com/token', private_key_id: 'test', private_key: keys.privateKey };
  const jwt = assertion(credentials, 1000); const parts = jwt.split('.');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
  assert.equal(claims.aud, credentials.token_uri); assert.equal(claims.exp - claims.iat, 3600);
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/androidpublisher');
  assert.ok(crypto.verify('RSA-SHA256', Buffer.from(parts.slice(0, 2).join('.')), keys.publicKey, Buffer.from(parts[2], 'base64url')));
  assert.throws(() => assertion({ ...credentials, token_uri: 'https://untrusted.example/token' }));
});
test('stages and validates without committing or changing production', async () => {
  const { api, calls, state } = fake(); const saved = [];
  const receipt = await stage(api, plan, bytes, hash(plan), true, r => saved.push(clone(r)));
  assert.equal(receipt.state, 'validated'); assert.equal(saved[0].state, 'staging');
  assert.ok(!calls.some(c => c.url.includes(':commit')));
  assert.deepEqual(state.tracks.tracks[1], { track: 'production', releases: [] });
});
test('staging stops before any mutation when approval, bytes or review state differ', async () => {
  const { api, calls } = fake();
  await assert.rejects(stage(api, plan, bytes, 'wrong', true, () => {}));
  await assert.rejects(stage(api, plan, Buffer.from('wrong'), hash(plan), true, () => {}));
  api.releases = async () => ({ releases: [{ releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_IN_REVIEW' }] });
  await assert.rejects(stage(api, plan, bytes, hash(plan), true, () => {}));
  assert.equal(calls.length, 0);
});
test('changed approved store baseline stops before upload', async () => {
  const { api, calls } = fake();
  const changed = { ...plan, listingChanges: [{ language: 'en-US', before: { title: 'Stale' }, after: { title: 'Approved' } }] };
  await assert.rejects(stage(api, changed, bytes, hash(changed), true, () => {}), /changed since approval/);
  assert.ok(!calls.some(c => c.url.includes('/bundles?') || c.method === 'PATCH' || c.method === 'PUT'));
});
test('submission needs separate confirmation and records uncertainty before commit', async () => {
  const { api, calls } = fake();
  const receipt = await stage(api, plan, bytes, hash(plan), true, () => {}); const saved = [];
  await assert.rejects(submit(api, receipt, hash(plan), true, false, () => {}));
  await submit(api, receipt, hash(plan), true, true, r => saved.push(clone(r)));
  assert.equal(saved[0].state, 'submission-started'); assert.equal(saved[1].state, 'submitted');
  assert.ok(calls.at(-1).url.endsWith(':commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW'));
  await assert.rejects(submit(api, receipt, hash(plan), true, true, () => {}));
});
test('a concurrent change or ambiguous commit cannot be blindly retried', async () => {
  const first = fake(); const changed = await stage(first.api, plan, bytes, hash(plan), true, () => {});
  first.state.listings.listings[0].title = 'Concurrent change';
  await assert.rejects(submit(first.api, changed, hash(plan), true, true, () => {}), /changed since staging/);
  const second = fake(); const uncertain = await stage(second.api, plan, bytes, hash(plan), true, () => {});
  const request = second.api.request;
  second.api.request = async (...args) => { if (args[1].includes(':commit')) throw new Error('timeout'); return request(...args); };
  await assert.rejects(submit(second.api, uncertain, hash(plan), true, true, () => {}), /timeout/);
  assert.equal(uncertain.state, 'submission-started');
  await assert.rejects(submit(second.api, uncertain, hash(plan), true, true, () => {}), /validated/);
});
