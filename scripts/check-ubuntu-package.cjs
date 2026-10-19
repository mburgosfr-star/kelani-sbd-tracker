const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

// Inspect the finished artifact without installing it or touching user data.
async function main() {
  const root = path.resolve(__dirname, '..');
  const deb = path.join(root, 'desktop-out', 'Kelani-Ubuntu-Prototype-amd64.deb');
  const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim();
  assert.equal(run('dpkg-deb', ['-f', deb, 'Package']), 'kelani-desktop-prototype');
  assert.equal(run('dpkg-deb', ['-f', deb, 'Architecture']), 'amd64');
  const version = run('dpkg-deb', ['-f', deb, 'Version']);
  assert(version.startsWith(require('../package.json').version + '~prototype.'));
  const contents = run('dpkg-deb', ['-c', deb]).split('\n');
  for (const line of contents) {
    const [mode, owner, , , , filename] = line.trim().split(/\s+/);
    assert.equal(owner, 'root/root', `Unexpected package ownership: ${line}`);
    assert(!/[sStT]/.test(mode.slice(1)), `Privileged package permission: ${line}`);
    assert(filename === './' || /^\.\/(opt|usr|etc)\//.test(filename), `Unexpected installation path: ${line}`);
  }
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'kelani-deb-check-'));
  try {
    run('dpkg-deb', ['--extract', deb, temporary]);
    run('dpkg-deb', ['--control', deb, path.join(temporary, 'control')]);
    const icon = await fs.readFile(path.join(temporary, 'usr/share/icons/hicolor/192x192/apps/kelani-desktop-prototype.png'));
    assert.deepEqual(icon, await fs.readFile(path.join(root, 'public/icons/icon-192.webp')));
    const desktop = path.join(temporary, 'usr/share/applications/kelani-desktop-prototype.desktop');
    run('desktop-file-validate', [desktop]);
    const entry = await fs.readFile(desktop, 'utf8');
    assert(!/^(Hidden|NoDisplay)=true$/m.test(entry));
    const executable = entry.match(/^Exec=(.+)$/m)[1];
    assert.equal(executable, '/opt/kelani-desktop-prototype/kelani-desktop-prototype');
    assert((await fs.stat(path.join(temporary, executable))).mode & 0o111);
    for (const script of ['postinst', 'prerm']) run('sh', ['-n', path.join(temporary, 'control', script)]);
    const { extractFile } = await import('@electron/asar');
    const archive = path.join(temporary, 'opt/kelani-desktop-prototype/resources/app.asar');
    assert.deepEqual(extractFile(archive, 'build/kelani-icon.png'), icon);
    // Catch stale runtime files, not just a correctly named executable.
    for (const file of ['main.cjs', 'preload.cjs', 'runtime.cjs']) {
      assert.deepEqual(extractFile(archive, `desktop/${file}`), await fs.readFile(path.join(root, 'desktop', file)));
    }
    const sha = createHash('sha256').update(await fs.readFile(deb)).digest('hex');
    assert.equal((await fs.readFile(deb + '.sha256', 'utf8')).split(/\s+/)[0], sha);
    console.log(`Ubuntu ${version}: menu entry, icons, runtime, permissions, install scripts and checksum verified.`);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
