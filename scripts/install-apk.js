const { spawnSync } = require('child_process');
const os = require('os');
const path = require('path');
const pkg = require('../package.json');

const apkPath = path.join(
  os.homedir(),
  'Downloads',
  `kelani-sbd-tracker-v${pkg.version}.apk`
);

console.log(`Installing ${apkPath}`);

const result = spawnSync('adb', ['install', '-r', apkPath], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
