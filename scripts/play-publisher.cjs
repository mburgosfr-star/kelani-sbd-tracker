#!/usr/bin/env node
// Guarded closed-test publication. No production track, tester, billing or account mutations.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { client, serviceToken, digest } = require('./play-api-client.cjs');
const { isDeepStrictEqual } = require('node:util');
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const hash = value => digest(canonical(value));
const LANGUAGES = ['ca', 'en-US', 'nl-NL'];
const PUBLISHED = 'RELEASE_LIFECYCLE_STATE_PUBLISHED';

function assertPlan(plan, build) {
  if (plan.schema !== 1 || plan.track !== 'alpha' || plan.packageName !== build.expected.packageName ||
      plan.commit !== build.manifest.git.commit || plan.versionName !== build.expected.versionName ||
      plan.versionCode !== build.expected.versionCode || plan.bundleSha256 !== build.bundle.sha256 ||
      plan.bundleMetadataSha256 !== build.bundle.metadataSha256) throw new Error('Stale or unsupported Play plan.');
  const keys = ['schema', 'track', 'packageName', 'commit', 'versionName', 'versionCode',
    'bundleSha256', 'bundleMetadataSha256', 'release', 'listingChanges'];
  if (Object.keys(plan).some(key => !keys.includes(key)) ||
      plan.release?.name !== `${plan.versionCode} (${plan.versionName})` ||
      plan.release?.status !== 'completed' ||
      !isDeepStrictEqual(plan.release.versionCodes, [String(plan.versionCode)]) ||
      Object.keys(plan.release).some(key => !['name', 'status', 'versionCodes', 'releaseNotes'].includes(key))) {
    throw new Error('The plan must contain only the exact full Alpha rollout.');
  }
  const notes = plan.release.releaseNotes;
  if (!Array.isArray(notes) || notes.length !== LANGUAGES.length ||
      new Set(notes.map(note => note.language)).size !== LANGUAGES.length ||
      notes.some(note => !LANGUAGES.includes(note.language) || typeof note.text !== 'string' ||
        !note.text.trim() || [...note.text].length > 500 || Object.keys(note).some(k => !['language', 'text'].includes(k)))) {
    throw new Error('Expected the three approved release notes, each at most 500 characters.');
  }
  if (!Array.isArray(plan.listingChanges) || new Set(plan.listingChanges.map(c => c.language)).size !== plan.listingChanges.length ||
      plan.listingChanges.some(change => !LANGUAGES.includes(change.language) ||
        Object.keys(change).sort().join(',') !== 'after,before,language' ||
        !Object.keys(change.after || {}).length ||
        Object.keys(change.after).some(field => !['title', 'shortDescription', 'fullDescription', 'video'].includes(field)) ||
        !isDeepStrictEqual(Object.keys(change.before || {}).sort(), Object.keys(change.after || {}).sort()) ||
        Object.values(change.before).some(v => typeof v !== 'string') ||
        Object.values(change.after).some(v => typeof v !== 'string'))) throw new Error('Invalid exact before/after listing changes.');
}

