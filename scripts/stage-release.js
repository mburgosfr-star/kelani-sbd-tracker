#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  root,
  fail,
  run,
  output,
  readVersionInfo,
  getHeadCommit,
  assertCleanSourceTreeExceptRelease,
  assertVerifiedReleaseCommits,
  assertReleasePreparationProof,
  readReleaseNotes,
  fetchCiPublicAssetsSha256,
} = require('./release-common');

const workflow = 'android-release-sanity.yml';
const pollIntervalMs = 10000;
const timeoutMs = 15 * 60 * 1000;

function commandSucceeds(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    stdio: 'ignore',
    shell: false,
  }).status === 0;
}

function sleep(milliseconds) {
  Atomics.wait(
    new Int32Array(new SharedArrayBuffer(4)),
    0,
    0,
    milliseconds
  );
}

function matchingPushRuns(runs, commit) {
  if (!Array.isArray(runs)) return [];

  return runs.filter(entry =>
    entry &&
    entry.headSha === commit &&
    entry.event === 'push'
  );
}

function workflowRuns(commit) {
  const result = spawnSync('gh', [
    'run',
    'list',
    '--workflow', workflow,
    '--branch', 'main',
    '--commit', commit,
    '--json',
    'databaseId,headSha,status,conclusion,createdAt,updatedAt,url,event',
    '--limit', '20',
  ], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
  });

  if (result.error || result.signal || result.status !== 0) {
    fail(
      'Could not read Android release sanity status from GitHub.\n' +
      String(result.stderr || '').trim()
    );
  }

  let runs;

  try {
    runs = JSON.parse(result.stdout || '[]');
  } catch {
    fail('GitHub returned invalid Android release sanity data.');
  }

  return matchingPushRuns(runs, commit);
}

function waitForCi(commit) {
  const deadline = Date.now() + timeoutMs;

  console.log(
    `Waiting quietly for ${workflow} on exact commit ${commit}...`
  );

  while (Date.now() < deadline) {
    const runs = workflowRuns(commit);

    if (runs.length > 1) {
      fail(
        `Found multiple push-triggered ${workflow} runs for ${commit}; ` +
        'refusing ambiguous CI evidence.'
      );
    }

    if (runs.length === 1) {
      const [ciRun] = runs;

      if (ciRun.status === 'completed') {
        if (ciRun.conclusion !== 'success') {
          fail(
            `Android release sanity ended with ${ciRun.conclusion || 'no conclusion'}:\n` +
            ciRun.url
          );
        }

        const assetsSha256 = fetchCiPublicAssetsSha256(ciRun.databaseId);

        if (!assetsSha256) {
          fail(
            'Android release sanity passed, but its public-assets hash ' +
            'could not be verified.'
          );
        }

        return { ciRun, assetsSha256 };
      }
    }

    sleep(pollIntervalMs);
  }

  fail(
    `Timed out after ${timeoutMs / 60000} minutes waiting for ` +
    `${workflow} on ${commit}.`
  );
}

function main() {
  if (!process.argv.includes('--confirmed')) {
    fail(
      'Staging pushes main and requires explicit confirmation.\n' +
      'Run: npm run release:stage -- --confirmed'
    );
  }

  assertCleanSourceTreeExceptRelease(root);
  assertVerifiedReleaseCommits(root);
  assertReleasePreparationProof(root);

  const expected = readVersionInfo(root);
  const commit = getHeadCommit(root);
  const tag = `v${expected.versionName}`;
  const branch = output('git', [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ]);

  if (branch !== 'main') {
    fail(`Release staging must run from main, not ${branch}.`);
  }

  const proofPath = path.join(
    root,
    'release',
    'release-staging-proof.json'
  );

  fs.rmSync(proofPath, { force: true });

  readReleaseNotes(expected.versionName, root);
  run('git', ['fetch', 'origin', 'main', '--tags']);

  const originMain = output('git', ['rev-parse', 'origin/main']);

  if (!commandSucceeds('git', [
    'merge-base',
    '--is-ancestor',
    originMain,
    commit,
  ])) {
    fail('HEAD has diverged from origin/main. Resolve it before staging.');
  }

  const remoteTag = output('git', [
    'ls-remote',
    'origin',
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ]);

  if (remoteTag) {
    fail(`Remote tag ${tag} already exists.`);
  }

  if (commandSucceeds('gh', ['release', 'view', tag])) {
    fail(`GitHub Release ${tag} already exists and must not be overwritten.`);
  }

  if (originMain !== commit) {
    run('git', ['push', 'origin', 'main']);
  }

  const { ciRun, assetsSha256 } = waitForCi(commit);

  fs.mkdirSync(path.dirname(proofPath), { recursive: true });
  fs.writeFileSync(
    proofPath,
    `${JSON.stringify({
      schema: 1,
      generatedBy: 'scripts/stage-release.js',
      confirmedByUser: true,
      confirmedAt: new Date().toISOString(),
      commit,
      versionName: expected.versionName,
      versionCode: expected.versionCode,
      ci: {
        workflow,
        event: ciRun.event,
        runId: ciRun.databaseId,
        url: ciRun.url,
        status: ciRun.status,
        conclusion: ciRun.conclusion,
        publicAssetsSha256: assetsSha256,
      },
    }, null, 2)}\n`
  );

  console.log('\n✅ Release candidate staged safely');
  console.log(`✅ main: ${commit}`);
  console.log(`✅ Android release sanity: ${ciRun.url}`);
  console.log(`✅ Public assets manifest: ${assetsSha256}`);
  console.log('✅ No tag or GitHub Release was created');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`\nERROR: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { matchingPushRuns };
