const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

async function main() {
  const { packager } = await import('@electron/packager');
  const root = path.resolve(__dirname, '..');
  const metadata = require('../package.json');
  const platform = process.argv[2] || 'win32';
  if (!['win32', 'linux'].includes(platform)) throw new Error('Unsupported desktop target');
  const executableName = platform === 'win32' ? 'Kelani SBD Tracker Prototype' : 'kelani-desktop-prototype';
  const output = path.join(root, 'desktop-out');
  const staging = path.join(output, 'source');
  await fs.rm(staging, { recursive: true, force: true });
  await fs.mkdir(staging, { recursive: true });
  // ICO can contain the existing PNG unchanged; no artwork is generated.
  const png = await fs.readFile(path.join(root, 'public', 'icons', 'icon-192.webp'));
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width > 256 || height > 256) throw new Error('Desktop icon must be at most 256 pixels');
  const icoHeader = Buffer.alloc(22);
  icoHeader.writeUInt16LE(1, 2);
  icoHeader.writeUInt16LE(1, 4);
  icoHeader[6] = width === 256 ? 0 : width;
  icoHeader[7] = height === 256 ? 0 : height;
  icoHeader.writeUInt16LE(1, 10);
  icoHeader.writeUInt16LE(32, 12);
  icoHeader.writeUInt32LE(png.length, 14);
  icoHeader.writeUInt32LE(22, 18);
  const icon = path.join(output, 'kelani.ico');
  await fs.writeFile(icon, Buffer.concat([icoHeader, png]));
  const pngIcon = path.join(output, 'kelani-icon.png');
  await fs.writeFile(pngIcon, png);
  // Explicit allowlist: no repository, exports, credentials or dependencies.
  await fs.cp(path.join(root, 'build'), path.join(staging, 'build'), { recursive: true });
  await fs.copyFile(pngIcon, path.join(staging, 'build', 'kelani-icon.png'));
  await fs.cp(path.join(root, 'desktop'), path.join(staging, 'desktop'), { recursive: true, filter: source => !source.endsWith('.test.cjs') });
  await fs.copyFile(path.join(root, 'LICENSE'), path.join(staging, 'LICENSE'));
  await fs.copyFile(path.join(root, 'docs', 'windows-prototype.md'), path.join(staging, 'WINDOWS-PROTOTYPE.md'));
  await fs.copyFile(path.join(root, 'docs', 'ubuntu-prototype.md'), path.join(staging, 'UBUNTU-PROTOTYPE.md'));
  await fs.writeFile(path.join(staging, 'package.json'), JSON.stringify({ name: 'kelani-desktop-prototype', productName: 'Kelani SBD Tracker Desktop Prototype', author: 'Kelani SBD Tracker contributors', version: metadata.version, main: 'desktop/main.cjs', license: metadata.license }, null, 2));
  const paths = await packager({
    dir: staging, out: output, name: 'Kelani SBD Tracker Desktop Prototype',
    platform, arch: 'x64', electronVersion: metadata.devDependencies.electron,
    appVersion: metadata.version, icon: platform === 'win32' ? icon : pngIcon,
    asar: true, prune: false, overwrite: true,
    executableName,
  });
  for (const packaged of paths) {
    await fs.copyFile(path.join(root, 'desktop', 'assets', 'rest-timer.wav'), path.join(packaged, 'resources', 'rest-timer.wav'));
    await fs.copyFile(path.join(root, 'docs', 'windows-prototype.md'), path.join(packaged, 'WINDOWS-PROTOTYPE.md'));
    await fs.copyFile(path.join(root, 'docs', 'ubuntu-prototype.md'), path.join(packaged, 'UBUNTU-PROTOTYPE.md'));
    const executable = path.join(packaged, executableName + (platform === 'win32' ? '.exe' : ''));
    const sha = createHash('sha256').update(await fs.readFile(executable)).digest('hex');
    console.log(`${platform} prototype: ${packaged}\nExecutable SHA-256: ${sha}`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
