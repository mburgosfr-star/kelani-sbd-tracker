const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  assertReleaseStagingProof,
} = require('../scripts/release-common');
const { matchingPushRuns } = require('../scripts/stage-release');

describe('release staging CI evidence', () => {
  const commit = 'a'.repeat(40);
  let tempDir;

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  function createStagedReleaseProof(overrides = {}) {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kelani-release-staging-test-')
    );
    fs.mkdirSync(path.join(tempDir, 'android', 'app'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tempDir, 'release'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ version: '3.0.0' })
    );
    fs.writeFileSync(
      path.join(tempDir, 'package-lock.json'),
      JSON.stringify({
        version: '3.0.0',
        packages: { '': { version: '3.0.0' } },
      })
    );
    fs.writeFileSync(
      path.join(tempDir, 'android', 'app', 'build.gradle'),
      'versionCode 200\nversionName "3.0.0"\n'
    );
    const head = 'c'.repeat(40);
    const proof = {
      schema: 1,
      generatedBy: 'scripts/stage-release.js',
      confirmedByUser: true,
      commit: head,
      versionName: '3.0.0',
      versionCode: 200,
      ci: {
        workflow: 'android-release-sanity.yml',
        event: 'push',
        runId: 123,
        url: 'https://github.example/actions/runs/123',
        status: 'completed',
        conclusion: 'success',
        publicAssetsSha256: 'b'.repeat(64),
      },
      ...overrides,
    };

    fs.writeFileSync(
      path.join(tempDir, 'release', 'release-staging-proof.json'),
      JSON.stringify(proof)
    );

    return { base: tempDir, head };
  }

  test('accepts only push runs for the exact commit', () => {
    const runs = [
      { databaseId: 1, headSha: commit, event: 'push' },
      { databaseId: 2, headSha: commit, event: 'workflow_dispatch' },
      { databaseId: 3, headSha: 'b'.repeat(40), event: 'push' },
    ];

    expect(matchingPushRuns(runs, commit)).toEqual([runs[0]]);
  });

  test('returns every exact push run so ambiguity is detectable', () => {
    const runs = [
      { databaseId: 1, headSha: commit, event: 'push' },
      { databaseId: 2, headSha: commit, event: 'push' },
    ];

    expect(matchingPushRuns(runs, commit)).toEqual(runs);
  });

  test('treats malformed GitHub data as no usable evidence', () => {
    expect(matchingPushRuns(null, commit)).toEqual([]);
    expect(matchingPushRuns({}, commit)).toEqual([]);
  });

  test('accepts a commit- and version-bound successful staging proof', () => {
    const { base, head } = createStagedReleaseProof();

    expect(
      assertReleaseStagingProof(base, { expectedCommit: head }).proof.ci.runId
    ).toBe(123);
  });

  test('rejects staging evidence that was not triggered by a push', () => {
    const { base, head } = createStagedReleaseProof({
      ci: {
        workflow: 'android-release-sanity.yml',
        event: 'workflow_dispatch',
        runId: 123,
        url: 'https://github.example/actions/runs/123',
        status: 'completed',
        conclusion: 'success',
        publicAssetsSha256: 'b'.repeat(64),
      },
    });

    expect(() =>
      assertReleaseStagingProof(base, { expectedCommit: head })
    ).toThrow(
      'Release-staging proof is invalid or does not match HEAD.'
    );
  });
});

describe('parallel release workflow gate', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/android-release-sanity.yml'), 'utf8');
  const gate = workflow.split('\n  release-sanity:\n')[1];

  test('retains the required check name and waits for both independent branches even after failure', () => {
    expect(gate).toContain('name: Test app and isolated Android release build');
    expect(gate).toContain('needs: [validation, isolated-build]');
    expect(gate).toContain('if: ${{ always() }}');
    expect(gate).toContain('VALIDATION_RESULT: ${{ needs.validation.result }}');
    expect(gate).toContain('ISOLATED_BUILD_RESULT: ${{ needs.isolated-build.result }}');
    for (const id of ['validation', 'isolated-build']) {
      const branch = workflow.split(`\n  ${id}:\n`)[1].split(/\n  [a-z-]+:\n/)[0];
      expect(branch).not.toMatch(/^    (needs|if|continue-on-error):/m);
    }
    expect(workflow).not.toContain('continue-on-error:');
  });

  test('the actual workflow shell rejects any failed, cancelled, skipped or missing branch result', () => {
    const { spawnSync } = require('child_process');
    const script = gate.split('        run: |\n')[1]
      .split('\n').map(line => line.replace(/^          /, '')).join('\n');
    for (const validation of ['success', 'failure', 'cancelled', 'skipped', '']) {
      for (const isolatedBuild of ['success', 'failure', 'cancelled', 'skipped', '']) {
        const result = spawnSync('bash', ['-e', '-c', script], {
          env: { ...process.env, VALIDATION_RESULT: validation, ISOLATED_BUILD_RESULT: isolatedBuild },
          encoding: 'utf8',
        });
        expect(result.status).toBe(validation === 'success' && isolatedBuild === 'success' ? 0 : 1);
      }
    }
  });
});
