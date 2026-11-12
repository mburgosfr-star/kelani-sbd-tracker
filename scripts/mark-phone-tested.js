#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const common = require('./release-common');
const play = require('./play-release-proof.cjs');
function main() {
  if (!process.argv.includes('--confirmed')) throw new Error('Phone testing must be explicitly confirmed. Run: npm run release:phone-tested -- --confirmed');
  common.assertCleanSourceTreeExceptRelease(common.root);
  common.run('node', ['scripts/check-release-build-manifest.js']);
  const build = play.candidate(common.root, common);
  const installed = play.capture(common.root, common, build);
  const proof = { schema: 2, delivery: 'google-play', confirmedByUser: true,
    confirmedAt: new Date().toISOString(), commit: build.manifest.git.commit,
    ...build.expected, deviceSerial: installed.deviceSerial,
    apk: { publicPath: path.relative(common.root, build.apk), sha256: build.manifest.apk.sha256 },
    bundle: build.bundle, installed };
  common.assertCleanSourceTreeExceptRelease(common.root);
  fs.writeFileSync(path.join(common.root, 'release/phone-test-proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
  fs.rmSync(path.join(common.root, 'release/preflight-proof.json'), { force: true });
  console.log('\n✅ Confirmed Google Play phone test recorded with captured APK/split evidence.');
  console.log('✅ Code, assets and device-native libraries match the candidate. Packaging bytes may differ.');
}
try { main(); } catch (error) { console.error(`\nERROR: ${error.message}`); process.exitCode = 1; }
