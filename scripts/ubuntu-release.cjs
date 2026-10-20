const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const { root, assertVerifiedReleaseCommits } = require('./release-common');

const repo = 'mburgosfr-star/kelani-sbd-tracker';
const proofDirectory = path.join(root, 'release', 'ubuntu');
const deb = path.join(root, 'desktop-out', 'Kelani-Ubuntu-Prototype-amd64.deb');
const outputDirectory = path.join(root, 'desktop-out', 'Kelani SBD Tracker Desktop Prototype-linux-x64');
const hash = value => createHash('sha256').update(value).digest('hex');
const fileHash = filename => hash(fs.readFileSync(filename));
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
function execute(cmd, args, cwd = root) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${cmd} failed (${result.status})`);
}
function requireThat(condition, message) { if (!condition) throw new Error(message); }

function identity() {
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  const { revision } = JSON.parse(fs.readFileSync(path.join(root, 'desktop/ubuntu/package.json')));
  requireThat(/^\d+\.\d+\.\d+$/.test(version) && Number.isSafeInteger(revision) && revision > 0, 'Invalid Ubuntu release identity');
  return { version, revision, packageVersion: `${version}~prototype.${revision}`, tag: `ubuntu-v${version}-prototype.${revision}` };
}
function sourceIdentity() {
  requireThat(!run('git', ['status', '--porcelain']), 'Ubuntu release requires a clean committed tree');
  requireThat(run('git', ['branch', '--show-current']) === 'main', 'Ubuntu release requires main');
  assertVerifiedReleaseCommits(root);
  const files = run('git', ['ls-files', '-z']).split('\0').filter(Boolean).sort();
  const sourceHash = hash(JSON.stringify(files.map(name => [name, fileHash(path.join(root, name))])));
  return { commit: run('git', ['rev-parse', 'HEAD']), sourceHash, ...identity() };
}
function writeProof(phase, data) {
  fs.mkdirSync(proofDirectory, { recursive: true });
  const filename = path.join(proofDirectory, phase + '.json');
  fs.writeFileSync(filename, JSON.stringify({ schema: 1, generatedBy: 'scripts/ubuntu-release.cjs', phase, ...sourceIdentity(), ...data }, null, 2) + '\n', { mode: 0o600 });
}
function readProof(phase) {
  const proof = JSON.parse(fs.readFileSync(path.join(proofDirectory, phase + '.json')));
  validateProofIdentity(proof, sourceIdentity(), phase);
  return proof;
}
function validateProofIdentity(proof, current, phase) {
  requireThat(proof.schema === 1 && proof.generatedBy === 'scripts/ubuntu-release.cjs' && proof.phase === phase, `Invalid Ubuntu ${phase} proof`);
  for (const key of ['commit', 'sourceHash', 'version', 'revision', 'packageVersion', 'tag']) {
    requireThat(proof[key] === current[key], `Ubuntu ${phase} proof changed: ${key}`);
  }
}
function notes() {
  const filename = path.join(root, 'docs/releases', `release-notes-${identity().tag}.md`);
  const text = fs.readFileSync(filename, 'utf8');
  requireThat(text.startsWith("## What's new\n") && !text.includes(`\n# Kelani`), 'Invalid Ubuntu release notes format');
  return { filename, text, sha256: fileHash(filename) };
}
function requirePreparation() {
  requireThat(readProof('prepare').confirmedByUser === true, 'Ubuntu preparation approval is missing');
}
function requireBuild() {
  requirePreparation();
  const build = readProof('build');
  requireThat(build.sha256 === fileHash(deb), 'Ubuntu package changed after build');
  requireThat(build.checksumSha256 === fileHash(deb + '.sha256'), 'Ubuntu checksum changed after build');
  requireThat(build.notesSha256 === notes().sha256, 'Ubuntu notes changed after build');
  execute('node', ['scripts/check-ubuntu-package.cjs']);
  return build;
}

