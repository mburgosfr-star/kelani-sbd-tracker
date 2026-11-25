#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  packageName,
  releaseCertificateSha256,
  fail,
  sha256File,
  findAndroidSdk,
  getApkMetadata,
  assertSignedV2,
} = require('./release-common');

const defaultRepository = 'mburgosfr-star/kelani-sbd-tracker';
const trustedSourceRepository = 'mburgosfr-star/kelani-sbd-tracker';
const izzyBaseUrl = 'https://apt.izzysoft.de';
const itchPageUrl = new URL('https://kelburgos.itch.io/kelani-sbd-tracker-android');
const izzyPropagationGraceMs = 24 * 60 * 60 * 1000;

function parseArguments(argv, { localVersion } = {}) {
  const resolvedLocalVersion = localVersion || JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
  ).version;
  const options = {
    version: resolvedLocalVersion,
    githubRepository: defaultRepository,
  };
  let repositoryWasExplicit = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (argument === '--version' && value) {
      options.version = value;
      index += 1;
    } else if (argument === '--github-repo' && value) {
      options.githubRepository = value;
      repositoryWasExplicit = true;
      index += 1;
    } else {
      fail(`Unknown or incomplete argument: ${argument}`);
    }
  }

  if (!options.version || !/^\d+\.\d+\.\d+$/.test(options.version)) {
    fail('Release version must have the form X.Y.Z.');
  }

  if (!repositoryWasExplicit && options.version !== resolvedLocalVersion) {
    options.githubRepository = defaultRepository;
  }

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.githubRepository)) {
    fail(`Invalid GitHub repository: ${options.githubRepository}`);
  }

  return options;
}

async function fetchResponse(url, options = {}) {
  const headers = {
    'User-Agent': 'kelani-distribution-integrity-check',
    Accept: options.accept || '*/*',
  };

  const parsedUrl = new URL(url);
  const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

  if (parsedUrl.hostname === 'api.github.com' && githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
    headers['X-GitHub-Api-Version'] = '2022-11-28';
  }

  const response = await fetch(url, {
    redirect: 'follow',
    headers,
  });

  if (!response.ok) {
    fail(`HTTP ${response.status} while fetching ${url}`);
  }

  return response;
}

async function download(url, destination) {
  const response = await fetchResponse(url);
  const content = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, content);
}

function expectedGithubAssets(release, version) {
  const apkName = `kelani-sbd-tracker-v${version}.apk`;
  const checksumName = `${apkName}.sha256`;
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const apk = assets.filter(asset => asset?.name === apkName);
  const checksum = assets.filter(asset => asset?.name === checksumName);

  if (apk.length !== 1 || checksum.length !== 1 || assets.length !== 2) {
    fail(
      `GitHub release v${version} must contain exactly ${apkName} and ${checksumName}.`
    );
  }

  return { apk: apk[0], checksum: checksum[0] };
}

function assertIzzyIdentity(html, repository) {
  const sourceUrl = `https://github.com/${repository}`;

  if (!html.includes(`AppID:</b></td><td>${packageName}</td>`)) {
    fail(`IzzyOnDroid page does not identify ${packageName}.`);
  }

  for (const expectedUrl of [
    sourceUrl,
    `${sourceUrl}/issues`,
    `${sourceUrl}/releases`,
  ]) {
    if (!html.includes(`href='${expectedUrl}'`)) {
      fail(`IzzyOnDroid is missing expected link: ${expectedUrl}`);
    }
  }
}

function izzyListsVersion(html, version) {
  const escapedVersion = version.replace(/\./g, '\\.');
  return new RegExp(`Version ${escapedVersion} \\(`).test(html);
}

function isWithinIzzyPropagationGrace(release, nowMs = Date.now()) {
  const publishedAtMs = Date.parse(release?.published_at || '');

  if (!Number.isFinite(publishedAtMs)) {
    fail('GitHub release published_at is missing or invalid.');
  }

  const ageMs = nowMs - publishedAtMs;

  if (ageMs < 0) {
    fail('GitHub release publication time is in the future.');
  }

  return ageMs < izzyPropagationGraceMs;
}