function assertApproval(plan, approvedHash, confirmed) {
  if (confirmed !== true || approvedHash !== hash(plan)) throw new Error('Separate approval of this exact Play plan is required.');
}
function assertNoPending(releases) {
  if (!Array.isArray(releases?.releases) || releases.releases.some(r => r.releaseLifecycleState !== PUBLISHED)) {
    throw new Error('The track has pending, rejected or unknown releases. Resolve these before staging another release.');
  }
}
function checkBundle(upload, plan) {
  if (String(upload.versionCode) !== String(plan.versionCode) || upload.sha256 !== plan.bundleSha256) {
    throw new Error('Google upload does not match the candidate version and SHA-256.');
  }
}
function verifyListingChanges(listings, changes) {
  for (const change of changes) {
    const listing = listings.listings?.find(l => l.language === change.language);
    if (!listing || Object.entries(change.before).some(([key, value]) => listing[key] !== value)) {
      throw new Error(`Store text changed since approval (${change.language}). Review a new plan.`);
    }
  }
}
async function snapshot(api, base) {
  return { tracks: await api.request('GET', `${base}/tracks`),
    listings: await api.request('GET', `${base}/listings`),
    bundles: await api.request('GET', `${base}/bundles`) };
}
async function stage(api, plan, bytes, approvedHash, confirmed, persist) {
  assertApproval(plan, approvedHash, confirmed);
  if (digest(bytes) !== plan.bundleSha256) throw new Error('Bundle changed before upload.');
  assertNoPending(await api.releases(plan.packageName, plan.track));
  const prefix = `/applications/${encodeURIComponent(plan.packageName)}/edits`;
  const edit = await api.request('POST', prefix, {});
  if (!/^[A-Za-z0-9_-]+$/.test(edit.id || '')) throw new Error('Invalid Google edit identifier.');
  const base = `${prefix}/${edit.id}`;
  // Persist immediately: an uncertain upload is never retried blindly with a new edit/version.
  const receipt = { schema: 1, planHash: hash(plan), editId: edit.id, state: 'staging', plan };
  persist(receipt);
  const before = await snapshot(api, base);
  verifyListingChanges(before.listings, plan.listingChanges);
  if (before.bundles.bundles?.some(b => String(b.versionCode) === String(plan.versionCode))) {
    throw new Error('This version code is already uploaded. Inspect the saved edit before continuing.');
  }
  const uploaded = await api.request('POST', `${base}/bundles?uploadType=media`, bytes, true);
  checkBundle(uploaded, plan);
  for (const change of plan.listingChanges) {
    await api.request('PATCH', `${base}/listings/${encodeURIComponent(change.language)}`, change.after);
  }
  await api.request('PUT', `${base}/tracks/alpha`, { track: 'alpha', releases: [plan.release] });
  await api.request('POST', `${base}:validate`);
  const expected = await snapshot(api, base);
  const target = expected.tracks.tracks?.find(t => t.track === 'alpha');
  if (!isDeepStrictEqual(target?.releases, [plan.release])) throw new Error('Google returned unexpected release content.');
  if ((expected.tracks.tracks || []).length !== (before.tracks.tracks || []).length ||
      (expected.listings.listings || []).length !== (before.listings.listings || []).length ||
      (expected.bundles.bundles || []).length !== (before.bundles.bundles || []).length + 1 ||
      (before.bundles.bundles || []).some(old => !isDeepStrictEqual(old,
        expected.bundles.bundles?.find(b => String(b.versionCode) === String(old.versionCode))))) {
    throw new Error('Unexpected additional track, listing or bundle change.');
  }
  for (const old of before.tracks.tracks || []) {
    if (old.track !== 'alpha' && !isDeepStrictEqual(old, expected.tracks.tracks?.find(t => t.track === old.track))) {
      throw new Error('An unrelated track changed. Refusing submission.');
    }
  }
  for (const listing of before.listings.listings || []) {
    const change = plan.listingChanges.find(c => c.language === listing.language);
    if (!isDeepStrictEqual({ ...listing, ...(change?.after || {}) },
      expected.listings.listings?.find(l => l.language === listing.language))) throw new Error('Unexpected store listing change.');
  }
  checkBundle(expected.bundles.bundles?.find(b => String(b.versionCode) === String(plan.versionCode)) || {}, plan);
  Object.assign(receipt, { state: 'validated', expected, stagedAt: new Date().toISOString() });
  persist(receipt);
  return receipt;
}
async function submit(api, receipt, approvedHash, confirmed, consoleReviewed, persist) {
  assertApproval(receipt.plan, approvedHash, confirmed);
  if (receipt.schema !== 1 || receipt.planHash !== hash(receipt.plan) || receipt.state !== 'validated' ||
      !/^[A-Za-z0-9_-]+$/.test(receipt.editId) || consoleReviewed !== true) {
    throw new Error('A validated edit and review of all pending Console changes are required.');
  }
  assertNoPending(await api.releases(receipt.plan.packageName, 'alpha'));
  const base = `/applications/${encodeURIComponent(receipt.plan.packageName)}/edits/${receipt.editId}`;
  if (!isDeepStrictEqual(await snapshot(api, base), receipt.expected)) throw new Error('Google edit changed since staging.');
  await api.request('POST', `${base}:validate`);
  receipt.state = 'submission-started'; persist(receipt);
  // Never cancel a review, and never retry an ambiguous commit automatically.
  await api.request('POST', `${base}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`);
  receipt.state = 'submitted'; receipt.submittedAt = new Date().toISOString(); persist(receipt);
  return receipt;
}
function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function privateFile(root, input) {
  const file = path.resolve(input);
  const parent = fs.realpathSync(path.dirname(file));
  const privateRoot = fs.realpathSync(path.join(root, '.private')) + path.sep;
  if (!`${parent}${path.sep}`.startsWith(privateRoot) || fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) {
    throw new Error('Plans and receipts must be inside the ignored .private directory.');
  }
  return file;
}
function write(file, data, exclusive = false) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600, flag: exclusive ? 'wx' : 'w' });
}
async function main(argv = process.argv.slice(2)) {
  const [action, ...args] = argv;
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!['--plan', '--notes', '--listings', '--receipt', '--approved-plan', '--confirmed', '--console-reviewed'].includes(key) || key in options) throw new Error('Unknown or duplicate option.');
    options[key] = ['--confirmed', '--console-reviewed'].includes(key) ? true : args[++i];
    if (!options[key] || typeof options[key] === 'string' && options[key].startsWith('--')) throw new Error('Missing option value.');
  }
  const root = path.resolve(__dirname, '..');
  const common = require('./release-common.js');
  const pkg = common.packageName;
  if (action === 'status') {
    if (args.length) throw new Error('Status takes no options.');
    const api = client(await serviceToken(process.env.KELANI_PLAY_CREDENTIALS));
    console.log(JSON.stringify(await api.releases(pkg), null, 2)); return;
  }
  if (!['plan', 'stage', 'submit'].includes(action)) throw new Error('Use status, plan, stage or submit.');
  common.assertCleanSourceTreeExceptRelease(root);
  execFileSync(process.execPath, ['scripts/check-release-build-manifest.js'], { cwd: root, stdio: 'inherit' });
  const build = require('./play-release-proof.cjs').candidate(root, common);
  const planFile = privateFile(root, options['--plan']);
  if (action === 'plan') {
    const plan = { schema: 1, track: 'alpha', packageName: build.expected.packageName,
      commit: build.manifest.git.commit, versionName: build.expected.versionName, versionCode: build.expected.versionCode,
      bundleSha256: build.bundle.sha256, bundleMetadataSha256: build.bundle.metadataSha256,
      release: { name: `${build.expected.versionCode} (${build.expected.versionName})`, status: 'completed',
        versionCodes: [String(build.expected.versionCode)], releaseNotes: read(options['--notes']) },
      listingChanges: options['--listings'] ? read(options['--listings']) : [] };
    assertPlan(plan, build); write(planFile, plan, true);
    console.log(JSON.stringify(plan, null, 2)); console.log(`Plan SHA-256: ${hash(plan)}`); return;
  }
  const plan = read(planFile); assertPlan(plan, build);
  assertApproval(plan, options['--approved-plan'], options['--confirmed']);
  const receiptFile = privateFile(root, options['--receipt']);
  if (action === 'stage' && fs.existsSync(receiptFile)) throw new Error('Receipt already exists. Inspect it instead of retrying.');
  const api = client(await serviceToken(process.env.KELANI_PLAY_CREDENTIALS));
  if (action === 'stage') {
    await stage(api, plan, fs.readFileSync(path.join(root, build.bundle.path)), options['--approved-plan'], true,
      data => write(receiptFile, data, !fs.existsSync(receiptFile)));
    console.log('Validated Google edit saved. Nothing submitted. Separate submission approval is required.');
  } else {
    const receipt = read(receiptFile);
    if (!isDeepStrictEqual(receipt.plan, plan)) throw new Error('Receipt and approved plan differ.');
    await submit(api, receipt, options['--approved-plan'], true, options['--console-reviewed'], data => write(receiptFile, data));
    console.log('Submitted to Google. This is not approval, availability or phone-test evidence.');
  }
}
module.exports = { hash, assertPlan, assertApproval, assertNoPending, checkBundle, verifyListingChanges, stage, submit, privateFile };
if (require.main === module) main().catch(() => {
  // Transport and credential failures must not print raw input or credentials.
  console.error('Play command stopped. No automatic retry. Inspect local plan/receipt and Google state before continuing.');
  process.exitCode = 1;
});
