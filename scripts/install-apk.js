#!/usr/bin/env node
// The primary release channel is Google Play. Never sideload over the daily app.
const common = require('./release-common');
const play = require('./play-release-proof.cjs');
function main() {
  common.assertCleanSourceTreeExceptRelease(common.root);
  common.run('node', ['scripts/check-release-build-manifest.js']);
  const build = play.candidate(common.root, common);
  console.log(`Candidate: ${build.expected.versionName}/${build.expected.versionCode}`);
  console.log(`Play bundle: ${build.bundle.path}`);
  console.log('First obtain separate approval for the closed Alpha rollout and wait until this exact version is available.');
  console.log(`Update through Google Play: https://play.google.com/store/apps/details?id=${build.expected.packageName}`);
  console.log('Do not uninstall, downgrade or sideload. If no update appears, stop and check track availability and the installed version.');
  console.log('After the Play update and successful user test: npm run release:phone-tested -- --confirmed');
  console.log('No installation, upload or rollout performed by this command.');
}
try { main(); } catch (error) { console.error(`\nERROR: ${error.message}`); process.exitCode = 1; }
