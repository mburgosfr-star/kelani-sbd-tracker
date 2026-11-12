// Release evidence for real Play installations. Never installs or uploads an app.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { bundlePath, assertPayloadMatches } = require('./build-play-bundle.cjs');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const text = (command, args) => execFileSync(command, args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }).trim();
const entries = file => text('unzip', ['-Z1', file]).split(/\r?\n/);
const readEntry = (file, name) => execFileSync('unzip', ['-p', file, name], { maxBuffer: 128 * 1024 * 1024 });
function payload(files) {
  const result = {};
  for (const file of files) {
    for (const name of entries(file).filter(name => !name.endsWith('/') && bundlePath(name))) {
      if (Object.hasOwn(result, name)) throw new Error(`Duplicate installed payload: ${name}`);
      result[name] = hash(readEntry(file, name));
    }
  }
  return result;
}

function assertInstalledPayload(expected, actual, supportedAbis) {
  const nativeNames = Object.keys(actual).filter(n => n.startsWith('lib/'));
  const installedAbis = [...new Set(nativeNames.map(n => n.split('/')[1]))];
  const needsNative = Object.keys(expected).some(n => n.startsWith('lib/'));
  if ((needsNative && installedAbis.length !== 1) || installedAbis.some(abi => !supportedAbis.includes(abi))) {
    throw new Error('Missing, ambiguous or unsupported installed native ABI.');
  }
  const wanted = Object.keys(expected).filter(n => !n.startsWith('lib/') || installedAbis.includes(n.split('/')[1])).sort();
  if (!wanted.includes('classes.dex') || wanted.length !== Object.keys(actual).length ||
      wanted.some(name => actual[name] !== expected[name])) {
    throw new Error('Installed Play code, assets or native libraries differ from the candidate.');
  }
  return wanted.length;
}

function assertInstallation({ installer, versionName, versionCode }, expected) {
  if (installer !== 'com.android.vending' || versionName !== expected.versionName ||
      String(versionCode) !== String(expected.versionCode)) {
    throw new Error('Install the exact candidate through Google Play before confirming the phone test.');
  }
}

function candidate(root, common) {
  const manifest = common.readJson(path.join(root, 'release/build-manifest.json'));
  const expected = common.readVersionInfo(root);
  if (manifest.git?.commit !== common.getHeadCommit(root) || manifest.packageName !== expected.packageName ||
      manifest.versionName !== expected.versionName || String(manifest.versionCode) !== String(expected.versionCode)) {
    throw new Error('Candidate build manifest does not match HEAD and version.');
  }
  const staging = common.assertReleaseStagingProof(root);
  const apk = path.join(root, `release/kelani-sbd-tracker-v${expected.versionName}.apk`);
  const aab = path.join(root, `release/play/kelani-sbd-tracker-v${expected.versionName}.aab`);
  const metadata = common.readJson(`${aab}.json`);
  if (manifest.apk.path !== path.relative(root, apk) || common.sha256File(apk) !== manifest.apk.sha256 ||
      metadata.schema !== 1 || metadata.sourceCommit !== manifest.git.commit || metadata.packageName !== expected.packageName ||
      metadata.versionName !== expected.versionName || String(metadata.versionCode) !== String(expected.versionCode) ||
      metadata.apkSha256 !== manifest.apk.sha256 || metadata.bundleSha256 !== common.sha256File(aab) ||
      metadata.certificateSha256 !== common.releaseCertificateSha256 ||
      metadata.builderSha256 !== common.sha256File(path.join(root, 'scripts/build-play-bundle.cjs'))) {
    throw new Error('Play bundle evidence does not match the exact candidate.');
  }
  if (common.publicAssetManifest(apk).sha256 !== staging.proof.ci.publicAssetsSha256) {
    throw new Error('Candidate public assets differ from staged CI evidence.');
  }
  const javaHome = process.env.JAVA_HOME || common.fallbackJavaHome;
  const verification = text(path.join(javaHome, 'bin/jarsigner'), ['-J-Duser.language=en', '-verify', aab]);
  const cert = text(path.join(javaHome, 'bin/keytool'), ['-printcert', '-jarfile', aab, '-J-Duser.language=en']);
  if (!verification.includes('jar verified.') || /unsigned entries/i.test(verification) ||
      cert.match(/SHA256:\s*([0-9A-F:]+)/i)?.[1].replace(/:/g, '').toLowerCase() !== common.releaseCertificateSha256) {
    throw new Error('Play bundle signing verification failed.');
  }
  assertPayloadMatches(entries(apk), entries(aab), n => readEntry(apk, n), n => readEntry(aab, n));
  return { manifest, expected, apk, bundle: { path: path.relative(root, aab), sha256: common.sha256File(aab), metadataSha256: common.sha256File(`${aab}.json`) } };
}

