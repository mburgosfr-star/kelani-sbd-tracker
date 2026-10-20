const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

async function main() {
  const root = path.resolve(__dirname, '..');
  const { version } = require('../package.json');
  const { revision } = require('../desktop/ubuntu/package.json');
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Invalid Ubuntu revision');
  const stage = path.join(root, 'desktop-out', 'ubuntu-package');
  const application = path.join(stage, 'opt', 'kelani-desktop-prototype');
  const source = path.join(root, 'desktop-out', 'Kelani SBD Tracker Desktop Prototype-linux-x64');
  await fs.rm(stage, { recursive: true, force: true });
  await fs.mkdir(application, { recursive: true });
  await fs.cp(source, application, { recursive: true });
  await fs.chmod(path.join(application, 'kelani-desktop-prototype'), 0o755);
  // Use the namespace sandbox via AppArmor, never a setuid helper or --no-sandbox.
  await fs.chmod(path.join(application, 'chrome-sandbox'), 0o755);
  const files = [
    ['desktop/ubuntu/kelani-desktop-prototype.apparmor', 'etc/apparmor.d/kelani-desktop-prototype'],
    ['desktop/ubuntu/kelani-desktop-prototype.desktop', 'usr/share/applications/kelani-desktop-prototype.desktop'],
    ['public/icons/icon-192.webp', 'usr/share/icons/hicolor/192x192/apps/kelani-desktop-prototype.png'],
    ['docs/ubuntu-prototype.md', 'usr/share/doc/kelani-desktop-prototype/README.md'],
  ];
  for (const [input, output] of files) {
    const destination = path.join(stage, output);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join(root, input), destination);
    await fs.chmod(destination, 0o644);
  }
  const control = path.join(stage, 'DEBIAN');
  await fs.mkdir(control, { recursive: true });
  await fs.writeFile(path.join(control, 'control'), `Package: kelani-desktop-prototype\nVersion: ${version}~prototype.${revision}\nSection: utils\nPriority: optional\nArchitecture: amd64\nMaintainer: Kelani SBD Tracker contributors\nDepends: apparmor (>= 4.0), libgtk-3-0t64, libnotify4, pulseaudio-utils, libnss3, libasound2t64, libgbm1, libxss1, libatk-bridge2.0-0t64, libxkbcommon0, libdrm2, libcups2t64\nDescription: Offline powerlifting tracker desktop prototype\n Experimental desktop build for local testing. No automatic phone sync.\n`);
  await fs.writeFile(path.join(control, 'postinst'), '#!/bin/sh\nset -eu\nif [ "$1" = configure ]; then\n  apparmor_parser -r /etc/apparmor.d/kelani-desktop-prototype\n  if command -v gtk-update-icon-cache >/dev/null 2>&1; then\n    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor\n  fi\nfi\n', { mode: 0o755 });
  await fs.writeFile(path.join(control, 'prerm'), '#!/bin/sh\nset -eu\nif [ "$1" = remove ] && [ -f /etc/apparmor.d/kelani-desktop-prototype ]; then\n  apparmor_parser -R /etc/apparmor.d/kelani-desktop-prototype\nfi\n', { mode: 0o755 });
  const output = path.join(root, 'desktop-out', 'Kelani-Ubuntu-Prototype-amd64.deb');
  const result = spawnSync('dpkg-deb', ['--root-owner-group', '--build', stage, output], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Ubuntu package build failed');
  const sha = createHash('sha256').update(await fs.readFile(output)).digest('hex');
  await fs.writeFile(output + '.sha256', sha + '  ' + path.basename(output) + '\n');
  console.log(`Ubuntu prototype: ${output}\nSHA-256: ${sha}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