function assertIzzyPage(html, version, repository) {
  assertIzzyIdentity(html, repository);

  if (!izzyListsVersion(html, version)) {
    fail(`IzzyOnDroid does not list version ${version}.`);
  }

  const apkPath = html.match(
    new RegExp(`href='([^']*${packageName}_[0-9]+\\.apk)'`)
  )?.[1];

  if (!apkPath) fail('Could not find the IzzyOnDroid APK download link.');
  return new URL(apkPath, izzyBaseUrl).toString();
}

function assertSameMetadata(githubMetadata, mirrorMetadata, version, mirror = 'IzzyOnDroid') {
  for (const [label, metadata] of [
    ['GitHub', githubMetadata],
    [mirror, mirrorMetadata],
  ]) {
    if (
      metadata.name !== packageName ||
      metadata.versionName !== version ||
      !/^\d+$/.test(metadata.versionCode)
    ) {
      fail(`${label} APK metadata does not match ${packageName} v${version}.`);
    }
  }

  if (githubMetadata.versionCode !== mirrorMetadata.versionCode) {
    fail(
      `versionCode differs: GitHub ${githubMetadata.versionCode}, ` +
      `${mirror} ${mirrorMetadata.versionCode}.`
    );
  }
}

function parseItchDownloads(html) {
  const files = [...html.matchAll(/<a\b[^>]*\bdata-upload_id="(\d+)"[^>]*>[^<]*<\/a>\s*<div class="info_column">\s*<div class="upload_name">\s*<strong\b[^>]*\btitle="([^"]+)"/g)];
  const apk = files.filter(file => file[2].endsWith('.apk'));
  const checksum = files.filter(file => file[2].endsWith('.apk.sha256'));
  const version = apk[0]?.[2].match(/^kelani-sbd-tracker-v(\d+\.\d+\.\d+)\.apk$/)?.[1];
  if (!version || apk.length !== 1 || checksum.length !== 1 || checksum[0][2] !== `${apk[0][2]}.sha256` ||
      apk[0][1] === checksum[0][1]) {
    fail('itch.io must offer exactly one matching Kelani APK and checksum pair.');
  }
  return { version, apkId: apk[0][1], checksumId: checksum[0][1] };
}

async function getItchDownloads() {
  const cookies = new Map();
  let csrf;
  async function request(url, page) {
    const headers = { 'User-Agent': 'kelani-distribution-integrity-check' };
    if (cookies.size) headers.Cookie = [...cookies.values()].join('; ');
    if (page) {
      headers.Origin = itchPageUrl.origin;
      headers.Referer = page.href;
      headers['X-Requested-With'] = 'XMLHttpRequest';
    }
    const response = await fetch(url, {
      headers, redirect: 'error', signal: AbortSignal.timeout(30000),
      ...(page && { method: 'POST', body: new URLSearchParams({ csrf_token: csrf }) }),
    });
    if (!response.ok) fail(`itch.io download flow returned HTTP ${response.status}.`);
    for (const value of response.headers.getSetCookie()) {
      const cookie = value.split(';', 1)[0];
      cookies.set(cookie.split('=', 1)[0], cookie);
    }
    if (page) return response.json();
    const html = await response.text();
    csrf = html.match(/<meta name="csrf_token" value="([^"]+)"/)?.[1];
    if (!csrf) fail('itch.io download flow is missing its CSRF token.');
    return html;
  }

  await request(itchPageUrl);
  const session = await request(new URL(`${itchPageUrl.href}/download_url`), itchPageUrl);
  if (typeof session.url !== 'string') fail('itch.io did not offer a free download page.');
  const page = new URL(session.url, itchPageUrl);
  if (page.origin !== itchPageUrl.origin || !page.pathname.startsWith(`${itchPageUrl.pathname}/download/`)) {
    fail('itch.io returned an unexpected download page.');
  }
  const files = parseItchDownloads(await request(page));

  async function resolveUpload(id) {
    const response = await request(new URL(`${itchPageUrl.href}/file/${id}?source=game_download&as_props=1`), page);
    if (!response.url || response.external || response.lightbox || response.errors) {
      fail('itch.io did not offer a direct public file download.');
    }
    const url = new URL(response.url);
    if (url.protocol !== 'https:' || !/^itchio-mirror\.[a-f0-9]+\.r2\.cloudflarestorage\.com$/.test(url.hostname)) {
      fail('itch.io returned an unexpected file storage host.');
    }
    return url;
  }

  const [apk, checksum] = await Promise.all([resolveUpload(files.apkId), resolveUpload(files.checksumId)]);
  return { version: files.version, apk, checksum };
}