// Compare application bytes, not ASAR timestamps or guides. A documentation-only
// change does not force the user to repeat an unchanged visible desktop test.
async function applicationManifest(directory) {
  const { extractFile, listPackage, statFile } = await import('@electron/asar');
  const archive = path.join(directory, 'resources/app.asar');
  const result = {};
  for (const name of listPackage(archive).sort()) {
    const relative = name.replace(/^\//, '');
    if (!(relative.startsWith('build/') || relative.startsWith('desktop/') || relative === 'package.json')) continue;
    if (relative.startsWith('desktop/ubuntu/')) continue;
    if (statFile(archive, relative).files) continue;
    result[`asar:${relative}`] = hash(extractFile(archive, relative));
  }
  function walk(folder, prefix = '') {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix + entry.name;
      if (relative === 'resources/app.asar' || /^(WINDOWS|UBUNTU)-PROTOTYPE\.md$/.test(relative)) continue;
      const filename = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(filename, relative + '/');
      else if (entry.isSymbolicLink()) result[relative] = `link:${fs.readlinkSync(filename)}`;
      else result[relative] = fileHash(filename);
    }
  }
  walk(directory);
  return result;
}
function compareApplications(expected, actual) {
  requireThat(JSON.stringify(expected) === JSON.stringify(actual), 'Ubuntu application bytes differ from the tested build');
}
function ciEvidence() {
  const commit = sourceIdentity().commit;
  const runs = JSON.parse(run('gh', ['run', 'list', '--repo', repo, '--workflow', 'android-release-sanity.yml', '--branch', 'main', '--commit', commit, '--limit', '20', '--json', 'databaseId,headSha,status,conclusion,event']));
  const matches = runs.filter(value => value.headSha === commit && value.event === 'push');
  requireThat(matches.length === 1 && matches[0].status === 'completed' && matches[0].conclusion === 'success', 'Exact Ubuntu commit must have one successful push-triggered CI run');
  return matches[0];
}
function remoteState() {
  const origin = run('git', ['remote', 'get-url', 'origin']).replace(/\.git$/, '');
  requireThat([`https://github.com/${repo}`, `git@github.com:${repo}`].includes(origin), 'Wrong official repository origin');
  const current = sourceIdentity();
  const remoteMain = run('git', ['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0];
  requireThat(remoteMain === current.commit, 'Ubuntu HEAD is not staged at origin/main');
  const tags = run('git', ['ls-remote', 'origin', `refs/tags/${current.tag}`, `refs/tags/${current.tag}^{}`]);
  requireThat(!tags, 'Ubuntu tag already exists remotely; existing tags are never replaced');
  const local = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/tags/${current.tag}`], { cwd: root });
  requireThat(local.status === 1, 'Ubuntu tag already exists locally; existing tags are never replaced');
  const releases = run('gh', ['api', `repos/${repo}/releases`, '--paginate', '--jq', '.[].tag_name']).split('\n');
  requireThat(!releases.includes(current.tag), 'Ubuntu release already exists; releases are never overwritten');
  // Record the stable release so Ubuntu cannot silently replace Android Latest.
  return JSON.parse(run('gh', ['api', `repos/${repo}/releases/latest`])).tag_name;
}

async function prepare(confirmed) {
  requireThat(confirmed, 'Ubuntu release preparation requires explicit user approval (--confirmed)');
  sourceIdentity(); notes();
  require('./check-dependency-security').checkDependencySecurity({ dependabot: true });
  writeProof('prepare', { confirmedByUser: true });
  console.log('Ubuntu preparation recorded. No app version, Android artifact, tag or public release changed.');
}
async function build() {
  requirePreparation();
  execute('npm', ['test', '--', '--runInBand']);
  execute('npm', ['run', 'desktop:test']);
  execute('npm', ['run', 'desktop:package:ubuntu']);
  const application = await applicationManifest(outputDirectory);
  writeProof('build', { sha256: fileHash(deb), checksumSha256: fileHash(deb + '.sha256'), notesSha256: notes().sha256, application });
  console.log('Ubuntu build, tests, package inspection and commit-bound manifest complete.');
}
async function tested(confirmed) {
  requireThat(confirmed, 'Visible desktop testing requires user confirmation (--confirmed)');
  const build = requireBuild();
  const installedVersion = run('dpkg-query', ['-W', '-f=${Version}', 'kelani-desktop-prototype']);
  requireThat(installedVersion === identity().packageVersion, 'Installed Ubuntu package version differs');
  compareApplications(build.application, await applicationManifest('/opt/kelani-desktop-prototype'));
  for (const [source, installed] of [
    ['desktop/ubuntu/kelani-desktop-prototype.desktop', '/usr/share/applications/kelani-desktop-prototype.desktop'],
    ['desktop/ubuntu/kelani-desktop-prototype.apparmor', '/etc/apparmor.d/kelani-desktop-prototype'],
  ]) requireThat(fileHash(path.join(root, source)) === fileHash(installed), 'Installed Ubuntu integration differs');
  requireThat(run('dpkg-query', ['-W', '-f=${Depends}', 'kelani-desktop-prototype']) === run('dpkg-deb', ['-f', deb, 'Depends']), 'Installed Ubuntu dependencies differ');
  const control = fs.mkdtempSync(path.join(os.tmpdir(), 'kelani-ubuntu-installed-'));
  try {
    execute('dpkg-deb', ['--control', deb, control]);
    for (const script of ['postinst', 'prerm']) {
      requireThat(fileHash(path.join(control, script)) === fileHash(`/var/lib/dpkg/info/kelani-desktop-prototype.${script}`), 'Installed Ubuntu installer differs');
    }
  } finally { fs.rmSync(control, { recursive: true, force: true }); }
  writeProof('tested', { sha256: build.sha256, confirmedByUser: true, application: build.application });
  console.log('User-confirmed desktop test bound to identical installed application bytes.');
}
async function preflight() {
  const build = requireBuild();
  const test = readProof('tested');
  requireThat(test.confirmedByUser && test.sha256 === build.sha256, 'Ubuntu desktop-test proof differs from package');
  compareApplications(build.application, test.application);
  const ci = ciEvidence();
  remoteState();
  require('./check-dependency-security').checkDependencySecurity({ dependabot: true });
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kelani-ubuntu-preflight-'));
  const clone = path.join(temporary, 'source');
  try {
    execute('git', ['clone', '--no-local', '--quiet', root, clone]);
    execute('git', ['checkout', '--detach', sourceIdentity().commit], clone);
    execute('npm', ['ci'], clone);
    execute('npm', ['test', '--', '--runInBand'], clone);
    execute('npm', ['run', 'desktop:test'], clone);
    execute('npm', ['run', 'desktop:package:ubuntu'], clone);
    compareApplications(build.application, await applicationManifest(path.join(clone, 'desktop-out', path.basename(outputDirectory))));
    requireThat(!run('git', ['status', '--porcelain'], clone), 'Clean Ubuntu build changed tracked source');
    writeProof('preflight', {
      sha256: build.sha256, notesSha256: notes().sha256,
      buildProofSha256: fileHash(path.join(proofDirectory, 'build.json')),
      testedProofSha256: fileHash(path.join(proofDirectory, 'tested.json')),
      preparationProofSha256: fileHash(path.join(proofDirectory, 'prepare.json')),
      ciRunId: ci.databaseId, cleanClone: true, identicalApplication: true,
    });
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  console.log('Ubuntu clean-clone preflight passed. No publication performed.');
}
function validatePreflight(proof, build, hashes) {
  requireThat(proof.sha256 === build.sha256 && proof.notesSha256 === build.notesSha256 && proof.cleanClone === true && proof.identicalApplication === true, 'Ubuntu preflight does not match final package');
  for (const [key, value] of Object.entries(hashes)) requireThat(proof[key] === value, `Ubuntu proof changed after preflight: ${key}`);
}
function publicationArguments({ tag, packageVersion, deb, publishedNotes }) {
  requireThat(/^ubuntu-v\d+\.\d+\.\d+-prototype\.\d+$/.test(tag), 'Invalid Ubuntu publication tag');
  return ['release', 'create', tag, deb, deb + '.sha256', '--repo', repo, '--verify-tag', '--prerelease', '--latest=false', '--title', `Kelani Ubuntu Test ${packageVersion}`, '--notes-file', publishedNotes];
}
async function guard({ publish = false, confirmed = false } = {}) {
  if (publish) requireThat(confirmed, 'Ubuntu publication requires separate explicit approval (--confirm-publication)');
  const build = requireBuild();
  const proof = readProof('preflight');
  validatePreflight(proof, build, {
    buildProofSha256: fileHash(path.join(proofDirectory, 'build.json')),
    testedProofSha256: fileHash(path.join(proofDirectory, 'tested.json')),
    preparationProofSha256: fileHash(path.join(proofDirectory, 'prepare.json')),
  });
  const test = readProof('tested');
  requireThat(test.confirmedByUser === true && test.sha256 === build.sha256, 'Missing Ubuntu user test');
  compareApplications(test.application, build.application);
  requireThat(ciEvidence().databaseId === proof.ciRunId, 'Ubuntu CI evidence changed after preflight');
  const stableTag = remoteState();
  if (!publish) { console.log('Ubuntu publication gate passed. No tags, assets or releases changed.'); return; }
  const { tag, packageVersion } = identity();
  const localTag = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/tags/${tag}`], { cwd: root });
  requireThat(localTag.status === 1, 'Ubuntu tag already exists locally; refusing to reuse it');
  const publishedNotes = path.join(proofDirectory, 'published-notes.md');
  fs.writeFileSync(publishedNotes, notes().text + `\n## Verify this test release\n\n- Ubuntu package: \`${packageVersion}\` (amd64).\n- DEB SHA-256: \`${build.sha256}\`.\n- Source commit: \`${sourceIdentity().commit}\`.\n- See [verification instructions](https://github.com/${repo}/blob/${tag}/VERIFY.md).\n`);
  execute('git', ['-c', 'tag.gpgSign=false', 'tag', '-a', tag, '-m', `Kelani Ubuntu test ${packageVersion}`]);
  execute('git', ['push', 'origin', tag]);
  execute('gh', publicationArguments({ tag, packageVersion, deb, publishedNotes }));
  const release = JSON.parse(run('gh', ['release', 'view', tag, '--repo', repo, '--json', 'tagName,isPrerelease,isDraft,assets,url']));
  requireThat(release.tagName === tag && release.isPrerelease && !release.isDraft, 'Published Ubuntu release identity differs');
  requireThat(JSON.parse(run('gh', ['api', `repos/${repo}/releases/latest`])).tag_name === stableTag, 'Stable Android Latest unexpectedly changed');
  const verify = fs.mkdtempSync(path.join(os.tmpdir(), 'kelani-ubuntu-download-'));
  try {
    execute('gh', ['release', 'download', tag, '--repo', repo, '--dir', verify, '--pattern', '*.deb*']);
    requireThat(fileHash(path.join(verify, path.basename(deb))) === build.sha256, 'Public Ubuntu package checksum differs');
    requireThat(fileHash(path.join(verify, path.basename(deb) + '.sha256')) === build.checksumSha256, 'Public Ubuntu checksum asset differs');
  } finally { fs.rmSync(verify, { recursive: true, force: true }); }
  console.log(`Published and verified: ${release.url}`);
}

if (require.main === module) {
  const action = process.argv[2];
  const confirmed = process.argv.includes('--confirmed');
  const actions = { prepare: () => prepare(confirmed), build, tested: () => tested(confirmed), preflight };
  Promise.resolve().then(() => {
    requireThat(Object.hasOwn(actions, action), 'Use the canonical npm run release:check or release:publish with --ubuntu');
    return actions[action]();
  }).catch(error => { console.error(`ERROR: ${error.message}`); process.exitCode = 1; });
}
module.exports = { guard, validateProofIdentity, validatePreflight, compareApplications, identity, applicationManifest, publicationArguments };
