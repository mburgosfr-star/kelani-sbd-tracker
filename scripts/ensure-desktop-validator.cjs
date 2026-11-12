#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

// Ubuntu 24.04 amd64. Update version, size and hash together from:
// https://packages.ubuntu.com/noble/amd64/desktop-file-utils/download
// The package is a build-time tool only; it is never bundled with Kelani.
const TOOL = Object.freeze({
  package: 'desktop-file-utils', version: '0.27-2build1', architecture: 'amd64',
  bytes: 53760,
  sha256: 'a6b03256d0153a8d1213ee21123d15315945752308f31b63751d7b29543b8bc0',
  file: 'pool/main/d/desktop-file-utils/desktop-file-utils_0.27-2build1_amd64.deb',
});
const ORIGINS = Object.freeze(['https://archive.ubuntu.com/ubuntu', 'https://security.ubuntu.com/ubuntu']);

function verifyArchive(filename, spec = TOOL) {
  const bytes = fs.readFileSync(filename);
  if (bytes.length !== spec.bytes || createHash('sha256').update(bytes).digest('hex') !== spec.sha256) {
    throw new Error('Desktop validator archive failed its pinned size/SHA-256 check. Refusing to extract or run it.');
  }
}

function downloadArchive(url, destination, execute = execFileSync) {
  execute('curl', ['--fail', '--silent', '--show-error', '--location',
    '--proto', '=https', '--proto-redir', '=https', '--connect-timeout', '10',
    '--max-time', '30', '--max-filesize', String(TOOL.bytes), '--output', destination, url],
  { timeout: 35000, stdio: ['ignore', 'ignore', 'pipe'] });
}

function setupDesktopValidator({ parent = os.tmpdir(), download = downloadArchive,
  execute = execFileSync, spec = TOOL, log = console.log } = {}) {
  const directory = fs.mkdtempSync(path.join(parent, 'kelani-desktop-validator-'));
  try {
    const archive = path.join(directory, 'validator.deb');
    let downloaded = false;
    for (const origin of ORIGINS) {
      try {
        download(`${origin}/${spec.file}`, archive);
        downloaded = true;
      } catch (error) {
        fs.rmSync(archive, { force: true });
        log(`Desktop validator download unavailable from ${origin}: ${String(error.stderr || error.message).trim().slice(0, 500)}`);
        continue;
      }
      // An integrity failure is fatal, not a network retry.
      verifyArchive(archive, spec);
      break;
    }
    if (!downloaded) throw new Error('Desktop validator download failed from both approved Ubuntu sources. Check runner DNS/network; validation remains blocked.');
    const run = (command, args) => String(execute(command, args, { encoding: 'utf8', timeout: 10000 })).trim();
    for (const [field, expected] of [['Package', spec.package], ['Version', spec.version], ['Architecture', spec.architecture]]) {
      if (run('dpkg-deb', ['-f', archive, field]) !== expected) throw new Error(`Unexpected desktop validator ${field}.`);
    }
    const extracted = path.join(directory, 'tool');
    run('dpkg-deb', ['--extract', archive, extracted]);
    const bin = path.join(extracted, 'usr/bin');
    const validator = path.join(bin, 'desktop-file-validate');
    const valid = path.join(directory, 'valid.desktop');
    const invalid = path.join(directory, 'invalid.desktop');
    fs.writeFileSync(valid, '[Desktop Entry]\nType=Application\nName=Validator check\nExec=true\n');
    fs.writeFileSync(invalid, '[Desktop Entry]\nType=Invalid\nName=Validator check\n');
    run(validator, [valid]);
    let rejected = false;
    try { run(validator, [invalid]); } catch { rejected = true; }
    if (!rejected) throw new Error('Desktop validator did not reject an invalid desktop entry.');
    return { directory, bin, validator };
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

if (require.main === module) {
  const started = Date.now();
  try {
    if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Pinned desktop validator requires Linux amd64.');
    const result = setupDesktopValidator({ parent: process.env.RUNNER_TEMP || os.tmpdir() });
    if (process.env.GITHUB_PATH) fs.appendFileSync(process.env.GITHUB_PATH, `${result.bin}\n`);
    console.log(`Verified desktop-file-validate ${TOOL.version}: ${result.validator} (${Date.now() - started} ms)`);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
module.exports = { TOOL, ORIGINS, verifyArchive, downloadArchive, setupDesktopValidator };