async function checkItchDistribution({ workDir, version, release, githubRepository }) {
  const itch = await getItchDownloads();
  const itchTag = `v${itch.version}`;
  const official = itch.version === version ? release : await (
    await fetchResponse(`https://api.github.com/repos/${githubRepository}/releases/tags/${itchTag}`)
  ).json();
  if (official.tag_name !== itchTag || official.draft || official.prerelease) {
    fail(`itch.io version ${itch.version} does not have a final public GitHub release.`);
  }
  const assets = expectedGithubAssets(official, itch.version);
  const referenceName = itch.version === version ? 'github.apk' : 'itch-reference.apk';
  const githubApk = path.join(workDir, referenceName);
  const githubChecksum = path.join(workDir, `${referenceName}.sha256`);
  const itchApk = path.join(workDir, 'itch.apk');
  const itchChecksum = path.join(workDir, 'itch.apk.sha256');

  async function downloadItch(url, destination) {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(60000) });
    if (!response.ok) fail(`itch.io file download returned HTTP ${response.status}.`);
    fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
  }

  await Promise.all([
    download(assets.apk.browser_download_url, githubApk),
    download(assets.checksum.browser_download_url, githubChecksum),
    downloadItch(itch.apk, itchApk),
    downloadItch(itch.checksum, itchChecksum),
  ]);
  const githubHash = sha256File(githubApk);
  const referenceChecksum = fs.readFileSync(githubChecksum);
  if (referenceChecksum.toString().match(/^([a-f0-9]{64})\s+/i)?.[1]?.toLowerCase() !== githubHash ||
      !referenceChecksum.equals(fs.readFileSync(itchChecksum)) || sha256File(itchApk) !== githubHash) {
    fail('itch.io APK or checksum differs from the official GitHub release.');
  }
  const sdkDir = findAndroidSdk();
  const metadata = getApkMetadata(itchApk, sdkDir);
  assertSameMetadata(getApkMetadata(githubApk, sdkDir), metadata, itch.version, 'itch.io');
  assertSignedV2(itchApk, sdkDir);
  console.log(`✅ itch.io: ${itch.version} (${metadata.versionCode}), checksum and release certificate verified`);
  if (itch.version !== version) {
    console.warn(`⚠️ itch.io offers ${itch.version}; this run targets ${version}.`);
  }
  return { version: itch.version, versionCode: metadata.versionCode, apkSha256: githubHash };
}

