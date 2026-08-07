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
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'kelani-distribution-integrity-check',
      Accept: options.accept || '*/*',
    },
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

function assertIzzyPage(html, version, repository) {
  const sourceUrl = `https://github.com/${repository}`;
  const escapedVersion = version.replace(/\./g, '\\.');

  if (!html.includes(`AppID:</b></td><td>${packageName}</td>`)) {
    fail(`IzzyOnDroid page does not identify ${packageName}.`);
  }

  if (!new RegExp(`Version ${escapedVersion} \\(`).test(html)) {
    fail(`IzzyOnDroid does not list version ${version}.`);
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

  const apkPath = html.match(
    new RegExp(`href='([^']*${packageName}_[0-9]+\\.apk)'`)
  )?.[1];

  if (!apkPath) fail('Could not find the IzzyOnDroid APK download link.');
  return new URL(apkPath, izzyBaseUrl).toString();
}

function assertSameMetadata(githubMetadata, izzyMetadata, version) {
  for (const [label, metadata] of [
    ['GitHub', githubMetadata],
    ['IzzyOnDroid', izzyMetadata],
  ]) {
    if (
      metadata.name !== packageName ||
      metadata.versionName !== version ||
      !/^\d+$/.test(metadata.versionCode)
    ) {
      fail(`${label} APK metadata does not match ${packageName} v${version}.`);
    }
  }

  if (githubMetadata.versionCode !== izzyMetadata.versionCode) {
    fail(
      `versionCode differs: GitHub ${githubMetadata.versionCode}, ` +
      `IzzyOnDroid ${izzyMetadata.versionCode}.`
    );
  }
}

async function checkDistribution({ version, githubRepository }) {
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
    const izzyApkUrl = assertIzzyPage(
      izzyHtml,
      version,
      trustedSourceRepository
    );
    const githubApkPath = path.join(workDir, 'github.apk');
    const githubChecksumPath = path.join(workDir, 'github.apk.sha256');
    const izzyApkPath = path.join(workDir, 'izzy.apk');

    await Promise.all([
      download(assets.apk.browser_download_url, githubApkPath),
      download(assets.checksum.browser_download_url, githubChecksumPath),
      download(izzyApkUrl, izzyApkPath),
    ]);

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
  assertIzzyPage,
  assertSameMetadata,
  checkDistribution,
};
