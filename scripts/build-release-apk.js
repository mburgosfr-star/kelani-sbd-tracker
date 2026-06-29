const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const suffix = process.argv[2] ? `-${process.argv[2]}` : '';
const apkName = `kelani-sbd-tracker-v${pkg.version}${suffix}.apk`;

const javaHome = '/usr/lib/jvm/java-21-openjdk-amd64';
const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  PATH: `${path.join(javaHome, 'bin')}:${process.env.PATH}`,
  REACT_APP_VERSION: pkg.version,
  GENERATE_SOURCEMAP: 'false',
};

function run(command, options = {}) {
  console.log(`\n> ${command}`);
  execSync(command, {
    stdio: 'inherit',
    cwd: options.cwd || root,
    env,
  });
}

run('npm run build');
run('npx cap sync android');
run('./gradlew :app:assembleRelease', { cwd: path.join(root, 'android') });

const source = path.join(root, 'android/app/build/outputs/apk/release/app-release.apk');
const target = path.join(os.homedir(), 'Downloads', apkName);

if (!fs.existsSync(source)) {
  throw new Error(`APK not found: ${source}`);
}

fs.copyFileSync(source, target);

console.log(`\n✅ Signed APK copied to: ${target}`);