async function checkDistribution({
  version,
  githubRepository,
  nowMs = Date.now(),
}) {
  const tag = `v${version}`;
  const releaseApi =
    `https://api.github.com/repos/${githubRepository}/releases/tags/${tag}`;
  const izzyPageUrl = `${izzyBaseUrl}/packages/${packageName}`;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kelani-distribution-'));

  try {
    const [releaseResponse, izzyResponse] = await Promise.all([
      fetchResponse(releaseApi, { accept: 'application/vnd.github+json' }),
      fetchResponse(izzyPageUrl, { accept: 'text/html' }),
    ]);
    const release = await releaseResponse.json();
    const izzyHtml = await izzyResponse.text();

    if (release.tag_name !== tag || release.draft || release.prerelease) {
      fail(`GitHub release ${tag} is missing or is not a final public release.`);
    }

    const assets = expectedGithubAssets(release, version);
    const itch = await checkItchDistribution({ workDir, version, release, githubRepository });
    assertIzzyIdentity(izzyHtml, trustedSourceRepository);

    if (!izzyListsVersion(izzyHtml, version)) {
      if (isWithinIzzyPropagationGrace(release, nowMs)) {
        const publishedAtMs = Date.parse(release.published_at);
        const ageHours = (nowMs - publishedAtMs) / (60 * 60 * 1000);
        const remainingHours = (
          (izzyPropagationGraceMs - (nowMs - publishedAtMs)) /
          (60 * 60 * 1000)
        );

        console.log('\n⚠️ IzzyOnDroid synchronization is still pending');
        console.log(`✅ GitHub release v${version} is public and structurally valid`);
        console.log(`⚠️ Published ${ageHours.toFixed(1)} hours ago`);
        console.log(
          `⚠️ IzzyOnDroid has up to ${remainingHours.toFixed(1)} hours ` +
          'remaining in the propagation grace period'
        );

        return {
          version,
          packageName,
          status: 'pending-izzy-propagation',
          itch,
        };
      }

      fail(`IzzyOnDroid does not list version ${version}.`);
    }

    const izzyApkUrl = assertIzzyPage(
      izzyHtml,
      version,
      trustedSourceRepository
    );
    const githubApkPath = path.join(workDir, 'github.apk');
    const githubChecksumPath = path.join(workDir, 'github.apk.sha256');
    const izzyApkPath = path.join(workDir, 'izzy.apk');

    const downloads = [download(izzyApkUrl, izzyApkPath)];
    if (itch.version !== version) {
      downloads.push(
        download(assets.apk.browser_download_url, githubApkPath),
        download(assets.checksum.browser_download_url, githubChecksumPath),
      );
    }
    await Promise.all(downloads);

    const githubHash = sha256File(githubApkPath);
    const izzyHash = sha256File(izzyApkPath);
    const checksumText = fs.readFileSync(githubChecksumPath, 'utf8').trim();
    const checksumHash = checksumText.match(/^([0-9a-f]{64})\s+/i)?.[1]?.toLowerCase();

    if (checksumHash !== githubHash) {
      fail('GitHub checksum asset does not match the GitHub APK.');
    }

    if (githubHash !== izzyHash) {
      fail(`APK hash differs: GitHub ${githubHash}, IzzyOnDroid ${izzyHash}.`);
    }

    const sdkDir = findAndroidSdk();
    const githubMetadata = getApkMetadata(githubApkPath, sdkDir);
    const izzyMetadata = getApkMetadata(izzyApkPath, sdkDir);
    assertSameMetadata(githubMetadata, izzyMetadata, version);
    assertSignedV2(githubApkPath, sdkDir);
    assertSignedV2(izzyApkPath, sdkDir);

    console.log('\n✅ Distribution integrity check passed');
    console.log(`✅ GitHub: https://github.com/${githubRepository}/releases/tag/${tag}`);
    console.log(`✅ IzzyOnDroid: ${izzyPageUrl}`);
    console.log(`✅ Package: ${packageName}`);
    console.log(`✅ Version: ${version} (${githubMetadata.versionCode})`);
    console.log(`✅ APK SHA-256: ${githubHash}`);
    console.log(`✅ Certificate SHA-256: ${releaseCertificateSha256}`);

    return {
      version,
      versionCode: githubMetadata.versionCode,
      packageName,
      apkSha256: githubHash,
      certificateSha256: releaseCertificateSha256,
      itch,
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  await checkDistribution(options);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`\nERROR: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArguments,
  expectedGithubAssets,
  assertIzzyIdentity,
  izzyListsVersion,
  isWithinIzzyPropagationGrace,
  assertIzzyPage,
  assertSameMetadata,
  parseItchDownloads,
  checkDistribution,
};