function deviceInfo(expected) {
  const devices = text('adb', ['devices']).split('\n').slice(1).filter(l => /\tdevice$/.test(l.trim())).map(l => l.split('\t')[0]);
  if (devices.length !== 1) throw new Error(`Expected one connected phone, found ${devices.length}.`);
  const serial = devices[0];
  const adb = args => text('adb', ['-s', serial, ...args]);
  const info = adb(['shell', 'dumpsys', 'package', expected.packageName]);
  const packages = adb(['shell', 'pm', 'list', 'packages', '-i', expected.packageName]);
  const line = packages.split('\n').find(l => l.startsWith(`package:${expected.packageName} `));
  return { serial, adb, installer: line?.match(/installer=(\S+)/)?.[1],
    versionName: info.match(/versionName=([^\s]+)/)?.[1], versionCode: info.match(/versionCode=(\d+)/)?.[1] };
}

function capture(root, common, build) {
  const device = deviceInfo(build.expected);
  assertInstallation(device, build.expected);
  const paths = device.adb(['shell', 'pm', 'path', build.expected.packageName]).split('\n').map(l => l.replace(/^package:/, '').trim());
  if (!paths.length || paths.some(p => !/^\/[^\r\n]+\.apk$/.test(p)) || new Set(paths).size !== paths.length) throw new Error('Invalid installed APK paths.');
  const directory = fs.mkdtempSync(path.join(root, 'release/play-phone-'));
  const files = paths.map((remote, index) => {
    const file = path.join(directory, `${index}.apk`);
    common.run('adb', ['-s', device.serial, 'pull', remote, file]);
    common.assertApkMetadata(file, build.expected, common.findAndroidSdk(root));
    common.assertSignedV2(file, common.findAndroidSdk(root));
    return { path: path.relative(root, file), sha256: common.sha256File(file) };
  });
  const supportedAbis = device.adb(['shell', 'getprop', 'ro.product.cpu.abilist']).split(',');
  const comparedPayloadFiles = assertInstalledPayload(payload([build.apk]), payload(files.map(f => path.join(root, f.path))), supportedAbis);
  // Detect a concurrent update while pulling base/split APKs.
  const after = deviceInfo(build.expected);
  assertInstallation(after, build.expected);
  if (after.serial !== device.serial || after.adb(['shell', 'pm', 'path', build.expected.packageName]).split('\n').map(l => l.replace(/^package:/, '').trim()).join('\n') !== paths.join('\n')) throw new Error('Phone installation changed during capture.');
  return { installer: device.installer, deviceSerial: device.serial, supportedAbis, apks: files, comparedPayloadFiles };
}

function verifyPhoneProof(root, common, build) {
  const proofPath = path.join(root, 'release/phone-test-proof.json');
  const proof = common.readJson(proofPath);
  if (proof.schema !== 2 || proof.delivery !== 'google-play' || proof.confirmedByUser !== true ||
      proof.commit !== build.manifest.git.commit || proof.packageName !== build.expected.packageName ||
      proof.versionName !== build.expected.versionName || proof.versionCode !== build.expected.versionCode ||
      proof.apk?.sha256 !== build.manifest.apk.sha256 || JSON.stringify(proof.bundle) !== JSON.stringify(build.bundle) ||
      !proof.installed?.apks?.length || !Array.isArray(proof.installed.supportedAbis)) throw new Error('Missing or stale Play phone-test proof.');
  assertInstallation({ installer: proof.installed.installer, versionName: proof.versionName, versionCode: proof.versionCode }, build.expected);
  const files = proof.installed.apks.map(file => {
    if (!/^release\/play-phone-[^/]+\/\d+\.apk$/.test(file.path)) throw new Error('Invalid captured APK evidence path.');
    const absolute = path.join(root, file.path);
    if (common.sha256File(absolute) !== file.sha256) throw new Error('Captured Play APK changed.');
    common.assertApkMetadata(absolute, build.expected, common.findAndroidSdk(root));
    common.assertSignedV2(absolute, common.findAndroidSdk(root));
    return absolute;
  });
  assertInstalledPayload(payload([build.apk]), payload(files), proof.installed.supportedAbis);
  return { proof, proofPath, sha256: common.sha256File(proofPath) };
}

module.exports = { assertInstalledPayload, assertInstallation, candidate, capture, verifyPhoneProof };
