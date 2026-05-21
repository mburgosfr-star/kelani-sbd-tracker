const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const androidDir = path.join(root, 'android');
const gradleHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kelani-izzy-gradle-'));

const javaHome = '/usr/lib/jvm/java-21-openjdk-amd64';

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  PATH: `${path.join(javaHome, 'bin')}:${process.env.PATH}`,
  GRADLE_USER_HOME: gradleHome,
};

function run(command, cwd = root) {
  console.log(`\n> ${command}`);
  execSync(command, {
    cwd,
    env,
    stdio: 'inherit',
  });
}

try {
  run('java -version');
  run('npm run build');
  run('npx cap sync android');
  run('./gradlew :app:assembleRelease --no-daemon', androidDir);

  console.log('\n✅ Izzy-style build test passed without local Gradle signing properties.');
  console.log(`Temporary GRADLE_USER_HOME: ${gradleHome}`);
} catch (error) {
  console.error('\n❌ Izzy-style build test failed.');
  console.error(`Temporary GRADLE_USER_HOME: ${gradleHome}`);
  process.exit(error.status || 1);
}
