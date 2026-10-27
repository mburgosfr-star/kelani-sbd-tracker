#!/usr/bin/env node

// Packaging only: never uploads, changes versions, or replaces APK release inputs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

function assertPhoneProof(proof, manifest) {
  if (proof.schema !== 1 || proof.confirmedByUser !== true ||
      proof.commit !== manifest.git.commit || proof.packageName !== manifest.packageName ||
      proof.versionName !== manifest.versionName ||
      String(proof.versionCode) !== String(manifest.versionCode) ||
      proof.apk?.sha256 !== manifest.apk.sha256) {
    throw new Error('The APK must have a matching confirmed phone test before building a Play bundle.');
  }
}

function bundlePath(apkPath) {
  // APK-only compiled baseline profiles are build optimization metadata, not app payload.
  if (/^assets\/dexopt\/baseline\.(prof|profm)$/.test(apkPath)) return null;
  if (apkPath.startsWith('assets/') || apkPath.startsWith('lib/')) return `base/${apkPath}`;
  if (/^classes\d*\.dex$/.test(apkPath)) return `base/dex/${apkPath}`;
  return null;
}

function assertPayloadMatches(apkEntries, bundleEntries, readApk, readBundle) {
  const expected = apkEntries.filter(entry => !entry.endsWith('/') && bundlePath(entry));
  const actual = bundleEntries.filter(entry => !entry.endsWith('/') &&
    /^base\/(assets\/|lib\/|dex\/classes\d*\.dex$)/.test(entry));
  if (!expected.some(entry => /^classes\d*\.dex$/.test(entry)) ||
      expected.length !== actual.length ||
      expected.some(entry => !actual.includes(bundlePath(entry)) ||
        !readApk(entry).equals(readBundle(bundlePath(entry))))) {
    throw new Error('Bundle code or assets differ from the phone-tested APK.');
  }
  return expected.length;
}

function main() {
  const root = process.cwd();
  const common = require(path.join(root, 'scripts/release-common.js'));
  const { versionName, versionCode } = common.readVersionInfo(root);
  const javaHome = process.env.JAVA_HOME || common.fallbackJavaHome;
  const env = { ...process.env, JAVA_HOME: javaHome,
    PATH: `${path.join(javaHome, 'bin')}:${process.env.PATH}`, VITE_APP_VERSION: versionName };
  const output = (command, args) => execFileSync(command, args,
    { cwd: root, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
  const run = (label, command, args, cwd = root) => common.runLogged(label, command, args,
    { cwd, env, logName: `play-bundle-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.log` });
  const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  const directory = path.join(root, 'release/play');
  const destination = path.join(directory, `kelani-sbd-tracker-v${versionName}.aab`);
  if (fs.existsSync(destination)) throw new Error(`Bundle already exists; refusing to replace ${destination}`);

  // This existing guard validates clean HEAD, metadata, APK bytes and checksum file.
  run('APK provenance', process.execPath, ['scripts/check-release-build-manifest.js']);
  const manifest = read('release/build-manifest.json');
  assertPhoneProof(read('release/phone-test-proof.json'), manifest);
  const apk = path.join(root, manifest.apk.path);
  common.assertSignedV2(apk, common.findAndroidSdk());
  run('Web build', 'npm', ['run', 'build']);
  run('Android sync', 'npx', ['cap', 'sync', 'android']);
  common.assertCapacitorConfigSynced(root);
  common.assertCleanSourceTreeExceptRelease(root);
  run('Gradle bundle', './gradlew', ['clean', ':app:bundleRelease', '--no-daemon'], path.join(root, 'android'));
  const bundle = path.join(root, 'android/app/build/outputs/bundle/release/app-release.aab');
  const verification = output(path.join(javaHome, 'bin/jarsigner'), ['-J-Duser.language=en', '-verify', bundle]);
  if (!verification.includes('jar verified.') || /unsigned entries/i.test(verification)) {
    throw new Error('Bundle signature verification failed or contains unsigned entries.');
  }
  const cert = output(path.join(javaHome, 'bin/keytool'), ['-printcert', '-jarfile', bundle, '-J-Duser.language=en']);
  const fingerprint = cert.match(/SHA256:\s*([0-9A-F:]+)/i)?.[1].replace(/:/g, '').toLowerCase();
  if (fingerprint !== common.releaseCertificateSha256) throw new Error('Unexpected bundle signing certificate.');
  const entries = file => output('unzip', ['-Z1', file]).split(/\r?\n/);
  const entry = (file, name) => execFileSync('unzip', ['-p', file, name], { maxBuffer: 64 * 1024 * 1024 });
  const comparedFiles = assertPayloadMatches(entries(apk), entries(bundle),
    name => entry(apk, name), name => entry(bundle, name));
  // Recheck source and APK after the build, before recording a usable output.
  run('Final APK provenance', process.execPath, ['scripts/check-release-build-manifest.js']);
  assertPhoneProof(read('release/phone-test-proof.json'), manifest);
  fs.mkdirSync(directory, { recursive: true });
  fs.copyFileSync(bundle, destination, fs.constants.COPYFILE_EXCL);
  const sha256 = common.sha256File(destination);
  fs.writeFileSync(`${destination}.sha256`, `${sha256}  ${path.basename(destination)}\n`, { flag: 'wx' });
  fs.writeFileSync(`${destination}.json`, `${JSON.stringify({ schema: 1,
    sourceCommit: manifest.git.commit, packageName: common.packageName, versionName, versionCode,
    apkSha256: manifest.apk.sha256, bundleSha256: sha256, certificateSha256: fingerprint,
    comparedPayloadFiles: comparedFiles, builderSha256: crypto.createHash('sha256')
      .update(fs.readFileSync(__filename)).digest('hex'), builtAt: new Date().toISOString(),
    uploaded: false }, null, 2)}\n`, { flag: 'wx' });
  console.log(`Verified local Play bundle: ${destination}\nNo upload performed. Google Play testing remains required.`);
}

module.exports = { assertPhoneProof, bundlePath, assertPayloadMatches };
if (require.main === module) {
  try { main(); } catch (error) { console.error(`ERROR: ${error.message}`); process.exitCode = 1; }
}
