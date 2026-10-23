#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');

const REPOSITORY = 'mburgosfr-star/kelani-sbd-tracker';
const BUTLER_VERSION = '15.32.0';
const BUTLER_ARCHIVE_SHA256 = '5db7b053fc9b578b86ffaf3520a12b952eb95c9225171cc5720dfbc9fe4574b3';

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

function releaseIdentity(tag) {
  let match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  if (match) {
    requireThat(match.slice(1).map(Number).every(Number.isSafeInteger), 'Invalid release version.');
    const version = match.slice(1).join('.');
    return { tag, version, order: match.slice(1).map(Number), prerelease: false,
      target: 'kelburgos/kelani-sbd-tracker-android', channel: 'android',
      filename: `kelani-sbd-tracker-v${version}.apk` };
  }
  match = /^ubuntu-v(\d+)\.(\d+)\.(\d+)-prototype\.(\d+)$/.exec(tag);
  requireThat(match, 'Only published stable Android and Ubuntu prototype tags can be synchronized.');
  requireThat(match.slice(1).map(Number).every(Number.isSafeInteger), 'Invalid release version.');
  return { tag, version: `${match.slice(1, 4).join('.')}~prototype.${match[4]}`,
    order: match.slice(1).map(Number), prerelease: true,
    target: 'kelburgos/kelani-sbd-tracker-ubuntu', channel: 'linux-deb',
    filename: 'Kelani-Ubuntu-Prototype-amd64.deb' };
}

