const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const { listPackage, extractFile } = await import('@electron/asar');
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'desktop-out', 'Kelani SBD Tracker Desktop Prototype-win32-x64');
  const archive = path.join(output, 'resources', 'app.asar');
  const entries = listPackage(archive).map(value => value.replaceAll('\\', '/'));
  const allowed = new Set(['build', 'desktop', 'package.json', 'LICENSE', 'WINDOWS-PROTOTYPE.md']);
  for (const entry of entries) {
    assert(allowed.has(entry.split('/').filter(Boolean)[0]), `Unexpected packaged entry: ${entry}`);
    assert(!/\.map$|\.test\.|\.private|\.keystore|\.jks|\.env/i.test(entry), `Unexpected packaged entry: ${entry}`);
  }
  for (const required of ['/build/index.html', '/desktop/main.cjs', '/desktop/preload.cjs', '/desktop/runtime.cjs', '/LICENSE']) {
    assert(entries.includes(required), `Missing ${required}`);
  }
  const metadata = JSON.parse(extractFile(archive, 'package.json').toString());
  assert.equal(metadata.name, 'kelani-desktop-prototype');
  assert.equal(metadata.main, 'desktop/main.cjs');
  assert.equal(metadata.version, require('../package.json').version);
  const executable = await fs.readFile(path.join(output, 'Kelani SBD Tracker Prototype.exe'));
  assert.equal(executable.subarray(0, 2).toString(), 'MZ');
  assert.equal(executable.subarray(executable.readUInt32LE(0x3c), executable.readUInt32LE(0x3c) + 4).toString(), 'PE\u0000\u0000');
  assert(extractFile(archive, 'desktop/main.cjs').toString().includes('sandbox: true'));
  console.log(`Windows executable and ${entries.length} archive entries verified. No application was launched.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
