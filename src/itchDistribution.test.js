import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { REPOSITORY, releaseIdentity, validateRelease, verifyFiles, assertLatestRelease, pushChannel } = require('../scripts/sync-itch.cjs');
const digest = bytes => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;

test('waits for an existing upload to finish but does not retry unrelated upload errors', async () => {
  let calls = 0;
  let waits = 0;
  const run = () => ++calls < 3
    ? { status: 1, stderr: 'latest build is still processing' }
    : { status: 0, stdout: '' };
  await pushChannel('butler', [], {}, run, async () => { waits += 1; });
  expect(calls).toBe(3);
  expect(waits).toBe(2);
  calls = 0;
  await expect(pushChannel('butler', [], {}, () => {
    calls += 1;
    return { status: 1, stderr: '' };
  }, async () => { throw new Error('Must not wait for unrelated errors'); })).rejects.toThrow(/upload failed/);
  expect(calls).toBe(1);
  calls = 0;
  await expect(pushChannel('butler', [], {}, () => {
    calls += 1;
    return { status: 1, stderr: 'latest build is still processing' };
  }, async () => {})).rejects.toThrow(/upload failed/);
  expect(calls).toBe(60);
});

function fixture(tag) {
  const identity = releaseIdentity(tag);
  const bytes = Buffer.from('representative published package bytes');
  const checksum = Buffer.from(`${digest(bytes).slice(7)}  release/${identity.filename}\n`);
  const assets = [[identity.filename, bytes], [`${identity.filename}.sha256`, checksum]]
    .map(([name, data]) => ({ name, size: data.length, digest: digest(data), state: 'uploaded',
      browser_download_url: `https://github.com/${REPOSITORY}/releases/download/${tag}/${name}` }));
  return { release: { tag_name: tag, draft: false, prerelease: identity.prerelease,
    published_at: '2026-10-23T12:00:00Z', assets }, bytes, checksum };
}

test.each([
  ['v2.0.60', 'kelburgos/kelani-sbd-tracker-android', 'android', '2.0.60'],
  ['ubuntu-v2.0.59-prototype.4', 'kelburgos/kelani-sbd-tracker-ubuntu', 'linux-deb', '2.0.59~prototype.4'],
])('routes published %s to the correct project and version', (tag, target, channel, version) => {
  const { release } = fixture(tag);
  const plan = validateRelease(release, tag);
  expect(plan).toMatchObject({ target, channel, version });
});

test('rejects drafts, wrong release types, injected tags and missing or unrelated assets', () => {
  for (const tag of ['main', 'v2.0.60;echo unsafe', '../v2.0.60', 'v2.0.60-beta', 'ubuntu-v2.0.59-prototype.4/extra']) {
    expect(() => releaseIdentity(tag)).toThrow();
  }
  const { release } = fixture('v2.0.60');
  for (const changed of [
    { ...release, draft: true }, { ...release, published_at: null },
    { ...release, prerelease: true }, { ...release, tag_name: 'v2.0.59' },
    { ...release, assets: release.assets.slice(0, 1) },
    { ...release, assets: [...release.assets, release.assets[0]] },
    { ...release, assets: release.assets.map(a => ({ ...a, digest: null })) },
    { ...release, assets: release.assets.map(a => ({ ...a, browser_download_url: 'https://example.com/package' })) },
  ]) expect(() => validateRelease(changed, 'v2.0.60')).toThrow();
});

test.each(['v2.0.60', 'ubuntu-v2.0.59-prototype.4'])('validates %s bytes and refuses tampering or a lying checksum', tag => {
  const { release, bytes, checksum } = fixture(tag);
  const plan = validateRelease(release, tag);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kelani-itch-test-'));
  try {
    const binary = path.join(dir, plan.filename);
    const sha = `${binary}.sha256`;
    fs.writeFileSync(binary, bytes);
    fs.writeFileSync(sha, checksum);
    expect(() => verifyFiles(plan, dir)).not.toThrow();
    fs.writeFileSync(binary, Buffer.from('X'.repeat(bytes.length)));
    expect(() => verifyFiles(plan, dir)).toThrow(/digest/);
    fs.writeFileSync(binary, bytes);
    const lyingChecksum = Buffer.from(`${'0'.repeat(64)}  ${plan.filename}\n`);
    fs.writeFileSync(sha, lyingChecksum);
    const changed = { ...plan, assets: [plan.assets[0], { ...plan.assets[1], size: lyingChecksum.length, digest: digest(lyingChecksum) }] };
    expect(() => verifyFiles(changed, dir)).toThrow(/Checksum content/);
    fs.unlinkSync(binary);
    fs.symlinkSync(sha, binary);
    expect(() => verifyFiles(plan, dir)).toThrow(/size\/type/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('an older Android release cannot overwrite the latest download', () => {
  expect(() => assertLatestRelease(releaseIdentity('v2.0.59'), { tag_name: 'v2.0.60' })).toThrow(/roll back/);
  expect(() => assertLatestRelease(releaseIdentity('v2.0.60'), { tag_name: 'v2.0.60' })).not.toThrow();
});

test('Ubuntu ordering is numeric and independent from Android releases and unpublished drafts', () => {
  const plan = releaseIdentity('ubuntu-v2.0.59-prototype.4');
  const current = fixture(plan.tag).release;
  const android = fixture('v2.0.60').release;
  const newer = fixture('ubuntu-v2.0.59-prototype.10').release;
  expect(() => assertLatestRelease(plan, [current, android, { ...newer, draft: true }])).not.toThrow();
  expect(() => assertLatestRelease(plan, [current, newer])).toThrow(/roll back/);
});