function compareOrder(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

function validateRelease(release, tag) {
  const identity = releaseIdentity(tag);
  requireThat(release.tag_name === tag && !release.draft && release.published_at,
    'The source must be an already-published GitHub release.');
  requireThat(release.prerelease === identity.prerelease, 'Release type does not match its tag.');
  requireThat(Array.isArray(release.assets) && release.assets.length === 2,
    'Expected exactly the official package and checksum assets.');
  const names = [identity.filename, `${identity.filename}.sha256`];
  const assets = names.map(name => {
    const matches = release.assets.filter(asset => asset.name === name);
    requireThat(matches.length === 1, `Missing or duplicate release asset: ${name}`);
    const asset = matches[0];
    requireThat(asset.state === 'uploaded' && Number.isSafeInteger(asset.size) && asset.size > 0,
      `Incomplete release asset: ${name}`);
    requireThat(/^sha256:[a-f0-9]{64}$/.test(asset.digest || ''), `Missing GitHub asset digest: ${name}`);
    requireThat(asset.browser_download_url === `https://github.com/${REPOSITORY}/releases/download/${tag}/${name}`,
      'Release asset URL does not belong to the official repository.');
    return asset;
  });
  return { ...identity, assets };
}

function verifyAsset(asset, filename) {
    const stat = fs.lstatSync(filename);
    requireThat(stat.isFile() && stat.size === asset.size, `Downloaded asset size/type mismatch: ${asset.name}`);
    const digest = crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
    requireThat(`sha256:${digest}` === asset.digest, `Downloaded GitHub digest mismatch: ${asset.name}`);
}

function verifyFiles(plan, directory) {
  for (const asset of plan.assets) verifyAsset(asset, path.join(directory, asset.name));
  const checksum = fs.readFileSync(path.join(directory, `${plan.filename}.sha256`), 'utf8').trim();
  const match = /^([a-f0-9]{64})[ \t]+\*?(?:release\/)?([^\r\n/\\]+)$/.exec(checksum);
  requireThat(match && match[2] === plan.filename && `sha256:${match[1]}` === plan.assets[0].digest,
    'Checksum content does not match the package and GitHub digest.');
}

function gh(args, capture = true) {
  const env = { ...process.env };
  delete env.BUTLER_API_KEY;
  return execFileSync('gh', args, {
    env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', maxBuffer: 20 * 1024 * 1024,
  });
}

function assertLatestRelease(plan, releases) {
  if (!plan.prerelease) {
    requireThat(releases.tag_name === plan.tag, 'Refusing to roll back itch.io to an older Android release.');
    return;
  }
  const newer = releases.some(release => {
    if (release.draft || !release.prerelease || !release.published_at ||
      !/^ubuntu-v\d+\.\d+\.\d+-prototype\.\d+$/.test(release.tag_name)) return false;
    return compareOrder(releaseIdentity(release.tag_name).order, plan.order) > 0;
  });
  requireThat(!newer, 'Refusing to roll back itch.io to an older Ubuntu test release.');
}

function assertLatest(plan) {
  const releases = plan.prerelease
    ? gh(['api', `repos/${REPOSITORY}/releases?per_page=100`, '--paginate', '--jq', '.[] | @json'])
      .trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    : JSON.parse(gh(['api', `repos/${REPOSITORY}/releases/latest`]));
  assertLatestRelease(plan, releases);
}

async function channelVersion(target, channel) {
  const url = new URL('https://api.itch.io/wharf/latest');
  url.searchParams.set('target', target);
  url.searchParams.set('channel_name', channel);
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  requireThat(response.ok, `Could not verify public itch.io channel ${channel}: HTTP ${response.status}`);
  return (await response.json()).latest;
}

async function verifyPublishedChannels(plan) {
  let lastError;
  for (let attempt = 0; attempt < 18; attempt += 1) {
    try {
      const versions = await Promise.all([plan.channel, 'checksums'].map(channel => channelVersion(plan.target, channel)));
      if (versions.every(version => version === plan.version)) return;
    } catch (error) { lastError = error; }
    if (attempt < 17) await new Promise(resolve => setTimeout(resolve, 10_000));
  }
  throw new Error(`itch.io did not report the expected version for both channels. ${lastError?.message || 'Check the workflow before retrying.'}`);
}

async function waitForAttestation(filename) {
  // Attestation and this workflow start from the same release event.
  for (let attempt = 0; attempt < 18; attempt += 1) {
    try {
      gh(['attestation', 'verify', filename, '--repo', REPOSITORY]);
      console.log('Published Android APK provenance verified.');
      return;
    } catch {
      if (attempt === 17) throw new Error('Published APK provenance could not be verified; no upload was performed.');
      if (attempt === 0) console.log('Waiting for the release attestation workflow.');
      await new Promise(resolve => setTimeout(resolve, 10_000));
    }
  }
}

async function main() {
  requireThat(process.env.GITHUB_REPOSITORY === REPOSITORY, 'Synchronization is restricted to the official repository.');
  const tag = process.argv[process.argv.indexOf('--tag') + 1];
  releaseIdentity(tag);
  requireThat(process.argv.includes('--tag'), 'An explicit published release tag is required.');
  const release = JSON.parse(gh(['api', `repos/${REPOSITORY}/releases/tags/${tag}`]));
  const plan = validateRelease(release, tag);
  assertLatest(plan);
  if (!plan.prerelease) {
    try { gh(['attestation', '--help']); }
    catch { throw new Error('This GitHub CLI is too old for provenance verification; use a current gh release.'); }
  }
  requireThat(process.env.BUTLER_API_KEY, 'Configure the BUTLER_API_KEY Actions secret before synchronizing.');
  const butler = process.env.BUTLER_BIN;
  requireThat(butler && path.isAbsolute(butler), 'A verified Butler binary is required.');
  const env = { ...process.env };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  const version = spawnSync(butler, ['-V'], { env, encoding: 'utf8' });
  requireThat(version.status === 0 && `${version.stdout}${version.stderr}`.includes(`v${BUTLER_VERSION},`),
    'Butler version differs from the verified tool version.');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kelani-itch-'));
  try {
    for (const asset of plan.assets) {
      gh(['release', 'download', tag, '--repo', REPOSITORY, '--pattern', asset.name, '--dir', directory], false);
    }
    verifyFiles(plan, directory);
    if (!plan.prerelease) {
      await waitForAttestation(path.join(directory, plan.filename));
    }
    // Each channel contains one original file so website downloads are not ZIP-wrapped.
    for (const [filename, channel] of [[plan.filename, plan.channel], [`${plan.filename}.sha256`, 'checksums']]) {
      assertLatest(plan);
      execFileSync(butler, ['push', path.join(directory, filename), `${plan.target}:${channel}`,
        '--userversion', plan.version, '--if-changed'], { env, stdio: 'inherit' });
    }
    await verifyPublishedChannels(plan);
    for (const [index, channel] of [plan.channel, 'checksums'].entries()) {
      const fetched = path.join(directory, `download-${channel}`);
      execFileSync(butler, ['fetch', `${plan.target}:${channel}`, fetched], { env, stdio: 'inherit' });
      verifyAsset(plan.assets[index], path.join(fetched, plan.assets[index].name));
    }
    console.log(`Verified itch.io package and checksum channels: ${plan.target} ${plan.version}`);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

module.exports = { REPOSITORY, BUTLER_VERSION, BUTLER_ARCHIVE_SHA256, releaseIdentity, compareOrder, validateRelease, verifyFiles, assertLatestRelease };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
